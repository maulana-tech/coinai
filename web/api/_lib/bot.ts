// Telegram texts for the v2 + consumer features: the /goals, /badges, /points, /groups and /agent commands, and the
// push notifications (referral points, a new badge, a goal reached, contributions to a group you run, Plutus's new
// basket weights). Written in code (no LLM) so they arrive even when the models are down. Formatting is pure and
// tested in bot.test.ts; the *Text() functions read the chain / KV first.

import { Contract } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { chainProvider, readUserState, type UserState } from './chain.js'
import { hermesRentedUntil, readFunds, readStakes, groupReminders, type Fund, type Stake } from './duties.js'
import { POSITIONS, SKILL_INVEST, SKILL_PAY, SKILL_SPLIT, payBudgetLeft } from './guard.js'
import { BADGES_ABI, getGoals, goalProgress, rewardsOf, REFERRAL_POINTS, type Goal } from './rewards.js'
import type { Locale } from './swarm.js'

type T = Record<Locale, string>
const pick = (t: T, l: Locale) => t[l] ?? t.en
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''))
const say = (t: T, l: Locale, v: Record<string, string | number> = {}) => fill(pick(t, l), v)

const NUM: Record<Locale, string> = { en: 'en-US', id: 'id-ID', zh: 'zh-CN' }
export const money = (x: bigint | number, l: Locale) =>
  `${(typeof x === 'bigint' ? Number(x) / 1e6 : x).toLocaleString(NUM[l], { maximumFractionDigits: 2 })} tUSDT`
const date = (unix: number, l: Locale) => new Date(unix * 1000).toLocaleDateString(NUM[l], { day: 'numeric', month: 'short', year: 'numeric' })
const appLink = (path: string) => (process.env.APP_URL ? `${process.env.APP_URL}${path}` : `coinAI app (${path})`)
const bar = (pct: number) => {
  const n = Math.round(Math.min(100, Math.max(0, pct)) / 10)
  return '▓'.repeat(n) + '░'.repeat(10 - n)
}

const savedTotal = (s: Pick<UserState, 'savings' | 'positions'>) => Number(POSITIONS.reduce((sum, p) => sum + s.positions[p], s.savings)) / 1e6

// ─── /goals ──────────────────────────────────────────────────────────────────

export function formatGoals(goals: Goal[], saved: number, now: number, l: Locale): string {
  if (!goals.length)
    return say({ en: 'No savings goals yet. Add one (a trip, a laptop, an emergency fund): {link}', id: 'Belum ada tujuan tabungan. Tambahkan satu (liburan, laptop, dana darurat): {link}', zh: '还没有储蓄目标。添加一个（旅行、笔记本电脑、应急基金）：{link}' }, l, { link: appLink('/app/rewards') })
  const rows = goals.map((g) => {
    const p = goalProgress(g, saved, now)
    const when =
      p.daysLeft === null ? '' : p.daysLeft > 0 ? ' · ' + say({ en: '{n} days left', id: 'sisa {n} hari', zh: '还剩 {n} 天' }, l, { n: p.daysLeft }) : ' · ' + say({ en: 'past the deadline', id: 'lewat tenggat', zh: '已过截止日期' }, l)
    return `${p.reached ? '✅' : '🎯'} ${g.name}\n${bar(p.pct)} ${Math.floor(p.pct)}%\n${money(p.saved, l)} / ${money(g.target, l)} · ${say({ en: '{s}% of savings', id: '{s}% tabungan', zh: '储蓄的 {s}%' }, l, { s: g.share })}${when}`
  })
  return `${say({ en: 'Your savings goals', id: 'Tujuan tabunganmu', zh: '你的储蓄目标' }, l)}\n\n${rows.join('\n\n')}\n\n${appLink('/app/rewards')}`
}

export async function goalsText(user: string, l: Locale): Promise<string> {
  const [s, goals] = await Promise.all([readUserState(user), getGoals(user)])
  return formatGoals(goals, savedTotal(s), s.now, l)
}

// ─── /badges ─────────────────────────────────────────────────────────────────

