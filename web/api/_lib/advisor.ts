// Chat Advisor shared by the web chat (/api/agent/chat) and the Telegram bot (/api/telegram).
// It never moves funds itself: any change goes through run_agent_team, i.e. the full agent
// pipeline with guardrails and the risk officer.

import { fetchHistory } from '../../shared/market.js'
import { backtest, POOL_ASSETS, vaultMix } from '../../shared/pool.js'
import { describe, readUserState, yieldSpeedup } from './chain.js'
import { loadPools, setActivePool } from './pools.js'
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
      name: 'get_assets',
      description:
        'Last-90-day return, volatility and worst drop for up to 8 assets the user can put in a simulated pool: ' +
        `${POOL_ASSETS.map((a) => a.symbol).join(', ')} (crypto, tokenized US stocks/ETFs, PAXG gold, USDT).`,
      parameters: {
        type: 'object',
        properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'Tickers, e.g. ["NVDA","BTC","PAXG"]' } },
        required: ['symbols'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_strategy',
      description:
        "Make one of the user's saved pools the AI benchmark (the Investment Strategist follows its vault mix), or clear it. " +
        'Use only when the user asks. Pass the pool name as they say it, or null to stop following a pool.',
      parameters: {
        type: 'object',
        properties: { pool_name: { type: ['string', 'null'], description: 'Saved pool name, or null to clear' } },
        required: ['pool_name'],
      },
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

/** Both channels show plain text; drop the markdown free models add anyway (**bold**, # headings, stray bullets). */
export function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\s*•\s*$/, '')
    .trim()
}

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
    const answer = await withUserKeys(user, () => advise(user, cleanHistory(stored), locale, channel))
    const { run } = answer
    const reply = plainText(answer.reply) || '…'
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
Each incoming payment is auto-split into spendable and savings; idle savings can go into conservative/balanced/growth vaults or the AI Smart Money basket (tUSDT, BNB, BTC, ETH, CAKE; Plutus sets its weights).
You never move funds yourself. For any change the user asks for, call run_agent_team with their goal;
the team acts only within the user's on-chain limits, and the risk officer may decline.
If the agent is not enabled or has expired (see get_state agentLimits), tell the user to enable it on the Agent page.
Use get_market for questions about prices or the market, and get_assets for a coin, tokenized stock/ETF or gold over 90 days;
you explain, you never promise returns or give trading signals. Tokenized stocks are only simulated in coinAI, never sold.
The user's investor profile (risk, horizon, goal) is edited on the Investment Strategist page.
On the Market page the user builds and saves pools (crypto, tokenized stocks/ETFs, gold, stablecoin); one can be the AI
benchmark that steers how savings are split across the vaults (see get_state savedPools / activeStrategy; set_strategy switches it).
To add money, the user deposits tUSDT or tBNB in the app ("Deposit into coinAI" on the Get test funds page); you cannot do it for them.
On testnet the vault yield is simulated (vaults are topped up by their APY, sped up), so mention that when talking about earnings.
Always check get_state before quoting numbers.
Reply in the language of the user's latest message (if unclear, use ${LANGUAGE[locale]}).
Plain text only: no markdown, no asterisks or headings; use short lines and "•" for lists. ${style}`,
    },
    ...history,
  ]

  // Free models sometimes end a turn with no text (often right after a tool call) or keep calling
  // tools; then ask once more for the answer, with tools off.
  const finalReply = async () => {
    const msg = await complete('chat', [...convo, { role: 'user', content: 'Answer me now in plain text, based on the tool results above.' }])
    return msg.content?.trim() || '…'
  }

  let run: RunResult | undefined
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await complete('chat', convo, { tools: TOOLS })
    convo.push(msg)
    if (!msg.tool_calls?.length) return { reply: msg.content?.trim() || (round > 0 ? await finalReply() : '…'), run }

    for (const call of msg.tool_calls) {
      let result: unknown
      try {
        if (call.function.name === 'get_state') {
          const [state, profile, pools] = await Promise.all([readUserState(user), getProfile(user), loadPools(user)])
          const active = pools.pools.find((p) => p.id === pools.activeId)
          result = {
            ...describe(state),
            investorProfile: profile,
            savedPools: pools.pools.map((p) => ({ name: p.name, weights: p.weights, vaultMix: vaultMix(p.weights) })),
            activeStrategy: active ? { name: active.name, vaultMix: vaultMix(active.weights) } : null,
            testnetYield: `simulated: vaults are topped up by their APY, sped up ${yieldSpeedup()}x`,
          }
        } else if (call.function.name === 'get_market') {
          const market = await getMarket()
          result = {
            coins: market.coins.map(({ closes: _closes, ...c }) => c),
            analysis: await getMarketAnalysis(market).catch(() => null),
          }
        } else if (call.function.name === 'get_recent_runs') {
          result = (await kv.list<RunResult>(`runs:${user}`, 5)).map(({ at, strategy, allocation, steps, executed }) => ({
            at,
            strategy: strategy?.name ?? null,
            allocation,
            steps,
            executed,
          }))
        } else if (call.function.name === 'get_assets') {
          const args = JSON.parse(call.function.arguments || '{}') as { symbols?: string[] }
          const wanted = POOL_ASSETS.filter((a) => a.pair && (args.symbols ?? []).map((x) => String(x).toUpperCase()).includes(a.symbol)).slice(0, 8)
          const history = await fetchHistory(wanted.map((a) => a.pair!), 90)
          result = wanted.flatMap((a) => {
            const closes = history[a.pair!]
            if (!closes) return []
            const s = backtest({ [a.symbol]: 100 }, { [a.symbol]: closes })
            const r = (x: number) => Math.round(x * 10) / 10
            return [{ symbol: a.symbol, name: a.name, category: a.category, price: closes[closes.length - 1], days: s.days, returnPct: r(s.totalReturn), volatilityPct: r(s.volatility), worstDropPct: r(s.maxDrawdown) }]
          })
        } else if (call.function.name === 'set_strategy') {
          const args = JSON.parse(call.function.arguments || '{}') as { pool_name?: string | null }
          const pools = await loadPools(user)
          const name = args.pool_name?.trim().toLowerCase()
          const match = name ? (pools.pools.find((p) => p.name.toLowerCase() === name) ?? pools.pools.find((p) => p.name.toLowerCase().includes(name))) : null
          if (name && !match) result = { error: 'no saved pool with that name', savedPools: pools.pools.map((p) => p.name) }
          else {
            await setActivePool(user, match?.id ?? null)
            result = match ? { active: match.name, vaultMix: vaultMix(match.weights) } : { active: null }
          }
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
  return { reply: await finalReply(), run }
}
