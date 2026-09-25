import { bearer, body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { asLocale, runSwarm } from '../_lib/swarm.js'

// POST { locale?, instruction? } with Authorization: Bearer <token> → RunResult
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if ((await kv.hit(`rl:run:${user}`, 60)) > 1) return json({ error: 'rate_limited' }, 429)

  const { locale, instruction } = await body<{ locale: string; instruction: string }>(req)
  await kv.sadd('users', user)
  try {
    return json(await runSwarm(user, { locale: asLocale(locale), instruction: instruction?.slice(0, 500) }))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}
