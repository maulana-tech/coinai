// Invoices: a payment link with a fixed amount (rupiah or tUSDT), a memo and a reference, whose
// paid/unpaid status the server sets only after reading the payment from the chain. Rupiah
// invoices are converted at the rate when the payer pays.

import { randomBytes } from 'node:crypto'
import { formatUnits, getAddress } from 'ethers'
import { paymentFromTx, type Payment } from './chain.js'
import { covers } from '../../shared/invoice.js'
import { kv } from './kv.js'

export { covers, RATE_SLACK, requiredUnits } from '../../shared/invoice.js'

export type InvoiceCurrency = 'IDR' | 'USDT'

export type Invoice = {
  id: string
  to: string // recipient wallet (the merchant)
  name: string // shown to the payer, e.g. the shop's name
  memo: string // what it's for
  reference: string // the merchant's own number, optional
  currency: InvoiceCurrency
  amount: number // whole rupiah, or tUSDT with up to 2 decimals
  createdAt: number // unix seconds
  status: 'open' | 'paid' | 'cancelled'
  paid?: { txHash: string; payer: string; amountUsdt: string; saved: string; idrPerUsd: number | null; at: number }
}

const KEEP = 50 // invoices listed per merchant
const RATES_URL = 'https://open.er-api.com/v6/latest/USD' // same source as src/lib/rates.ts

const key = (id: string) => `inv:${id}`
const listKey = (user: string) => `invs:${user.toLowerCase()}`
const clean = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Validates merchant input; throws a short error code the app maps to a message. */
export function parseInvoiceInput(input: { name?: unknown; memo?: unknown; reference?: unknown; currency?: unknown; amount?: unknown }) {
  const currency: InvoiceCurrency = input.currency === 'USDT' ? 'USDT' : 'IDR'
  const raw = Number(input.amount)
  const amount = currency === 'IDR' ? Math.round(raw) : Math.round(raw * 100) / 100
  if (!Number.isFinite(raw) || amount <= 0) throw new Error('invalid_amount')
  if (currency === 'IDR' && amount < 1000) throw new Error('amount_too_small') // under Rp1,000 isn't worth an invoice
  if (amount > (currency === 'IDR' ? 1_000_000_000 : 100_000)) throw new Error('amount_too_large')
  const memo = clean(input.memo, 80)
  if (!memo) throw new Error('memo_required')
  return { currency, amount, memo, name: clean(input.name, 40), reference: clean(input.reference, 32) }
}

export async function idrPerUsd(): Promise<number> {
  const cached = await kv.get<number>('fx:idr').catch(() => null)
  if (cached) return cached
  const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(8000) })
  const rate = Number(((await res.json()) as { rates?: Record<string, number> }).rates?.IDR)
  if (!res.ok || !(rate > 0)) throw new Error('rate_unavailable')
  await kv.set('fx:idr', rate, 600).catch(() => {})
  return rate
}

export async function createInvoice(user: string, input: Parameters<typeof parseInvoiceInput>[0]): Promise<Invoice> {
  const inv: Invoice = {
    id: randomBytes(6).toString('base64url'),
    to: getAddress(user),
    ...parseInvoiceInput(input),
    createdAt: Math.floor(Date.now() / 1000),
    status: 'open',
  }
  await kv.set(key(inv.id), inv)
  await kv.push(listKey(user), inv.id, KEEP)
  return inv
}

export const getInvoice = (id: string) => (/^[\w-]{6,16}$/.test(id) ? kv.get<Invoice>(key(id)) : Promise.resolve(null))

export async function listInvoices(user: string): Promise<Invoice[]> {
  const ids = await kv.list<string>(listKey(user), KEEP)
  return (await kv.mget<Invoice>(ids.map(key))).filter((x): x is Invoice => x !== null)
}

export async function cancelInvoice(user: string, id: string): Promise<Invoice> {
  const inv = await getInvoice(id)
  if (!inv || inv.to !== getAddress(user)) throw new Error('not_found')
  if (inv.status !== 'open') throw new Error(`already_${inv.status}`)
  inv.status = 'cancelled'
  await kv.set(key(id), inv)
  return inv
}

/**
 * Marks an invoice paid from a tx hash the payer's browser sends. Trusts nothing but the chain: the tx must hold a
 * CoinAI payment to the invoice's recipient that covers the amount, and each tx can settle one invoice only.
 */
export async function settleInvoice(id: string, txHash: string): Promise<{ invoice: Invoice; payment: Payment }> {
  const inv = await getInvoice(id)
  if (!inv) throw new Error('not_found')
  if (inv.status === 'cancelled') throw new Error('already_cancelled')
  const payment = await paymentFromTx(txHash)
  if (!payment) throw new Error('payment_not_found')
  if (inv.status === 'paid') {
    if (inv.paid?.txHash.toLowerCase() === txHash.toLowerCase()) return { invoice: inv, payment }
    throw new Error('already_paid')
  }
  if (payment.to !== inv.to) throw new Error('wrong_recipient')
  if (payment.at < inv.createdAt) throw new Error('payment_before_invoice')
  const rate = inv.currency === 'IDR' ? await idrPerUsd() : 0
  if (!covers(inv, payment.amount, rate)) throw new Error('amount_too_low')
  if (!(await kv.setnx(`invtx:${txHash.toLowerCase()}`, id))) throw new Error('tx_already_used')

  const usdt = Number(formatUnits(payment.amount, 6))
  inv.status = 'paid'
  inv.paid = {
    txHash,
    payer: payment.from,
    amountUsdt: formatUnits(payment.amount, 6),
    saved: formatUnits(payment.saved, 6),
    idrPerUsd: inv.currency === 'IDR' ? Math.round((inv.amount / usdt) * 100) / 100 : null,
    at: payment.at,
  }
  await kv.set(key(id), inv)
  return { invoice: inv, payment }
}
