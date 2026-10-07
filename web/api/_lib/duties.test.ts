// Run: npx tsx --test api/_lib/duties.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duesPlan, groupReminders, type Fund, type Stake } from './duties.ts'

const NOW = 1_000_000
const fund = (x: Partial<Fund>): Fund => ({ id: 1, kind: 'iuran', title: 'Kas RT', organizer: '0xorg', cancelled: false, deadline: 0, period: 30 * 86400, dues: 5_000_000n, target: 0n, raised: 0n, contributors: 0, members: 1, ...x })
const stake = (x: Partial<Stake>): Stake => ({ fund: fund({}), member: true, contributed: 0n, paidPeriods: 0, owedPeriods: 1, ...x })

test('Hermes pays whole periods behind, capped by spendable and budget', () => {
  const s = [stake({ owedPeriods: 3, paidPeriods: 0 })]
  assert.deepEqual(duesPlan(s, 100_000_000n, 100_000_000n, NOW).map((d) => d.periods), [3])
  assert.deepEqual(duesPlan(s, 12_000_000n, 100_000_000n, NOW).map((d) => d.periods), [2]) // spendable 12 → 2 × 5
  assert.deepEqual(duesPlan(s, 100_000_000n, 4_000_000n, NOW), []) // budget below one period
  assert.deepEqual(duesPlan([stake({ owedPeriods: 2, paidPeriods: 2 })], 100_000_000n, 100_000_000n, NOW), []) // paid up
})

test('Hermes never pays non-members, other kinds, or closed funds', () => {
  const rich = [100_000_000n, 100_000_000n, NOW] as const
  assert.deepEqual(duesPlan([stake({ member: false })], ...rich), [])
  assert.deepEqual(duesPlan([stake({ fund: fund({ kind: 'patungan' }) })], ...rich), [])
  assert.deepEqual(duesPlan([stake({ fund: fund({ cancelled: true }) })], ...rich), [])
  assert.deepEqual(duesPlan([stake({ fund: fund({ deadline: NOW - 1 }) })], ...rich), [])
})

test('the budget is shared across funds', () => {
  const s = [stake({ fund: fund({ id: 1 }) }), stake({ fund: fund({ id: 2 }) })]
  assert.deepEqual(duesPlan(s, 100_000_000n, 7_000_000n, NOW).map((d) => d.fund.id), [1])
})

test('Poseidon: due, late, deadline close, refund open; paid dues are not nagged', () => {
  const due = stake({ owedPeriods: 1 })
  const late = stake({ fund: fund({ id: 2, title: 'Arisan' }), owedPeriods: 3 })
  const closing = stake({ fund: fund({ id: 3, kind: 'patungan', title: 'Kado', deadline: NOW + 3600, target: 10n, raised: 4n }), member: false, contributed: 4n })
  const failed = stake({ fund: fund({ id: 4, kind: 'patungan', title: 'Trip', deadline: NOW - 1, target: 10n, raised: 4n }), member: false, contributed: 4n })
  const lines = groupReminders([due, late, closing, failed], [], NOW, 'en')
  assert.equal(lines.length, 4)
  assert.match(lines[0], /due/)
  assert.match(lines[1], /3 periods behind/)
  assert.match(lines[2], /closes within 2 days/)
  assert.match(lines[3], /refunded/)
  const afterHermes = groupReminders([due], [{ fundId: 1, title: 'Kas RT', amount: 5_000_000n, txHash: '0xabc' }], NOW, 'id')
  assert.deepEqual(afterHermes, ['Hermes membayar iuran 5.0 tUSDT ke “Kas RT”.'])
})
