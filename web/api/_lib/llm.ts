import { AsyncLocalStorage } from 'node:async_hooks'
import { env } from './chain.js'
import { userKeys } from './keys.js'

// OpenRouter speaks the OpenAI chat-completions format.
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

export type Role = 'strategist' | 'risk' | 'reporter' | 'chat'

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }
export type Tool = { type: 'function'; function: { name: string; description: string; parameters: object } }

/** Per-role model override, e.g. OPENROUTER_MODEL_RISK; falls back to OPENROUTER_MODEL. */
export function modelFor(role: Role): string {
  return process.env[`OPENROUTER_MODEL_${role.toUpperCase()}`] || env('OPENROUTER_MODEL')
}

const FALLBACKS = (process.env.OPENROUTER_FALLBACK_MODELS ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

// Key pool: the wallet's own keys (BYOK, set in Settings) first, then the server's
// OPENROUTER_API_KEY, which may itself be a comma-separated list.
const serverKeys = () =>
  env('OPENROUTER_API_KEY')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

const scope = new AsyncLocalStorage<string[]>()

/** Runs fn with the user's BYOK keys in front of the server keys for every LLM call inside it. */
export async function withUserKeys<T>(user: string, fn: () => Promise<T>): Promise<T> {
  const own = await userKeys(user).catch(() => [])
  return scope.run(own, fn)
}

// A key that hit its quota is parked so the next calls go straight to a fresh one.
// ponytail: per-instance memory; move to KV if many instances keep re-hitting the same dead key.
const parked = new Map<string, number>()
const PARK_MS = 10 * 60_000

function keyPool(): string[] {
  const all = [...new Set([...(scope.getStore() ?? []), ...serverKeys()])]
  const live = all.filter((k) => (parked.get(k) ?? 0) < Date.now())
  return live.length ? live : all
}

class LlmError extends Error {
  keyProblem: boolean
  constructor(message: string, keyProblem: boolean) {
    super(message)
    this.keyProblem = keyProblem
  }
}

async function completeWith(
  model: string,
  key: string,
  role: Role,
  messages: ChatMessage[],
  opts: { tools?: Tool[]; json?: boolean },
): Promise<Extract<ChatMessage, { role: 'assistant' }>> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'coinAI',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: role === 'reporter' || role === 'chat' ? 0.5 : 0.2,
      ...(opts.tools && { tools: opts.tools }),
      ...(opts.json && { response_format: { type: 'json_object' } }),
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = await res.json().catch(() => null)
  const msg = body?.choices?.[0]?.message
  // OpenRouter can return 200 with an upstream error in the body, so check both.
  if (!res.ok || body?.error || !msg) {
    const status = Number(body?.error?.code ?? res.status)
    // 401 bad key, 402 no credits, 403 key limit, 429 rate/daily limit: another key may still work.
    throw new LlmError(`openrouter ${model} ${status}: ${body?.error?.message ?? 'no message'}`, [401, 402, 403, 429].includes(status))
  }
  return { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls }
}

/**
 * Tries the role's model, then each OPENROUTER_FALLBACK_MODELS entry (free models are often busy).
 * Per model, a key that is rate-limited or out of credit is parked and the next key is tried.
 */
export async function complete(
  role: Role,
  messages: ChatMessage[],
  opts: { tools?: Tool[]; json?: boolean } = {},
): Promise<Extract<ChatMessage, { role: 'assistant' }>> {
  const models = [modelFor(role), ...FALLBACKS.filter((m) => m !== modelFor(role))]
  let lastError: unknown
  // Free-model outages/429s are usually seconds long: one more pass after a short pause.
  for (const [pass, delay] of [[0, 0], [1, 2500]] as const) {
    if (pass) await new Promise((r) => setTimeout(r, delay))
    for (const model of models) {
      for (const key of keyPool()) {
        try {
          return await completeWith(model, key, role, messages, opts)
        } catch (e) {
          lastError = e
          if (!(e instanceof LlmError && e.keyProblem)) break // the model failed, not the key
          // Daily quota, bad key or no credit won't recover in seconds; a plain 429 might.
          if (!/ 429:/.test(e.message) || /per-day/i.test(e.message)) parked.set(key, Date.now() + PARK_MS)
        }
      }
    }
  }
  throw lastError
}

function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('model returned no JSON')
    return JSON.parse(match[0]) as T
  }
}

/** One-shot structured call. Tolerates prose/code fences, and asks once more if the JSON is broken. */
export async function askJson<T>(role: Role, system: string, user: unknown): Promise<T> {
  const messages: ChatMessage[] = [
    { role: 'system', content: `${system}\nRespond with a single JSON object and nothing else.` },
    { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user, null, 2) },
  ]
  const first = await complete(role, messages, { json: true })
  try {
    return parseJson<T>(first.content ?? '')
  } catch (e) {
    // Free models occasionally emit malformed JSON; one corrective retry before failing closed.
    const retry = await complete(
      role,
      [...messages, { role: 'assistant', content: first.content ?? '' }, { role: 'user', content: `That was not valid JSON (${(e as Error).message}). Reply again with only the corrected JSON object.` }],
      { json: true },
    )
    return parseJson<T>(retry.content ?? '')
  }
}