export const BADGE_NAMES: T[] = [
  { en: 'First payment', id: 'Pembayaran pertama', zh: '第一笔付款' },
  { en: 'Ten payments', id: 'Sepuluh pembayaran', zh: '十笔付款' },
  { en: '100 tUSDT saved', id: '100 tUSDT ditabung', zh: '已存 100 tUSDT' },
  { en: '4-week saving streak', id: 'Streak menabung 4 minggu', zh: '连续储蓄 4 周' },
  { en: 'Goal reached', id: 'Tujuan tercapai', zh: '达成目标' },
  { en: 'First agent run', id: 'Run agen pertama', zh: '首次智能体运行' },
]

export function formatBadges(earnedAt: number[], streakWeeks: number, bestStreak: number, l: Locale): string {
  const rows = BADGE_NAMES.map((n, i) => (earnedAt[i] ? `🏅 ${pick(n, l)} · ${date(earnedAt[i], l)}` : `▫️ ${pick(n, l)}`))
  const count = earnedAt.filter(Boolean).length
  return [
    say({ en: 'Badges: {n}/6', id: 'Badge: {n}/6', zh: '徽章：{n}/6' }, l, { n: count }),
    say({ en: '🔥 Saving streak: {w} weeks (best {b})', id: '🔥 Streak menabung: {w} minggu (terbaik {b})', zh: '🔥 连续储蓄：{w} 周（最佳 {b}）' }, l, { w: streakWeeks, b: bestStreak }),
    '',
    ...rows,
    '',
    say({ en: 'The first three you claim in the app; the agent awards the rest from its daily run.', id: 'Tiga pertama kamu klaim di app; sisanya diberikan agen dari run hariannya.', zh: '前三个在 app 中领取；其余由智能体在每日运行中颁发。' }, l),
    appLink('/app/rewards'),
  ].join('\n')
}

export async function badgesText(user: string, l: Locale): Promise<string> {
  const c = new Contract(process.env.BADGES_ADDRESS || DEPLOYMENT.v2.badges, BADGES_ABI, chainProvider())
  const [earned, r] = await Promise.all([c.badgesOf(user) as Promise<bigint[]>, rewardsOf(user)])
  return formatBadges(earned.map(Number), r.streakWeeks, r.bestStreak, l)
}

// ─── /points ─────────────────────────────────────────────────────────────────

export function formatPoints(r: { points: number; referrals: number }, user: string, l: Locale): string {
  return [
    say({ en: '⭐ {p} points · {f} friends joined', id: '⭐ {p} poin · {f} teman bergabung', zh: '⭐ {p} 积分 · {f} 位好友加入' }, l, { p: r.points, f: r.referrals }),
    '',
    say(
      { en: 'Share your payment link. When someone makes their first coinAI payment through it, you both get {n} points:', id: 'Bagikan payment link-mu. Saat seseorang melakukan pembayaran coinAI pertamanya lewat link itu, kalian berdua dapat {n} poin:', zh: '分享你的收款链接。有人通过它完成首次 coinAI 付款时，你们双方各得 {n} 积分：' },
      l,
      { n: REFERRAL_POINTS },
    ),
    appLink(`/pay/${user}`),
  ].join('\n')
}

export async function pointsText(user: string, l: Locale): Promise<string> {
  return formatPoints(await rewardsOf(user), user, l)
}

// ─── /groups ─────────────────────────────────────────────────────────────────

const KIND: Record<Fund['kind'], T> = {
  patungan: { en: 'Chip-in', id: 'Patungan', zh: '凑钱' },
  iuran: { en: 'Dues', id: 'Iuran', zh: '会费' },
  donasi: { en: 'Fundraiser', id: 'Donasi', zh: '募捐' },
}

