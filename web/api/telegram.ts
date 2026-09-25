import { env } from './_lib/chain.js'
import { json } from './_lib/http.js'
import { kv } from './_lib/kv.js'
import { getSub, sendTelegram, setSub } from './_lib/notify.js'
import { runSwarm } from './_lib/swarm.js'

// Telegram bot webhook. Register once:
//   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=$APP_URL/api/telegram&secret_token=$TELEGRAM_WEBHOOK_SECRET"
type Update = { message?: { chat: { id: number }; text?: string } }

const HELP = 'coinAI bot\n/report — savings report now\n/stop — stop daily reports\n\nConnect your wallet from the coinAI app (Agent → Notifications).'

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env('TELEGRAM_WEBHOOK_SECRET')) {
    return json({ error: 'forbidden' }, 403)
  }
  const update = (await req.json().catch(() => ({}))) as Update
  const chatId = update.message?.chat.id
  const text = update.message?.text?.trim() ?? ''
  if (!chatId) return json({ ok: true })

  try {
    if (text.startsWith('/start ')) {
      const code = text.slice(7).trim()
      const user = await kv.get<string>(`tglink:${code}`)
      if (!user) {
        await sendTelegram(chatId, 'This link has expired. Generate a new one from the coinAI app.')
      } else {
        await kv.del(`tglink:${code}`)
        await setSub(user, { ...((await getSub(user)) ?? { locale: 'en' }), telegramChatId: chatId })
        await kv.set(`tgchat:${chatId}`, user)
        await kv.sadd('users', user)
        await sendTelegram(chatId, `✅ Connected to ${user.slice(0, 6)}…${user.slice(-4)}. You'll get a daily savings report here.\n\n${HELP}`)
      }
    } else if (text === '/report') {
      const user = await kv.get<string>(`tgchat:${chatId}`)
      if (!user) await sendTelegram(chatId, HELP)
      else if ((await kv.hit(`rl:tgreport:${chatId}`, 300)) > 1) await sendTelegram(chatId, 'Please wait a few minutes between reports.')
      else {
        const sub = await getSub(user)
        const run = await runSwarm(user, { locale: sub?.locale, reportOnly: true })
        await sendTelegram(chatId, run.report)
      }
    } else if (text === '/stop') {
      const user = await kv.get<string>(`tgchat:${chatId}`)
      if (user) {
        const sub = await getSub(user)
        if (sub) {
          delete sub.telegramChatId
          await setSub(user, sub)
        }
        await kv.del(`tgchat:${chatId}`)
      }
      await sendTelegram(chatId, 'Daily reports stopped. Reconnect any time from the coinAI app.')
    } else {
      await sendTelegram(chatId, HELP)
    }
  } catch (e) {
    console.error('telegram webhook', e)
  }
  // Always 200 so Telegram doesn't retry the same update forever.
  return json({ ok: true })
}
