import { dripYield, env, readUserState } from '../_lib/chain.js'
import { policyActive } from '../_lib/guard.js'
import { json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { deliver, getSub } from '../_lib/notify.js'
import { renderReportEmail } from '../_lib/email.js'
import { renderReportPdf } from '../_lib/report-pdf.js'
import { getMarket, runSwarm, saveSnapshot } from '../_lib/swarm.js'

// Vercel Cron (see vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET.
// For each enrolled user: run the agent team (report-only if the agent isn't enabled),
// deliver the report + reminders to their channels, then snapshot for tomorrow's deltas.
// ponytail: serial loop, fine for a demo-sized user list; fan out via a queue past ~20 users.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return json({ error: 'forbidden' }, 403)

  const drip = await dripYield().catch((e) => [{ error: (e as Error).message }])
  const users = await kv.smembers('users')
  const results: { user: string; executed: number; delivered: boolean; errors: string[] }[] = []

  for (const user of users) {
    const errors: string[] = []
    let executed = 0
    let delivered = false
    try {
      const sub = await getSub(user)
      const subscribed = !!(sub && (sub.email || sub.telegramChatId))
      // Nothing to do or report: skip without spending LLM calls.
      if (!subscribed && !policyActive(await readUserState(user))) continue
      const run = await runSwarm(user, { locale: sub?.locale })
      executed = run.executed.length
      const state = await readUserState(user)
      if (sub && (sub.email || sub.telegramChatId)) {
        const appUrl = process.env.APP_URL
        const market = await getMarket().catch(() => null)
        const email = renderReportEmail({ run, state, market, locale: sub.locale, appUrl })
        const pdf = sub.email ? await renderReportPdf({ run, state, market, locale: sub.locale }).catch(() => null) : null
        const text = appUrl ? `${run.report}\n\n${appUrl}/app/agent` : run.report
        errors.push(...(await deliver(sub, text, email, pdf)))
        delivered = errors.length === 0
      }
      await saveSnapshot(state)
    } catch (e) {
      errors.push((e as Error).message)
    }
    results.push({ user, executed, delivered, errors })
  }
  return json({ users: users.length, drip, results })
}