export function formatGroups(stakes: Stake[], user: string, now: number, l: Locale): string {
  if (!stakes.length)
    return say({ en: "You're not in any group yet. Start or join one: {link}", id: 'Kamu belum ikut grup mana pun. Buat atau gabung: {link}', zh: '你还没有加入任何群组。创建或加入一个：{link}' }, l, { link: appLink('/groups') })
  const rows = stakes.map((s) => {
    const f = s.fund
    const mine = f.organizer.toLowerCase() === user.toLowerCase()
    const head = `${mine ? '👑' : '•'} ${f.title} (${pick(KIND[f.kind], l)}, #${f.id})`
    let detail: string
    if (f.kind === 'iuran') {
      const behind = s.owedPeriods - s.paidPeriods
      detail = s.member
        ? behind > 0
          ? say({ en: '{n} period(s) due: {a}', id: '{n} periode belum dibayar: {a}', zh: '待缴 {n} 期：{a}' }, l, { n: behind, a: money(f.dues * BigInt(behind), l) })
          : say({ en: 'paid up ✓', id: 'lunas ✓', zh: '已缴清 ✓' }, l)
        : say({ en: '{a} every {d} days', id: '{a} setiap {d} hari', zh: '每 {d} 天 {a}' }, l, { a: money(f.dues, l), d: Math.round(f.period / 86400) })
    } else {
      const of = f.target > 0n ? ` / ${money(f.target, l)}` : ''
      const until = f.deadline ? ' · ' + say({ en: 'until {d}', id: 'sampai {d}', zh: '截至 {d}' }, l, { d: date(f.deadline, l) }) : ''
      detail = `${money(f.raised, l)}${of}${until}`
      if (s.contributed > 0n) detail += ' · ' + say({ en: 'you gave {a}', id: 'kamu memberi {a}', zh: '你出了 {a}' }, l, { a: money(s.contributed, l) })
    }
    return `${head}\n  ${detail}\n  ${appLink(`/groups/${f.id}`)}`
  })
  const nudges = groupReminders(stakes, [], now, l)
  return [say({ en: 'Your groups', id: 'Grupmu', zh: '你的群组' }, l), '', ...rows, ...(nudges.length ? ['', ...nudges] : [])].join('\n')
}

export async function groupsText(user: string, l: Locale): Promise<string> {
  const funds = await readFunds()
  const stakes = await readStakes(user, funds)
  // also the groups the user runs, even before anyone joined or gave
  const run = funds.filter((f) => f.organizer.toLowerCase() === user.toLowerCase() && !stakes.some((s) => s.fund.id === f.id))
  const all = [...stakes, ...run.map((fund) => ({ fund, member: false, contributed: 0n, paidPeriods: 0, owedPeriods: 0 }))]
  return formatGroups(all, user, Math.floor(Date.now() / 1000), l)
}

// ─── /agent ──────────────────────────────────────────────────────────────────

export function formatAgent(s: Pick<UserState, 'policy' | 'now' | 'agentAddress'>, hermesUntil: number, l: Locale): string {
  const p = s.policy
  const active = p.skills !== 0 && p.agent.toLowerCase() === s.agentAddress.toLowerCase() && s.now < p.expiry
  if (!active)
    return say({ en: 'The AI agent is off{why}. Turn it on, choose its skills and limits: {link}', id: 'Agen AI belum aktif{why}. Aktifkan, pilih skill dan batasnya: {link}', zh: 'AI 智能体未开启{why}。开启并选择技能与限制：{link}' }, l, {
      why: p.skills !== 0 ? say({ en: ' (permission expired)', id: ' (izin kedaluwarsa)', zh: '（授权已过期）' }, l) : '',
      link: appLink('/app/agent'),
    })
  const rows: string[] = [say({ en: '🤖 Agent on until {d}', id: '🤖 Agen aktif sampai {d}', zh: '🤖 智能体有效期至 {d}' }, l, { d: date(p.expiry, l) })]
  if (p.skills & SKILL_SPLIT) rows.push(say({ en: '• Demeter tunes your split: {a}%–{b}%', id: '• Demeter mengatur split: {a}%–{b}%', zh: '• Demeter 调整储蓄比例：{a}%–{b}%' }, l, { a: p.minSplitBps / 100, b: p.maxSplitBps / 100 }))
  if (p.skills & SKILL_INVEST) rows.push(say({ en: '• Athena invests and rebalances your savings', id: '• Athena menginvestasikan dan me-rebalance tabunganmu', zh: '• Athena 投资并再平衡你的储蓄' }, l))
  if (p.skills & SKILL_PAY) {
    rows.push(say({ en: '• Hermes pays your dues: {u} of {b} used this window', id: '• Hermes membayar iuranmu: {u} dari {b} terpakai periode ini', zh: '• Hermes 代缴会费：本期已用 {u} / {b}' }, l, { u: money(p.payBudget - payBudgetLeft(p, s.now), l), b: money(p.payBudget, l) }))
    rows.push(
      hermesUntil > s.now
        ? say({ en: '  hired until {d}', id: '  disewa sampai {d}', zh: '  雇用至 {d}' }, l, { d: date(hermesUntil, l) })
        : say({ en: '  ⚠️ not hired: he only pays while hired (1 tUSDT / 30 days)', id: '  ⚠️ belum disewa: Hermes hanya membayar selama disewa (1 tUSDT / 30 hari)', zh: '  ⚠️ 未雇用：只有受雇期间才会代缴（1 tUSDT / 30 天）' }, l),
    )
  }
  return [...rows, '', appLink('/app/agent')].join('\n')
}

