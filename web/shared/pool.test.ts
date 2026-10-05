// Run: node --test shared/pool.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backtest, normalizeWeights, projectRange, vaultMix } from './pool.ts'

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

test('weights must add up to 100', () => {
  assert.equal(normalizeWeights({ BNB: 70, BTC: 20, USDT: 10 }).valid, true)
  assert.equal(normalizeWeights({ BNB: 70, BTC: 20 }).valid, false)
  assert.deepEqual(normalizeWeights({ BNB: 50, BTC: 0, USDT: 50 }).weights, { BNB: 50, USDT: 50 })
})

test('all stablecoin never moves', () => {
  const s = backtest({ USDT: 100 }, { BNB: [1, 2, 3] })
  assert.equal(s.totalReturn, 0)
  assert.equal(s.volatility, 0)
  assert.equal(s.maxDrawdown, 0)
})

test('half BNB doubling gives +50% with daily rebalance on one step', () => {
  const s = backtest({ BNB: 50, USDT: 50 }, { BNB: [100, 200] })
  assert.ok(close(s.totalReturn, 50))
})

test('drawdown measures the fall from the peak', () => {
  const s = backtest({ BTC: 100 }, { BTC: [100, 120, 90, 110] })
  assert.ok(close(s.maxDrawdown, -25))
  assert.equal(s.days, 3)
})

test('zero volatility means no range; more volatility, wider range', () => {
  const [flat] = projectRange(100, 0, [12])
  assert.ok(close(flat.low, 100) && close(flat.high, 100))
  const [calm] = projectRange(100, 20, [12])
  const [wild] = projectRange(100, 80, [12])
  assert.ok(wild.high - wild.low > calm.high - calm.low)
  assert.ok(calm.low < 100 && calm.high > 100)
})

test('a pool maps to a vault mix by risk tier', () => {
  assert.deepEqual(vaultMix({ BNB: 70, BTC: 20, USDT: 10 }), { conservative: 10, balanced: 90, growth: 0 })
  assert.deepEqual(vaultMix({ SPY: 20, NVDA: 30, SOL: 10, PAXG: 15, USDT: 25 }), { conservative: 40, balanced: 20, growth: 40 })
})
