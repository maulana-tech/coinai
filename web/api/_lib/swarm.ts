// coinAI agent team. Orchestration is plain code (not an LLM supervisor) so the flow is
// predictable and auditable:
//
//   state ─┬─ Savings Strategist ─┐
//          └─ Yield Strategist  ──┴─ guard (code) ─ Risk Officer (veto only) ─ executor ─ Reporter
//
// Strategists can only propose; the Risk Officer can only veto; the guard and the
// contract both enforce the user's on-chain limits. Missing/invalid reviews fail closed.

import { describe, execute, explorerTx, fmt, readUserState, type UserState } from './chain.js'
import { checkProposal, policyActive, TARGETS, type Proposal, type Target } from './guard.js'
import { askJson, complete } from './llm.js'
import { kv } from './kv.js'

export type Locale = 'en' | 'id' | 'zh'
const LANGUAGE: Record<Locale, string> = { en: 'English', id: 'Bahasa Indonesia', zh: 'Simplified Chinese' }
export const asLocale = (x: unknown): Locale => (x === 'id' || x === 'zh' ? x : 'en')

const MIN_INVEST = 1_000_000n // 1 tUSDT; below this, investing isn't worth the gas

export type Step = {
  agent: 'savings' | 'yield' | 'guard' | 'risk' | 'executor'
  proposal?: { kind: Proposal['kind']; bps?: number; amount?: string; target?: Target; reason: string }
  outcome: 'proposed' | 'skipped' | 'rejected' | 'approved' | 'executed' | 'failed'
  note?: string
  txHash?: string
}

export type RunResult = {
  user: string
  at: string
  mode: 'agent' | 'report-only'
  steps: Step[]
  executed: { kind: Proposal['kind']; reason: string; txHash: string; explorer: string }[]
  reminders: string[]
  report: string
}

type Snapshot = { totalReceived: string; paymentCount: number; savings: string; at: number }

const TEAM = `You are part of coinAI's agent team managing a user's automatic savings on BNB Chain testnet.
Every incoming payment is split: a percentage goes to savings, the rest stays spendable.
Idle savings earn nothing until invested into one of three vaults (conservative, balanced, growth).`

// ─── Strategists ─────────────────────────────────────────────────────────────

type SplitIdea = { action: 'set_split' | 'none'; percent?: number; reason?: string; confidence?: number }
type YieldIdea = { action: 'invest' | 'none'; target?: Target; percent?: number; reason?: string; confidence?: number }

async function savingsStrategist(view: object, instruction?: string): Promise<SplitIdea> {
  return askJson<SplitIdea>(
    'strategist',
    `${TEAM}
Role: Savings Strategist. Decide the savings split percentage.
- Stay within agentLimits. Prefer steps of at most 10 percentage points.
- Regular, sizable income and healthy spendable balance -> saving more is reasonable.
- Irregular income, long gap since last payment, or low spendable balance -> save less or hold.
- With fewer than 2 payments there is too little data: choose "none" unless the user instruction says otherwise.
- The user instruction, if any, takes priority when it stays within limits.
JSON shape: {"action":"set_split"|"none","percent":number,"reason":"<=200 chars, plain language, cite the data","confidence":0..1}`,
    { state: view, userInstruction: instruction ?? null },
  )
}

async function yieldStrategist(view: object, instruction?: string): Promise<YieldIdea> {
  return askJson<YieldIdea>(
    'strategist',
    `${TEAM}
Role: Yield Strategist. Decide whether to move idle savings into a vault, which one, and what share.
- Default to "balanced". Use "growth" only for long horizons or when the user asks for higher returns.
  Use "conservative" when the user asks for safety or savings are small.
- You may invest part of the idle savings (percent 1-100) to keep a buffer.
- The user instruction, if any, takes priority.
JSON shape: {"action":"invest"|"none","target":"conservative"|"balanced"|"growth","percent":number,"reason":"<=200 chars","confidence":0..1}`,
    { state: view, userInstruction: instruction ?? null },
  )
}

// ─── Risk Officer ────────────────────────────────────────────────────────────

type Review = { reviews?: { id?: string; approve?: boolean; note?: string }[] }

async function riskOfficer(view: object, candidates: { id: string; proposal: object }[], instruction?: string) {
  const out = await askJson<Review>(
    'risk',
    `${TEAM}
Role: Risk Officer. Review each proposal. You can approve or veto, never modify.
Veto when the reason contradicts the data, the move is too aggressive for how little data exists,
it conflicts with the user instruction, or it would leave the user without a sensible buffer.
JSON shape: {"reviews":[{"id":"<proposal id>","approve":true|false,"note":"<=160 chars"}]}`,
    { state: view, userInstruction: instruction ?? null, proposals: candidates },
  )
  return new Map((out.reviews ?? []).map((r) => [r.id, r]))
}

