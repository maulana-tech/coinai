// Consumer features on top of the savings account (roadmap phase 3):
//   C1 goals — named pockets over the user's savings: each takes a share of everything saved, with a target and
//      a deadline. Shares route every payment's savings across the pockets (they're views of one on-chain balance:
//      CoinAI v2 has one savings balance per wallet, so a pocket's money stays withdrawable like the rest).
//   C2 streaks — consecutive weeks with at least one payment in, tracked by the daily cron; the agent wallet mints
//      the soulbound badges that need this history (evm/src/CoinAIBadges.sol).
//   C4 referrals — a wallet's first coinAI payment, sent through someone's payment link, earns both sides points.
// Pure rules (cleanGoals, goalProgress, streakStep) are separate from storage so they can be tested.

import { Contract } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { agentWallet, chainProvider } from './chain.js'
import { kv } from './kv.js'

// ─── C1 goals ────────────────────────────────────────────────────────────────

export const MAX_GOALS = 6

export type Goal = {
  id: string
  name: string
  target: number // tUSDT
  deadline: number // unix seconds, 0 = none
  share: number // percent of all savings this pocket holds; the shares of all goals sum to at most 100
  createdAt: number
}

/** Validates goals from the app; throws on bad input. */
export function cleanGoals(input: unknown, now: number): Goal[] {
  if (!Array.isArray(input)) throw new Error('goals_must_be_a_list')
  if (input.length > MAX_GOALS) throw new Error('too_many_goals')
  const goals = input.map((g: Partial<Goal>, i): Goal => {
    const name = String(g?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    const target = Math.round(Number(g?.target) * 100) / 100
    const share = Math.round(Number(g?.share))
    const deadline = Math.max(0, Math.floor(Number(g?.deadline) || 0))
    if (!name) throw new Error('goal_name_required')
    if (!(target > 0) || target > 1e9) throw new Error('goal_target_invalid')
    if (!(share >= 1 && share <= 100)) throw new Error('goal_share_invalid')
    const id = /^[a-z0-9-]{1,40}$/.test(String(g?.id)) ? String(g!.id) : `g${now}${i}`
    return { id, name, target, deadline, share, createdAt: Number(g?.createdAt) || now }
  })
  if (goals.reduce((s, g) => s + g.share, 0) > 100) throw new Error('goal_shares_over_100')
  return goals
}

/** What a pocket holds and how far it is, from the user's total savings (tUSDT). */
export function goalProgress(g: Goal, totalSavings: number, now: number) {
  const saved = Math.round(((totalSavings * g.share) / 100) * 100) / 100
  const pct = Math.min(100, Math.round((saved / g.target) * 1000) / 10)
  const daysLeft = g.deadline ? Math.ceil((g.deadline - now) / 86400) : null
  return { saved, pct, reached: saved >= g.target, daysLeft }
}

const goalsKey = (user: string) => `goals:${user.toLowerCase()}`
export const getGoals = async (user: string) => (await kv.get<Goal[]>(goalsKey(user)).catch(() => null)) ?? []
export const setGoals = (user: string, goals: Goal[]) => kv.set(goalsKey(user), goals)

// ─── C2 streaks + badges ─────────────────────────────────────────────────────

const WEEK = 7 * 86400
export type Streak = { weeks: number; lastWeek: number; lastCount: number; best: number }

/** One daily cron tick: a new payment in the week after the last paid week extends the streak, a gap resets it. */
export function streakStep(s: Streak | null, paymentCount: number, now: number): Streak {
  const week = Math.floor(now / WEEK)
  const prev = s ?? { weeks: 0, lastWeek: -1, lastCount: paymentCount, best: 0 }
  if (s === null && paymentCount === 0) return prev
  const paid = s === null ? paymentCount > 0 : paymentCount > prev.lastCount
  let weeks = prev.lastWeek >= 0 && week - prev.lastWeek > 1 ? 0 : prev.weeks // a full week with no payment ends it
  let lastWeek = prev.lastWeek
  if (paid && week !== prev.lastWeek) {
    weeks = week === prev.lastWeek + 1 ? weeks + 1 : 1
    lastWeek = week
  }
  return { weeks, lastWeek, lastCount: paymentCount, best: Math.max(prev.best, weeks) }
}

const streakKey = (user: string) => `streak:${user.toLowerCase()}`
export const getStreak = async (user: string) => kv.get<Streak>(streakKey(user)).catch(() => null)
export const setStreak = (user: string, s: Streak) => kv.set(streakKey(user), s)

export const BADGE = { STREAK_4_WEEKS: 3, GOAL_REACHED: 4, FIRST_AGENT_RUN: 5 } as const
export const BADGES_ABI = ['function badgesOf(address user) view returns (uint64[6])', 'function award(address user,uint8 badge)']
const badgesAddress = () => process.env.BADGES_ADDRESS || DEPLOYMENT.v2.badges

/** Mints the awarded badges the user has earned and doesn't hold yet; returns the badge ids it minted. */
export async function awardBadges(user: string, earned: { streak: boolean; goal: boolean; agentRun: boolean }): Promise<number[]> {
  const want: number[] = []
  if (earned.streak) want.push(BADGE.STREAK_4_WEEKS)
  if (earned.goal) want.push(BADGE.GOAL_REACHED)
  if (earned.agentRun) want.push(BADGE.FIRST_AGENT_RUN)
  if (!want.length) return []
  const read = new Contract(badgesAddress(), BADGES_ABI, chainProvider())
  const held = (await read.badgesOf(user)) as bigint[]
  const c = new Contract(badgesAddress(), BADGES_ABI, agentWallet())
  const out: number[] = []
  for (const b of want) {
    if (held[b] !== 0n) continue
    const tx = await c.award(user, b)
    await tx.wait()
    out.push(b)
  }
  return out
}

// ─── C4 referrals ────────────────────────────────────────────────────────────

export const REFERRAL_POINTS = 100

/**
 * A payment through `recipient`'s link from a wallet that never used coinAI before (no payments received, never
 * referred): both get points, once per new wallet. The caller has verified the payment on-chain.
 */
export async function creditReferral(payer: string, recipient: string, payerPaymentCount: number): Promise<boolean> {
  if (payer.toLowerCase() === recipient.toLowerCase() || payerPaymentCount > 0) return false
  if (!(await kv.setnx(`referred:${payer.toLowerCase()}`, recipient.toLowerCase()))) return false
  await Promise.all([
    kv.incrby(`points:${payer.toLowerCase()}`, REFERRAL_POINTS),
    kv.incrby(`points:${recipient.toLowerCase()}`, REFERRAL_POINTS),
    kv.incrby(`referrals:${recipient.toLowerCase()}`, 1),
  ])
  return true
}

export async function rewardsOf(user: string) {
  const u = user.toLowerCase()
  const [points, referrals, referredBy] = await kv.mget<number | string>([`points:${u}`, `referrals:${u}`, `referred:${u}`])
  const streak = await getStreak(user)
  return {
    points: Number(points ?? 0),
    referrals: Number(referrals ?? 0),
    referredBy: typeof referredBy === 'string' ? referredBy : null,
    streakWeeks: streak?.weeks ?? 0,
    bestStreak: streak?.best ?? 0,
  }
}
