// Savings projection: monthly compounding at the vault APY plus a fixed monthly contribution
// (income × savings split). Deterministic on purpose — the numbers are explainable, not an LLM guess.

export type ProjectionPoint = { month: number; balance: number; contributed: number }

export function projectSavings(opts: { start: number; monthlyContribution: number; apy: number; months?: number }): ProjectionPoint[] {
  const months = opts.months ?? 12
  const rate = opts.apy / 12
  const points: ProjectionPoint[] = [{ month: 0, balance: opts.start, contributed: opts.start }]
  for (let m = 1; m <= months; m++) {
    const prev = points[m - 1]
    points.push({
      month: m,
      balance: prev.balance * (1 + rate) + opts.monthlyContribution,
      contributed: prev.contributed + opts.monthlyContribution,
    })
  }
  return points
}

/** Position-weighted APY; falls back to the preferred vault's APY when nothing is invested yet. */
export function weightedApy(positions: { amount: number; apy: number }[], fallbackApy: number): number {
  const total = positions.reduce((s, p) => s + p.amount, 0)
  return total > 0 ? positions.reduce((s, p) => s + p.amount * p.apy, 0) / total : fallbackApy
}
