import { RefreshCwIcon } from 'lucide-react'
import { CoinIcon } from '@/components/brand/coin-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { MarketAnalysis } from '@/lib/agent-api'
import { formatDateTime, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import type { CoinMarket, MarketSnapshot } from '../../shared/market.js'

function Sparkline({ closes, up }: { closes: number[]; up: boolean }) {
  if (closes.length < 2) return null
  const min = Math.min(...closes)
  const span = Math.max(...closes) - min || 1
  const points = closes.map((c, i) => `${(i / (closes.length - 1)) * 100},${30 - ((c - min) / span) * 28 - 1}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-24" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={up ? 'stroke-primary' : 'stroke-destructive'}
      />
    </svg>
  )
}

function Change({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular-nums', value >= 0 ? 'text-primary-ink' : 'text-destructive', className)}>
      {value >= 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

export function MarketBoard({
  market,
  loading,
  error,
  onRefresh,
}: {
  market: MarketSnapshot | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const t = useT()
  const { locale } = useSettings()
  const usd = (c: CoinMarket) =>
    new Intl.NumberFormat(intlLocale(locale), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: c.price < 10 ? 4 : 2,
    }).format(c.price)

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {t('market.title')}
          <Button variant="outline" size="icon-sm" aria-label={t('common.refresh')} disabled={loading} onClick={onRefresh}>
            <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && !market ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error && !market ? (
          <p className="text-sm text-destructive">{t('market.loadFailed')}</p>
        ) : market ? (
          <>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] tracking-wider text-muted-foreground uppercase">
                    <th className="px-2 pb-2 font-medium">{t('market.coin')}</th>
                    <th className="px-2 pb-2 text-right font-medium">{t('market.price')}</th>
                    <th className="px-2 pb-2 text-right font-medium">24h</th>
                    <th className="px-2 pb-2 text-right font-medium">7d</th>
                    <th className="px-2 pb-2 text-right font-medium">30d</th>
                    <th className="px-2 pb-2 text-right font-medium">{t('market.volatility')}</th>
                    <th className="px-2 pb-2 font-medium" aria-label={t('market.chart')} />
                  </tr>
                </thead>
                <tbody>
                  {market.coins.map((c) => (
                    <tr key={c.symbol} className="border-t">
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <CoinIcon symbol={c.symbol} size={32} />
                          <span>
                            <span className="block font-medium">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {c.priceSource === 'chainlink' ? t('market.sourceChainlink') : t('market.sourceBinance')}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-medium tabular-nums">{usd(c)}</td>
                      <td className="px-2 py-2.5 text-right"><Change value={c.change24h} /></td>
                      <td className="px-2 py-2.5 text-right"><Change value={c.change7d} /></td>
                      <td className="px-2 py-2.5 text-right"><Change value={c.change30d} /></td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{c.volatility30d.toFixed(0)}%</td>
                      <td className="px-2 py-2.5"><Sparkline closes={c.closes} up={c.change30d >= 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('market.caption', { time: formatDateTime(new Date(market.at), locale) })}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

const REGIME: Record<MarketAnalysis['regime'], { label: MessageKey; className: string }> = {
  risk_on: { label: 'market.regimeRiskOn', className: 'bg-primary/15 text-primary-ink' },
  neutral: { label: 'market.regimeNeutral', className: 'bg-gold/15 text-gold-ink' },
  risk_off: { label: 'market.regimeRiskOff', className: 'bg-destructive/15 text-destructive' },
}

export function MarketAnalysisCard({ analysis }: { analysis: MarketAnalysis | null }) {
  const t = useT()
  const { locale } = useSettings()
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {t('market.analysisTitle')}
          {analysis && (
            <Badge variant="secondary" className={cn('text-[10px]', REGIME[analysis.regime].className)}>
              {t(REGIME[analysis.regime].label)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {analysis ? (
          <>
            <p className="text-sm">{analysis.summary}</p>
            {analysis.signals.length > 0 && (
              <ul className="space-y-1.5">
                {analysis.signals.map((s) => (
                  <li key={s} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {t('market.analysisMeta', {
                pct: Math.round(analysis.confidence * 100),
                time: formatDateTime(new Date(analysis.at), locale),
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('market.analysisEmpty')}</p>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">{t('market.disclaimer')}</p>
      </CardContent>
    </Card>
  )
}
