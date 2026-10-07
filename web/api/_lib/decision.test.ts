// Run: npx tsx --test api/_lib/decision.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confidenceGate, fitAllocation, profileMix, readConfidence, referenceMix, riskOffRebalance, smartWeights } from './decision.ts'

const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0)

test('profile mix sums to 100 and the horizon shifts growth', () => {
  for (const risk of ['conservative', 'moderate', 'aggressive'] as const)
    for (const horizon of ['short', 'medium', 'long'] as const) {
      const m = profileMix({ risk, horizon })
      assert.equal(sum(m), 100)
      assert.ok(Object.values(m).every((x) => x >= 0))
    }
  assert.deepEqual(profileMix({ risk: 'moderate', horizon: 'medium' }), { conservative: 25, balanced: 50, growth: 25 })
  assert.deepEqual(profileMix({ risk: 'moderate', horizon: 'long' }), { conservative: 15, balanced: 50, growth: 35 })
  assert.deepEqual(profileMix({ risk: 'conservative', horizon: 'short' }), { conservative: 75, balanced: 25, growth: 0 })
})

test('an active strategy is the reference, otherwise the profile', () => {
  const profile = { risk: 'moderate' as const, horizon: 'medium' as const }
  const vaultMix = { conservative: 10, balanced: 40, growth: 50 }
  assert.deepEqual(referenceMix(profile, { vaultMix }), { source: 'strategy', mix: vaultMix })
  assert.equal(referenceMix(profile, null).source, 'profile')
})

test('an allocation within the tilt passes unchanged', () => {
  const f = fitAllocation({ conservative: 15, balanced: 45, growth: 40 }, { conservative: 10, balanced: 40, growth: 50 })
  assert.deepEqual(f.mix, { conservative: 15, balanced: 45, growth: 40 })
  assert.equal(f.investPercent, 100)
  assert.equal(f.clamped, false)
})

test('an allocation beyond the tilt is pulled back and still sums to 100', () => {
  const ref = { conservative: 10, balanced: 40, growth: 50 }
  const f = fitAllocation({ conservative: 80, balanced: 20, growth: 0 }, ref)
  assert.equal(f.clamped, true)
  assert.equal(sum(f.mix), 100)
  for (const v of ['conservative', 'balanced', 'growth'] as const) assert.ok(Math.abs(f.mix[v] - ref[v]) <= 15, v)
})

test('the invested share is kept and the rest stays a buffer', () => {
  const f = fitAllocation({ conservative: 20, balanced: 30, growth: 30 }, { conservative: 25, balanced: 50, growth: 25 })
  assert.equal(f.investPercent, 80)
  assert.equal(sum(f.mix), 100)
  assert.ok(sum(f.allocation) <= 80)
})

test('nothing to invest gives an empty fit', () => {
  const f = fitAllocation({ conservative: 0, balanced: 0, growth: 0 }, { conservative: 25, balanced: 50, growth: 25 })
  assert.equal(f.investPercent, 0)
  assert.equal(sum(f.allocation), 0)
})

test('confidence is read leniently and gated fail-closed', () => {
  assert.equal(readConfidence(0.8), 0.8)
  assert.equal(readConfidence('0.6'), 0.6)
  assert.equal(readConfidence(4), 1)
  assert.equal(readConfidence(undefined), null)
  assert.equal(readConfidence('high'), null)
  assert.equal(confidenceGate(0.5), null)
  assert.match(confidenceGate(0.3)!, /low confidence/)
  assert.match(confidenceGate(null)!, /no confidence/)
})

test('Athena moves Growth out only when the market turns risk_off', () => {
  const min = 1_000_000n
  assert.equal(riskOffRebalance('risk_off', 'neutral', 5_000_000n, min), 5_000_000n)
  assert.equal(riskOffRebalance('risk_off', null, 5_000_000n, min), 5_000_000n)
  assert.equal(riskOffRebalance('risk_off', 'risk_off', 5_000_000n, min), null) // already moved on the change
  assert.equal(riskOffRebalance('neutral', 'risk_off', 5_000_000n, min), null)
  assert.equal(riskOffRebalance('risk_off', 'risk_on', 999_999n, min), null) // dust isn't worth the gas
})

test('Plutus weights fit the deployed basket caps for every regime', () => {
  const assets = [
    { symbol: 'tUSDT', maxBps: 10_000 },
    { symbol: 'BNB', maxBps: 5_000 },
    { symbol: 'BTC', maxBps: 5_000 },
    { symbol: 'ETH', maxBps: 5_000 },
    { symbol: 'CAKE', maxBps: 2_000 },
  ]
  for (const regime of ['risk_on', 'neutral', 'risk_off'] as const) {
    const w = smartWeights(regime, assets)
    assert.ok(w, regime)
    assert.equal(sum(Object.fromEntries(w.map((x, i) => [i, x]))), 10_000)
  }
  assert.deepEqual(smartWeights('neutral', assets), [4_000, 2_000, 2_000, 1_500, 500]) // the deploy's initial weights
  assert.ok(smartWeights('risk_off', assets)![0] > smartWeights('risk_on', assets)![0])
  assert.equal(smartWeights('risk_on', [...assets.slice(0, 4), { symbol: 'CAKE', maxBps: 500 }]), null) // over a cap
})
