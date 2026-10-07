import { chatTurn, clearChat } from './_lib/advisor.js'
import { env, readUserState } from './_lib/chain.js'
import { loadPools, setActivePool } from './_lib/pools.js'
import { vaultMix } from '../shared/pool.js'
import { json } from './_lib/http.js'
import { kv } from './_lib/kv.js'
import { getSub, sendTelegram, sendTyping, setSub } from './_lib/notify.js'
import { getMarket, getMarketAnalysis, runSwarm } from './_lib/swarm.js'

// Telegram bot webhook: chat with coinAI (same advisor as the web chat) + commands.
// Register once with web/scripts/setup-telegram.sh.
type Update = { update_id?: number; message?: { chat: { id: number }; text?: string } }

const HELP_EN = `coinAI — your AI savings & investing team on BNB Chain.

Just type to chat, e.g. "how are my savings?", "how did NVIDIA do lately?" or "use Pool 1 Aggressive as the benchmark".

/portfolio — savings, vault positions and the AI's strategy
/pools — your saved pools (from the Market page)
/use <pool name> — make a pool the AI benchmark (/use off to stop)
/deposit — how to add tUSDT or tBNB
/market — live market read (BNB, BTC, ETH, CAKE)
/run — run the agent team now
/report — today's savings report
/reset — clear the conversation (web + Telegram)
/stop — stop daily reports and unlink

Connect your wallet in the coinAI app (AI Agent → Daily report & reminders → Connect Telegram).`

const HELP_ID = `coinAI — tim AI tabungan & investasimu di BNB Chain.

Langsung ketik untuk chat, misalnya "gimana tabunganku?", "gimana performa NVIDIA belakangan ini?" atau "pakai Pool 1 Agresif sebagai patokan".

/portfolio — tabungan, posisi vault, dan strategi AI
/pools — pool tersimpanmu (dari halaman Pasar)
/use <nama pool> — jadikan pool patokan AI (/use off untuk melepas)
/deposit — cara setor tUSDT atau tBNB
/market — kondisi market live (BNB, BTC, ETH, CAKE)
/run — jalankan tim agen sekarang
/report — laporan tabungan hari ini
/reset — hapus percakapan (web + Telegram)
/stop — hentikan laporan harian dan putuskan tautan

Hubungkan wallet di app coinAI (Agen AI → Laporan & pengingat harian → Hubungkan Telegram).`

const NOT_LINKED = 'This chat is not linked to a wallet yet. Open the coinAI app → AI Agent → Daily report & reminders → Connect Telegram, then press Start.'

const idOrEn = (locale: string, id: string, en: string) => (locale === 'id' ? id : en)
// Chat-friendly amounts: 47.826332 tUSDT → 47.83 tUSDT (47,83 in Indonesian)
const money = (x: bigint, locale: string) =>
  `${(Number(x) / 1e6).toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 })} tUSDT`
const helpFor = (locale: string) => idOrEn(locale, HELP_ID, HELP_EN)
const appLink = (path: string) => (process.env.APP_URL ? `${process.env.APP_URL}${path}` : `the coinAI app (${path})`)
const mixText = (m: { conservative: number; balanced: number; growth: number }, locale: string) =>
  idOrEn(locale, `Konservatif ${m.conservative}% · Seimbang ${m.balanced}% · Agresif ${m.growth}%`, `Conservative ${m.conservative}% · Balanced ${m.balanced}% · Growth ${m.growth}%`)

