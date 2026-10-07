// Run: node --test api/_lib/guard.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkProposal, payBudgetLeft, SKILL_INVEST, SKILL_PAY, SKILL_SPLIT, type GuardInput } from './guard.ts'

const AGENT = '0x000000000000000000000000000000000000a6e7'
const DAY = 86400
const base: GuardInput = {
  policy: {
    agent: AGENT.toUpperCase().replace('0X', '0x'),
    skills: SKILL_SPLIT | SKILL_INVEST | SKILL_PAY,
    minSplitBps: 1000,
    maxSplitBps: 4000,
    expiry: 100 * DAY,
    payBudget: 10_000_000n,
    windowStart: 0,
    paidInWindow: 0n,
  },
  agentAddress: AGENT,
  now: 1000,
  splitBps: 2000,
  spend: 20_000_000n,
  savings: 5_000_000n,
  positions: { conservative: 0n, balanced: 0n, growth: 3_000_000n, basket: 1_000_000n },
  lockUntil: 0,
}

test('split inside bounds passes, outside/unchanged rejected', () => {
  assert.equal(checkProposal({ kind: 'set_split', bps: 3000, reason: 'ok' }, base), null)
  assert.match(checkProposal({ kind: 'set_split', bps: 4500, reason: 'x' }, base)!, /outside/)
  assert.match(checkProposal({ kind: 'set_split', bps: 500, reason: 'x' }, base)!, /outside/)
  assert.match(checkProposal({ kind: 'set_split', bps: 2000, reason: 'x' }, base)!, /unchanged/)
})

test('invest limited to idle savings, into a vault or the basket, and allowed while locked (v2)', () => {
  assert.equal(checkProposal({ kind: 'invest', amount: 5_000_000n, target: 'growth', reason: 'ok' }, base), null)
  assert.equal(checkProposal({ kind: 'invest', amount: 1n, target: 'basket', reason: 'ok' }, base), null)
  assert.match(checkProposal({ kind: 'invest', amount: 5_000_001n, target: 'growth', reason: 'x' }, base)!, /exceeds/)
  assert.equal(checkProposal({ kind: 'invest', amount: 1n, target: 'growth', reason: 'ok' }, { ...base, lockUntil: 5000 }), null)
})

test('rebalance only between own positions, within what the source holds', () => {
  const p = { kind: 'rebalance' as const, from: 'growth' as const, to: 'conservative' as const, amount: 3_000_000n, reason: 'risk off' }
  assert.equal(checkProposal(p, base), null)
  assert.equal(checkProposal(p, { ...base, lockUntil: 5000 }), null) // the money stays in savings
  assert.match(checkProposal({ ...p, amount: 3_000_001n }, base)!, /exceeds the growth/)
  assert.match(checkProposal({ ...p, to: 'growth' }, base)!, /same position/)
  assert.match(checkProposal(p, { ...base, policy: { ...base.policy, skills: SKILL_SPLIT } })!, /invest skill/)
})

test('dues only into joined groups, from spendable, inside the 30-day budget', () => {
  const p = { kind: 'contribute' as const, fundId: 3, amount: 4_000_000n, member: true, reason: 'October dues' }
  assert.equal(checkProposal(p, base), null)
  assert.match(checkProposal({ ...p, member: false }, base)!, /not a member/)
  assert.match(checkProposal({ ...p, amount: 25_000_000n }, base)!, /spendable/)
  const spent = { ...base, policy: { ...base.policy, windowStart: 0, paidInWindow: 8_000_000n } }
  assert.match(checkProposal(p, spent)!, /budget/)
  // the window resets 30 days after it opened, like the contract
  assert.equal(payBudgetLeft(spent.policy, 30 * DAY), 10_000_000n)
  assert.equal(checkProposal(p, { ...spent, now: 30 * DAY }), null)
  assert.match(checkProposal(p, { ...base, policy: { ...base.policy, skills: SKILL_INVEST } })!, /pay skill/)
})

test('expired, foreign agent, no skills, or missing reason rejected', () => {
  const p = { kind: 'set_split' as const, bps: 3000, reason: 'ok' }
  assert.match(checkProposal(p, { ...base, now: 100 * DAY })!, /not authorized/)
  assert.match(checkProposal(p, { ...base, agentAddress: '0x0000000000000000000000000000000000000001' })!, /not authorized/)
  assert.match(checkProposal(p, { ...base, policy: { ...base.policy, skills: 0 } })!, /not authorized/)
  assert.match(checkProposal({ ...p, reason: '  ' }, base)!, /reason/)
})
