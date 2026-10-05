import { useEffect, useState } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { autopilot } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { DEPOSIT_ROUTER_ADDRESS, readProvider } from '@/lib/config'
import { depositBNB, quoteBNB } from '@/lib/deposit'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { getTokenBalance } from '@/lib/token'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

type Asset = 'usdt' | 'bnb'
const GAS_BUFFER = 2n * 10n ** 15n // keep 0.002 tBNB for gas when using Max

function parseBnb(raw: string): bigint | null {
  if (!/^\d*\.?\d{0,18}$/.test(raw) || raw === '' || raw === '.') return null
  const [i, f = ''] = raw.split('.')
  const wei = BigInt(i || '0') * 10n ** 18n + BigInt(f.padEnd(18, '0'))
  return wei > 0n ? wei : null
}
const formatBnb = (wei: bigint) => (Number(wei) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 })

function tryToken(raw: string): bigint | null {
  try {
    const v = parseToken(raw)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

// Puts wallet funds into the user's coinAI account as a payment, so the split and the AI agents
// apply: tUSDT directly, tBNB via the Chainlink-priced DepositRouter.
export function DepositCard() {
  const t = useT()
  const { address } = useWallet()
  const { account, busy, rates, runAction } = useAppState()
  const { locale, primaryCurrency } = useSettings()
  const [asset, setAsset] = useState<Asset>('usdt')
  const [value, setValue] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<bigint | null>(null)

  useEffect(() => {
    if (!address) return
    setBalance(null)
    const load = asset === 'usdt' ? getTokenBalance(address) : readProvider.getBalance(address)
    load.then(setBalance).catch(() => setBalance(null))
  }, [address, asset, busy])

  const amount = asset === 'usdt' ? tryToken(value) : parseBnb(value)
  useEffect(() => {
    setQuote(null)
    if (asset !== 'bnb' || amount === null) return
    const id = setTimeout(() => void quoteBNB(amount).then((q) => setQuote(q.usdtOut)).catch(() => setQuote(null)), 300)
    return () => clearTimeout(id)
  }, [asset, amount])

  // Arriving from "Deposit funds" (…/faucet#deposit): bring the card into view once it renders.
  const ready = !!address && !!account
  useEffect(() => {
    if (ready && window.location.hash === '#deposit') document.getElementById('deposit')?.scrollIntoView({ behavior: 'smooth' })
  }, [ready])

  if (!address || !account) return null

  const usdtIn = asset === 'usdt' ? amount : quote // tUSDT that lands in the account
  const tooMuch = amount !== null && balance !== null && amount > balance
  const saved = usdtIn !== null ? (usdtIn * BigInt(account.splitBps)) / 10_000n : 0n
  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)
  const isBusy = busy === 'deposit'
  const max =
    balance === null ? null : asset === 'usdt' ? tokenToInput(balance) : balance > GAS_BUFFER ? formatBnb(balance - GAS_BUFFER).replace(/,/g, '') : '0'

  const submit = async () => {
    if (amount === null || usdtIn === null) return
    const ok = await runAction('deposit', 'success.deposited', () =>
      asset === 'usdt' ? coinai.pay(address, address, amount) : depositBNB(amount, usdtIn),
    )
    if (ok) {
      setValue('')
      autopilot.nudge(address) // let the agents invest the new savings right away
    }
  }

  return (
    <div id="deposit" className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{t('deposit.title')}</p>
          <p className="text-sm text-muted-foreground">{t('deposit.caption')}</p>
        </div>
        {DEPOSIT_ROUTER_ADDRESS && (
          <Tabs value={asset} onValueChange={(v) => { setAsset(v as Asset); setValue('') }}>
            <TabsList className="rounded-full">
              <TabsTrigger value="usdt" className="rounded-full px-4">tUSDT</TabsTrigger>
              <TabsTrigger value="bnb" className="rounded-full px-4">tBNB</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className={cn('mt-5 rounded-2xl border bg-muted/30 p-4', tooMuch && 'border-destructive/50')}>
        <label htmlFor="deposit-in" className="text-sm text-muted-foreground">
          {t('deposit.fromWallet')}
        </label>
        <div className="mt-1 flex items-center gap-3">
          <input
            id="deposit-in"
            value={value}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            disabled={isBusy}
            onChange={(e) => setValue(e.target.value.replace(',', '.'))}
            className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
          <span className="flex shrink-0 items-center gap-2 rounded-full border bg-card py-1.5 pr-3 pl-1.5 text-sm font-medium">
            <TokenIcon token={asset} size={24} />
            {asset === 'usdt' ? 'tUSDT' : 'tBNB'}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('withdraw.available', {
              amount: balance === null ? '…' : asset === 'usdt' ? formatMoney(balance, 'usdt', rates, locale) : `${formatBnb(balance)} tBNB`,
            })}
          </span>
          <button
            type="button"
            disabled={isBusy || !max || max === '0'}
            onClick={() => max && setValue(max)}
            className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-ink uppercase transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            {t('withdraw.max')}
          </button>
        </div>
      </div>

      <div className="-my-2.5 flex justify-center" aria-hidden="true">
        <span className="relative z-10 flex size-8 items-center justify-center rounded-full border bg-card">
          <ArrowDownIcon className="size-4 text-muted-foreground" />
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border p-4">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={36} />
          <div className="min-w-0">
            <p className="font-semibold">{t('deposit.toAccount')}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t('deposit.splitPreview', { saved: money(saved), spend: money((usdtIn ?? 0n) - saved) })}
            </p>
          </div>
        </div>
        <p className="shrink-0 font-semibold tabular-nums">{usdtIn === null ? '–' : formatMoney(usdtIn, 'usdt', rates, locale)}</p>
      </div>

      {tooMuch && <p className="mt-3 text-sm text-destructive">{t('deposit.notEnough')}</p>}

      <Button
        size="lg"
        className="mt-5 h-12 w-full rounded-full text-base"
        disabled={isBusy || amount === null || usdtIn === null || tooMuch}
        onClick={() => void submit()}
      >
        {isBusy
          ? `${t('common.loading')}...`
          : usdtIn === null
            ? t('withdraw.enterAmount')
            : t('deposit.button', { amount: formatMoney(usdtIn, 'usdt', rates, locale) })}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">{t(asset === 'bnb' ? 'deposit.bnbHint' : 'deposit.usdtHint')}</p>
    </div>
  )
}
