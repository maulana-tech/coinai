// Shape of the agent-vs-fixed-rule evaluation (web/scripts/evaluate-agents.ts), shared by the
// simulation in api/_lib/evaluation.ts and the panel on AI Portfolio.

export type IncomePattern = 'salary' | 'freelance' | 'gig'
/** testnet: the deployed vaults' fixed APY. market: Balanced/Growth partly track BTC / BNB+ETH (roadmap F6 preview). */
export type VaultModel = 'testnet' | 'market'

export type Metrics = {
  contributed: number // tUSDT routed into savings over the window
  value: number // savings value at the end (idle + vault positions)
  gain: number // value - contributed
  gainPct: number // gain / contributed, percent
  worstDipPct: number // largest fall of savings value from its running peak, percent
  shortDays: number // days the spendable balance couldn't cover that day's spending
  avgSplitPercent: number
}

/** 1,000 tUSDT held in the AI Smart Money basket over the window. */
export type BasketMetrics = { value: number; gainPct: number; worstDipPct: number; weightChanges: number }

export type EvaluationRow = { pattern: IncomePattern; model: VaultModel; fixed: Metrics; agent: Metrics }

/** Live-model spot check: the real strategists' calls at sampled moments vs the codified policy. */
export type LlmSpotCheck = {
  model: string
  points: number
  splitMatched: number // decisions whose direction (raise / hold / lower) matched the policy
  splitCompared: number
  mixDiffPoints: number | null // mean absolute difference per vault, percentage points
  mixCompared: number
  skippedLowConfidence: number
  failed: number
}

export type Evaluation = {
  generatedAt: string
  window: { from: string; to: string; days: number }
  regimeDays: { risk_on: number; neutral: number; risk_off: number }
  rows: EvaluationRow[]
  basket?: { static: BasketMetrics; plutus: BasketMetrics } // Plutus's regime weights vs the deploy's fixed weights
  llm: LlmSpotCheck | null
}
