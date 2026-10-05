// coinAI agent team. Orchestration is plain code (not an LLM supervisor) so the flow is
// predictable and auditable:
//
//   market ─ Market Analyst ─┐
//   state ─┬─ Savings Strategist ───────┐
//          └─ Investment Strategist ────┴─ guard (code) ─ Risk Officer (veto only) ─ executor ─ Reporter
//
// Strategists can only propose; the Risk Officer can only veto; the guard and the
// contract both enforce the user's on-chain limits. Missing/invalid reviews fail closed.

import { fetchMarket, type MarketSnapshot } from '../../shared/market.js'
import { describe, dripYield, execute, explorerTx, fmt, readUserState, type UserState } from './chain.js'
import { checkProposal, policyActive, TARGETS, type Proposal, type Target } from './guard.js'
import { askJson, complete, withUserKeys } from './llm.js'
import { kv } from './kv.js'
import { activeStrategy, type Strategy } from './pools.js'

export type Locale = 'en' | 'id' | 'zh'
const LANGUAGE: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' }
export const asLocale = (x: unknown): Locale => (x === 'id' || x === 'zh' ? x : 'en')

const MIN_INVEST = 1_000_000n // 1 tUSDT; below this, investing isn't worth the gas

export type AgentName = 'market' | 'savings' | 'investment' | 'guard' | 'risk' | 'executor'

export type Step = {
  agent: AgentName
  proposal?: { kind: Proposal['kind']; bps?: number; amount?: string; target?: Target; reason: string }
  outcome: 'analyzed' | 'proposed' | 'skipped' | 'rejected' | 'approved' | 'executed' | 'failed'
  note?: string
  txHash?: string
}

export type Profile = {
  risk: 'conservative' | 'moderate' | 'aggressive'
  horizon: 'short' | 'medium' | 'long'
  goal: string
}

export type MarketAnalysis = {
  regime: 'risk_on' | 'neutral' | 'risk_off'
  confidence: number
  summary: string
  signals: string[]
  at: string
}

export type Allocation = Record<Target, number> // percent of idle savings to invest now, per vault

export type RunResult = {
  user: string
  at: string
  mode: 'agent' | 'report-only'
  profile: Profile
  market: MarketAnalysis | null
  allocation: Allocation | null
  strategy: Strategy | null // the saved pool the user made the agents' benchmark, if any
  steps: Step[]
  executed: { kind: Proposal['kind']; reason: string; txHash: string; explorer: string }[]
  reminders: string[]
  report: string
}

type Snapshot = { totalReceived: string; paymentCount: number; savings: string; at: number }

const TEAM = `You are part of coinAI's agent team managing a user's automatic savings and investments on BNB Chain testnet.
Every incoming payment is split: a percentage goes to savings, the rest stays spendable.
Idle savings earn nothing until invested into one of three vaults: conservative (low risk), balanced (medium), growth (high risk).`

// ─── Investor profile ────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: Profile = { risk: 'moderate', horizon: 'medium', goal: '' }

