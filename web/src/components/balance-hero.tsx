import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, LockIcon } from 'lucide-react'
import { TokenIcon } from '@/components/brand/token-icon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Skeleton } from '@/components/ui/skeleton'
import type { ActivityItem } from '@/lib/activity'
import { FIRELIGHT_VAULT } from '@/lib/config'
import { fxrpToNumber } from '@/lib/format'
import { currencyAffix, formatDate, formatMoney, intlLocale, useT } from '@/lib/i18n'
import type { FxRates } from '@/lib/rates'
import { secondaryCurrencyFor, useSettings } from '@/lib/settings'
import type { CoinAIAccount } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import {
  computeSavingsPosition,
  getSharePrice,
  getSparkDexPoolInfo,
  getUpshiftStats,
  valueOfShares,
} from '@/lib/yield'

const MIN_SEGMENT_PCT = 4 // keep tiny pockets visible on the bar
const ONE_FXRP = 10n ** 18n

type BalanceHeroProps = {
  account: CoinAIAccount | null
  activity: ActivityItem[]
  loading: boolean
  rates: FxRates
}

function segmentWidths(spend: number, save: number): [number, number] {
  const total = spend + save
  if (total <= 0) return [0, 0]
  let spendPct = (spend / total) * 100
  if (spend > 0 && spendPct < MIN_SEGMENT_PCT) spendPct = MIN_SEGMENT_PCT
  if (save > 0 && spendPct > 100 - MIN_SEGMENT_PCT) spendPct = 100 - MIN_SEGMENT_PCT
  return [spendPct, 100 - spendPct]
}

