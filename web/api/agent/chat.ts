import { describe, readUserState } from '../_lib/chain.js'
import { bearer, body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { complete, type ChatMessage, type Tool } from '../_lib/llm.js'
import { asLocale, runSwarm, type RunResult } from '../_lib/swarm.js'

const LANGUAGE = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' }
const MAX_ROUNDS = 4

const TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_state',
      description: "Read the user's live on-chain savings state, payment stats, agent limits and vault options.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_runs',
      description: 'Read what the agent team did recently, with reasons and transaction links.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_agent_team',
      description:
        'Ask the agent team (savings + yield strategists, reviewed by a risk officer) to act now. ' +
        "Use only when the user asks for a change. Pass the user's goal as a clear instruction. " +
        "Changes stay within the user's on-chain limits.",
      parameters: {
        type: 'object',
        properties: { instruction: { type: 'string', description: "The user's goal in one or two sentences" } },
        required: ['instruction'],
      },
    },
  },
]

type Incoming = { role: 'user' | 'assistant'; content: string }

// POST { messages: [{role, content}], locale } with Authorization: Bearer <token> → { reply, run? }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if ((await kv.hit(`rl:chat:${user}`, 600)) > 30) return json({ error: 'rate_limited' }, 429)

  const { messages, locale: rawLocale } = await body<{ messages: Incoming[]; locale: string }>(req)
  const locale = asLocale(rawLocale)
  const history = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }) as ChatMessage)
  if (!history.length) return json({ error: 'empty' }, 400)

  const convo: ChatMessage[] = [
    {
      role: 'system',
      content: `You are coinAI, a friendly savings assistant on BNB Chain testnet (token: tUSDT).
Each incoming payment is auto-split into spendable and savings; idle savings can go into conservative/balanced/growth vaults.
You never move funds yourself. For any change the user asks for, call run_agent_team with their goal;
the team acts only within the user's on-chain limits, and the risk officer may decline.
If the agent is not enabled or has expired (see get_state agentLimits), tell the user to enable it on the Agent page.
Always check get_state before quoting numbers. Reply in ${LANGUAGE[locale]}, concisely.`,
    },
    ...history,
  ]

  let run: RunResult | undefined
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const msg = await complete('chat', convo, { tools: TOOLS })
      convo.push(msg)
      if (!msg.tool_calls?.length) return json({ reply: msg.content ?? '', run })

      for (const call of msg.tool_calls) {
        let result: unknown
        try {
          if (call.function.name === 'get_state') result = describe(await readUserState(user))
          else if (call.function.name === 'get_recent_runs') {
            result = (await kv.list<RunResult>(`runs:${user}`, 5)).map(({ at, steps, executed }) => ({ at, steps, executed }))
          } else if (call.function.name === 'run_agent_team') {
            if (run) result = { error: 'the team already ran in this reply' }
            else {
              const args = JSON.parse(call.function.arguments || '{}') as { instruction?: string }
              run = await runSwarm(user, { locale, instruction: String(args.instruction ?? '').slice(0, 500) })
              result = { steps: run.steps, executed: run.executed }
            }
          } else result = { error: 'unknown tool' }
        } catch (e) {
          result = { error: (e as Error).message }
        }
        convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
    }
    return json({ reply: '…', run })
  } catch (e) {
    return json({ error: (e as Error).message, run }, 500)
  }
}
