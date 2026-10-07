import nodemailer from 'nodemailer'
import { env } from './chain.js'
import { kv } from './kv.js'
import type { ReportEmail } from './email.js'
import type { Locale } from './swarm.js'

export type Subscription = { email?: string; telegramChatId?: number; locale: Locale }

export const getSub = (user: string) => kv.get<Subscription>(`sub:${user}`)
export const setSub = (user: string, sub: Subscription) => kv.set(`sub:${user}`, sub)

async function telegram(method: string, payload: object) {
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`telegram ${method} ${res.status}: ${await res.text()}`)
}

const TELEGRAM_MAX = 4096

export function sendTelegram(chatId: number, text: string) {
  return telegram('sendMessage', { chat_id: chatId, text: text.slice(0, TELEGRAM_MAX), disable_web_page_preview: true })
}

/** A Telegram message to a wallet, if it linked a chat; resolves to whether it was sent. Never throws. */
export async function notifyUser(user: string, text: (locale: Locale) => string): Promise<boolean> {
  const sub = await getSub(user).catch(() => null)
  if (!sub?.telegramChatId) return false
  return sendTelegram(sub.telegramChatId, text(sub.locale)).then(
    () => true,
    () => false,
  )
}

/** Shows "typing…" in the chat for ~5s while the agents think. */
export function sendTyping(chatId: number) {
  return telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
}

// Gmail SMTP with an App Password (Google Account → Security → App passwords).
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  attachments?: { filename: string; content: Buffer; contentType: string }[],
) {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD') },
  })
  await transport.sendMail({ from: `coinAI <${env('GMAIL_USER')}>`, to, subject, text, html, attachments })
}

/** Delivers to every channel the user subscribed to; returns per-channel errors. */
export async function deliver(sub: Subscription, text: string, email: ReportEmail, pdf?: Uint8Array | null): Promise<string[]> {
  const jobs: Promise<unknown>[] = []
  if (sub.telegramChatId) jobs.push(sendTelegram(sub.telegramChatId, text))
  const attachments = pdf
    ? [{ filename: `coinAI-report-${new Date().toISOString().slice(0, 10)}.pdf`, content: Buffer.from(pdf), contentType: 'application/pdf' }]
    : undefined
  if (sub.email) jobs.push(sendEmail(sub.email, email.subject, email.text, email.html, attachments))
  const results = await Promise.allSettled(jobs)
  return results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []))
}