export function BalanceHero({ account, activity, loading, rates }: BalanceHeroProps) {
  const t = useT()
  const { address } = useWallet()
  const { locale, primaryCurrency } = useSettings()
  const secondaryCurrency = secondaryCurrencyFor(primaryCurrency, locale)
  const intl = intlLocale(locale)
  const [sharePrice, setSharePrice] = useState<bigint | null>(null)
  const [sparkdexTvl, setSparkdexTvl] = useState<bigint | null>(null)
  const [upshiftStats, setUpshiftStats] = useState<{ tvl: bigint | null }>({ tvl: null })
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n)
  const yieldTarget = account?.yieldTarget ?? 'firelight'

  useEffect(() => {
    let active = true
    if (yieldTarget === 'sparkdex') {
      void getSparkDexPoolInfo().then((info) => {
        if (active) setSparkdexTvl(info.tvl)
      })
    } else if (yieldTarget === 'upshift') {
      void getUpshiftStats().then((stats) => {
        if (active) setUpshiftStats({ tvl: stats.tvl })
      })
    } else {
      void getSharePrice().then((price) => {
        if (active) setSharePrice(price)
      })
    }
    return () => {
      active = false
    }
  }, [yieldTarget])

  // Fetch vault share balance (direct deposits bypass coinAI contract)
  useEffect(() => {
    if (!address) return
    let active = true
    const ERC4626_ABI = ['function balanceOf(address) view returns (uint256)']
    const { Contract, JsonRpcProvider } = require('ethers') as typeof import('ethers')
    const provider = new JsonRpcProvider(
      import.meta.env.VITE_FLARE_RPC_URL ?? 'https://coston2-api.flare.network/ext/C/rpc',
    )
    const vault = new Contract(FIRELIGHT_VAULT, ERC4626_ABI, provider)
    vault.balanceOf(address)
      .then((bal: bigint) => {
        if (active) setVaultBalance(bal)
      })
      .catch(() => {})
    return () => { active = false }
  }, [address])

  const primary = (amount: bigint): string => formatMoney(amount, primaryCurrency, rates, locale)
  const secondary = (amount: bigint): string =>
    formatMoney(amount, secondaryCurrency, rates, locale)

  if (loading || account === null) {
    return (
      <Card className="rounded-2xl shadow-none">
        <CardContent>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-10 w-48" />
          <Skeleton className="mt-2 h-4 w-32" />
          <div className="mt-6 flex justify-between">
            <Skeleton className="h-14 w-32" />
            <Skeleton className="h-14 w-32" />
          </div>
          <Skeleton className="mt-3 h-3 w-full rounded-full" />
        </CardContent>
      </Card>
    )
  }

  const total = account.spend + account.shares + vaultBalance // vaultBalance from direct deposits
  const empty = total <= 0n
  const locked = Number(account.lockUntil) * 1000 > Date.now()
  const [spendPct, savePct] = segmentWidths(
    fxrpToNumber(account.spend),
    fxrpToNumber(account.shares + vaultBalance),
  )
  const currentValue = valueOfShares(
    account.shares + vaultBalance,
    account.yieldTarget,
    sharePrice,
    sparkdexTvl,
    upshiftStats,
  )
  const position = currentValue !== null ? computeSavingsPosition(activity, currentValue) : null
  const earning = position !== null && position.earnings !== null && position.earnings > 0n

  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent>
        <p className="text-sm text-muted-foreground">{t('balances.total')}</p>
        <div className="mt-1 flex items-end gap-1.5">
          {primaryCurrency === 'fxrp' ? (
            <>
              <NumberTicker
                value={fxrpToNumber(total)}
                decimalPlaces={2}
                locale={intl}
                delay={0.3}
                className="text-4xl font-semibold tracking-tight text-foreground tabular-nums"
              />
              <span className="mb-1 inline-flex items-center gap-2 text-lg text-muted-foreground">
                <TokenIcon token="fxrp" size={34} />
                FXRP
              </span>
            </>
          ) : (
            (() => {
              const { symbol, position } = currencyAffix(primaryCurrency, locale)
              const affix = (
                <span className="mb-1.5 text-2xl font-medium text-muted-foreground">{symbol}</span>
              )
              const fiatDecimals = primaryCurrency === 'idr' ? 0 : 2
              const ticker = (
                <NumberTicker
                  value={fxrpToNumber(total) * rates[primaryCurrency as 'usd' | 'idr' | 'cny']}
                  decimalPlaces={fiatDecimals}
                  locale={intl}
                  delay={0.3}
                  className="text-4xl font-semibold tracking-tight text-foreground tabular-nums"
                />
              )
              return position === 'prefix' ? (
                <>
                  {affix}
                  {ticker}
                </>
              ) : (
                <>
                  {ticker}
                  {affix}
                </>
              )
            })()
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          {secondaryCurrency === 'fxrp' && <TokenIcon token="fxrp" size={18} />}~{' '}
          {secondary(total)}
        </p>
        {primaryCurrency !== 'fxrp' && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('balances.rateCaption', { amount: formatMoney(ONE_FXRP, primaryCurrency, rates, locale) })}
          </p>
        )}
        <div className="mt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                <span className="size-2 rounded-full bg-secondary" />
                {t('balances.spendable')}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold tracking-tight tabular-nums">
                <TokenIcon token="fxrp" size={24} />
                {primary(account.spend)}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                ~ {secondary(account.spend)}
              </p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {t('balances.savings')}
                <span className="size-2 rounded-full bg-gold" />
              </p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-lg font-semibold tracking-tight tabular-nums">
                <TokenIcon token="fxrp" size={24} />
                {primary(account.shares + vaultBalance)}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                ~ {secondary(account.shares + vaultBalance)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
            {spendPct > 0 && (
              <div className="rounded-full bg-secondary" style={{ width: `${spendPct}%` }} />
            )}
            {savePct > 0 && (
              <div className="rounded-full bg-gold" style={{ width: `${savePct}%` }} />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('balances.pocketsHint')}</p>
          {empty ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('balances.emptyHint')}{' '}
              <Link to="/app/link" className="inline-flex items-center gap-2 text-primary-ink hover:underline">
                {t('nav.paymentLink')}
                <ArrowRightIcon className="size-4" />
              </Link>
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {locked && (
                <Badge variant="secondary" className="gap-1 bg-accent text-xs text-accent-foreground">
                  <LockIcon className="size-3" />
                  {t('balances.lockedUntil', { date: formatDate(account.lockUntil, locale) })}
                </Badge>
              )}
              {account.shares + vaultBalance > 0n && (
                <Link
                  to="/app/yield"
                  className={cn(
                    'flex items-center gap-1.5 text-xs hover:underline',
                    earning ? 'font-medium text-gold-ink' : 'text-accent-foreground',
                  )}
                >
                  <span className="size-1.5 rounded-full bg-gold" />
                  {earning && position?.earnings != null
                    ? t('balances.earningsLine', { amount: primary(position.earnings) })
                    : t('balances.earningCaption')}
                </Link>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
