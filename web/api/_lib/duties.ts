// The v2 agents' daily duties, run by the cron (api/cron/daily.ts) next to the agent team:
//   Plutus   — sets the AI Smart Money basket weights from Apollo's market read (BasketVault.setSmartWeights).
//   Hermes   — pays the user's group dues from their spendable balance (CoinAIV2.agentContribute), only while hired
//              in AgentRegistry, only into funds they joined, within the PAY budget. Same guard as every proposal.
//   Poseidon — Telegram reminders for groups: dues due or late, a chip-in deadline close, a refund open.
// Pure planning (duesPlan, groupReminders) is separate from the chain calls so it can be tested.

import { Contract, formatUnits } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { agentAddress, agentWallet, chainProvider, execute, type UserState } from './chain.js'
import { smartWeights } from './decision.js'
import { checkProposal, hasSkill, payBudgetLeft, SKILL_PAY, type Proposal } from './guard.js'
import type { Locale, MarketAnalysis } from './swarm.js'

export const GROUP_ABI = [
  'function fundCount() view returns (uint256)',
  'function fund(uint256 id) view returns ((address organizer,address beneficiary,uint8 kind,bool cancelled,uint64 start,uint64 deadline,uint64 period,uint128 target,uint128 dues,uint128 raised,uint128 withdrawn,uint32 contributors,uint32 members,string title))',
  'function isMember(uint256 id,address who) view returns (bool)',
  'function contributedOf(uint256 id,address who) view returns (uint256)',
  'function duesOf(uint256 id,address member) view returns (uint256 paid,uint256 owed)',
]
export const BASKET_ABI = [
  'function assets() view returns ((string symbol,address feed,uint16 maxBps)[])',
  'function smartWeights() view returns (uint16[])',
  'function setSmartWeights(uint16[] weights,string reason)',
]
export const REGISTRY_ABI = [
  'function listingCount() view returns (uint256)',
  'function listing(uint256 id) view returns ((address operator,address agent,uint8 skills,bool active,uint64 hires,uint128 feePer30Days,string name,string description))',
  'function rentedUntil(address hirer,uint256 id) view returns (uint64)',
]

const KINDS = ['patungan', 'iuran', 'donasi'] as const
// ponytail: scans the newest funds on every run; index Joined/Contributed events per user once there are many.
const MAX_FUNDS = 200
const DAY = 86400

export type Fund = {
  id: number
  kind: (typeof KINDS)[number]
  title: string
  organizer: string
  cancelled: boolean
  deadline: number
  period: number // iuran: seconds
  dues: bigint
  target: bigint
  raised: bigint
  contributors: number
  members: number
}

/** One user's stake in one fund. */
export type Stake = { fund: Fund; member: boolean; contributed: bigint; paidPeriods: number; owedPeriods: number }

const groups = () => new Contract(process.env.GROUP_FUNDS_ADDRESS || DEPLOYMENT.v2.groupFunds, GROUP_ABI, chainProvider())

/** Every fund (newest MAX_FUNDS), read once per cron run and shared across users. */
export async function readFunds(): Promise<Fund[]> {
  const c = groups()
  const count = Number(await c.fundCount())
  const ids = Array.from({ length: Math.min(count, MAX_FUNDS) }, (_, i) => count - 1 - i)
  return Promise.all(
    ids.map(async (id) => {
      const f = await c.fund(id)
      return {
        id,
        kind: KINDS[Number(f.kind)] ?? 'donasi',
        title: String(f.title),
        organizer: String(f.organizer),
        cancelled: Boolean(f.cancelled),
        deadline: Number(f.deadline),
        period: Number(f.period),
        dues: BigInt(f.dues),
        target: BigInt(f.target),
        raised: BigInt(f.raised),
        contributors: Number(f.contributors),
        members: Number(f.members),
      }
    }),
  )
}

