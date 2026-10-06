import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BanIcon, CheckIcon, CopyIcon, ExternalLinkIcon, LogOutIcon, ReceiptTextIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { LogoWordmark } from '@/components/brand/logo'
import { TokenIcon } from '@/components/brand/token-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/lib/app-state'
import { isValidRecipientAddress } from '@/lib/address'
import { autopilot, invoiceApi, type Invoice } from '@/lib/agent-api'
import { coinai } from '@/lib/coinai'
import { explorerTxUrl } from '@/lib/config'
import { errorKey } from '@/lib/errors'
import { parseToken, shortHex } from '@/lib/format'
import { formatDateTime, formatMoney, useT } from '@/lib/i18n'
import { formatInvoiceAmount } from '@/lib/invoice'
import { useSettings } from '@/lib/settings'
import { useScrollLock } from '@/lib/use-scroll-lock'
import { useWallet } from '@/lib/wallet'
import { requiredUnits } from '../../shared/invoice.js'

const QUICK_AMOUNTS = ['25', '50', '100']
const MAX_NAME_LENGTH = 40

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

function AddressChip({ address }: { address: string }) {
  const t = useT()

  const copy = async () => {
    await navigator.clipboard.writeText(address)
    toast.success(t('settings.copied'))
  }

  return (
    <button
      type="button"
      aria-label={t('shell.copyAddress')}
      className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => void copy()}
    >
      {shortAddress(address)}
      <CopyIcon className="size-4" />
    </button>
  )
}

