import { SavingsWaveChart } from '@/components/savings-wave-chart'
import { TokenIcon } from '@/components/brand/token-icon'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { tokenToInput } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import type { FxRates } from '@/lib/rates'
import { secondaryCurrencyFor, useSettings } from '@/lib/settings'
import { POSITION_NAME, savingsHistory, savingsPosition } from '@/lib/yield'
import type { ActivityItem } from '@/lib/activity'
import { POSITIONS, type CoinAIAccount } from '@/lib/types'

type YieldPositionCardProps = {
  account: CoinAIAccount | null
  activity: ActivityItem[]
  loading: boolean
  rates: FxRates
}

function Stat({
  label,
  amount,
  secondary,
  tone,
  badge,
}: {
  label: string
  amount: string
  secondary: string
  tone?: 'gold' | 'muted'
  badge?: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
        {badge && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal normal-case">
            {badge}
          </Badge>
        )}
      </p>
      <p
        className={
          'mt-1 flex items-center gap-1.5 text-lg font-semibold tracking-tight tabular-nums ' +
          (tone === 'gold' ? 'text-gold-ink' : tone === 'muted' ? 'text-muted-foreground' : '')
        }
      >
        <TokenIcon token="usdt" size={24} />
        {amount}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">{secondary}</p>
    </div>
  )
}

export function YieldPositionCard({
  account,
  activity,
  loading,
  rates,
}: YieldPositionCardProps) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const secondaryCurrency = secondaryCurrencyFor(primaryCurrency, locale)

  const primary = (amount: bigint): string => formatMoney(amount, primaryCurrency, rates, locale)
  const secondary = (amount: bigint): string =>
    formatMoney(amount, secondaryCurrency, rates, locale)

  if (loading || account === null) {
    return (
      <Card className="rounded-2xl shadow-none">
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="mt-5 h-4 w-2/3" />
        </CardContent>
      </Card>
    )
  }

  // idle savings in coinAI + every position it holds for the user
  const position = savingsPosition(account)
  const earningsTone = position.earnings !== null && position.earnings > 0n ? 'gold' : 'muted'
  const history = savingsHistory(activity)

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('yield.positionTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label={t('yield.principal')}
            amount={primary(position.principal)}
            secondary={`~ ${secondary(position.principal)}`}
            badge={t('yield.estimate')}
          />
          {position.currentValue !== null && position.earnings !== null ? (
            <>
              <Stat
                label={t('yield.currentValue')}
                amount={primary(position.currentValue)}
                secondary={`~ ${secondary(position.currentValue)}`}
              />
              <Stat
                label={t('yield.earnings')}
                amount={`${position.earnings > 0n ? '+' : ''}${primary(position.earnings)}`}
                secondary={`~ ${secondary(position.earnings)}`}
                tone={earningsTone}
              />
            </>
          ) : (
            <>
              <Stat label={t('yield.currentValue')} amount="-" secondary="-" tone="muted" />
              <Stat label={t('yield.earnings')} amount="-" secondary="-" tone="muted" />
            </>
          )}
        </div>
        {(history.length > 0 || position.currentValue !== null) && (
          <div className="mt-5">
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {t('yield.historyLabel')}
            </p>
            <SavingsWaveChart
              history={history}
              currentValue={position.currentValue}
              className="mt-2 h-14 w-full"
            />
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {t('portfolio.idle')}: <span className="tabular-nums">{tokenToInput(account.idle)}</span>
          </span>
          {POSITIONS.filter((p) => account.positions[p] > 0n).map((p) => (
            <span key={p}>
              {t(POSITION_NAME[p])}: <span className="tabular-nums">{tokenToInput(account.positions[p])}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('yield.estimateHint')} {t('yield.earningsCaption')} {t('yield.simulatedNote')}
        </p>
      </CardContent>
    </Card>
  )
}