export async function readStakes(user: string, funds: Fund[]): Promise<Stake[]> {
  const c = groups()
  const all = await Promise.all(
    funds.map(async (fund) => {
      const [member, contributed, dues] = await Promise.all([
        c.isMember(fund.id, user) as Promise<boolean>,
        c.contributedOf(fund.id, user) as Promise<bigint>,
        fund.kind === 'iuran' ? (c.duesOf(fund.id, user) as Promise<[bigint, bigint]>) : Promise.resolve([0n, 0n] as const),
      ])
      return { fund, member, contributed: BigInt(contributed), paidPeriods: Number(dues[0]), owedPeriods: Number(dues[1]) }
    }),
  )
  return all.filter((s) => s.member || s.contributed > 0n)
}

const open = (f: Fund, now: number) => !f.cancelled && (f.deadline === 0 || now <= f.deadline)

// ─── Hermes ──────────────────────────────────────────────────────────────────

/** Which dues to pay: whole periods behind, capped by the budget left and the spendable balance, in fund order. */
export function duesPlan(stakes: Stake[], spend: bigint, budgetLeft: bigint, now: number): { fund: Fund; periods: number; amount: bigint }[] {
  const out: { fund: Fund; periods: number; amount: bigint }[] = []
  let cash = spend < budgetLeft ? spend : budgetLeft
  for (const s of stakes) {
    const behind = s.owedPeriods - s.paidPeriods
    if (s.fund.kind !== 'iuran' || !s.member || behind <= 0 || s.fund.dues === 0n || !open(s.fund, now)) continue
    const periods = Math.min(behind, Number(cash / s.fund.dues))
    if (periods <= 0) continue
    const amount = s.fund.dues * BigInt(periods)
    cash -= amount
    out.push({ fund: s.fund, periods, amount })
  }
  return out
}

/** The listing id of Hermes in AgentRegistry, if it's listed for our agent wallet. */
async function hermesListing(): Promise<number | null> {
  const r = new Contract(DEPLOYMENT.v2.agentRegistry, REGISTRY_ABI, chainProvider())
  const count = Number(await r.listingCount())
  const me = agentAddress().toLowerCase()
  for (let id = 0; id < count; id++) {
    const l = await r.listing(id)
    if (l.name === 'Hermes' && l.active && String(l.agent).toLowerCase() === me) return id
  }
  return null
}

/** Until when (unix seconds) the user has Hermes hired; 0 when never or not listed. */
export async function hermesRentedUntil(user: string): Promise<number> {
  const id = await hermesListing()
  if (id === null) return 0
  const r = new Contract(DEPLOYMENT.v2.agentRegistry, REGISTRY_ABI, chainProvider())
  return Number(await r.rentedUntil(user, id))
}

export const hermesHired = async (user: string) => (await hermesRentedUntil(user)) > Math.floor(Date.now() / 1000)

export type Paid = { fundId: number; title: string; amount: bigint; txHash?: string; error?: string }

/** Pays what's due, each payment checked by the guard first. Nothing happens without the PAY skill and a hire. */
export async function hermesPayDues(s: UserState, stakes: Stake[]): Promise<Paid[]> {
  if (!hasSkill(s, SKILL_PAY) || !(await hermesHired(s.user))) return []
  const out: Paid[] = []
  let state = s
  for (const d of duesPlan(stakes, s.spend, payBudgetLeft(s.policy, s.now), s.now)) {
    const p: Proposal = {
      kind: 'contribute',
      fundId: d.fund.id,
      amount: d.amount,
      member: true,
      reason: `Hermes: dues for "${d.fund.title}", ${d.periods} period${d.periods > 1 ? 's' : ''}`.slice(0, 140),
    }
    const why = checkProposal(p, state)
    if (why) {
      out.push({ fundId: d.fund.id, title: d.fund.title, amount: d.amount, error: why })
      continue
    }
    try {
      const txHash = await execute(s.user, p)
      out.push({ fundId: d.fund.id, title: d.fund.title, amount: d.amount, txHash })
      // keep the local view in step with what the contract now holds
      const policy = { ...state.policy, paidInWindow: state.policy.paidInWindow + d.amount }
      if (state.now >= policy.windowStart + 30 * DAY) Object.assign(policy, { windowStart: state.now, paidInWindow: d.amount })
      state = { ...state, spend: state.spend - d.amount, policy }
    } catch (e) {
      out.push({ fundId: d.fund.id, title: d.fund.title, amount: d.amount, error: (e as Error).message.slice(0, 200) })
    }
  }
  return out
}

