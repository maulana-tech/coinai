import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketAnalysis } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { formatMoney, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { YIELD_TARGETS, type PaymentStats } from '@/lib/types'
import { useMarket } from '@/lib/use-market'
import { useYieldData } from '@/lib/use-yield-data'
import { cn } from '@/lib/utils'
import { projectSavings, weightedApy, type ProjectionPoint } from '../../shared/projection.js'

const REGIME: Record<MarketAnalysis['regime'], { label: MessageKey; className: string }> = {
  risk_on: { label: 'market.regimeRiskOn', className: 'bg-primary/15 text-primary-ink' },
  neutral: { label: 'market.regimeNeutral', className: 'bg-gold/15 text-gold-ink' },
  risk_off: { label: 'market.regimeRiskOff', className: 'bg-destructive/15 text-destructive' },
}

// Projections are estimates: round to cents so they don't read as false precision.
const toUnits = (x: number) => BigInt(Math.round(Math.max(0, x) * 100)) * 10_000n

function Chart({ points }: { points: ProjectionPoint[] }) {
  const max = Math.max(...points.map((p) => p.balance), 1)
  const line = (key: 'balance' | 'contributed') =>
    points.map((p) => `${(p.month / (points.length - 1)) * 100},${40 - (p[key] / max) * 36 - 2}`).join(' ')
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full" aria-hidden="true">
      <line x1="0" y1="38" x2="100" y2="38" className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={line('contributed')} fill="none" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" className="stroke-muted-foreground/60" />
      <polyline points={line('balance')} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className="stroke-primary" />
    </svg>
  )
}

export function ProjectionCard({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { account, rates } = useAppState()
  const { vaults } = useYieldData()
  const { analysis } = useMarket()
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [income, setIncome] = useState<string | null>(null) // null = use the average payment

  useEffect(() => {
    coinai.getStats(address).then(setStats).catch(() => setStats(null))
  }, [address])

  const money = (x: number) => formatMoney(toUnits(x), primaryCurrency, rates, locale)
  const avgPayment = stats?.paymentCount ? Number(stats.totalReceived) / stats.paymentCount / 1e6 : 0
  const monthlyIncome = income === null ? avgPayment : Number(income.replace(',', '.')) || 0

  const ready = account && vaults
  // ponytail: the basket has no fixed APY (it follows coin prices), so it projects flat at 0%
  const positions = ready
    ? [
        ...YIELD_TARGETS.map((target) => ({ amount: Number(account.positions[target]) / 1e6, apy: vaults[target].apy })),
        { amount: Number(account.positions.basket) / 1e6, apy: 0 },
      ]
    : []
  const start = ready ? Number(account.idle) / 1e6 + positions.reduce((s, p) => s + p.amount, 0) : 0
  const split = ready ? account.splitBps / 10_000 : 0
  // nothing invested yet: assume new savings go to the Balanced vault
  const apy = ready ? weightedApy(positions, vaults.balanced.apy) : 0
  const points = projectSavings({ start, monthlyContribution: monthlyIncome * split, apy })
  const end = points[points.length - 1]

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('proj.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Link
          to="/app/agent/market"
          className="group flex items-start gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('proj.market')}</span>
              {analysis && (
                <Badge variant="secondary" className={cn('text-[10px]', REGIME[analysis.regime].className)}>
                  {t(REGIME[analysis.regime].label)}
                </Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{analysis?.summary ?? t('proj.marketEmpty')}</p>
          </div>
          <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        {!ready ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[3, 6, 12].map((m) => (
                <div key={m}>
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('proj.inMonths', { n: m })}</p>
                  <p className={cn('mt-1 font-semibold tabular-nums', m === 12 ? 'text-lg' : 'text-base')}>{money(points[m].balance)}</p>
                </div>
              ))}
            </div>
            <div>
              <Chart points={points} />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{t('proj.now')}</span>
                <span>{t('proj.inMonths', { n: 12 })}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-primary" />
                  {t('proj.balance')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t border-dashed border-muted-foreground" />
                  {t('proj.contributed', { amount: money(end.contributed) })}
                </span>
                <span>{t('proj.growth', { amount: money(end.balance - end.contributed) })}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="proj-income" className="text-sm font-medium">
                {t('proj.incomeLabel')}
              </label>
              <div className="relative">
                <Input
                  id="proj-income"
                  inputMode="decimal"
                  value={income ?? (avgPayment ? String(Math.round(avgPayment * 100) / 100) : '')}
                  placeholder="0"
                  onChange={(e) => setIncome(e.target.value)}
                  className="pr-16 tabular-nums"
                />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">tUSDT</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('proj.assumption', {
                  split: split * 100,
                  apy: new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(apy * 100),
                })}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
