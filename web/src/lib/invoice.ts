import type { Invoice } from '@/lib/agent-api'
import { intlLocale } from '@/lib/i18n'

/** What the invoice asks for, in its own currency: "Rp25.000" or "7.50 tUSDT". */
export function formatInvoiceAmount(inv: Pick<Invoice, 'currency' | 'amount'>, locale: string): string {
  if (inv.currency === 'IDR')
    return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(inv.amount)
  return `${new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(inv.amount)} tUSDT`
}

export const invoiceLink = (inv: Pick<Invoice, 'id' | 'to'>) => `${window.location.origin}/pay/${inv.to}?invoice=${inv.id}`