// ─── Poseidon ────────────────────────────────────────────────────────────────

const money = (x: bigint) => `${formatUnits(x, 6)} tUSDT`

const TEXT: Record<Locale, { due: string; late: string; deadline: string; refund: string; paid: string }> = {
  en: {
    due: 'Dues for “{t}” are due: {a}.',
    late: 'You are {n} periods behind on “{t}”: {a}.',
    deadline: '“{t}” closes within 2 days and still needs {a}.',
    refund: '“{t}” did not reach its target: your {a} can be refunded on the group page.',
    paid: 'Hermes paid {a} of dues into “{t}”.',
  },
  id: {
    due: 'Iuran “{t}” jatuh tempo: {a}.',
    late: 'Kamu telat {n} periode di “{t}”: {a}.',
    deadline: '“{t}” ditutup dalam 2 hari dan masih kurang {a}.',
    refund: '“{t}” tidak mencapai target: {a} milikmu bisa di-refund di halaman grup.',
    paid: 'Hermes membayar iuran {a} ke “{t}”.',
  },
  zh: {
    due: '“{t}”的会费已到期：{a}。',
    late: '你在“{t}”已欠 {n} 期：{a}。',
    deadline: '“{t}”将在 2 天内截止，仍差 {a}。',
    refund: '“{t}”未达到目标：你的 {a} 可在群组页面退款。',
    paid: 'Hermes 已向“{t}”缴纳会费 {a}。',
  },
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w)\}/g, (_, k: string) => String(v[k] ?? ''))

/** Reminder lines for a user's groups (after Hermes paid what he could, so paid dues aren't nagged about). */
export function groupReminders(stakes: Stake[], paid: Paid[], now: number, locale: Locale): string[] {
  const t = TEXT[locale]
  const out: string[] = paid.filter((p) => p.txHash).map((p) => fill(t.paid, { a: money(p.amount), t: p.title }))
  const paidAmount = new Map(paid.filter((p) => p.txHash).map((p) => [p.fundId, p.amount]))
  for (const s of stakes) {
    const f = s.fund
    if (f.kind === 'iuran' && s.member && open(f, now) && f.dues > 0n) {
      const behind = s.owedPeriods - s.paidPeriods - Number((paidAmount.get(f.id) ?? 0n) / f.dues)
      if (behind === 1) out.push(fill(t.due, { t: f.title, a: money(f.dues) }))
      else if (behind > 1) out.push(fill(t.late, { t: f.title, n: behind, a: money(f.dues * BigInt(behind)) }))
    }
    if (f.kind === 'patungan' && s.contributed > 0n) {
      const failed = f.cancelled || (f.deadline !== 0 && now > f.deadline && f.raised < f.target)
      if (failed) out.push(fill(t.refund, { t: f.title, a: money(s.contributed) }))
      else if (f.deadline !== 0 && f.deadline - now < 2 * DAY && f.deadline > now && f.raised < f.target)
        out.push(fill(t.deadline, { t: f.title, a: money(f.target - f.raised) }))
    }
  }
  return out
}

// ─── Plutus ──────────────────────────────────────────────────────────────────

/** Sets the basket weights for today's regime; skipped when they're already set. Returns the tx hash, if sent. */
export async function plutusSetWeights(market: MarketAnalysis): Promise<{ weights: number[]; symbols: string[]; reason: string; txHash: string } | null> {
  const basket = new Contract(DEPLOYMENT.v2.basketVault, BASKET_ABI, agentWallet())
  const [assets, current] = await Promise.all([
    basket.assets() as Promise<{ symbol: string; maxBps: bigint }[]>,
    basket.smartWeights() as Promise<bigint[]>,
  ])
  const weights = smartWeights(
    market.regime,
    assets.map((a) => ({ symbol: a.symbol, maxBps: Number(a.maxBps) })),
  )
  if (!weights || weights.every((w, i) => w === Number(current[i]))) return null
  const reason = `${market.regime.replace('_', '-')}: ${market.summary}`.slice(0, 280)
  const tx = await basket.setSmartWeights(weights, reason)
  await tx.wait()
  return { weights, symbols: assets.map((a) => a.symbol), reason, txHash: tx.hash as string }
}
