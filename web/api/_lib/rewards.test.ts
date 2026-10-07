// Run: npx tsx --test api/_lib/rewards.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanGoals, goalProgress, streakStep } from './rewards.ts'

const WEEK = 7 * 86400
const NOW = 2_000 * WEEK + 3600 // early in week 2000

test('goals are validated: name, target, share, at most 100% shared', () => {
  const g = cleanGoals([{ name: '  Trip to Bali ', target: 500, share: 60, deadline: NOW + 30 * 86400 }], NOW)
  assert.equal(g[0].name, 'Trip to Bali')
  assert.ok(g[0].id)
  assert.equal(g[0].public, false)
  assert.equal(cleanGoals([{ name: 'x', target: 5, share: 10, public: true }], NOW)[0].public, true)
  assert.throws(() => cleanGoals([{ name: '', target: 5, share: 10 }], NOW), /name/)
  assert.throws(() => cleanGoals([{ name: 'x', target: 0, share: 10 }], NOW), /target/)
  assert.throws(() => cleanGoals([{ name: 'a', target: 5, share: 60 }, { name: 'b', target: 5, share: 50 }], NOW), /over_100/)
  assert.throws(() => cleanGoals('nope', NOW), /list/)
})

test('a pocket holds its share of all savings', () => {
  const [g] = cleanGoals([{ name: 'Laptop', target: 300, share: 50, deadline: NOW + 10 * 86400 }], NOW)
  assert.deepEqual(goalProgress(g, 200, NOW), { saved: 100, pct: 33.3, reached: false, daysLeft: 10 })
  assert.equal(goalProgress(g, 700, NOW).reached, true)
  assert.equal(goalProgress(g, 700, NOW).pct, 100)
})

test('streak: one paid week after another grows it, a skipped week resets it', () => {
  let s = streakStep(null, 0, NOW)
  assert.equal(s.weeks, 0)
  s = streakStep(s, 1, NOW) // first payment
  assert.equal(s.weeks, 1)
  s = streakStep(s, 1, NOW + 86400) // same week, nothing new
  assert.equal(s.weeks, 1)
  for (let w = 1; w <= 3; w++) s = streakStep(s, 1 + w, NOW + w * WEEK) // paid in each next week
  assert.equal(s.weeks, 4)
  assert.equal(s.best, 4)
  s = streakStep(s, 4, NOW + 4 * WEEK) // week 5 has started, not paid yet: still 4
  assert.equal(s.weeks, 4)
  s = streakStep(s, 4, NOW + 5 * WEEK) // week 5 passed without a payment
  assert.equal(s.weeks, 0)
  s = streakStep(s, 5, NOW + 5 * WEEK + 3600)
  assert.equal(s.weeks, 1)
  assert.equal(s.best, 4)
})
