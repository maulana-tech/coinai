import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CheckIcon, CopyIcon, ExternalLinkIcon, LogOutIcon } from 'lucide-react'
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
import { autopilot } from '@/lib/agent-api'
import { coinai } from '@/lib/coinai'
import { explorerTxUrl } from '@/lib/config'
import { errorKey } from '@/lib/errors'
import { parseToken, shortHex } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { useScrollLock } from '@/lib/use-scroll-lock'
import { useWallet } from '@/lib/wallet'

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
  const anyBusy = busy !== null
  const displayName = name !== '' ? name : shortAddress(recipient)

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
      parsed = parseToken(value)
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
      autopilot.nudge(recipient) // recipient's agents invest the new savings (server re-checks on-chain)
    }
  }

  if (paid !== null) {
    return (
      <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <CheckIcon className="size-7" />
          </span>
          <p className="text-xl font-semibold tracking-tight">{t('pay.successTitle')}</p>
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
            <Button variant="outline" onClick={() => setPaid(null)}>
              {t('pay.payAgain')}
            </Button>
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
              disabled={anyBusy || value.trim() === ''}
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

function InvalidLink() {
  const t = useT()

  return (
    <Card className="w-full max-w-md rounded-2xl shadow-none backdrop-blur-sm bg-card/80">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-xl font-semibold tracking-tight">{t('pay.invalidTitle')}</p>
        <p className="text-sm text-muted-foreground">{t('errors.invalidPayAddress')}</p>
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
      <div className="no-scrollbar relative z-10 flex h-full flex-col overflow-y-auto">
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
