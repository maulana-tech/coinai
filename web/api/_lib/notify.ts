import nodemailer from 'nodemailer'
import { env } from './chain.js'
import { kv } from './kv.js'
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

/** Shows "typing…" in the chat for ~5s while the agents think. */
export function sendTyping(chatId: number) {
  return telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
}

// Gmail SMTP with an App Password (Google Account → Security → App passwords).
export async function sendEmail(to: string, subject: string, text: string) {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD') },
  })
  await transport.sendMail({ from: `coinAI <${env('GMAIL_USER')}>`, to, subject, text })
}

const SUBJECT: Record<Locale, string> = {
  en: 'Your coinAI daily report',
  id: 'Laporan harian coinAI kamu',
  zh: '您的 coinAI 每日报告',
}

/** Delivers to every channel the user subscribed to; returns per-channel errors. */
export async function deliver(sub: Subscription, text: string, appUrl?: string): Promise<string[]> {
  const full = appUrl ? `${text}\n\n${appUrl}` : text
  const jobs: Promise<unknown>[] = []
  if (sub.telegramChatId) jobs.push(sendTelegram(sub.telegramChatId, full))
  if (sub.email) jobs.push(sendEmail(sub.email, SUBJECT[sub.locale], full))
  const results = await Promise.allSettled(jobs)
  return results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []))
}