export function cleanProfile(x: Partial<Profile> | null | undefined): Profile {
  return {
    risk: x?.risk === 'conservative' || x?.risk === 'aggressive' ? x.risk : 'moderate',
    horizon: x?.horizon === 'short' || x?.horizon === 'long' ? x.horizon : 'medium',
    goal: String(x?.goal ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
  }
}

export const getProfile = async (user: string) => cleanProfile(await kv.get<Profile>(`profile:${user}`).catch(() => null))
export const setProfile = (user: string, p: Profile) => kv.set(`profile:${user}`, p)

// ─── Market Analyst (shared across users, cached) ───────────────────────────

const MARKET_TTL = 300 // spot data
const ANALYSIS_TTL = 1800 // LLM read of the market

export async function getMarket(): Promise<MarketSnapshot> {
  const cached = await kv.get<MarketSnapshot>('market:snapshot').catch(() => null)
  if (cached) return cached
  const fresh = await fetchMarket()
  await kv.set('market:snapshot', fresh, MARKET_TTL).catch(() => {})
  return fresh
}

export async function getMarketAnalysis(market?: MarketSnapshot): Promise<MarketAnalysis> {
  const cached = await kv.get<MarketAnalysis>('market:analysis').catch(() => null)
  if (cached) return cached
  const m = market ?? (await getMarket())
  const out = await askJson<Partial<MarketAnalysis>>(
    'strategist',
    `${TEAM}
Role: Market Analyst. Read the crypto market data (spot prices from Chainlink on BNB Smart Chain, daily history from Binance)
and classify the current regime for a cautious long-term saver:
- "risk_on": broad uptrend with moderate volatility -> growth exposure is reasonable.
- "neutral": mixed or sideways.
- "risk_off": broad downtrend or very high volatility -> favour capital preservation.
BNB matters most (the savings live on BNB Chain); BTC is the market bellwether; CAKE reflects BNB DeFi appetite.
Cite concrete numbers. You are not giving financial advice to trade, only a regime read for allocation.
JSON shape: {"regime":"risk_on"|"neutral"|"risk_off","confidence":0..1,"summary":"<=240 chars","signals":["<=90 chars", "... up to 4"]}`,
    { at: m.at, coins: m.coins.map(({ closes: _closes, ...c }) => c) },
  )
  const analysis: MarketAnalysis = {
    regime: out.regime === 'risk_on' || out.regime === 'risk_off' ? out.regime : 'neutral',
    confidence: Math.min(1, Math.max(0, Number(out.confidence) || 0)),
    summary: '',
    signals: (Array.isArray(out.signals) ? out.signals : []).slice(0, 4).map((x) => cleanReason(x).slice(0, 90)),
    at: new Date().toISOString(),
  }
  // Free models sometimes leave the summary empty; fall back to the signals rather than show nothing.
  analysis.summary = cleanReason(out.summary).slice(0, 240) || analysis.signals.slice(0, 2).join(' ') || analysis.regime
  await kv.set('market:analysis', analysis, ANALYSIS_TTL).catch(() => {})
  return analysis
}

// ─── Strategists ─────────────────────────────────────────────────────────────

type SplitIdea = { action: 'set_split' | 'none'; percent?: number; reason?: string; confidence?: number }
type InvestIdea = { action: 'invest' | 'none'; allocation?: Partial<Allocation>; reason?: string; confidence?: number }

async function savingsStrategist(view: object, profile: Profile, lang: string, instruction?: string): Promise<SplitIdea> {
  return askJson<SplitIdea>(
    'strategist',
    `${TEAM}
Role: Savings Strategist. Decide the savings split percentage.
- Stay within agentLimits. Prefer steps of at most 10 percentage points.
- Regular, sizable income and healthy spendable balance -> saving more is reasonable.
- Irregular income, long gap since last payment, or low spendable balance -> save less or hold.
- A concrete goal in the investor profile (e.g. a trip in December) justifies saving more.
- With fewer than 2 payments there is too little data: choose "none" unless the user instruction says otherwise.
- The user instruction, if any, takes priority when it stays within limits.
Write "reason" in ${lang}.
JSON shape: {"action":"set_split"|"none","percent":number,"reason":"<=200 chars, plain language, cite the data","confidence":0..1}`,
    { state: view, investorProfile: profile, userInstruction: instruction ?? null },
  )
}

async function investmentStrategist(
  view: object,
  profile: Profile,
  market: MarketAnalysis | null,
  lang: string,
  instruction?: string,
  strategy?: Strategy | null,
): Promise<InvestIdea> {
  return askJson<InvestIdea>(
    'strategist',
    `${TEAM}
Role: Investment Strategist. Decide how much of the idle savings to invest now and how to split it across the three vaults.
- Start from the investor profile: conservative -> mostly conservative vault; moderate -> mostly balanced;
  aggressive -> meaningful growth share. Short horizon -> less risk; long horizon -> more.
- Tilt with the Market Analyst's regime: risk_off -> shift toward conservative; risk_on -> allow more growth.
  If no market read is available, stay neutral.
- Percentages are of the current idle savings; their sum must be <= 100 (keep a buffer if the user may need cash soon).
- If userStrategy is set, it is the pool the user saved as the benchmark: aim for its vaultMix
  (calm assets -> conservative, core BTC/ETH/BNB/index ETFs -> balanced, other coins and single stocks -> growth).
  Deviate by at most 15 points per vault, and only to respect a risk_off market or a clear mismatch with the profile.
  Mention the strategy by its name (e.g. "following your Pool 1 Aggressive"), never internal field names like userStrategy.
- The user instruction, if any, takes priority.
Write "reason" in ${lang}.
JSON shape: {"action":"invest"|"none","allocation":{"conservative":0-100,"balanced":0-100,"growth":0-100},"reason":"<=200 chars, cite profile and market","confidence":0..1}`,
    { state: view, investorProfile: profile, marketAnalysis: market, userStrategy: strategy ?? null, userInstruction: instruction ?? null },
  )
}

/** Normalizes an LLM allocation to integer percents per vault with a total of at most 100. */
export function cleanAllocation(x: Partial<Allocation> | undefined): Allocation {
  const raw = Object.fromEntries(TARGETS.map((t) => [t, clampPct(x?.[t])])) as Allocation
  const total = TARGETS.reduce((s, t) => s + raw[t], 0)
  if (total <= 100) return raw
  return Object.fromEntries(TARGETS.map((t) => [t, Math.floor((raw[t] * 100) / total)])) as Allocation
}

// ─── Risk Officer ────────────────────────────────────────────────────────────

type Review = { reviews?: { id?: string; approve?: boolean; note?: string }[] }

async function riskOfficer(
  view: object,
  profile: Profile,
  market: MarketAnalysis | null,
  candidates: { id: string; proposal: object }[],
  lang: string,
  instruction?: string,
  strategy?: Strategy | null,
) {
  const out = await askJson<Review>(
    'risk',
    `${TEAM}
Role: Risk Officer. Review each proposal. You can approve or veto, never modify.
Veto when the reason contradicts the data, the move is too aggressive for how little data exists or for the investor profile,
it ignores a risk_off market read, it conflicts with the user instruction, or it leaves the user without a sensible buffer.
Proposals with ids "invest:<vault>" are legs of ONE allocation that share a single reason: judge the allocation as a whole
(a small conservative leg inside an aggressive allocation is diversification, not a contradiction), then approve or veto each leg.
An allocation that follows the user's own saved strategy (userStrategy.vaultMix) reflects their explicit choice: approve it
unless the market read is risk_off and it ignores that, or it leaves no buffer.
Write each "note" in ${lang}.
JSON shape: {"reviews":[{"id":"<proposal id>","approve":true|false,"note":"<=160 chars"}]}`,
    { state: view, investorProfile: profile, marketAnalysis: market, userStrategy: strategy ?? null, userInstruction: instruction ?? null, proposals: candidates },
  )
  return new Map((out.reviews ?? []).map((r) => [r.id, r]))
}

// ─── Reminders (deterministic) & Reporter ────────────────────────────────────

export function reminders(s: UserState): string[] {
  const out: string[] = []
  const day = 86400
  if (policyActive(s) && s.policy.expiry - s.now < 3 * day) out.push('Agent permission expires within 3 days — renew it on the Agent page.')
  if (!policyActive(s)) out.push('The AI agent is not enabled — enable it on the Agent page to let coinAI manage your savings.')
  if (s.lockUntil > s.now && s.lockUntil - s.now < 3 * day) out.push('Your savings lock ends within 3 days.')
  if (s.lastPaymentAt && s.now - s.lastPaymentAt > 7 * day) out.push('No payments received in over 7 days — share your payment link.')
  if (s.savings >= MIN_INVEST * 10n) out.push(`${fmt(s.savings)} of savings is idle and not invested.`)
  return out
}

async function reporter(s: UserState, run: Omit<RunResult, 'report'>, locale: Locale): Promise<string> {
  const prev = await kv.get<Snapshot>(`snap:${s.user}`).catch(() => null)
  const sinceLast = prev && {
    hoursAgo: Math.round((s.now - prev.at) / 3600),
    newPayments: s.paymentCount - prev.paymentCount,
    received: fmt(s.totalReceived - BigInt(prev.totalReceived)),
  }
  const msg = await complete('reporter', [
    {
      role: 'system',
      content: `${TEAM}
Role: Reporter. Write the user's savings & investment update in ${LANGUAGE[locale]}.
Plain text (no markdown headings), max ~140 words, friendly and concrete, amounts in tUSDT.
Structure: one-line summary; one line on the market read; then "•" bullets for what changed and what the agents did
(with their reasons); then the reminders. Never invent numbers; use only the data given.`,
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          state: describe(s),
          sinceLastReport: sinceLast,
          investorProfile: run.profile,
          marketAnalysis: run.market,
          agentSteps: run.steps,
          executed: run.executed,
          reminders: run.reminders,
        },
        null,
        2,
      ),
    },
  ])
  return msg.content?.trim() || run.reminders.join('\n')
}

