// Run: node --test shared/market.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annualizedVolatility } from './market.ts'

test('flat prices have zero volatility', () => {
  assert.equal(annualizedVolatility([100, 100, 100, 100]), 0)
})

test('alternating ±1% daily moves annualize to ~19%', () => {
  const closes = [100]
  for (let i = 0; i < 30; i++) closes.push(closes[i] * (i % 2 ? 0.99 : 1.01))
  const v = annualizedVolatility(closes)
  assert.ok(v > 18 && v < 20, `got ${v}`)
})
