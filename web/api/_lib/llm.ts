import { env } from './chain.js'

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

export async function complete(
  role: Role,
  messages: ChatMessage[],
  opts: { tools?: Tool[]; json?: boolean } = {},
): Promise<Extract<ChatMessage, { role: 'assistant' }>> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'X-Title': 'coinAI',
    },
    body: JSON.stringify({
      model: modelFor(role),
      messages,
      temperature: role === 'reporter' || role === 'chat' ? 0.5 : 0.2,
      ...(opts.tools && { tools: opts.tools }),
      ...(opts.json && { response_format: { type: 'json_object' } }),
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = await res.json().catch(() => null)
  const msg = body?.choices?.[0]?.message
  if (!res.ok || !msg) throw new Error(`openrouter ${res.status}: ${body?.error?.message ?? 'no message'}`)
  return { role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls }
}

/** One-shot structured call. Tolerates models that wrap JSON in prose or code fences. */
export async function askJson<T>(role: Role, system: string, user: unknown): Promise<T> {
  const msg = await complete(
    role,
    [
      { role: 'system', content: `${system}\nRespond with a single JSON object and nothing else.` },
      { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user, null, 2) },
    ],
    { json: true },
  )
  const text = msg.content ?? ''
  try {
    return JSON.parse(text) as T
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`${role}: model returned no JSON`)
    return JSON.parse(match[0]) as T
  }
}