function PayCard({ recipient }: { recipient: string }) {
  const t = useT()
  const { address, connecting, connect, disconnect } = useWallet()
  const { rates, busy, runAction } = useAppState()
  const { locale } = useSettings()
  const [searchParams] = useSearchParams()
  const name = (searchParams.get('name') ?? '').trim().slice(0, MAX_NAME_LENGTH)
  const [value, setValue] = useState(() => {
    const preset = (searchParams.get('amount') ?? '').trim()
    try {
      return parseToken(preset) > 0n ? preset : ''
    } catch {
      return ''
    }
  })
  const [splitPct, setSplitPct] = useState<number | null>(null)
  const [paid, setPaid] = useState<{ amount: bigint; hash: string } | null>(null)
  // ?invoice=<id>: a fixed amount, memo and reference set by the recipient; rupiah converts at the server's rate,
  // the same one it checks the payment against.
  const invoiceId = searchParams.get('invoice')
  const [invoice, setInvoice] = useState<{ data: Invoice; idrPerUsd: number | null } | 'loading' | 'missing' | null>(
    invoiceId ? 'loading' : null,
  )
  const anyBusy = busy !== null
  const inv = invoice !== null && typeof invoice === 'object' ? invoice.data : null
  const invoiceRate = inv?.currency === 'IDR' && typeof invoice === 'object' ? (invoice?.idrPerUsd ?? rates.idr) : 0
  const invoiceUnits = inv ? requiredUnits(inv, invoiceRate) : null
  const displayName = inv?.name || (name !== '' ? name : shortAddress(recipient))

  useEffect(() => {
    if (!invoiceId) return
    invoiceApi.get(invoiceId).then(
      (r) => setInvoice(r.invoice.to.toLowerCase() === recipient.toLowerCase() ? { data: r.invoice, idrPerUsd: r.idrPerUsd } : 'missing'),
      () => setInvoice('missing'),
    )
  }, [invoiceId, recipient])

  useEffect(() => {
    let cancelled = false
    coinai.getAccount(recipient).then(
      (acc) => {
        if (!cancelled) setSplitPct(Math.round(acc.splitBps / 100))
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [recipient])

  const handleConnect = async () => {
    try {
      await connect()
    } catch (e) {
      const key = errorKey(e)
      if (key === 'errors.walletCancelled') return
      toast.error(t(key))
    }
  }

  const handlePay = async () => {
    let parsed: bigint
    try {
      parsed = invoiceUnits ?? parseToken(value)
      if (parsed <= 0n) throw new Error('invalid amount')
    } catch {
      toast.error(t('errors.invalidAmount'))
      return
    }
    if (!address) return
    const result = await runAction('paylink', 'success.linkPaid', () =>
      coinai.pay(address, recipient, parsed),
    )
    if (result) {
      setPaid({ amount: parsed, hash: result.hash })
      if (inv) {
        // The server reads the payment from the chain before marking the invoice paid (and sends the receipt).
        const settled = await invoiceApi.markPaid(inv.id, result.hash).catch(() => null)
        if (settled) setInvoice((cur) => (cur !== null && typeof cur === 'object' ? { ...cur, data: settled.invoice } : cur))
        else toast.warning(t('invoice.markLater'))
      }
      autopilot.nudge(recipient, result.hash) // agents invest the new savings + Telegram receipt (server re-checks on-chain)
    }
  }

  if (invoice === 'loading') {
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('invoice.loading')}</CardContent>
      </Card>
    )
  }
  if (invoice === 'missing') return <InvalidLink body={t('invoice.notFound')} />
  if (inv && paid === null && inv.status !== 'open') {
    const wasPaid = inv.status === 'paid'
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {wasPaid ? <CheckIcon className="size-7" /> : <BanIcon className="size-7" />}
          </span>
          <p className="text-xl font-semibold tracking-tight">{t(wasPaid ? 'invoice.alreadyPaid' : 'invoice.cancelled')}</p>
          <p className="text-sm text-muted-foreground">
            {inv.memo} · {formatInvoiceAmount(inv, locale)}
          </p>
          {wasPaid && inv.paid && (
            <a
              href={explorerTxUrl(inv.paid.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {formatDateTime(new Date(inv.paid.at * 1000), locale)} · {shortHex(inv.paid.txHash)}
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </CardContent>
      </Card>
    )
  }

  if (paid !== null) {
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <CheckIcon className="size-7" />
          </span>
          <p className="text-xl font-semibold tracking-tight">{t(inv ? 'invoice.paidTitle' : 'pay.successTitle')}</p>
          {inv && <p className="text-sm text-muted-foreground">{inv.memo}{inv.reference && ` · #${inv.reference}`}</p>}
          <p className="flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums">
            <TokenIcon token="usdt" size={36} />
            {formatMoney(paid.amount, 'usdt', rates, locale)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('pay.successBody', { name: displayName })}
          </p>
          <a
            href={explorerTxUrl(paid.hash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {shortHex(paid.hash)}
            <ExternalLinkIcon className="size-3" />
          </a>
          <div className="mt-4 flex flex-col items-center gap-2">
            {!inv && (
              <Button variant="outline" onClick={() => setPaid(null)}>
                {t('pay.payAgain')}
              </Button>
            )}
            <Button asChild variant="link">
              <Link to="/">{t('pay.createOwn')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
      <CardHeader className="items-center text-center">
        <div className="flex items-center justify-center gap-3">
          <AddressAvatar address={recipient} size={40} />
          <CardTitle className="text-2xl tracking-tight">
            {t('pay.title', { name: displayName })}
          </CardTitle>
        </div>
        <div className="mx-auto mt-1">
          <AddressChip address={recipient} />
        </div>
        <p className="mx-auto max-w-xs text-xs text-muted-foreground">{t('pay.signHint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {inv && invoiceUnits !== null ? (
          <div className="space-y-1 rounded-xl border p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              <ReceiptTextIcon className="size-3.5" />
              {t('invoice.label')}
              {inv.reference && <span className="normal-case">· #{inv.reference}</span>}
            </p>
            <p className="font-medium">{inv.memo}</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatInvoiceAmount(inv, locale)}</p>
            {inv.currency === 'IDR' && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('invoice.converted', {
                  amount: formatMoney(invoiceUnits, 'usdt', rates, locale),
                  rate: new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(invoiceRate),
                })}
              </p>
            )}
          </div>
        ) : (
          <>
        <div className="relative">
          <TokenIcon
            token="usdt"
            size={36}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <Input
            value={value}
            placeholder={t('common.amountPlaceholder')}
            inputMode="decimal"
            className="h-14 pl-16 text-lg tabular-nums"
            disabled={anyBusy}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('common.quickAmounts')}</span>
          {QUICK_AMOUNTS.map((quick) => (
            <Button
              key={quick}
              variant="outline"
              size="sm"
              className="rounded-full tabular-nums"
              disabled={anyBusy}
              onClick={() => setValue(quick)}
            >
              {quick}
            </Button>
          ))}
        </div>
          </>
        )}
        {splitPct !== null && (
          <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-primary-ink">
            {t('pay.splitInfo', { pct: splitPct })}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {address ? (
          <>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <AddressAvatar address={address} size={24} className="rounded-md" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t('pay.payingFrom')}
                </span>
                <span className="min-w-0 truncate font-mono text-xs">
                  {shortAddress(address)}
                </span>
              </div>
              <button
                type="button"
                aria-label={t('pay.switchWallet')}
                title={t('pay.switchWallet')}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => void disconnect()}
              >
                <LogOutIcon className="size-3.5" />
              </button>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => void handlePay()}
              disabled={anyBusy || (invoiceUnits === null && value.trim() === '')}
            >
              {busy === 'paylink' ? `${t('common.loading')}...` : t('pay.button')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={connecting}
              onClick={() => void handleConnect()}
            >
              {connecting ? `${t('topbar.connecting')}...` : t('pay.connectCta')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('pay.connectCaption')}</p>
          </>
        )}
      </CardFooter>
    </Card>
  )
}

function InvalidLink({ body }: { body?: string }) {
  const t = useT()

  return (
    <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-xl font-semibold tracking-tight">{t('pay.invalidTitle')}</p>
        <p className="text-sm text-muted-foreground">{body ?? t('errors.invalidPayAddress')}</p>
        <Button asChild className="mt-3">
          <Link to="/">{t('pay.goHome')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export function PayPage() {
  const t = useT()
  const { address: recipient = '' } = useParams()
  const valid = isValidRecipientAddress(recipient)

  useScrollLock()

  return (
    <div className="relative h-svh">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/assets/section1-bg.png)' }}
      />
      <div className="pointer-events-none fixed inset-0 z-0 bg-black/30" />
      {/* data-lenis-prevent: the app's Lenis smooth scroll drives the (locked) window and would swallow the wheel here */}
      <div data-lenis-prevent className="no-scrollbar relative z-10 flex h-full flex-col overflow-y-auto">
        <header className="flex items-center justify-between px-6 py-4">
          <Link to="/">
            <LogoWordmark />
          </Link>
          <Badge variant="outline" className="text-muted-foreground">
            {t('topbar.testnet')}
          </Badge>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-4">
          {valid ? <PayCard recipient={recipient} /> : <InvalidLink />}
        </main>
        <footer className="px-6 py-5 text-center text-sm text-muted-foreground">
          {t('landing.footer')}
        </footer>
      </div>
    </div>
  )
}