async function portfolioText(user: string, locale: string): Promise<string> {
  const [s, pools] = await Promise.all([readUserState(user), loadPools(user)])
  const invested = s.vaults.reduce((sum, v) => sum + v.userPosition, s.positions.basket) // vaults + the AI Smart Money basket
  const active = pools.pools.find((p) => p.id === pools.activeId)
  const vaultNames: Record<string, string> = { conservative: idOrEn(locale, 'Konservatif', 'Conservative'), balanced: idOrEn(locale, 'Seimbang', 'Balanced'), growth: idOrEn(locale, 'Agresif', 'Growth') }
  const lines = [
    ...s.vaults.map((v) => `• ${vaultNames[v.target]} (${v.apyBps / 100}% APY): ${money(v.userPosition, locale)}`),
    `• AI Smart Money: ${money(s.positions.basket, locale)}`,
  ]
  const strategy = active
    ? idOrEn(locale, `Patokan AI: ${active.name}
${mixText(vaultMix(active.weights), locale)}`, `AI benchmark: ${active.name}
${mixText(vaultMix(active.weights), locale)}`)
    : idOrEn(locale, 'Patokan AI: belum ada (AI mengikuti profilmu). /pools untuk memilih.', 'AI benchmark: none (the AI follows your profile). See /pools.')
  return [
    idOrEn(locale, 'Portofolio coinAI', 'coinAI portfolio'),
    `${idOrEn(locale, 'Total tabungan', 'Total savings')}: ${money(s.savings + invested, locale)}`,
    `${idOrEn(locale, 'Menganggur', 'Idle')}: ${money(s.savings, locale)} · ${idOrEn(locale, 'Siap pakai', 'Spendable')}: ${money(s.spend, locale)}`,
    '',
    ...lines,
    '',
    strategy,
    idOrEn(locale, '\nImbal hasil vault di testnet disimulasikan.', '\nVault yield on testnet is simulated.'),
    appLink('/app/portfolio'),
  ].join('\n')
}

async function poolsText(user: string, locale: string): Promise<string> {
  const { pools, activeId } = await loadPools(user)
  if (!pools.length)
    return idOrEn(locale, `Belum ada pool tersimpan. Susun dan simpan di halaman Pasar: ${appLink('/app/market')}`, `No saved pools yet. Build and save one on the Market page: ${appLink('/app/market')}`)
  const rows = pools.map((p) => {
    const top = Object.entries(p.weights).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4).map(([k, v]) => `${k} ${v}%`).join(', ')
    return `${p.id === activeId ? '✓' : '•'} ${p.name}\n  ${top}\n  → ${mixText(vaultMix(p.weights), locale)}`
  })
  return `${idOrEn(locale, 'Pool tersimpan', 'Saved pools')} (✓ = ${idOrEn(locale, 'patokan AI', 'AI benchmark')})\n\n${rows.join('\n\n')}\n\n${idOrEn(locale, 'Ganti dengan /use <nama pool> atau /use off.', 'Switch with /use <pool name> or /use off.')}`
}

async function applyPoolText(user: string, arg: string, locale: string): Promise<string> {
  const { pools } = await loadPools(user)
  if (!arg || ['off', 'none', 'stop'].includes(arg.toLowerCase())) {
    await setActivePool(user, null)
    return idOrEn(locale, 'Patokan dilepas. AI kembali mengikuti profil investormu.', 'Benchmark cleared. The AI follows your investor profile again.')
  }
  const q = arg.toLowerCase()
  const match = pools.find((p) => p.name.toLowerCase() === q) ?? pools.find((p) => p.name.toLowerCase().includes(q))
  if (!match) return idOrEn(locale, `Pool "${arg}" tidak ditemukan. Lihat /pools.`, `No pool named "${arg}". See /pools.`)
  await setActivePool(user, match.id)
  return idOrEn(
    locale,
    `✓ AI sekarang mengikuti "${match.name}"\n${mixText(vaultMix(match.weights), locale)}\nBerlaku di run berikutnya (setiap pembayaran, harian 08.00 WIB, atau /run).`,
    `✓ The AI now follows "${match.name}"\n${mixText(vaultMix(match.weights), locale)}\nApplies from the next run (every payment, daily 08:00 WIB, or /run).`,
  )
}

