import { useCallback, useEffect, useMemo, useState } from 'react'
import { CopyIcon, ExternalLinkIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'
import { renderSVG } from 'uqr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { agentApi, hasAgentSession, type Invoice } from '@/lib/agent-api'
import { explorerTxUrl } from '@/lib/config'
import { formatDateTime, useT, type MessageKey } from '@/lib/i18n'
import { formatInvoiceAmount, invoiceLink } from '@/lib/invoice'
import { useSettings } from '@/lib/settings'

const STATUS: Record<Invoice['status'], { label: MessageKey; variant: 'default' | 'secondary' | 'outline' }> = {
  open: { label: 'invoice.statusOpen', variant: 'outline' },
  paid: { label: 'invoice.statusPaid', variant: 'default' },
  cancelled: { label: 'invoice.statusCancelled', variant: 'secondary' },
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
// Server error codes from parseInvoiceInput that have their own message (invoice.err_<code>).
const INVOICE_ERRORS = new Set(['invalid_amount', 'amount_too_small', 'amount_too_large', 'memo_required'])

/** Invoices: a fixed amount (rupiah or tUSDT) with a memo and reference; marked paid only after the server reads the payment on-chain. */
export function InvoicesCard({ address, name }: { address: string; name: string }) {
  const t = useT()
  const { locale } = useSettings()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [currency, setCurrency] = useState<Invoice['currency']>('IDR')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [shown, setShown] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    setPending('load')
    try {
      setInvoices((await agentApi.invoices(address)).invoices)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setPending(null)
    }
  }, [address])
  // Never pop a signature just to render the page: load silently only with a session.
  useEffect(() => {
    if (hasAgentSession(address)) void load()
  }, [address, load])

  const qr = useMemo(() => (shown ? renderSVG(invoiceLink(shown)) : ''), [shown])
  // Rupiah is typed with thousands dots ("25.000"); tUSDT with a decimal point or comma ("7.5", "7,5").
  const amountNumber = currency === 'IDR' ? Number(amount.replace(/\D/g, '')) : Number(amount.replace(',', '.'))

  const create = async () => {
    setPending('create')
    try {
      const { invoice } = await agentApi.createInvoice(address, { name, memo, reference, currency, amount: amountNumber })
      setInvoices((list) => [invoice, ...(list ?? [])])
      setShown(invoice)
      setAmount('')
      setMemo('')
      setReference('')
      toast.success(t('invoice.created'))
    } catch (e) {
      const code = errorText(e)
      toast.error(t(INVOICE_ERRORS.has(code) ? (`invoice.err_${code}` as MessageKey) : 'invoice.createFailed'))
    } finally {
      setPending(null)
    }
  }

  const cancel = async (inv: Invoice) => {
    setPending(inv.id)
    try {
      const { invoice } = await agentApi.cancelInvoice(address, inv.id)
      setInvoices((list) => list?.map((x) => (x.id === invoice.id ? invoice : x)) ?? null)
      if (shown?.id === invoice.id) setShown(null)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setPending(null)
    }
  }

  const copy = async (inv: Invoice) => {
    await navigator.clipboard.writeText(invoiceLink(inv))
    toast.success(t('settings.copied'))
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t('invoice.title')}</CardTitle>
          {invoices !== null && (
            <Button variant="outline" size="icon-sm" aria-label={t('invoice.refresh')} disabled={pending !== null} onClick={() => void load()}>
              <RefreshCwIcon className={pending === 'load' ? 'animate-spin' : ''} />
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('invoice.caption')}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-amount">{t('invoice.amountLabel')}</Label>
            <div className="flex gap-2">
              <Tabs value={currency} onValueChange={(v) => setCurrency(v as Invoice['currency'])}>
                <TabsList className="rounded-full">
                  <TabsTrigger value="IDR" className="rounded-full px-3 text-xs">
                    Rp
                  </TabsTrigger>
                  <TabsTrigger value="USDT" className="rounded-full px-3 text-xs">
                    tUSDT
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                id="invoice-amount"
                value={amount}
                inputMode="decimal"
                placeholder={currency === 'IDR' ? '25000' : '10'}
                className="tabular-nums"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-reference">{t('invoice.referenceLabel')}</Label>
            <Input id="invoice-reference" value={reference} maxLength={32} placeholder="INV-001" onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="invoice-memo">{t('invoice.memoLabel')}</Label>
            <Input id="invoice-memo" value={memo} maxLength={80} placeholder={t('invoice.memoPlaceholder')} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <Button
          className="w-full rounded-full"
          disabled={pending !== null || memo.trim() === '' || !(amountNumber > 0)}
          onClick={() => void create()}
        >
          {pending === 'create' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {t('invoice.create')}
        </Button>
        {currency === 'IDR' && <p className="-mt-2 text-xs text-muted-foreground">{t('invoice.idrHint')}</p>}

        {shown && (
          <div className="flex flex-col items-center gap-3 rounded-xl border p-4 sm:flex-row">
            {/* white in both themes so scanners always see dark modules on white */}
            <div className="size-36 shrink-0 rounded-xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
              <p className="font-medium">{shown.memo}</p>
              <p className="text-2xl font-semibold tabular-nums">{formatInvoiceAmount(shown, locale)}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{invoiceLink(shown)}</p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => void copy(shown)}>
                <CopyIcon /> {t('paylink.copy')}
              </Button>
            </div>
          </div>
        )}

        {invoices === null ? (
          <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void load()}>
            {t('invoice.show')}
          </Button>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('invoice.empty')}</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {inv.memo}
                    {inv.reference && <span className="ml-1.5 text-xs font-normal text-muted-foreground">#{inv.reference}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.status === 'paid' && inv.paid
                      ? t('invoice.paidMeta', { time: formatDateTime(new Date(inv.paid.at * 1000), locale), amount: inv.paid.amountUsdt })
                      : formatDateTime(new Date(inv.createdAt * 1000), locale)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums">{formatInvoiceAmount(inv, locale)}</span>
                <Badge variant={STATUS[inv.status].variant} className="text-[10px]">
                  {t(STATUS[inv.status].label)}
                </Badge>
                <span className="flex gap-1">
                  {inv.status === 'open' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setShown(inv)}>
                        {t('invoice.qr')}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('paylink.copy')} onClick={() => void copy(inv)}>
                        <CopyIcon />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void cancel(inv)}>
                        {pending === inv.id ? <Loader2Icon className="size-4 animate-spin" /> : t('invoice.cancel')}
                      </Button>
                    </>
                  )}
                  {inv.paid && (
                    <Button asChild size="sm" variant="ghost" aria-label={t('common.viewTx')}>
                      <a href={explorerTxUrl(inv.paid.txHash)} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon />
                      </a>
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
