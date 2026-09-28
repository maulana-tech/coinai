// Run: node --test shared/projection.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectSavings, weightedApy } from './projection.ts'

test('no yield: balance is start plus contributions', () => {
  const p = projectSavings({ start: 100, monthlyContribution: 20, apy: 0 })
  assert.equal(p.length, 13)
  assert.equal(p[12].balance, 340)
  assert.equal(p[12].contributed, 340)
})

test('12% APY on 1000 for a year compounds monthly to ~1126.83', () => {
  const p = projectSavings({ start: 1000, monthlyContribution: 0, apy: 0.12 })
  assert.ok(Math.abs(p[12].balance - 1126.825) < 0.01, String(p[12].balance))
  assert.equal(p[12].contributed, 1000)
})

test('weighted APY by position, fallback when empty', () => {
  assert.ok(Math.abs(weightedApy([{ amount: 1, apy: 0.03 }, { amount: 3, apy: 0.07 }], 0.06) - 0.06) < 1e-12)
  assert.equal(weightedApy([], 0.06), 0.06)
})
