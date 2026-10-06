// Agent team vs a fixed rule, replayed over real daily prices. The agent side is the team's
// prompt rules written as code (split rule + reference mix tilted by a regime rule, bounded by the
// same fitAllocation the live run uses), so the replay is free and repeatable; the script then
// spot-checks the live LLM strategists against this policy at sampled moments.

import type { VaultMix } from '../../shared/pool.js'
import { annualizedVolatility } from '../../shared/market.js'
import type { IncomePattern, Metrics, VaultModel } from '../../shared/evaluation-types.js'
import { fitAllocation, profileMix } from './decision.js'
import type { Target } from './guard.js'

export type Regime = 'risk_on' | 'neutral' | 'risk_off'
export type Prices = { BNB: number[]; BTC: number[]; ETH: number[] } // daily closes, oldest first

const VAULTS: Target[] = ['conservative', 'balanced', 'growth']
const APY: Record<Target, number> = { conservative: 0.03, balanced: 0.06, growth: 0.12 } // the deployed vaults' metadata

/** Days of history before the window that the regime rule looks back over. */
export const LOOKBACK = 30
/** Split range the simulated user signs with setAgent, and the fixed rule's split (the contract default). */
export const LIMITS = { min: 10, max: 40 }
export const FIXED_SPLIT = 20

// ─── Market regime (deterministic stand-in for the Market Analyst) ──────────

/**
 * BNB and BTC over the last 30 days: falling 10%+ or annualized volatility 80%+ is risk_off,
 * rising 10%+ with volatility under 60% is risk_on, anything else neutral.
 */
export function regimeAt(p: Prices, t: number): Regime {
  const window = (xs: number[]) => xs.slice(t - LOOKBACK, t + 1)
  const change = (xs: number[]) => ((xs[xs.length - 1] - xs[0]) / xs[0]) * 100
  const coins = [window(p.BNB), window(p.BTC)]
  const trend = coins.reduce((s, xs) => s + change(xs), 0) / coins.length
  const vol = coins.reduce((s, xs) => s + annualizedVolatility(xs), 0) / coins.length
  if (trend <= -10 || vol >= 80) return 'risk_off'
  if (trend >= 10 && vol < 60) return 'risk_on'
  return 'neutral'
}

// ─── Income patterns ─────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32) so every run of the evaluation sees the same incomes. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export const PATTERNS: Record<IncomePattern, { dailySpend: number; startSpendable: number }> = {
  salary: { dailySpend: 26, startSpendable: 364 }, // 1,000 on the 1st of every 30 days
  freelance: { dailySpend: 26, startSpendable: 364 }, // ~4 jobs a month, 120–420 each, one 15-day dry spell
  gig: { dailySpend: 26, startSpendable: 364 }, // 20–55 on ~80% of days
}

export function incomes(pattern: IncomePattern, days: number, seed = 97): number[] {
  const r = rng(seed)
  return Array.from({ length: days }, (_, d) => {
    if (pattern === 'salary') return d % 30 === 0 ? 1000 : 0
    if (pattern === 'freelance') return d >= 45 && d < 60 ? 0 : r() < 0.13 ? Math.round(120 + r() * 300) : 0
    return r() < 0.8 ? Math.round(20 + r() * 35) : 0
  })
}

// ─── The two policies ────────────────────────────────────────────────────────

/** What a policy sees after a payment lands (mirrors describe() in chain.ts, in plain numbers). */
export type PaymentState = {
  day: number
  splitPercent: number
  spendable: number
  idleSavings: number
  dailySpend: number
  paymentDays: number[] // every payment so far, this one included
  paymentAmounts: number[]
  previousSpendable: number | null // spendable balance right after the previous payment (the agent's memory of the last run)
  regime: Regime
}

/**
 * The Savings Strategist's prompt rules as code: too little data → hold; a thin buffer, a gap well past this
 * person's usual rhythm (1.5× their average so far), next to nothing left over (< 10% of a payment), or a
 * left-over that keeps shrinking and is under a quarter of a payment → save less; steady income, a healthy buffer
 * and a quarter of a payment or more left over that isn't shrinking → save more.
 * "Long" is relative on purpose: 30 days is normal for a monthly salary and alarming for a daily gig.
 * "Left over" uses only what the agent can see: spendable balance minus the spendable part of an average payment.
 */
