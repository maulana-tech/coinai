// Payment receipts on Telegram (roadmap F4): the recipient hears about every payment the app sees,
// with what was saved automatically. Text is written in code, so it arrives even when the LLMs are down.

import { formatUnits } from 'ethers'
import { explorerTx, type Payment } from './chain.js'
import type { Invoice } from './invoices.js'
import { kv } from './kv.js'
import { getSub, sendTelegram } from './notify.js'
import type { Locale } from './swarm.js'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const usdt = (x: bigint) => `${Number(formatUnits(x, 6)).toFixed(2)} tUSDT`
const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`

const TEXT: Record<Locale, { received: string; invoice: string; saved: string }> = {
  en: { received: 'Payment received: {amount} from {from}.', invoice: 'Invoice paid: “{memo}”{ref}, {due}.', saved: '{saved} went to savings automatically.' },
  id: { received: 'Pembayaran masuk: {amount} dari {from}.', invoice: 'Invoice lunas: “{memo}”{ref}, {due}.', saved: '{saved} otomatis masuk tabungan.' },
  zh: { received: '收到付款：{amount}，来自 {from}。', invoice: '发票已付清：“{memo}”{ref}，{due}。', saved: '{saved} 已自动存入储蓄。' },
}
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')

export function receiptText(p: Payment, locale: Locale, invoice?: Invoice | null): string {
  const t = TEXT[locale] ?? TEXT.en
  const lines = [fill(t.received, { amount: usdt(p.amount), from: short(p.from) })]
  if (invoice)
    lines.push(
      fill(t.invoice, {
        memo: invoice.memo,
        ref: invoice.reference ? ` (#${invoice.reference})` : '',
        due: invoice.currency === 'IDR' ? rupiah(invoice.amount) : `${invoice.amount.toFixed(2)} tUSDT`,
      }),
    )
  if (p.saved > 0n) lines.push(fill(t.saved, { saved: usdt(p.saved) }))
  lines.push(explorerTx(p.txHash))
  return lines.join('\n')
}

/** Sends the recipient's receipt once per tx (the pay page and the invoice both report the same payment). */
export async function notifyPayment(p: Payment, invoice?: Invoice | null): Promise<boolean> {
  const sub = await getSub(p.to).catch(() => null)
  if (!sub?.telegramChatId) return false
  if (!(await kv.setnx(`receipt:${p.txHash.toLowerCase()}`, 1, 30 * 86400))) return false
  await sendTelegram(sub.telegramChatId, receiptText(p, sub.locale, invoice))
  return true
}
