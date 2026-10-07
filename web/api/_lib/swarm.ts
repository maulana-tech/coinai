// coinAI agent team. Orchestration is plain code (not an LLM supervisor) so the flow is
// predictable and auditable:
//
//   market ─ Market Analyst ─┐
//   state + recent runs ─┬─ Savings Strategist ───────┐
//                        └─ Investment Strategist ────┴─ confidence gate + guard (code) ─ Risk Officer (veto only) ─ executor ─ Reporter
//
// Strategists can only propose; the Risk Officer can only veto; the guard and the
// contract both enforce the user's on-chain limits. The investment mix is bounded around a
// reference (saved pool or profile) in code. Missing/invalid reviews and confidences fail closed.

import type { VaultMix } from '../../shared/pool.js'
import { fetchMarket, type MarketSnapshot } from '../../shared/market.js'
import { describe, dripYield, execute, explorerTx, fmt, readUserState, type UserState } from './chain.js'
import { confidenceGate, fitAllocation, MAX_TILT, MIN_CONFIDENCE, readConfidence, referenceMix, riskOffRebalance, type Reference } from './decision.js'
import { checkProposal, hasSkill, policyActive, POSITIONS, SKILL_INVEST, TARGETS, type Position, type Proposal, type Target } from './guard.js'
import { askJson, complete, llmFailure, withUserKeys, type LlmFailure } from './llm.js'
import { kv } from './kv.js'
import { activeStrategy, type Strategy } from './pools.js'
import { getGoals, goalProgress } from './rewards.js'

export type Locale = 'en' | 'id' | 'zh'
export const LANGUAGE: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' }
export const asLocale = (x: unknown): Locale => (x === 'id' || x === 'zh' ? x : 'en')

const MIN_INVEST = 1_000_000n // 1 tUSDT; below this, investing isn't worth the gas

export type AgentName = 'market' | 'savings' | 'investment' | 'guard' | 'risk' | 'executor'

