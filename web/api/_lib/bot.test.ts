// Run: npx tsx --test api/_lib/bot.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { badgeText, formatAgent, formatBadges, formatGoals, formatGroups, formatPoints, organizerLines, plutusLine, referralText } from './bot.ts'
import type { Fund, Stake } from './duties.ts'
import { SKILL_INVEST, SKILL_PAY, SKILL_SPLIT, type Policy } from './guard.ts'

const NOW = 1_800_000_000
const ME = '0x72092971935F31734118fD869A768aE17C84dd0B'
const AGENT = '0x03c8faF61c40F35CCFFd8fDcCa7F037C2dB2f6C6'
const fund = (x: Partial<Fund>): Fund => ({ id: 0, kind: 'iuran', title: 'Kas RT 05', organizer: ME, cancelled: false, deadline: 0, period: 30 * 86400, dues: 2_000_000n, target: 0n, raised: 2_000_000n, contributors: 1, members: 1, ...x })
const stake = (x: Partial<Stake>): Stake => ({ fund: fund({}), member: true, contributed: 2_000_000n, paidPeriods: 1, owedPeriods: 1, ...x })

test('goals: progress bar, share and days left; empty points to the app', () => {
  const text = formatGoals([{ id: 'g1', name: 'Trip ke Bali', target: 100, share: 50, deadline: NOW + 10 * 86400, createdAt: NOW }], 80, NOW, 'en')
  assert.match(text, /Trip ke Bali/)
  assert.match(text, /▓{4}░{6} 40%/)
  assert.match(text, /40 tUSDT \/ 100 tUSDT · 50% of savings · 10 days left/)
  assert.match(formatGoals([], 0, NOW, 'id'), /Belum ada tujuan/)
})

test('badges: earned ones dated, streak shown', () => {
  const text = formatBadges([NOW, 0, 0, 0, 0, 0], 2, 3, 'en')
  assert.match(text, /Badges: 1\/6/)
  assert.match(text, /🏅 First payment/)
  assert.match(text, /▫️ Ten payments/)
  assert.match(text, /2 weeks \(best 3\)/)
})

test('points: totals and the payment link', () => {
  const text = formatPoints({ points: 200, referrals: 2 }, ME, 'zh')
  assert.match(text, /200 积分 · 2 位好友/)
  assert.ok(text.includes(`/pay/${ME}`))
})

test('groups: dues due, paid up, organizer crown, chip-in progress', () => {
  const due = stake({ paidPeriods: 0, owedPeriods: 2 })
  const chipIn = stake({ fund: fund({ id: 1, kind: 'patungan', title: 'Trip ke Bali', organizer: AGENT, target: 50_000_000n, raised: 5_000_000n, deadline: NOW + 86400 }), member: false, contributed: 5_000_000n })
  const text = formatGroups([due, chipIn], ME, NOW, 'en')
  assert.match(text, /👑 Kas RT 05 \(Dues, #0\)/)
  assert.match(text, /2 period\(s\) due: 4 tUSDT/)
  assert.match(text, /• Trip ke Bali \(Chip-in, #1\)/)
  assert.match(text, /5 tUSDT \/ 50 tUSDT/)
  assert.match(text, /you gave 5 tUSDT/)
  assert.match(text, /closes within 2 days/) // Poseidon's nudge
  assert.match(formatGroups([stake({})], ME, NOW, 'id'), /lunas ✓/)
  assert.match(formatGroups([], ME, NOW, 'en'), /not in any group/)
})

test('agent: skills, limits, budget used and Hermes hire state', () => {
  const policy: Policy = { agent: AGENT, skills: SKILL_SPLIT | SKILL_INVEST | SKILL_PAY, minSplitBps: 1000, maxSplitBps: 4000, expiry: NOW + 86400, payBudget: 5_000_000n, windowStart: NOW - 86400, paidInWindow: 2_000_000n }
  const on = formatAgent({ policy, now: NOW, agentAddress: AGENT }, NOW + 30 * 86400, 'en')
  assert.match(on, /Demeter tunes your split: 10%–40%/)
  assert.match(on, /Athena invests/)
  assert.match(on, /2 tUSDT of 5 tUSDT used/)
  assert.match(on, /hired until/)
  assert.match(formatAgent({ policy, now: NOW, agentAddress: AGENT }, 0, 'en'), /not hired/)
  assert.match(formatAgent({ policy: { ...policy, skills: 0 }, now: NOW, agentAddress: AGENT }, 0, 'en'), /agent is off\. /)
  assert.match(formatAgent({ policy, now: NOW + 2 * 86400, agentAddress: AGENT }, 0, 'id'), /izin kedaluwarsa/)
})

test('notifications: referral both sides, badge, organizer income, Plutus', () => {
  assert.match(referralText('referrer', ME, 'en'), /\+100 points: 0x7209…dd0B made their first/)
  assert.match(referralText('newcomer', ME, 'id'), /pembayaran coinAI pertamamu/)
  assert.match(badgeText(3, 'en'), /4-week saving streak/)
  const lines = organizerLines([fund({ raised: 7_000_000n }), fund({ id: 1, organizer: AGENT, raised: 9_000_000n })], ME, { 0: '2000000', 1: '1000000' }, 'en')
  assert.deepEqual(lines, ['👑 "Kas RT 05" received 5 tUSDT since yesterday (now 7 tUSDT).'])
  assert.deepEqual(organizerLines([fund({})], ME, {}, 'en'), []) // no snapshot yet: nothing to compare
  assert.match(plutusLine([7000, 1000, 1500, 500, 0], ['tUSDT', 'BNB', 'BTC', 'ETH', 'CAKE'], 'risk-off: BTC fell 12%', 'en'), /tUSDT 70% · BNB 10% · BTC 15% · ETH 5% · CAKE 0%\. Why: risk-off/)
})