export async function saveSnapshot(s: UserState) {
  await kv.set(`snap:${s.user}`, {
    totalReceived: s.totalReceived.toString(),
    paymentCount: s.paymentCount,
    savings: s.savings.toString(),
    at: s.now,
  } satisfies Snapshot)
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

function clampPct(x: unknown) {
  return Math.min(100, Math.max(0, Math.round(Number(x) || 0)))
}
function cleanReason(x: unknown) {
  return String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 280)
}
const agentFor = (id: string): AgentName => (id === 'split' ? 'savings' : 'investment')

const runningKey = (user: string) => `running:${user}`
export const isRunning = async (user: string) => (await kv.get<number>(runningKey(user)).catch(() => null)) !== null

/** Runs the team; a short-lived flag lets a reopened page show "still running" and poll for the result. */
export async function runSwarm(
  user: string,
  opts: { locale?: Locale; instruction?: string; reportOnly?: boolean } = {},
): Promise<RunResult> {
  await kv.set(runningKey(user), Date.now(), 300).catch(() => {})
  try {
    // Testnet: accrue simulated vault yield first, so the report reflects it (never blocks the run).
    await dripYield().catch((e) => console.error('dripYield', e))
    return await withUserKeys(user, () => runTeam(user, opts))
  } finally {
    await kv.del(runningKey(user)).catch(() => {})
  }
}

