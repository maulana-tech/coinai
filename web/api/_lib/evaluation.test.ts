// Run: npx tsx --test api/_lib/evaluation.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentMix, agentSplit, basketReplay, FIXED_SPLIT, incomes, LIMITS, LOOKBACK, regimeAt, replay, type PaymentState, type Prices } from './evaluation.ts'

const DAYS = 90
const series = (start: number, dailyFactor: number, wobble = 0) =>
  Array.from({ length: LOOKBACK + DAYS + 1 }, (_, i) => start * dailyFactor ** i * (1 + (i % 2 ? wobble : -wobble)))
const flat: Prices = { BNB: series(600, 1), BTC: series(60_000, 1), ETH: series(3000, 1) }

test('regime: flat is neutral, a calm rally is risk_on, a slide is risk_off', () => {
  assert.equal(regimeAt(flat, LOOKBACK), 'neutral')
  const rally: Prices = { BNB: series(600, 1.005), BTC: series(60_000, 1.005), ETH: flat.ETH }
  assert.equal(regimeAt(rally, LOOKBACK), 'risk_on')
  const slide: Prices = { BNB: series(600, 0.995), BTC: series(60_000, 0.995), ETH: flat.ETH }
  assert.equal(regimeAt(slide, LOOKBACK), 'risk_off')
  const choppy: Prices = { BNB: series(600, 1, 0.05), BTC: series(60_000, 1, 0.05), ETH: flat.ETH }
  assert.equal(regimeAt(choppy, LOOKBACK + 1), 'risk_off') // ~190% annualized volatility
})

test('incomes are deterministic per seed and match their pattern', () => {
  assert.deepEqual(incomes('gig', 30, 1), incomes('gig', 30, 1))
  assert.equal(incomes('salary', 90).filter((x) => x > 0).length, 3)
  assert.ok(incomes('freelance', 90).slice(45, 60).every((x) => x === 0))
})

const state = (over: Partial<PaymentState>): PaymentState => ({
  day: 60,
  splitPercent: 20,
  spendable: 600,
  idleSavings: 0,
  dailySpend: 26,
  paymentDays: [0, 30, 60],
  paymentAmounts: [1000, 1000, 1000],
  previousSpendable: null,
  regime: 'neutral',
  ...over,
})

test('split rule: steady income + buffer saves more, thin buffer or long gap saves less, bounded', () => {
  assert.equal(agentSplit(state({ paymentDays: [0, 7, 14], spendable: 1100 })), 30)
  // a monthly salary is a 30-day rhythm, not a 30-day gap
  assert.equal(agentSplit(state({ paymentDays: [0, 30], paymentAmounts: [1000, 1000], spendable: 1100 })), 20)
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 1100 })), 30)
  // steady salary, but little was left of the last one when this one came: don't squeeze harder
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 950 })), 20)
  // next to nothing left (they ran dry before payday): save less
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 850 })), 10)
  // plenty left, but less than last payday: the cushion is draining, so no raise; drained under a quarter: lower
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 1100, previousSpendable: 1300 })), 20)
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 1000, previousSpendable: 1300 })), 10)
  assert.equal(agentSplit(state({ paymentDays: [0, 30, 60], spendable: 1100, previousSpendable: 1100 })), 30)
  assert.equal(agentSplit(state({ spendable: 100 })), 10)
  assert.equal(agentSplit(state({ paymentDays: [0, 3, 20], spendable: 600 })), 10)
  assert.equal(agentSplit(state({ paymentDays: [0] })), 20) // too little data
  assert.equal(agentSplit(state({ paymentDays: [0, 7, 14], spendable: 1100, splitPercent: LIMITS.max })), LIMITS.max)
  assert.equal(agentSplit(state({ spendable: 0, splitPercent: LIMITS.min })), LIMITS.min)
})

test('mix rule: neutral is the reference, the regime tilts it within bounds', () => {
  assert.deepEqual(agentMix('neutral'), { conservative: 25, balanced: 50, growth: 25 })
  assert.deepEqual(agentMix('risk_off'), { conservative: 40, balanced: 50, growth: 10 })
  assert.deepEqual(agentMix('risk_on'), { conservative: 15, balanced: 50, growth: 35 })
})

test('fixed rule saves 20% of every payment and earns the Balanced APY on testnet', () => {
  const r = replay('fixed', 'salary', 'testnet', flat)
  const paid = incomes('salary', DAYS).reduce((a, b) => a + b, 0)
  assert.equal(r.contributed, (paid * FIXED_SPLIT) / 100)
  assert.equal(r.avgSplitPercent, FIXED_SPLIT)
  assert.ok(r.gain > 0 && r.gainPct < 6) // under 90 days of a 6% APY
  assert.equal(r.worstDipPct, 0)
})

test('agent replay stays inside the signed limits and records a state per payment', () => {
  for (const pattern of ['salary', 'freelance', 'gig'] as const) {
    const r = replay('agent', pattern, 'market', flat)
    assert.ok(r.avgSplitPercent >= LIMITS.min && r.avgSplitPercent <= LIMITS.max, pattern)
    assert.equal(r.states.length, incomes(pattern, DAYS).filter((x) => x > 0).length)
  }
})

test('basket: flat prices keep 1,000; Plutus trims coins on a slide and loses less than static weights', () => {
  const withCake = (p: Prices, f: number): Prices => ({ ...p, CAKE: series(2, f) })
  const calm = basketReplay('plutus', withCake(flat, 1))
  assert.equal(calm.value, 1000)
  assert.equal(calm.weightChanges, 0)
  const slide = withCake({ BNB: series(600, 0.995), BTC: series(60_000, 0.995), ETH: series(3000, 0.995) }, 0.995)
  const stat = basketReplay('static', slide)
  const plutus = basketReplay('plutus', slide)
  assert.ok(stat.value < 1000)
  assert.ok(plutus.value > stat.value, `${plutus.value} vs ${stat.value}`) // 70% tUSDT in risk_off
  assert.ok(plutus.worstDipPct < stat.worstDipPct)
})

test('on a rally then a slide the agent (risk_off tilt + Athena rebalance) dips less than the fixed rule', () => {
  // a rally, then a slide: the agent's growth position is moved out once the regime flips
  const up = (s: number) => Array.from({ length: LOOKBACK + DAYS + 1 }, (_, i) => (i < 60 ? s * 1.006 ** i : s * 1.006 ** 60 * 0.99 ** (i - 60)))
  const p: Prices = { BNB: up(600), BTC: up(60_000), ETH: up(3000) }
  const fixed = replay('fixed', 'salary', 'market', p)
  const agent = replay('agent', 'salary', 'market', p)
  assert.ok(agent.worstDipPct < fixed.worstDipPct, `${agent.worstDipPct} vs ${fixed.worstDipPct}`)
})
