import { chatPending, chatTurn, clearChat, loadChat } from '../_lib/advisor.js'
import { bearer, body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { asLocale } from '../_lib/swarm.js'

// GET → { messages, pending } — the stored conversation (shared with Telegram)
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const [messages, pending] = await Promise.all([loadChat(user), chatPending(user)])
  return json({ messages, pending })
}

// POST { message, locale } → { reply, run?, messages }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if ((await kv.hit(`rl:chat:${user}`, 600)) > 30) return json({ error: 'rate_limited' }, 429)
  const { message, locale } = await body<{ message: string; locale: string }>(req)
  if (typeof message !== 'string' || !message.trim()) return json({ error: 'empty' }, 400)
  try {
    return json(await chatTurn(user, message.trim(), asLocale(locale), 'web'))
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}

// DELETE → clears the conversation
export async function DELETE(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  await clearChat(user)
  return json({ messages: [] })
}
