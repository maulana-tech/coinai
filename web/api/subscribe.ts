import { randomBytes } from 'node:crypto'
import { env } from './_lib/chain.js'
import { bearer, body, json } from './_lib/http.js'
import { kv } from './_lib/kv.js'
import { getSub, setSub } from './_lib/notify.js'
import { asLocale } from './_lib/swarm.js'

type Req = { channel: 'email' | 'telegram'; email: string; locale: string }

// GET → current subscription
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json({ subscription: await getSub(user) })
}

// POST { channel: 'email', email, locale } → { subscription }
// POST { channel: 'telegram', locale }     → { link } (open it and press Start in Telegram)
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { channel, email, locale } = await body<Req>(req)
  const sub = { ...(await getSub(user)), locale: asLocale(locale) }

  if (channel === 'email') {
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: 'invalid_email' }, 400)
    }
    const next = { ...sub, email }
    await setSub(user, next)
    await kv.sadd('users', user)
    return json({ subscription: next })
  }

  if (channel === 'telegram') {
    await setSub(user, sub)
    const code = randomBytes(12).toString('base64url') // Telegram /start payload: [A-Za-z0-9_-], ≤64 chars
    await kv.set(`tglink:${code}`, user, 3600)
    return json({ link: `https://t.me/${env('TELEGRAM_BOT_USERNAME')}?start=${code}` })
  }
  return json({ error: 'invalid_channel' }, 400)
}

// DELETE { channel } → unsubscribe that channel
export async function DELETE(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { channel } = await body<Req>(req)
  const sub = await getSub(user)
  if (!sub) return json({ subscription: null })
  if (channel === 'email') delete sub.email
  if (channel === 'telegram' && sub.telegramChatId) {
    await kv.del(`tgchat:${sub.telegramChatId}`)
    delete sub.telegramChatId
  }
  await setSub(user, sub)
  return json({ subscription: sub })
}
