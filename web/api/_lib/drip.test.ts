// Run: npx tsx --test api/_lib/drip.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dripAmount } from './chain.ts'

test('a year of yield at 12% on 100 tUSDT is 12 tUSDT', () => {
  assert.equal(dripAmount(100_000_000n, 1200, 365 * 86400, 1), 12_000_000n)
})

test('speedup scales elapsed time', () => {
  assert.equal(dripAmount(100_000_000n, 1200, 86400, 30), dripAmount(100_000_000n, 1200, 30 * 86400, 1))
})

test('empty vault or no time accrues nothing', () => {
  assert.equal(dripAmount(0n, 1200, 86400, 30), 0n)
  assert.equal(dripAmount(100_000_000n, 1200, 0, 30), 0n)
})
