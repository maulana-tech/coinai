// Deterministic half of the investment decision: the reference mix the strategist starts from,
// how far it may tilt away from it, and the confidence gate. The LLM proposes; this code bounds
// and explains what it proposed, so the app can show the reference, the tilt and the final weight.

import type { VaultMix } from '../../shared/pool.js'
import type { Target } from './guard.js'

type Risk = 'conservative' | 'moderate' | 'aggressive'
type Horizon = 'short' | 'medium' | 'long'

const VAULTS: Target[] = ['conservative', 'balanced', 'growth']

/** Max points per vault the strategist may move away from the reference mix. */
export const MAX_TILT = 15
/** Proposals below this confidence (or without one) are skipped, not executed. */
export const MIN_CONFIDENCE = 0.5

// Starting mix per risk level; the horizon shifts 10 points between growth and conservative.
const RISK_MIX: Record<Risk, VaultMix> = {
  conservative: { conservative: 70, balanced: 25, growth: 5 },
  moderate: { conservative: 25, balanced: 50, growth: 25 },
  aggressive: { conservative: 10, balanced: 40, growth: 50 },
}
const HORIZON_SHIFT: Record<Horizon, number> = { short: -10, medium: 0, long: 10 }

export function profileMix(p: { risk: Risk; horizon: Horizon }): VaultMix {
  const base = RISK_MIX[p.risk] ?? RISK_MIX.moderate
  const shift = Math.max(-base.growth, Math.min(base.conservative, HORIZON_SHIFT[p.horizon] ?? 0))
  return { conservative: base.conservative - shift, balanced: base.balanced, growth: base.growth + shift }
}

export type Reference = { source: 'strategy' | 'profile'; mix: VaultMix }

/** The user's saved pool when one is active, otherwise the investor profile. */
export function referenceMix(profile: { risk: Risk; horizon: Horizon }, strategy?: { vaultMix: VaultMix } | null): Reference {
  return strategy ? { source: 'strategy', mix: strategy.vaultMix } : { source: 'profile', mix: profileMix(profile) }
}

export type Fitted = {
  allocation: VaultMix // percent of idle savings to invest now, per vault (sum = investPercent)
  mix: VaultMix // share of the invested amount per vault (sum = 100)
  investPercent: number // percent of idle savings invested now; the rest stays as a buffer
  clamped: boolean // true when a vault had to be pulled back inside reference ± maxTilt
}

/**
 * Keeps an LLM allocation (percent of idle savings per vault, sum <= 100) within `maxTilt` points of
 * the reference mix, measured on the share of the invested amount. The invested percentage is kept.
 */
export function fitAllocation(raw: VaultMix, reference: VaultMix, maxTilt = MAX_TILT): Fitted {
  const investPercent = Math.min(100, VAULTS.reduce((s, v) => s + raw[v], 0))
  const zero = { conservative: 0, balanced: 0, growth: 0 }
  if (investPercent <= 0) return { allocation: zero, mix: zero, investPercent: 0, clamped: false }

  const lo = (v: Target) => Math.max(0, reference[v] - maxTilt)
  const hi = (v: Target) => Math.min(100, reference[v] + maxTilt)
  const share = Object.fromEntries(VAULTS.map((v) => [v, (raw[v] * 100) / investPercent])) as VaultMix
  const mix = Object.fromEntries(VAULTS.map((v) => [v, Math.round(Math.min(hi(v), Math.max(lo(v), share[v])))])) as VaultMix
  const clamped = VAULTS.some((v) => Math.abs(mix[v] - share[v]) > 0.5)

  // Bring the total back to 100 inside the bounds; feasible because the reference itself sums to 100.
  let gap = 100 - VAULTS.reduce((s, v) => s + mix[v], 0)
  for (const v of VAULTS) {
    if (gap === 0) break
    const room = gap > 0 ? hi(v) - mix[v] : lo(v) - mix[v]
    const step = gap > 0 ? Math.min(gap, room) : Math.max(gap, room)
    mix[v] += step
    gap -= step
  }

  const allocation = Object.fromEntries(VAULTS.map((v) => [v, Math.floor((mix[v] * investPercent) / 100)])) as VaultMix
  return { allocation, mix, investPercent, clamped }
}

/** Confidence from an LLM answer: 0..1, or null when missing or not a number. */
export function readConfidence(x: unknown): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null
}

/** Why a proposal with this confidence is skipped, or null when it may go ahead. Fails closed. */
export function confidenceGate(confidence: number | null, min = MIN_CONFIDENCE): string | null {
  if (confidence === null) return 'no confidence given'
  if (confidence < min) return `low confidence (${confidence.toFixed(2)} < ${min})`
  return null
}

// ─── Regime moves (Athena's rebalance, Plutus's basket weights) ──────────────

type Regime = 'risk_on' | 'neutral' | 'risk_off'

/** Athena: when the market turns risk_off, move the Growth position to Conservative (once, on the change). */
export function riskOffRebalance(regime: Regime | null, previous: Regime | null, growth: bigint, minAmount: bigint): bigint | null {
  return regime === 'risk_off' && previous !== 'risk_off' && growth >= minAmount ? growth : null
}

// Plutus: basket weights (bps, sum 10 000) per regime, by asset symbol. Every row stays inside the BasketVault caps
// set at deploy (BNB/BTC/ETH ≤ 50%, CAKE ≤ 20%) and keeps at least 10% in tUSDT; unknown symbols get 0.
const SMART_WEIGHTS: Record<Regime, Record<string, number>> = {
  risk_on: { tUSDT: 2_000, BNB: 2_500, BTC: 2_500, ETH: 2_000, CAKE: 1_000 },
  neutral: { tUSDT: 4_000, BNB: 2_000, BTC: 2_000, ETH: 1_500, CAKE: 500 },
  risk_off: { tUSDT: 7_000, BNB: 1_000, BTC: 1_500, ETH: 500, CAKE: 0 },
}

/** The basket weights for a regime, in the vault's asset order; null when they wouldn't fit the vault's caps. */
export function smartWeights(regime: Regime, assets: { symbol: string; maxBps: number }[]): number[] | null {
  const w = assets.map((a) => SMART_WEIGHTS[regime][a.symbol] ?? 0)
  const fits = w.reduce((s, x) => s + x, 0) === 10_000 && w[0] >= 1_000 && w.every((x, i) => x <= assets[i].maxBps)
  return fits ? w : null
}