const depositText = (locale: string) =>
  idOrEn(
    locale,
    `Setor dana ke coinAI dari app (bot tidak bisa menandatangani transaksi untukmu):\n• tUSDT dari wallet-mu, atau\n• tBNB, dikonversi dengan harga Chainlink BNB/USD\nSplit-mu berlaku, lalu autopilot langsung menginvestasikan bagian tabungannya.\n${appLink('/app/faucet#deposit')}`,
    `Deposit from the app (the bot can't sign transactions for you):\n• tUSDT from your wallet, or\n• tBNB, converted at the Chainlink BNB/USD price\nYour split applies, then autopilot invests the savings part right away.\n${appLink('/app/faucet#deposit')}`,
  )

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
        // One wallet ↔ one chat. Unlink the wallet's previous chat (it must not keep control), and the
        // wallet this chat pointed to before (it must not keep sending its reports here).
        const linkSub = (await getSub(linkUser)) ?? { locale: 'en' as const }
        if (linkSub.telegramChatId && linkSub.telegramChatId !== chatId) {
          await kv.del(`tgchat:${linkSub.telegramChatId}`)
          await sendTelegram(linkSub.telegramChatId, 'This chat was unlinked: the wallet was connected to another Telegram chat.').catch(() => {})
        }
        const previousUser = await kv.get<string>(`tgchat:${chatId}`)
        if (previousUser && previousUser !== linkUser) {
          const prevSub = await getSub(previousUser)
          if (prevSub?.telegramChatId === chatId) {
            delete prevSub.telegramChatId
            await setSub(previousUser, prevSub)
          }
        }
        await setSub(linkUser, { ...linkSub, telegramChatId: chatId })
        await kv.set(`tgchat:${chatId}`, linkUser)
        await kv.sadd('users', linkUser)
        await sendTelegram(chatId, `✅ Connected to ${linkUser.slice(0, 6)}…${linkUser.slice(-4)}. You'll get a daily report here, and you can chat with me any time.\n\n${helpFor((await getSub(linkUser))?.locale ?? 'en')}`)
      }
    } else if (command === '/start' || command === '/help') {
      await sendTelegram(chatId, helpFor(locale))
    } else if (command === '/market') {
      await sendTyping(chatId)
      await sendTelegram(chatId, await marketText())
    } else if (!user) {
      await sendTelegram(chatId, NOT_LINKED)
    } else if (command === '/portfolio') {
      await sendTyping(chatId)
      await sendTelegram(chatId, await portfolioText(user, locale))
    } else if (command === '/pools') {
      await sendTelegram(chatId, await poolsText(user, locale))
    } else if (command === '/use') {
      await sendTelegram(chatId, await applyPoolText(user, rest.join(' ').trim(), locale))
    } else if (command === '/deposit') {
      await sendTelegram(chatId, depositText(locale))
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
      await clearChat(user)
      await sendTelegram(chatId, 'Chat memory cleared.')
    } else if (command === '/stop') {
      if (sub) {
        delete sub.telegramChatId
        await setSub(user, sub)
      }
      await kv.del(`tgchat:${chatId}`)
      await sendTelegram(chatId, 'Unlinked. Daily reports stopped. Reconnect any time from the coinAI app.')
    } else if (command.startsWith('/')) {
      await sendTelegram(chatId, helpFor(locale))
    } else if ((await kv.hit(`rl:chat:${user}`, 600)) > 30) {
      await sendTelegram(chatId, 'You are sending messages quickly — please wait a few minutes.')
    } else {
      // Free text → the same Chat Advisor and conversation as the web app.
      await sendTyping(chatId)
      const { reply, run } = await chatTurn(user, text, locale, 'telegram')
      const txs = run?.executed.map((e) => `• ${e.explorer}`).join('\n')
      await sendTelegram(chatId, txs ? `${reply}\n\n${txs}` : reply)
    }
  } catch (e) {
    console.error('telegram webhook', e)
    await sendTelegram(chatId, 'Something went wrong on my side. Please try again in a moment.').catch(() => {})
  }
  // Always 200 so Telegram doesn't keep retrying the same update.
  return json({ ok: true })
}
