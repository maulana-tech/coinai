// Order matches CoinAIV2's targets (evm/src/CoinAIV2.sol): 0 Conservative, 1 Balanced, 2 Growth (yield vaults), 3 Basket.
export const YIELD_TARGETS = ['conservative', 'balanced', 'growth'] as const
export type YieldTarget = (typeof YIELD_TARGETS)[number]
export const POSITIONS = [...YIELD_TARGETS, 'basket'] as const
export type Position = (typeof POSITIONS)[number]

export type YieldDepositResult = {
  amountIn: bigint
  amountOut: bigint
  hash: string
}

export type CoinAIAccount = {
  splitBps: number
  spend: bigint
  idle: bigint // savings not in any position, 1:1 tUSDT
  lockUntil: bigint
  positions: Record<Position, bigint> // what each position is worth now, in tUSDT
  vaultShares: Record<YieldTarget, bigint> // yield-vault shares coinAI holds for the user
}

/** Every saved tUSDT: idle plus all positions. */
export const totalSavings = (a: CoinAIAccount): bigint => POSITIONS.reduce((sum, p) => sum + a.positions[p], a.idle)

// Skill bits (CoinAIV2.SKILL_*): what an authorized agent may do.
export const SKILL_SPLIT = 1
export const SKILL_INVEST = 2
export const SKILL_PAY = 4

// One authorized agent; agent === null when the user hasn't authorized it (or revoked it).
export type AgentPolicy = {
  agent: string | null
  skills: number
  minSplitBps: number
  maxSplitBps: number
  payBudget: bigint // PAY: tUSDT per 30 days
  paidInWindow: bigint
  windowStart: bigint
  expiry: bigint
}

export type AgentGrant = Pick<AgentPolicy, 'skills' | 'minSplitBps' | 'maxSplitBps' | 'payBudget' | 'expiry'>

// Lifetime payment stats kept on-chain (CoinAI.statsOf)
export type PaymentStats = {
  totalReceived: bigint
  paymentCount: number
  lastPaymentAt: bigint
}

export type TxResult = { hash: string }
export type WithdrawSavingsResult = { amount: bigint; hash: string }
export type PayManyRow = { to: string; amount: bigint }

export interface CoinAIService {
  getAccount(user: string): Promise<CoinAIAccount>
  pay(from: string, to: string, amount: bigint): Promise<TxResult>
  /** One payer, up to 50 recipients; each recipient's own split applies. */
  payMany(from: string, rows: PayManyRow[]): Promise<TxResult>
  withdrawSpend(user: string, amount: bigint): Promise<TxResult>
  /** Idle savings back to the wallet, 1:1. */
  withdrawSavings(user: string, amount: bigint): Promise<WithdrawSavingsResult>
  investSavings(user: string, amount: bigint, target: Position): Promise<YieldDepositResult>
  /** A position back to the wallet: `amount` in tUSDT, or 'all'. Blocked while savings are locked. */
  withdrawPosition(user: string, target: Position, amount: bigint | 'all'): Promise<WithdrawSavingsResult>
  /** Moves value between the user's own positions (`amount` in tUSDT, or 'all'). Allowed while locked. */
  rebalance(user: string, from: Position, to: Position, amount: bigint | 'all'): Promise<TxResult>
  /** Group dues / a contribution paid from the spendable balance (GroupFunds). */
  contributeFromSpend(user: string, fundId: bigint, amount: bigint, message: string): Promise<TxResult>
  setSplit(user: string, bps: number): Promise<TxResult>
  setLock(user: string, until: bigint): Promise<TxResult>
  /** The policy `agent` holds for `user` (agent: null when none). */
  getAgent(user: string, agent: string): Promise<AgentPolicy>
  /** Every agent the user authorized and hasn't revoked (expired ones included). */
  listAgents(user: string): Promise<AgentPolicy[]>
  getStats(user: string): Promise<PaymentStats>
  setAgent(user: string, agent: string, grant: AgentGrant): Promise<TxResult>
  revokeAgent(user: string, agent: string): Promise<TxResult>
}