export type Step = {
  agent: AgentName
  proposal?: { kind: Proposal['kind']; bps?: number; amount?: string; target?: Position; from?: Position; fundId?: number; reason: string }
  outcome: 'analyzed' | 'proposed' | 'skipped' | 'rejected' | 'approved' | 'executed' | 'failed'
  note?: string
  code?: LlmFailure // set when an LLM call failed, so the app can say why in plain words
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

/** How the agents arrived at this run's numbers; shown as the "why this mix" table in the app. */
export type Decision = {
  reference: Reference // the mix the strategist starts from: saved pool or investor profile
  mix: VaultMix | null // final share of the invested amount per vault (sum 100), after the tilt bound
  investPercent: number // share of idle savings invested this run; the rest stays as a buffer
  clamped: boolean // the strategist went past reference ± maxTilt and code pulled it back
  maxTilt: number
  minConfidence: number
  confidence: { savings: number | null; investment: number | null }
  split: { from: number; to: number | null } // savings split percent before, and as proposed (null = no change)
  skipped: { savings?: string; investment?: string } // confidence-gate reason when a proposal was not executed
  spendable: number // spendable balance (tUSDT) when the run started; the next runs compare against it
  previous: { at: string; mix: VaultMix | null; splitPercent: number | null } | null
}

export type RunResult = {
  user: string
  at: string
  mode: 'agent' | 'report-only'
  profile: Profile
  market: MarketAnalysis | null
  allocation: Allocation | null
  strategy: Strategy | null // the saved pool the user made the agents' benchmark, if any
  decision: Decision | null // agent mode only
  steps: Step[]
  executed: { kind: Proposal['kind']; reason: string; txHash: string; explorer: string }[]
  reminders: string[]
  report: string
}

type Snapshot = { totalReceived: string; paymentCount: number; savings: string; at: number }

const TEAM = `You are part of coinAI's agent team managing a user's automatic savings and investments on BNB Chain testnet.
Every incoming payment is split: a percentage goes to savings, the rest stays spendable.
Idle savings earn nothing until invested into one of three vaults: conservative (low risk), balanced (medium), growth (high risk).
Savings may also sit in the AI Smart Money basket (tUSDT, BNB, BTC, ETH, CAKE), whose weights another agent (Plutus) manages; you don't allocate to it.`

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

export type SplitIdea = { action: 'set_split' | 'none'; percent?: number; reason?: string; confidence?: number }
export type InvestIdea = { action: 'invest' | 'none'; allocation?: Partial<Allocation>; reason?: string; confidence?: number }

/** What every LLM role in one run sees besides its own instructions. */
export type Context = {
  view: object
  profile: Profile
  market: MarketAnalysis | null
  strategy: Strategy | null
  reference: Reference
  recent: RecentRun[]
  lang: string
  instruction?: string
}

const CONFIDENCE = `"confidence" is how well the data supports the move, 0..1. Be honest: thin or conflicting data means low confidence.
Below ${MIN_CONFIDENCE} the move is skipped, not executed.`

const MEMORY = `recentRuns are the team's last runs on this account, newest first. Don't reverse a move from those runs unless the data changed
(new payments, a different market regime, a user instruction); when you change direction, say what changed. Don't repeat a move just made.`

export async function savingsStrategist(c: Context): Promise<SplitIdea> {
  return askJson<SplitIdea>(
    'strategist',
    `${TEAM}
Role: Savings Strategist. Decide the savings split percentage.
- Stay within agentLimits. Prefer steps of at most 10 percentage points.
- Regular, sizable income and healthy spendable balance -> saving more is reasonable, but only if money from earlier
  payments was still left when this one arrived: spendableBalance clearly above the spendable part of an average payment
  (averagePayment x (100 - savingsSplitPercent)%), by a quarter of a payment or more. Less than that: don't raise.
- Irregular income, a gap much longer than this person's usual rhythm, low spendable balance, or next to nothing left
  over from earlier payments (they ran dry before this payday) -> save less.
- Compare with recentRuns' spendableBalance: if what is left over keeps shrinking run after run, don't raise even if it
  still looks comfortable, and save less once it is under a quarter of a payment. Judge gaps against their own rhythm: 30 days is normal for a monthly salary.
- A concrete goal in the investor profile (e.g. a trip in December), or a savings goal (state.savingsGoals) that is
  behind for its deadline, justifies saving more.
- With fewer than 2 payments there is too little data: choose "none" unless the user instruction says otherwise.
- The user instruction, if any, takes priority when it stays within limits.
${MEMORY}
${CONFIDENCE}
Write "reason" in ${c.lang}.
JSON shape: {"action":"set_split"|"none","percent":number,"reason":"<=200 chars, plain language, cite the data","confidence":0..1}`,
    { state: c.view, investorProfile: c.profile, recentRuns: c.recent, userInstruction: c.instruction ?? null },
  )
}

export async function investmentStrategist(c: Context): Promise<InvestIdea> {
  return askJson<InvestIdea>(
    'strategist',
    `${TEAM}
Role: Investment Strategist. Decide how much of the idle savings to invest now and how to split it across the three vaults.
- Start from referenceMix (percent of the invested amount per vault). Its source is "strategy" when the user saved a pool
  as the benchmark (userStrategy; calm assets -> conservative, core BTC/ETH/BNB/index ETFs -> balanced, other coins and
  single stocks -> growth), or "profile" when it comes from the investor profile (risk level, shifted by horizon).
- Tilt with the Market Analyst's regime: risk_off -> shift toward conservative; risk_on -> allow more growth.
  If no market read is available, stay at the reference.
- Deviate at most ${MAX_TILT} points per vault from referenceMix; code pulls anything further back.
- Allocation percentages are of the current idle savings; their sum must be <= 100 (keep a buffer if the user may need cash soon).
- With a strategy, mention it by its name (e.g. "following your Pool 1 Aggressive"); never use internal field names.
- The user instruction, if any, takes priority.
${MEMORY}
${CONFIDENCE}
Write "reason" in ${c.lang}.
JSON shape: {"action":"invest"|"none","allocation":{"conservative":0-100,"balanced":0-100,"growth":0-100},"reason":"<=200 chars, cite reference, profile and market","confidence":0..1}`,
    {
      state: c.view,
      investorProfile: c.profile,
      marketAnalysis: c.market,
      referenceMix: { source: c.reference.source, ...c.reference.mix },
      userStrategy: c.strategy,
      recentRuns: c.recent,
      userInstruction: c.instruction ?? null,
    },
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

async function riskOfficer(c: Context, candidates: { id: string; proposal: object }[]) {
  const out = await askJson<Review>(
    'risk',
    `${TEAM}
Role: Risk Officer. Review each proposal. You can approve or veto, never modify.
Veto when the reason contradicts the data, the move is too aggressive for how little data exists or for the investor profile,
it ignores a risk_off market read, it conflicts with the user instruction, it reverses a recent run without a change in the data
(see recentRuns, newest first), or it leaves the user without a sensible buffer.
Proposals with ids "invest:<vault>" are legs of ONE allocation that share a single reason: judge the allocation as a whole
(a small conservative leg inside an aggressive allocation is diversification, not a contradiction), then approve or veto each leg.
The proposal with id "rebalance" moves value between the user's own positions on a fresh risk_off read: approve it unless the
market data contradicts risk_off.
An allocation close to referenceMix with source "strategy" follows the user's own saved pool, their explicit choice: approve it
unless the market read is risk_off and it ignores that, or it leaves no buffer.
Write each "note" in ${c.lang}.
JSON shape: {"reviews":[{"id":"<proposal id>","approve":true|false,"note":"<=160 chars"}]}`,
    {
      state: c.view,
      investorProfile: c.profile,
      marketAnalysis: c.market,
      referenceMix: { source: c.reference.source, ...c.reference.mix },
      userStrategy: c.strategy,
      recentRuns: c.recent,
      userInstruction: c.instruction ?? null,
      proposals: candidates,
    },
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

// Athena's rebalance reason is code-written (no LLM), so it's localized here.
const RISK_OFF_REASON: Record<Locale, (summary: string) => string> = {
  en: (m) => `Market turned risk-off, moving the Growth position to Conservative to protect it. ${m}`,
  id: (m) => `Pasar berubah risk-off, posisi Growth dipindah ke Conservative untuk melindunginya. ${m}`,
  zh: (m) => `市场转为避险，将成长型仓位转入稳健型以保护资金。${m}`,
}

// ─── Memory: what the team did on this account lately ───────────────────────

const MEMORY_RUNS = 5

/** Compact view of a past run for the prompts: what was decided, what landed, what was skipped and why. */
export type RecentRun = {
  hoursAgo: number
  marketRegime: MarketAnalysis['regime'] | null
  splitPercent: { from: number; to: number } | null
  spendableBalance: number | null
  investedMix: VaultMix | null
  investPercent: number | null
  executed: string[]
  notDone: string[]
}

function toRecent(r: RunResult, now: number): RecentRun {
  const d = r.decision
  const executedSplit = r.steps.find((x) => x.agent === 'executor' && x.outcome === 'executed' && x.proposal?.kind === 'set_split')
  return {
    hoursAgo: Math.max(0, Math.round((now - Date.parse(r.at) / 1000) / 3600)),
    marketRegime: r.market?.regime ?? null,
    splitPercent: d && executedSplit?.proposal?.bps ? { from: d.split.from, to: executedSplit.proposal.bps / 100 } : null,
    spendableBalance: d?.spendable ?? null,
    investedMix: r.allocation ? (d?.mix ?? null) : null,
    investPercent: r.allocation ? (d?.investPercent ?? null) : null,
    executed: r.executed.map((e) => e.reason).slice(0, 4),
    notDone: r.steps
      .filter((x) => (x.outcome === 'rejected' || x.outcome === 'skipped') && x.note && x.agent !== 'market')
      .map((x) => `${x.agent}: ${x.note}`.slice(0, 160))
      .slice(0, 4),
  }
}

/** The account's last agent-mode runs, newest first. */
async function recentRuns(user: string): Promise<RunResult[]> {
  const runs = await kv.list<RunResult>(`runs:${user}`, MEMORY_RUNS).catch(() => [])
  return runs.filter((r) => r.mode === 'agent')
}

const MODELS_DOWN: Record<Locale, string> = {
  en: 'The AI models were unavailable, so the team changed nothing. Your savings, split and limits are untouched.',
  id: 'Model AI sedang tidak tersedia, jadi tim tidak mengubah apa pun. Tabungan, porsi, dan batasmu tetap aman.',
  zh: 'AI 模型暂不可用，团队未做任何更改。你的储蓄、比例和限额均保持不变。',
}

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
  const [s, profile, strategy, past, goals] = await Promise.all([
    readUserState(user),
    getProfile(user),
    activeStrategy(user).catch(() => null),
    recentRuns(user),
    getGoals(user),
  ])
  // C1: the user's savings pockets, so a goal with a close deadline can justify saving more
  const saved = Number(POSITIONS.reduce((sum, p) => sum + s.positions[p], s.savings)) / 1e6
  const view = {
    ...describe(s),
    savingsGoals: goals.map((g) => {
      const p = goalProgress(g, saved, s.now)
      return { name: g.name, target: `${g.target} tUSDT`, sharePercent: g.share, saved: `${p.saved} tUSDT`, progressPercent: p.pct, daysLeft: p.daysLeft }
    }),
  }
  const steps: Step[] = []
  const executed: RunResult['executed'] = []
  const active = policyActive(s) && !opts.reportOnly
  let allocation: Allocation | null = null
  let decision: Decision | null = null

  // 0. Market read — shared and cached, so it's cheap even for report-only runs.
  let market: MarketAnalysis | null = null
  try {
    market = await getMarketAnalysis()
    steps.push({ agent: 'market', outcome: 'analyzed', note: `${market.regime}: ${market.summary}` })
  } catch (e) {
    steps.push({ agent: 'market', outcome: 'failed', note: (e as Error).message.slice(0, 200), code: llmFailure(e) })
  }

  if (active) {
    const reference = referenceMix(profile, strategy)
    const c: Context = {
      view,
      profile,
      market,
      strategy,
      reference,
      recent: past.map((r) => toRecent(r, s.now)),
      lang: LANGUAGE[locale],
      instruction: opts.instruction,
    }
    const last = past[0] ? toRecent(past[0], s.now) : null
    const d: Decision = {
      reference,
      mix: null,
      investPercent: 0,
      clamped: false,
      maxTilt: MAX_TILT,
      minConfidence: MIN_CONFIDENCE,
      confidence: { savings: null, investment: null },
      split: { from: s.splitBps / 100, to: null },
      spendable: Number(s.spend) / 1e6,
      skipped: {},
      previous: last && { at: past[0].at, mix: last.investedMix, splitPercent: last.splitPercent?.to ?? past[0].decision?.split.from ?? null },
    }
    decision = d

    // 1. Strategists in parallel. One failing doesn't sink the other.
    const [split, invest] = await Promise.allSettled([
      savingsStrategist(c),
      s.savings >= MIN_INVEST
        ? investmentStrategist(c)
        : Promise.resolve<InvestIdea>({ action: 'none', reason: 'idle savings below 1 tUSDT' }),
    ])

    // Each idea passes the confidence gate first; a skipped idea is logged with what it would have done.
    const proposals: { id: string; p: Proposal }[] = []
    if (split.status === 'rejected') steps.push({ agent: 'savings', outcome: 'failed', note: String(split.reason).slice(0, 200), code: llmFailure(split.reason) })
    else if (split.value.action === 'set_split') {
      const p: Proposal = { kind: 'set_split', bps: clampPct(split.value.percent) * 100, reason: cleanReason(split.value.reason) }
      d.confidence.savings = readConfidence(split.value.confidence)
      d.split.to = p.bps / 100
      const gate = confidenceGate(d.confidence.savings)
      if (gate) {
        d.skipped.savings = gate
        steps.push({ agent: 'savings', proposal: stepProposal(p), outcome: 'skipped', note: gate })
      } else proposals.push({ id: 'split', p })
    } else steps.push({ agent: 'savings', outcome: 'skipped', note: cleanReason(split.value.reason) })

    if (invest.status === 'rejected') steps.push({ agent: 'investment', outcome: 'failed', note: String(invest.reason).slice(0, 200), code: llmFailure(invest.reason) })
    else if (invest.value.action === 'invest') {
      const fit = fitAllocation(cleanAllocation(invest.value.allocation), reference.mix)
      d.mix = fit.investPercent > 0 ? fit.mix : null
      d.investPercent = fit.investPercent
      d.clamped = fit.clamped
      d.confidence.investment = readConfidence(invest.value.confidence)
      const reason = cleanReason(invest.value.reason)
      const gate = confidenceGate(d.confidence.investment)
      if (gate) {
        d.skipped.investment = gate
        steps.push({ agent: 'investment', outcome: 'skipped', note: `${gate}: ${reason}`.slice(0, 280) })
      } else {
        allocation = fit.allocation
        for (const target of TARGETS) {
          const amount = (s.savings * BigInt(allocation[target])) / 100n
          if (amount > 0n) proposals.push({ id: `invest:${target}`, p: { kind: 'invest', amount, target, reason } })
        }
      }
    } else steps.push({ agent: 'investment', outcome: 'skipped', note: cleanReason(invest.value.reason) })

    // Athena, in code: a fresh risk_off read moves Growth to Conservative (CoinAIV2.agentRebalance, same review below).
    const shift = market && hasSkill(s, SKILL_INVEST) ? riskOffRebalance(market.regime, past[0]?.market?.regime ?? null, s.positions.growth, MIN_INVEST) : null
    if (shift)
      proposals.push({
        id: 'rebalance',
        p: { kind: 'rebalance', from: 'growth', to: 'conservative', amount: shift, reason: cleanReason(RISK_OFF_REASON[locale](market!.summary)) },
      })

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
        reviews = await riskOfficer(c, passed.map(({ id, p }) => ({ id, proposal: stepProposal(p) })))
      } catch (e) {
        steps.push({ agent: 'risk', outcome: 'failed', note: `review unavailable: ${(e as Error).message}`.slice(0, 200), code: llmFailure(e) })
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
    decision,
    steps,
    executed,
    reminders: reminders(after),
  }
  // If the models are down the Reporter is too: say so in code, so Telegram/email don't just list reminders.
  const blocked = active && !executed.length && steps.some((x) => x.outcome === 'failed' && x.code)
  const fallback = () => [blocked ? MODELS_DOWN[locale] : null, ...partial.reminders].filter(Boolean).join('\n')
  const result: RunResult = { ...partial, report: await reporter(after, partial, locale).catch(fallback) }
  await kv.push(`runs:${s.user}`, result, 20).catch(() => {})
  return result
}

function stepProposal(p: Proposal): NonNullable<Step['proposal']> {
  switch (p.kind) {
    case 'set_split':
      return { kind: p.kind, bps: p.bps, reason: p.reason }
    case 'invest':
      return { kind: p.kind, amount: fmt(p.amount), target: p.target, reason: p.reason }
    case 'rebalance':
      return { kind: p.kind, amount: fmt(p.amount), from: p.from, target: p.to, reason: p.reason }
    case 'contribute':
      return { kind: p.kind, amount: fmt(p.amount), fundId: p.fundId, reason: p.reason }
  }
}