async function runTeam(user: string, opts: { locale?: Locale; instruction?: string; reportOnly?: boolean }): Promise<RunResult> {
  const locale = opts.locale ?? 'en'
  const [s, profile, strategy] = await Promise.all([readUserState(user), getProfile(user), activeStrategy(user).catch(() => null)])
  const view = describe(s)
  const steps: Step[] = []
  const executed: RunResult['executed'] = []
  const active = policyActive(s) && !opts.reportOnly
  let allocation: Allocation | null = null

  // 0. Market read — shared and cached, so it's cheap even for report-only runs.
  let market: MarketAnalysis | null = null
  try {
    market = await getMarketAnalysis()
    steps.push({ agent: 'market', outcome: 'analyzed', note: `${market.regime}: ${market.summary}` })
  } catch (e) {
    steps.push({ agent: 'market', outcome: 'failed', note: (e as Error).message.slice(0, 200) })
  }

  if (active) {
    // 1. Strategists in parallel. One failing doesn't sink the other.
    const [split, invest] = await Promise.allSettled([
      savingsStrategist(view, profile, LANGUAGE[locale], opts.instruction),
      s.savings >= MIN_INVEST
        ? investmentStrategist(view, profile, market, LANGUAGE[locale], opts.instruction, strategy)
        : Promise.resolve<InvestIdea>({ action: 'none', reason: 'idle savings below 1 tUSDT' }),
    ])

    const proposals: { id: string; p: Proposal }[] = []
    if (split.status === 'rejected') steps.push({ agent: 'savings', outcome: 'failed', note: String(split.reason) })
    else if (split.value.action === 'set_split') {
      proposals.push({ id: 'split', p: { kind: 'set_split', bps: clampPct(split.value.percent) * 100, reason: cleanReason(split.value.reason) } })
    } else steps.push({ agent: 'savings', outcome: 'skipped', note: cleanReason(split.value.reason) })

    if (invest.status === 'rejected') steps.push({ agent: 'investment', outcome: 'failed', note: String(invest.reason) })
    else if (invest.value.action === 'invest') {
      allocation = cleanAllocation(invest.value.allocation)
      const reason = cleanReason(invest.value.reason)
      for (const target of TARGETS) {
        const amount = (s.savings * BigInt(allocation[target])) / 100n
        if (amount > 0n) proposals.push({ id: `invest:${target}`, p: { kind: 'invest', amount, target, reason } })
      }
    } else steps.push({ agent: 'investment', outcome: 'skipped', note: cleanReason(invest.value.reason) })

    // 2. Deterministic guard, tracking idle savings already committed by earlier proposals.
    let remaining = s.savings
    const passed = proposals.filter(({ id, p }) => {
      steps.push({ agent: agentFor(id), proposal: stepProposal(p), outcome: 'proposed' })
      const why = checkProposal(p, { ...s, savings: remaining })
      if (why) steps.push({ agent: 'guard', proposal: stepProposal(p), outcome: 'rejected', note: why })
      else if (p.kind === 'invest') remaining -= p.amount
      return !why
    })

    // 3. Risk Officer — veto only, fails closed.
    let reviews = new Map<string | undefined, { approve?: boolean; note?: string }>()
    if (passed.length) {
      try {
        reviews = await riskOfficer(view, profile, market, passed.map(({ id, p }) => ({ id, proposal: stepProposal(p) })), LANGUAGE[locale], opts.instruction, strategy)
      } catch (e) {
        steps.push({ agent: 'risk', outcome: 'failed', note: `review unavailable: ${(e as Error).message}` })
      }
    }

    // 4. Execute approved proposals; split first so later payments use the new rate.
    for (const { id, p } of passed) {
      const r = reviews.get(id)
      if (!r?.approve) {
        steps.push({ agent: 'risk', proposal: stepProposal(p), outcome: 'rejected', note: cleanReason(r?.note) || 'no approval' })
        continue
      }
      steps.push({ agent: 'risk', proposal: stepProposal(p), outcome: 'approved', note: cleanReason(r.note) })
      try {
        const txHash = await execute(s.user, p)
        steps.push({ agent: 'executor', proposal: stepProposal(p), outcome: 'executed', txHash })
        executed.push({ kind: p.kind, reason: p.reason, txHash, explorer: explorerTx(txHash) })
      } catch (e) {
        steps.push({ agent: 'executor', proposal: stepProposal(p), outcome: 'failed', note: (e as Error).message.slice(0, 200) })
      }
    }
  }

  // Re-read so the report reflects what actually landed on-chain.
  const after = executed.length ? await readUserState(user) : s
  const partial = {
    user: s.user,
    at: new Date().toISOString(),
    mode: active ? ('agent' as const) : ('report-only' as const),
    profile,
    market,
    allocation,
    strategy,
    steps,
    executed,
    reminders: reminders(after),
  }
  const result: RunResult = { ...partial, report: await reporter(after, partial, locale).catch(() => partial.reminders.join('\n')) }
  await kv.push(`runs:${s.user}`, result, 20).catch(() => {})
  return result
}

function stepProposal(p: Proposal): NonNullable<Step['proposal']> {
  return p.kind === 'set_split'
    ? { kind: p.kind, bps: p.bps, reason: p.reason }
    : { kind: p.kind, amount: fmt(p.amount), target: p.target, reason: p.reason }
}
