import { advise, cleanHistory, MAX_HISTORY, type Turn } from './_lib/advisor.js'
import { env } from './_lib/chain.js'
import { json } from './_lib/http.js'
import { kv } from './_lib/kv.js'
import { getSub, sendTelegram, sendTyping, setSub } from './_lib/notify.js'
import { getMarket, getMarketAnalysis, runSwarm } from './_lib/swarm.js'

// Telegram bot webhook: chat with coinAI (same advisor as the web chat) + commands.
// Register once with web/scripts/setup-telegram.sh.
type Update = { update_id?: number; message?: { chat: { id: number }; text?: string } }

const HELP = `coinAI — your AI savings & investing team on BNB Chain.

Just type to chat, e.g. "how are my savings?" or "save more for a trip in December".

/market — live market read (BNB, BTC, ETH, CAKE)
/run — run the agent team now
/report — today's savings report
/reset — clear this chat's memory
/stop — stop daily reports and unlink

Connect your wallet in the coinAI app (AI Agent → Daily report & reminders → Connect Telegram).`

const NOT_LINKED = 'This chat is not linked to a wallet yet. Open the coinAI app → AI Agent → Daily report & reminders → Connect Telegram, then press Start.'

const histKey = (chatId: number) => `tghist:${chatId}`

async function marketText(): Promise<string> {
  const market = await getMarket()
  const analysis = await getMarketAnalysis(market).catch(() => null)
  const sign = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`
  const lines = market.coins.map(
    (c) => `${c.symbol}  $${c.price.toLocaleString('en-US')}  24h ${sign(c.change24h)} · 7d ${sign(c.change7d)} · vol ${c.volatility30d.toFixed(0)}%`,
  )
  const read = analysis ? `\n\nMarket Analyst: ${analysis.regime.replace('_', '-')} — ${analysis.summary}` : ''
  return `Market (Chainlink on BNB Chain)\n${lines.join('\n')}${read}`
}

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env('TELEGRAM_WEBHOOK_SECRET')) {
    return json({ error: 'forbidden' }, 403)
  }
  const update = (await req.json().catch(() => ({}))) as Update
  const chatId = update.message?.chat.id
  const text = update.message?.text?.trim() ?? ''
  if (!chatId || !text) return json({ ok: true })
  // Telegram retries slow webhooks; handle each update once.
  if (update.update_id && (await kv.hit(`tgupd:${update.update_id}`, 3600)) > 1) return json({ ok: true })

  try {
    const user = await kv.get<string>(`tgchat:${chatId}`)
    const sub = user ? await getSub(user) : null
    const locale = sub?.locale ?? 'en'
    const [command, ...rest] = text.split(/\s+/)

    if (command === '/start' && rest[0]) {
      const code = rest[0]
      const linkUser = await kv.get<string>(`tglink:${code}`)
      if (!linkUser) {
        await sendTelegram(chatId, 'This link has expired. Generate a new one from the coinAI app.')
      } else {
        await kv.del(`tglink:${code}`)
        await setSub(linkUser, { ...((await getSub(linkUser)) ?? { locale: 'en' }), telegramChatId: chatId })
        await kv.set(`tgchat:${chatId}`, linkUser)
        await kv.sadd('users', linkUser)
        await sendTelegram(chatId, `✅ Connected to ${linkUser.slice(0, 6)}…${linkUser.slice(-4)}. You'll get a daily report here, and you can chat with me any time.\n\n${HELP}`)
      }
    } else if (command === '/start' || command === '/help') {
      await sendTelegram(chatId, HELP)
    } else if (command === '/market') {
      await sendTyping(chatId)
      await sendTelegram(chatId, await marketText())
    } else if (!user) {
      await sendTelegram(chatId, NOT_LINKED)
    } else if (command === '/report' || command === '/run') {
      if ((await kv.hit(`rl:tg${command.slice(1)}:${chatId}`, command === '/run' ? 60 : 300)) > 1) {
        await sendTelegram(chatId, 'Please wait a moment before asking again.')
      } else {
        await sendTyping(chatId)
        const run = await runSwarm(user, { locale, reportOnly: command === '/report' })
        const txs = run.executed.map((e) => `• ${e.reason}\n  ${e.explorer}`).join('\n')
        await sendTelegram(chatId, txs ? `${run.report}\n\n${txs}` : run.report)
      }
    } else if (command === '/reset') {
      await kv.del(histKey(chatId))
      await sendTelegram(chatId, 'Chat memory cleared.')
    } else if (command === '/stop') {
      if (sub) {
        delete sub.telegramChatId
        await setSub(user, sub)
      }
      await kv.del(`tgchat:${chatId}`)
      await kv.del(histKey(chatId))
      await sendTelegram(chatId, 'Unlinked. Daily reports stopped. Reconnect any time from the coinAI app.')
    } else if (command.startsWith('/')) {
      await sendTelegram(chatId, HELP)
    } else if ((await kv.hit(`rl:chat:${user}`, 600)) > 30) {
      await sendTelegram(chatId, 'You are sending messages quickly — please wait a few minutes.')
    } else {
      // Free text → the same Chat Advisor as the web app, with per-chat memory.
      await sendTyping(chatId)
      const history = cleanHistory([...((await kv.get<Turn[]>(histKey(chatId))) ?? []), { role: 'user', content: text }])
      const { reply, run } = await advise(user, history, locale, 'telegram')
      const txs = run?.executed.map((e) => `• ${e.explorer}`).join('\n')
      await sendTelegram(chatId, txs ? `${reply}\n\n${txs}` : reply)
      await kv.set(histKey(chatId), [...history, { role: 'assistant', content: reply }].slice(-MAX_HISTORY), 7 * 86400)
    }
  } catch (e) {
    console.error('telegram webhook', e)
    await sendTelegram(chatId, 'Something went wrong on my side. Please try again in a moment.').catch(() => {})
  }
  // Always 200 so Telegram doesn't keep retrying the same update.
  return json({ ok: true })
}