export async function agentText(user: string, l: Locale): Promise<string> {
  const [s, until] = await Promise.all([readUserState(user), hermesRentedUntil(user).catch(() => 0)])
  return formatAgent(s, until, l)
}

// ─── Notifications ───────────────────────────────────────────────────────────

export const referralText = (role: 'referrer' | 'newcomer', other: string, l: Locale) =>
  role === 'referrer'
    ? say({ en: '⭐ +{n} points: {who} made their first coinAI payment through your link. /points', id: '⭐ +{n} poin: {who} melakukan pembayaran coinAI pertamanya lewat link-mu. /points', zh: '⭐ +{n} 积分：{who} 通过你的链接完成了首次 coinAI 付款。/points' }, l, { n: REFERRAL_POINTS, who: short(other) })
    : say({ en: '⭐ +{n} points for your first coinAI payment, through {who}\'s link. Welcome! /points', id: '⭐ +{n} poin untuk pembayaran coinAI pertamamu, lewat link {who}. Selamat datang! /points', zh: '⭐ 首次 coinAI 付款获得 +{n} 积分（通过 {who} 的链接）。欢迎！/points' }, l, { n: REFERRAL_POINTS, who: short(other) })

export const badgeText = (badge: number, l: Locale) =>
  say({ en: '🏅 New badge: {b}. It\'s a soulbound token in your wallet. /badges', id: '🏅 Badge baru: {b}. Token soulbound di wallet-mu. /badges', zh: '🏅 新徽章：{b}。它是你钱包中的灵魂绑定代币。/badges' }, l, { b: pick(BADGE_NAMES[badge], l) })

export const goalReachedText = (g: Goal, l: Locale) =>
  say({ en: '🎉 Goal reached: "{g}" ({t}). Share it from the app, or set the next one. /goals', id: '🎉 Tujuan tercapai: "{g}" ({t}). Bagikan dari app, atau pasang tujuan berikutnya. /goals', zh: '🎉 目标达成："{g}"（{t}）。在 app 中分享，或设定下一个目标。/goals' }, l, { g: g.name, t: money(g.target, l) })

/** Lines for the organizer's daily report: money that came into their groups since the last snapshot. */
export function organizerLines(funds: Fund[], user: string, before: Record<number, string>, l: Locale): string[] {
  return funds
    .filter((f) => f.organizer.toLowerCase() === user.toLowerCase() && before[f.id] !== undefined && f.raised > BigInt(before[f.id]))
    .map((f) => say({ en: '👑 "{t}" received {a} since yesterday (now {r}).', id: '👑 "{t}" menerima {a} sejak kemarin (sekarang {r}).', zh: '👑 "{t}" 自昨天起收到 {a}（现为 {r}）。' }, l, { t: f.title, a: money(f.raised - BigInt(before[f.id]), l), r: money(f.raised, l) }))
}

/** One line for basket holders when Plutus set new weights today. */
export function plutusLine(weights: number[], symbols: string[], reason: string, l: Locale): string {
  const mix = weights.map((w, i) => `${symbols[i]} ${w / 100}%`).join(' · ')
  return say({ en: '🧺 Plutus re-weighted your AI Smart Money basket: {m}. Why: {r}', id: '🧺 Plutus mengubah bobot keranjang AI Smart Money-mu: {m}. Alasan: {r}', zh: '🧺 Plutus 调整了你的 AI 聪明钱篮子权重：{m}。原因：{r}' }, l, { m: mix, r: reason })
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
