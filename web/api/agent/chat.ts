import { advise, cleanHistory } from '../_lib/advisor.js'
import { bearer, body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { asLocale } from '../_lib/swarm.js'

// POST { messages: [{role, content}], locale } with Authorization: Bearer <token> → { reply, run? }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if ((await kv.hit(`rl:chat:${user}`, 600)) > 30) return json({ error: 'rate_limited' }, 429)

  const { messages, locale } = await body<{ messages: unknown; locale: string }>(req)
  const history = cleanHistory(messages)
  if (!history.length) return json({ error: 'empty' }, 400)

  try {
    return json(await advise(user, history, asLocale(locale), 'web'))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}
