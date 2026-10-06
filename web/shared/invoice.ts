// Invoice math shared by the pay page (what to charge) and api/_lib/invoices.ts (what to accept),
// so the payer is asked for exactly what the server will check.

export type InvoiceAmount = { currency: 'IDR' | 'USDT'; amount: number } // whole rupiah, or tUSDT with up to 2 decimals

/** How far the payer's rate may sit below the server's: the browser and the server fetch rates moments apart. */
export const RATE_SLACK = 0.02

/** tUSDT units (6 decimals) the invoice asks for at `idrPerUsd`, rounded up to the cent. */
export function requiredUnits(inv: InvoiceAmount, idrPerUsd: number): bigint {
  const usd = inv.currency === 'USDT' ? inv.amount : inv.amount / idrPerUsd
  return BigInt(Math.ceil(Math.round(usd * 1e6) / 1e4)) * 10_000n
}

/** Whether a payment of `paidUnits` settles the invoice, allowing RATE_SLACK on rupiah invoices. */
export function covers(inv: InvoiceAmount, paidUnits: bigint, idrPerUsd: number): boolean {
  const need = requiredUnits(inv, idrPerUsd)
  if (inv.currency === 'USDT') return paidUnits >= need
  return paidUnits * 10_000n >= need * BigInt(Math.round((1 - RATE_SLACK) * 10_000))
}
