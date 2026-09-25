// Deterministic pre-flight checks for agent proposals. Mirrors the on-chain rules in
// evm/src/Save.sol so bad proposals are dropped before we spend gas. The contract is
// still the real enforcement layer — this just fails fast and explains why.

export const TARGETS = ['conservative', 'balanced', 'growth'] as const
export type Target = (typeof TARGETS)[number]

export type Policy = {
  agent: string
  minSplitBps: number
  maxSplitBps: number
  expiry: number
}

export type Proposal =
  | { kind: 'set_split'; bps: number; reason: string }
  | { kind: 'invest'; amount: bigint; target: Target; reason: string }

export type GuardInput = {
  policy: Policy
  agentAddress: string
  now: number
  splitBps: number
  savings: bigint
  lockUntil: number
}

export const MAX_REASON = 280

export function policyActive(s: Pick<GuardInput, 'policy' | 'agentAddress' | 'now'>): boolean {
  return s.policy.agent.toLowerCase() === s.agentAddress.toLowerCase() && s.now < s.policy.expiry
}

/** Returns null when the proposal may be executed, otherwise a human-readable rejection. */
export function checkProposal(p: Proposal, s: GuardInput): string | null {
  if (!policyActive(s)) return 'agent not authorized or expired'
  if (!p.reason.trim()) return 'missing reason'
  if (p.reason.length > MAX_REASON) return 'reason too long'

  if (p.kind === 'set_split') {
    if (!Number.isInteger(p.bps)) return 'split must be an integer'
    if (p.bps < s.policy.minSplitBps || p.bps > s.policy.maxSplitBps) {
      return `split ${p.bps} outside allowed range ${s.policy.minSplitBps}-${s.policy.maxSplitBps}`
    }
    if (p.bps === s.splitBps) return 'split unchanged'
    return null
  }

  if (!TARGETS.includes(p.target)) return 'unknown vault'
  if (p.amount <= 0n) return 'amount must be positive'
  if (p.amount > s.savings) return 'amount exceeds idle savings'
  if (s.now < s.lockUntil) return 'savings are locked'
  return null
}