// ─── Reminders (deterministic) & Reporter ────────────────────────────────────

export function reminders(s: UserState): string[] {
  const out: string[] = []
  const day = 86400
  if (policyActive(s) && s.policy.expiry - s.now < 3 * day) out.push('Agent permission expires within 3 days — renew it on the Agent page.')
  if (!policyActive(s)) out.push('The AI agent is not enabled — enable it on the Agent page to let coinAI optimise your savings.')
  if (s.lockUntil > s.now && s.lockUntil - s.now < 3 * day) out.push('Your savings lock ends within 3 days.')
  if (s.lastPaymentAt && s.now - s.lastPaymentAt > 7 * day) out.push('No payments received in over 7 days — share your payment link.')
  if (s.savings >= MIN_INVEST * 10n) out.push(`${fmt(s.savings)} of savings is idle and not earning yield.`)
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
Role: Reporter. Write the user's savings update in ${LANGUAGE[locale]}.
Plain text (no markdown headings), max ~120 words, friendly and concrete, amounts in tUSDT.
Structure: one-line summary, then "•" bullets for what changed and what the agents did (with their reasons),
then the reminders. Never invent numbers; use only the data given.`,
    },
    {
      role: 'user',
      content: JSON.stringify(
        { state: describe(s), sinceLastReport: sinceLast, agentSteps: run.steps, executed: run.executed, reminders: run.reminders },
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

const clampPct = (x: unknown) => Math.min(100, Math.max(0, Math.round(Number(x) || 0)))
const cleanReason = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 280)

export async function runSwarm(
  user: string,
  opts: { locale?: Locale; instruction?: string; reportOnly?: boolean } = {},
): Promise<RunResult> {
  const locale = opts.locale ?? 'en'
  const s = await readUserState(user)
  const view = describe(s)
  const steps: Step[] = []
  const executed: RunResult['executed'] = []
  const active = policyActive(s) && !opts.reportOnly

  if (active) {
    // 1. Strategists in parallel. One failing doesn't sink the other.
    const [split, yieldIdea] = await Promise.allSettled([
      savingsStrategist(view, opts.instruction),
      s.savings >= MIN_INVEST ? yieldStrategist(view, opts.instruction) : Promise.resolve<YieldIdea>({ action: 'none', reason: 'idle savings below 1 tUSDT' }),
    ])

    const proposals: { id: string; p: Proposal }[] = []
    if (split.status === 'rejected') steps.push({ agent: 'savings', outcome: 'failed', note: String(split.reason) })
    else if (split.value.action === 'set_split') {
      proposals.push({ id: 'split', p: { kind: 'set_split', bps: clampPct(split.value.percent) * 100, reason: cleanReason(split.value.reason) } })
    } else steps.push({ agent: 'savings', outcome: 'skipped', note: cleanReason(split.value.reason) })

    if (yieldIdea.status === 'rejected') steps.push({ agent: 'yield', outcome: 'failed', note: String(yieldIdea.reason) })
    else if (yieldIdea.value.action === 'invest') {
      const target = TARGETS.includes(yieldIdea.value.target as Target) ? (yieldIdea.value.target as Target) : 'balanced'
      const amount = (s.savings * BigInt(clampPct(yieldIdea.value.percent))) / 100n
      proposals.push({ id: 'invest', p: { kind: 'invest', amount, target, reason: cleanReason(yieldIdea.value.reason) } })
    } else steps.push({ agent: 'yield', outcome: 'skipped', note: cleanReason(yieldIdea.value.reason) })

    // 2. Deterministic guard.
    const passed = proposals.filter(({ id, p }) => {
      const why = checkProposal(p, s)
      steps.push({ agent: id === 'split' ? 'savings' : 'yield', proposal: stepProposal(p), outcome: 'proposed' })
      if (why) steps.push({ agent: 'guard', proposal: stepProposal(p), outcome: 'rejected', note: why })
      return !why
    })

    // 3. Risk Officer — veto only, fails closed.
    let reviews = new Map<string | undefined, { approve?: boolean; note?: string }>()
    if (passed.length) {
      try {
        reviews = await riskOfficer(view, passed.map(({ id, p }) => ({ id, proposal: stepProposal(p) })), opts.instruction)
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
