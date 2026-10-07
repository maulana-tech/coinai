import { useState } from 'react'
import { ArrowDownIcon } from 'lucide-react'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatMoney, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import type { FxRates } from '@/lib/rates'
import { secondaryCurrencyFor, useSettings } from '@/lib/settings'
import { POSITIONS, type CoinAIAccount, type Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { mainVault, VAULT_LOGO, type Vaults } from '@/lib/yield'

const VAULT: Record<Position, { name: MessageKey; tab: MessageKey; route: MessageKey }> = {
  conservative: { name: 'yield.sourceConservativeName', tab: 'yield.tabConservative', route: 'yield.sourceConservativeRoute' },
  balanced: { name: 'yield.sourceBalancedName', tab: 'yield.tabBalanced', route: 'yield.sourceBalancedRoute' },
  growth: { name: 'yield.sourceGrowthName', tab: 'yield.tabGrowth', route: 'yield.sourceGrowthRoute' },
  basket: { name: 'yield.sourceBasketName', tab: 'yield.tabBasket', route: 'yield.sourceBasketRoute' },
}

// Parses what the user typed; null while empty or not a valid amount (no error while typing).
function tryParse(raw: string): bigint | null {
  try {
    const v = parseToken(raw)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

type YieldDepositCardProps = {
  account: CoinAIAccount
  vaults: Vaults | null
  rates: FxRates
  onDeposit: (amount: bigint, target: Position) => Promise<boolean>
  busy: boolean
}

// Same shape as the withdraw card: visual panel left, swap-style card right
// (idle savings → the vault or basket picked in the tabs). Investing is allowed while savings are locked:
// the money stays in savings.
export function YieldDepositCard({ account, vaults, rates, onDeposit, busy }: YieldDepositCardProps) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const [target, setTarget] = useState<Position>(mainVault(account) ?? 'balanced')
  const [value, setValue] = useState('')

  const available = account.idle
  const amount = tryParse(value)
  const tooMuch = amount !== null && amount > available
  const secondary = secondaryCurrencyFor(primaryCurrency, locale)
  const basket = target === 'basket'
  const apy = basket ? 0 : (vaults?.[target].apy ?? 0)
  const pct = (x: number) => new Intl.NumberFormat(intlLocale(locale), { style: 'percent', maximumFractionDigits: 1 }).format(x)
  // Simple one-year estimate at the vault's (simulated) APY.
  const yearly = amount !== null ? (amount * BigInt(Math.round(apy * 10_000))) / 10_000n : 0n
  const blocked = !basket && vaults === null

  const handleDeposit = async () => {
    if (amount === null || tooMuch) return
    if (await onDeposit(amount, target)) setValue('')
  }

  const buttonLabel = busy
    ? `${t('common.loading')}...`
    : amount === null
      ? t('withdraw.enterAmount')
      : t('yield.buttonAmount', { amount: formatMoney(amount, 'usdt', rates, locale), vault: t(VAULT[target].name) })

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Visual panel */}
      <div className="relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-2xl lg:min-h-[440px]">
        <img src="/landing/agents.jpg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="bg-[#0b0b0b]/70 p-6 text-white backdrop-blur-[2px]">
          <p className="font-mono text-[10px] font-bold tracking-[0.24em] text-white/70 uppercase">{t('yield.panelLabel')}</p>
          <p className="mt-2 font-serif text-2xl leading-tight font-medium">{t('yield.panelTitle')}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/80">{t('yield.howBody')}</p>
        </div>
      </div>

      {/* Action card */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <Tabs value={target} onValueChange={(v) => setTarget(v as Position)} className="items-center">
          <TabsList className="h-auto flex-wrap justify-center rounded-3xl">
            {POSITIONS.map((key) => (
              <TabsTrigger key={key} value={key} className="rounded-full px-3 sm:px-4">
                {t(VAULT[key].tab)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TokenIcon token="usdt" size={36} />
            <div>
              <p className="font-semibold">{t('withdraw.fromSave')}</p>
              <p className="font-mono text-xs text-muted-foreground">tUSDT</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{formatMoney(available, primaryCurrency, rates, locale)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">~ {formatMoney(available, secondary, rates, locale)}</p>
          </div>
        </div>

        <div className={cn('mt-5 rounded-2xl border bg-muted/30 p-4', tooMuch && 'border-destructive/50')}>
          <label htmlFor="deposit-amount" className="text-sm text-muted-foreground">
            {t('withdraw.amountLabel')}
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input
              id="deposit-amount"
              value={value}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              disabled={busy || blocked}
              onChange={(e) => setValue(e.target.value.replace(',', '.'))}
              className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
            />
            <span className="flex shrink-0 items-center gap-2 rounded-full border bg-card py-1.5 pr-3 pl-1.5 text-sm font-medium">
              <TokenIcon token="usdt" size={24} />
              tUSDT
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">~ {formatMoney(amount ?? 0n, secondary, rates, locale)}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{t('withdraw.available', { amount: formatMoney(available, 'usdt', rates, locale) })}</span>
              <button
                type="button"
                disabled={busy || blocked || available === 0n}
                onClick={() => setValue(tokenToInput(available))}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-ink uppercase transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                {t('withdraw.max')}
              </button>
            </span>
          </div>
        </div>

        <div className="-my-2.5 flex justify-center" aria-hidden="true">
          <span className="relative z-10 flex size-8 items-center justify-center rounded-full border bg-card">
            <ArrowDownIcon className="size-4 text-muted-foreground" />
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={VAULT_LOGO[target]} alt="" className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{t(VAULT[target].name)}</p>
              <p className="truncate text-xs text-muted-foreground">{t(VAULT[target].route)}</p>
            </div>
          </div>
          {basket ? (
            <p className="max-w-40 shrink-0 text-right text-xs text-muted-foreground">{t('yield.basketFollows')}</p>
          ) : (
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{t('yield.apyValue', { apy: pct(apy) })}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('yield.estYearly', { amount: formatMoney(yearly, primaryCurrency, rates, locale) })}
              </p>
            </div>
          )}
        </div>

        {tooMuch && <p className="mt-3 text-sm text-destructive">{t('errors.insufficientShares')}</p>}

        <Button
          size="lg"
          className="mt-5 h-12 w-full rounded-full text-base"
          disabled={busy || blocked || amount === null || tooMuch}
          onClick={() => void handleDeposit()}
        >
          {buttonLabel}
        </Button>

        <div className="mt-3 space-y-2">
          {!basket && vaults === null && <p className="text-xs text-destructive">{t('yield.targetUnavailable')}</p>}
          <p className="text-xs text-muted-foreground">{t('yield.depositHint')}</p>
        </div>
      </div>
    </div>
  )
}
