// Deterministic pre-flight checks for agent proposals. Mirrors the on-chain rules in
// evm/src/CoinAIV2.sol so bad proposals are dropped before we spend gas. The contract is
// still the real enforcement layer — this just fails fast and explains why.

// Order matches CoinAIV2's targets: 0 Conservative, 1 Balanced, 2 Growth (yield vaults), 3 Basket.
export const TARGETS = ['conservative', 'balanced', 'growth'] as const
export type Target = (typeof TARGETS)[number]
export const POSITIONS = [...TARGETS, 'basket'] as const
export type Position = (typeof POSITIONS)[number]

// CoinAIV2.SKILL_*
export const SKILL_SPLIT = 1
export const SKILL_INVEST = 2
export const SKILL_PAY = 4
export const PAY_WINDOW = 30 * 86400

export type Policy = {
  agent: string
  skills: number
  minSplitBps: number
  maxSplitBps: number
  expiry: number
  payBudget: bigint // PAY: tUSDT per 30-day window
  windowStart: number
  paidInWindow: bigint
}

export type Proposal =
  | { kind: 'set_split'; bps: number; reason: string }
  | { kind: 'invest'; amount: bigint; target: Position; reason: string }
  | { kind: 'rebalance'; from: Position; to: Position; amount: bigint; reason: string }
  | { kind: 'contribute'; fundId: number; amount: bigint; member: boolean; reason: string }

export type GuardInput = {
  policy: Policy
  agentAddress: string
  now: number
  splitBps: number
  spend: bigint
  savings: bigint // idle
  positions: Record<Position, bigint>
  lockUntil: number
}

export const MAX_REASON = 280

export function policyActive(s: Pick<GuardInput, 'policy' | 'agentAddress' | 'now'>): boolean {
  return s.policy.skills !== 0 && s.policy.agent.toLowerCase() === s.agentAddress.toLowerCase() && s.now < s.policy.expiry
}

export const hasSkill = (s: Pick<GuardInput, 'policy' | 'agentAddress' | 'now'>, skill: number) =>
  policyActive(s) && (s.policy.skills & skill) !== 0

/** What the PAY skill may still spend in the current window (the window resets 30 days after it opened). */
export function payBudgetLeft(p: Policy, now: number): bigint {
  const used = now >= p.windowStart + PAY_WINDOW ? 0n : p.paidInWindow
  return p.payBudget > used ? p.payBudget - used : 0n
}

const SKILL_FOR: Record<Proposal['kind'], number> = {
  set_split: SKILL_SPLIT,
  invest: SKILL_INVEST,
  rebalance: SKILL_INVEST,
  contribute: SKILL_PAY,
}

/** Returns null when the proposal may be executed, otherwise a human-readable rejection. */
export function checkProposal(p: Proposal, s: GuardInput): string | null {
  if (!policyActive(s)) return 'agent not authorized or expired'
  if (!hasSkill(s, SKILL_FOR[p.kind])) return `agent lacks the ${p.kind === 'set_split' ? 'split' : p.kind === 'contribute' ? 'pay' : 'invest'} skill`
  if (!p.reason.trim()) return 'missing reason'
  if (p.reason.length > MAX_REASON) return 'reason too long'

  switch (p.kind) {
    case 'set_split':
      if (!Number.isInteger(p.bps)) return 'split must be an integer'
      if (p.bps < s.policy.minSplitBps || p.bps > s.policy.maxSplitBps) {
        return `split ${p.bps} outside allowed range ${s.policy.minSplitBps}-${s.policy.maxSplitBps}`
      }
      if (p.bps === s.splitBps) return 'split unchanged'
      return null
    // Investing and rebalancing keep the money in savings, so the contract allows both while savings are locked.
    case 'invest':
      if (!POSITIONS.includes(p.target)) return 'unknown position'
      if (p.amount <= 0n) return 'amount must be positive'
      if (p.amount > s.savings) return 'amount exceeds idle savings'
      return null
    case 'rebalance':
      if (!POSITIONS.includes(p.from) || !POSITIONS.includes(p.to)) return 'unknown position'
      if (p.from === p.to) return 'same position'
      if (p.amount <= 0n) return 'amount must be positive'
      if (p.amount > s.positions[p.from]) return `amount exceeds the ${p.from} position`
      return null
    case 'contribute':
      if (!p.member) return 'user is not a member of that group'
      if (p.amount <= 0n) return 'amount must be positive'
      if (p.amount > s.spend) return 'amount exceeds spendable balance'
      if (p.amount > payBudgetLeft(s.policy, s.now)) return 'over the 30-day pay budget'
      return null
  }
}
