// Chat Advisor shared by the web chat (/api/agent/chat) and the Telegram bot (/api/telegram).
// It never moves funds itself: any change goes through run_agent_team, i.e. the full agent
// pipeline with guardrails and the risk officer.

import { describe, readUserState } from './chain.js'
import { kv } from './kv.js'
import { complete, withUserKeys, type ChatMessage, type Tool } from './llm.js'
import { getMarket, getMarketAnalysis, getProfile, runSwarm, type Locale, type RunResult } from './swarm.js'

const LANGUAGE: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' }
const MAX_ROUNDS = 4
export const MAX_HISTORY = 12

const TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'get_state',
      description: "Read the user's live on-chain savings state, payment stats, agent limits, vault options and investor profile.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market',
      description: 'Read the live crypto market (BNB, BTC, ETH, CAKE from Chainlink on BNB Chain + Binance history) and the Market Analyst regime read.',
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
        'Ask the agent team (market analyst, savings and investment strategists, reviewed by a risk officer) to act now. ' +
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

export type Turn = { role: 'user' | 'assistant'; content: string }

// One conversation per wallet, shared by the web chat and Telegram, kept for 7 days.
const CHAT_TTL = 7 * 86400
const STORED_TURNS = 40 // shown in the app; the model only sees the last MAX_HISTORY
const chatKey = (user: string) => `chat:${user}`
const pendingKey = (user: string) => `chat:pending:${user}`

export const loadChat = async (user: string) => (await kv.get<Turn[]>(chatKey(user)).catch(() => null)) ?? []
export const chatPending = async (user: string) => (await kv.get<number>(pendingKey(user)).catch(() => null)) !== null
export const clearChat = (user: string) => Promise.all([kv.del(chatKey(user)), kv.del(pendingKey(user))])

/** Stores the user's message first and the reply when it's ready, so leaving the page loses nothing. */
export async function chatTurn(user: string, message: string, locale: Locale, channel: 'web' | 'telegram') {
  const stored = [...(await loadChat(user)), { role: 'user' as const, content: message.slice(0, 2000) }].slice(-STORED_TURNS)
  await kv.set(chatKey(user), stored, CHAT_TTL)
  await kv.set(pendingKey(user), Date.now(), 300)
  try {
    const { reply, run } = await withUserKeys(user, () => advise(user, cleanHistory(stored), locale, channel))
    const messages = [...stored, { role: 'assistant' as const, content: reply }].slice(-STORED_TURNS)
    await kv.set(chatKey(user), messages, CHAT_TTL)
    return { reply, run, messages }
  } finally {
    await kv.del(pendingKey(user)).catch(() => {})
  }
}

/** Keeps only well-formed user/assistant turns, trimmed to the last MAX_HISTORY. */
export function cleanHistory(messages: unknown): Turn[] {
  return (Array.isArray(messages) ? messages : [])
    .filter((m): m is Turn => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
}

export async function advise(
  user: string,
  history: Turn[],
  locale: Locale,
  channel: 'web' | 'telegram',
): Promise<{ reply: string; run?: RunResult }> {
  const style =
    channel === 'telegram'
      ? 'You are chatting on Telegram: at most ~120 words. For settings, point to the coinAI web app.'
      : 'Keep answers short: at most ~90 words, lead with the answer.'
  const convo: ChatMessage[] = [
    {
      role: 'system',
      content: `You are coinAI, a friendly savings & investing assistant on BNB Chain testnet (token: tUSDT).
Each incoming payment is auto-split into spendable and savings; idle savings can go into conservative/balanced/growth vaults.
You never move funds yourself. For any change the user asks for, call run_agent_team with their goal;
the team acts only within the user's on-chain limits, and the risk officer may decline.
If the agent is not enabled or has expired (see get_state agentLimits), tell the user to enable it on the Agent page.
Use get_market for questions about prices or the market; you explain, you never promise returns or give trading signals.
The user's investor profile (risk, horizon, goal) is edited on the Investment Strategist page.
Always check get_state before quoting numbers.
Reply in the language of the user's latest message (if unclear, use ${LANGUAGE[locale]}).
Plain text only: no markdown, no asterisks or headings; use short lines and "•" for lists. ${style}`,
    },
    ...history,
  ]

  let run: RunResult | undefined
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await complete('chat', convo, { tools: TOOLS })
    convo.push(msg)
    if (!msg.tool_calls?.length) return { reply: msg.content?.trim() || '…', run }

    for (const call of msg.tool_calls) {
      let result: unknown
      try {
        if (call.function.name === 'get_state') {
          result = { ...describe(await readUserState(user)), investorProfile: await getProfile(user) }
        } else if (call.function.name === 'get_market') {
          const market = await getMarket()
          result = {
            coins: market.coins.map(({ closes: _closes, ...c }) => c),
            analysis: await getMarketAnalysis(market).catch(() => null),
          }
        } else if (call.function.name === 'get_recent_runs') {
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
  return { reply: '…', run }
}
