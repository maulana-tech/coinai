// Order matches the YieldTarget enum in evm/src/Save.sol (Conservative=0, Balanced=1, Growth=2).
export const YIELD_TARGETS = ['conservative', 'balanced', 'growth'] as const
export type YieldTarget = (typeof YIELD_TARGETS)[number]

export type YieldDepositResult = {
  amountIn: bigint
  amountOut: bigint
  hash: string
}

export type CoinAIAccount = {
  splitBps: number
  spend: bigint
  shares: bigint
  lockUntil: bigint
  yieldTarget: YieldTarget
}

// agent === null when the user hasn't authorized one (or revoked it)
export type AgentPolicy = {
  agent: string | null
  minSplitBps: number
  maxSplitBps: number
  expiry: bigint
}

// Lifetime payment stats kept on-chain (CoinAI.statsOf)
export type PaymentStats = {
  totalReceived: bigint
  paymentCount: number
  lastPaymentAt: bigint
}

export type TxResult = { hash: string }
export type WithdrawSavingsResult = { amount: bigint; hash: string }

export interface CoinAIService {
  getAccount(user: string): Promise<CoinAIAccount>
  pay(from: string, to: string, amount: bigint): Promise<TxResult>
  withdrawSpend(user: string, amount: bigint): Promise<TxResult>
  withdrawSavings(user: string, shares: bigint): Promise<WithdrawSavingsResult>
  investSavings(user: string, amount: bigint, target: YieldTarget): Promise<YieldDepositResult>
  /** Takes a vault position back to the wallet: `amount` in tUSDT, or 'all' to redeem every share. */
  withdrawFromVault(user: string, target: YieldTarget, amount: bigint | 'all'): Promise<WithdrawSavingsResult>
  setSplit(user: string, bps: number): Promise<TxResult>
  setLock(user: string, until: bigint): Promise<TxResult>
  setYieldTarget(user: string, target: YieldTarget): Promise<TxResult>
  getAgent(user: string): Promise<AgentPolicy>
  getStats(user: string): Promise<PaymentStats>
  setAgent(user: string, agent: string, minSplitBps: number, maxSplitBps: number, expiry: bigint): Promise<TxResult>
  revokeAgent(user: string): Promise<TxResult>
}
