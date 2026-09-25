import { env, readUserState } from '../_lib/chain.js'
import { json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { deliver, getSub } from '../_lib/notify.js'
import { runSwarm, saveSnapshot } from '../_lib/swarm.js'

// Vercel Cron (see vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET.
// For each known user: run the agent team (report-only if the agent isn't enabled),
// deliver the report + reminders to their channels, then snapshot for tomorrow's deltas.
// ponytail: serial loop, fine for a demo-sized user list; fan out via a queue past ~20 users.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return json({ error: 'forbidden' }, 403)

  const users = await kv.smembers('users')
  const results: { user: string; executed: number; delivered: boolean; errors: string[] }[] = []

  for (const user of users) {
    const errors: string[] = []
    let executed = 0
    let delivered = false
    try {
      const sub = await getSub(user)
      const run = await runSwarm(user, { locale: sub?.locale })
      executed = run.executed.length
      if (sub && (sub.email || sub.telegramChatId)) {
        errors.push(...(await deliver(sub, run.report, process.env.APP_URL && `${process.env.APP_URL}/app/agent`)))
        delivered = errors.length === 0
      }
      await saveSnapshot(await readUserState(user))
    } catch (e) {
      errors.push((e as Error).message)
    }
    results.push({ user, executed, delivered, errors })
  }
  return json({ users: users.length, results })
}
