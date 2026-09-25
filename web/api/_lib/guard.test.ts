// Run: node --test api/_lib/guard.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkProposal, type GuardInput } from './guard.ts'

const AGENT = '0x000000000000000000000000000000000000a6e7'
const base: GuardInput = {
  policy: { agent: AGENT.toUpperCase().replace('0X', '0x'), minSplitBps: 1000, maxSplitBps: 4000, expiry: 2000 },
  agentAddress: AGENT,
  now: 1000,
  splitBps: 2000,
  savings: 5_000_000n,
  lockUntil: 0,
}

test('split inside bounds passes, outside/unchanged rejected', () => {
  assert.equal(checkProposal({ kind: 'set_split', bps: 3000, reason: 'ok' }, base), null)
  assert.match(checkProposal({ kind: 'set_split', bps: 4500, reason: 'x' }, base)!, /outside/)
  assert.match(checkProposal({ kind: 'set_split', bps: 500, reason: 'x' }, base)!, /outside/)
  assert.match(checkProposal({ kind: 'set_split', bps: 2000, reason: 'x' }, base)!, /unchanged/)
})

test('invest limited to idle savings and blocked by lock', () => {
  assert.equal(checkProposal({ kind: 'invest', amount: 5_000_000n, target: 'growth', reason: 'ok' }, base), null)
  assert.match(checkProposal({ kind: 'invest', amount: 5_000_001n, target: 'growth', reason: 'x' }, base)!, /exceeds/)
  assert.match(checkProposal({ kind: 'invest', amount: 1n, target: 'growth', reason: 'x' }, { ...base, lockUntil: 1500 })!, /locked/)
})

test('expired, foreign agent, or missing reason rejected', () => {
  const p = { kind: 'set_split' as const, bps: 3000, reason: 'ok' }
  assert.match(checkProposal(p, { ...base, now: 2000 })!, /not authorized/)
  assert.match(checkProposal(p, { ...base, agentAddress: '0x0000000000000000000000000000000000000001' })!, /not authorized/)
  assert.match(checkProposal({ ...p, reason: '  ' }, base)!, /reason/)
})
