import { dripYield, env, readUserState } from '../_lib/chain.js'
import { groupReminders, hermesPayDues, plutusSetWeights, readFunds, readStakes } from '../_lib/duties.js'
import { policyActive } from '../_lib/guard.js'
import { json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { awardBadges, getGoals, getStreak, goalProgress, setStreak, streakStep } from '../_lib/rewards.js'
import { badgeText, goalReachedText, organizerLines, plutusLine } from '../_lib/bot.js'
import { deliver, getSub, notifyUser } from '../_lib/notify.js'
import { renderReportEmail } from '../_lib/email.js'
import { renderReportPdf } from '../_lib/report-pdf.js'
import { getMarket, getMarketAnalysis, runSwarm, saveSnapshot, type RunResult } from '../_lib/swarm.js'
import { POSITIONS } from '../_lib/guard.js'

// Vercel Cron (see vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET.
// Once: Plutus sets the AI Smart Money basket weights from today's market read.
// For each enrolled user: run the agent team (report-only if the agent isn't enabled), let Hermes pay due group
// dues, deliver the report + Poseidon's group reminders (and, for organizers, what came into their groups; for basket
// holders, Plutus's new weights) to their channels, then snapshot for tomorrow's deltas.
// Every saver: weekly streak, awarded badges and reached goals, each announced on Telegram as it happens.
// ponytail: serial loop, fine for a demo-sized user list; fan out via a queue past ~20 users.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return json({ error: 'forbidden' }, 403)

  const drip = await dripYield().catch((e) => [{ error: (e as Error).message }])
  const plutus = await getMarketAnalysis()
    .then(plutusSetWeights)
    .catch((e) => ({ error: (e as Error).message }))
  const funds = await readFunds().catch(() => [])
  // what each group had raised at the last run, for the organizers' "since yesterday" lines
  const fundsBefore = (await kv.get<Record<number, string>>('fundsnap').catch(() => null)) ?? {}
  const users = await kv.smembers('users')
  const rewards = await trackRewards([...new Set([...users, ...(await kv.smembers('savers').catch(() => []))])])
  const results: { user: string; executed: number; duesPaid: number; delivered: boolean; errors: string[] }[] = []

  for (const user of users) {
    const errors: string[] = []
    let executed = 0
    let duesPaid = 0
    let delivered = false
    try {
      const sub = await getSub(user)
      const subscribed = !!(sub && (sub.email || sub.telegramChatId))
      // Nothing to do or report: skip without spending LLM calls.
      if (!subscribed && !policyActive(await readUserState(user))) continue
      const run = await runSwarm(user, { locale: sub?.locale })
      executed = run.executed.length
      let state = await readUserState(user)
      const stakes = await readStakes(user, funds).catch(() => [])
      const paid = await hermesPayDues(state, stakes)
      duesPaid = paid.filter((p) => p.txHash).length
      errors.push(...paid.flatMap((p) => (p.error ? [`hermes ${p.fundId}: ${p.error}`] : [])))
      if (duesPaid) state = await readUserState(user)
      const locale = sub?.locale ?? 'en'
      const groupLines = [
        ...groupReminders(stakes, paid, state.now, locale),
        ...organizerLines(funds, user, fundsBefore, locale),
        ...(plutus && 'weights' in plutus && state.positions.basket > 0n ? [plutusLine(plutus.weights, plutus.symbols, plutus.reason, locale)] : []),
      ]
      if (sub && (sub.email || sub.telegramChatId)) {
        const appUrl = process.env.APP_URL
        const market = await getMarket().catch(() => null)
        const email = renderReportEmail({ run, state, market, locale: sub.locale, appUrl })
        const pdf = sub.email ? await renderReportPdf({ run, state, market, locale: sub.locale }).catch(() => null) : null
        const report = [run.report, ...groupLines].join('\n')
        const text = appUrl ? `${report}\n\n${appUrl}/app/agent` : report
        errors.push(...(await deliver(sub, text, email, pdf)))
        delivered = errors.length === 0
      }
      await saveSnapshot(state)
    } catch (e) {
      errors.push((e as Error).message)
    }
    results.push({ user, executed, duesPaid, delivered, errors })
  }
  if (funds.length) await kv.set('fundsnap', Object.fromEntries(funds.map((f) => [f.id, f.raised.toString()]))).catch(() => {})
  return json({ users: users.length, drip, plutus, rewards, results })
}

/** C2: step every saver's weekly streak and mint the awarded badges they've earned (streak, goal, first agent run). */
async function trackRewards(wallets: string[]) {
  const out: { user: string; streak: number; minted: number; error?: string }[] = []
  for (const user of wallets) {
    try {
      const s = await readUserState(user)
      const streak = streakStep(await getStreak(user), s.paymentCount, s.now)
      await setStreak(user, streak)
      const saved = Number(POSITIONS.reduce((sum, p) => sum + s.positions[p], s.savings)) / 1e6
      const reached = (await getGoals(user)).filter((g) => goalProgress(g, saved, s.now).reached)
      for (const g of reached)
        if (await kv.setnx(`goaldone:${user.toLowerCase()}:${g.id}`, s.now)) await notifyUser(user, (l) => goalReachedText(g, l))
      const runs = await kv.list<RunResult>(`runs:${user}`, 20).catch(() => [])
      const minted = await awardBadges(user, { streak: streak.weeks >= 4, goal: reached.length > 0, agentRun: runs.some((r) => r.executed.length > 0) })
      for (const b of minted) await notifyUser(user, (l) => badgeText(b, l))
      out.push({ user, streak: streak.weeks, minted: minted.length })
    } catch (e) {
      out.push({ user, streak: 0, minted: 0, error: (e as Error).message.slice(0, 200) })
    }
  }
  return out
}