export function agentSplit(s: PaymentState): number {
  const n = s.paymentDays.length
  if (n < 2) return s.splitPercent
  const gaps = s.paymentDays.slice(1).map((d, i) => d - s.paymentDays[i])
  const lastGap = gaps[gaps.length - 1]
  const prior = gaps.slice(0, -1)
  const longGap = prior.length > 0 && lastGap > 1.5 * (prior.reduce((a, b) => a + b, 0) / prior.length)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length)
  const steady = gaps.length >= 2 && mean > 0 && sd / mean < 0.35
  const bufferDays = s.spendable / s.dailySpend
  const average = s.paymentAmounts.reduce((a, b) => a + b, 0) / s.paymentAmounts.length
  const keep = (average * (100 - s.splitPercent)) / 100
  const leftOver = s.spendable - keep
  // vs the last run: spendable then minus what a payment adds now (a split change moves the second term)
  const shrinking = s.previousSpendable !== null && leftOver < s.previousSpendable - keep - average / 20
  let next = s.splitPercent
  if (bufferDays < 7 || longGap || leftOver < average / 10 || (shrinking && leftOver < average / 4)) next -= 10
  else if (steady && bufferDays >= 14 && leftOver >= average / 4 && !shrinking) next += 10
  return Math.min(LIMITS.max, Math.max(LIMITS.min, next))
}

const TILT: Record<Regime, VaultMix> = {
  risk_on: { conservative: -10, balanced: 0, growth: 10 },
  neutral: { conservative: 0, balanced: 0, growth: 0 },
  risk_off: { conservative: 15, balanced: 0, growth: -15 },
}

/** The Investment Strategist's rules as code: the profile's reference mix, tilted by the regime, bounded like a live run. */
export function agentMix(regime: Regime, reference: VaultMix = profileMix({ risk: 'moderate', horizon: 'medium' })): VaultMix {
  const raw = Object.fromEntries(VAULTS.map((v) => [v, Math.max(0, reference[v] + TILT[regime][v])])) as VaultMix
  return fitAllocation(raw, reference).mix
}

const FIXED_MIX: VaultMix = { conservative: 0, balanced: 100, growth: 0 } // the contract's default vault

// ─── Replay ──────────────────────────────────────────────────────────────────

function dailyReturn(model: VaultModel, v: Target, p: Prices, t: number): number {
  const r = (xs: number[]) => xs[t] / xs[t - 1] - 1
  const fixed = APY[v] / 365
  if (model === 'testnet' || v === 'conservative') return fixed
  if (v === 'balanced') return 0.5 * r(p.BTC) + 0.5 * fixed
  return 0.5 * ((r(p.BNB) + r(p.ETH)) / 2) + 0.5 * fixed
}

export type Replay = Metrics & { states: PaymentState[] }

/**
 * One policy, one income pattern, one vault model. Prices must hold LOOKBACK + days + 1 closes; day d of
 * the window is price index LOOKBACK + d + 1. A payment is split at the current rate, the savings slice is
 * invested right away (autopilot), then the agent may change the split for later payments.
 */
export function replay(policy: 'fixed' | 'agent', pattern: IncomePattern, model: VaultModel, p: Prices, seed = 97): Replay {
  const days = p.BNB.length - LOOKBACK - 1
  const { dailySpend, startSpendable } = PATTERNS[pattern]
  const income = incomes(pattern, days, seed)
  const pos: Record<Target, number> = { conservative: 0, balanced: 0, growth: 0 }
  let spendable = startSpendable
  let split = FIXED_SPLIT
  let contributed = 0
  let peak = 0
  let worstDip = 0
  let shortDays = 0
  let splitDays = 0
  const paymentDays: number[] = []
  const paymentAmounts: number[] = []
  const states: PaymentState[] = []
  let previousSpendable: number | null = null

  for (let d = 0; d < days; d++) {
    const t = LOOKBACK + d + 1
    for (const v of VAULTS) pos[v] *= 1 + dailyReturn(model, v, p, t)

    if (income[d] > 0) {
      const saved = (income[d] * split) / 100
      spendable += income[d] - saved
      contributed += saved
      paymentDays.push(d)
      paymentAmounts.push(income[d])
      const regime = regimeAt(p, t)
      const mix = policy === 'fixed' ? FIXED_MIX : agentMix(regime)
      for (const v of VAULTS) pos[v] += (saved * mix[v]) / 100
      if (policy === 'agent') {
        const state: PaymentState = {
          day: d,
          splitPercent: split,
          spendable,
          idleSavings: saved,
          dailySpend,
          paymentDays: [...paymentDays],
          paymentAmounts: [...paymentAmounts],
          previousSpendable,
          regime,
        }
        states.push(state)
        previousSpendable = spendable
        split = agentSplit(state)
      }
    }

    if (spendable >= dailySpend) spendable -= dailySpend
    else {
      shortDays++
      spendable = 0
    }

    const value = VAULTS.reduce((s, v) => s + pos[v], 0)
    peak = Math.max(peak, value)
    if (peak > 0) worstDip = Math.max(worstDip, ((peak - value) / peak) * 100)
    splitDays += split
  }

  const value = VAULTS.reduce((s, v) => s + pos[v], 0)
  const round = (x: number, k = 2) => Math.round(x * 10 ** k) / 10 ** k
  return {
    contributed: round(contributed),
    value: round(value),
    gain: round(value - contributed),
    gainPct: contributed ? round(((value - contributed) / contributed) * 100) : 0,
    worstDipPct: round(worstDip),
    shortDays,
    avgSplitPercent: round(splitDays / days, 1),
    states,
  }
}
