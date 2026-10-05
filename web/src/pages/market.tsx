import { useEffect, useState } from 'react'
import { BotIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { CoinIcon } from '@/components/brand/coin-icon'
import { MarketBoard } from '@/components/market-board'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { agentApi, type PoolReview } from '@/lib/agent-api'
import { intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { useMarket } from '@/lib/use-market'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { fetchHistory } from '../../shared/market.js'
import { backtest, normalizeWeights, POOL_ASSETS, projectRange, type AssetCategory, type History, type PoolSymbol, type Weights } from '../../shared/pool.js'

const PRESETS: { label: MessageKey; weights: Weights }[] = [
  { label: 'market.presetExample', weights: { BNB: 70, BTC: 20, USDT: 10 } },
  { label: 'market.presetBalanced', weights: { BNB: 30, BTC: 25, ETH: 15, USDT: 30 } },
  { label: 'market.presetStocks', weights: { BNB: 30, SPY: 20, NVDA: 15, BTC: 15, PAXG: 10, USDT: 10 } },
  { label: 'market.presetCautious', weights: { BNB: 15, BTC: 10, PAXG: 15, USDT: 60 } },
]
// Builder tabs; gold and stablecoin share the "safer" tab.
const TABS: { key: 'crypto' | 'stock' | 'safe'; label: MessageKey; categories: AssetCategory[] }[] = [
  { key: 'crypto', label: 'market.tabCrypto', categories: ['crypto'] },
  { key: 'stock', label: 'market.tabStocks', categories: ['etf', 'stock'] },
  { key: 'safe', label: 'market.tabSafe', categories: ['gold', 'stable'] },
]
const CATEGORY_COLOR: Record<AssetCategory, string> = {
  crypto: 'bg-primary',
  stock: 'bg-gold',
  etf: 'bg-gold/60',
  gold: 'bg-gold-ink',
  stable: 'bg-muted-foreground/40',
}
const categoryOf = (s: string) => POOL_ASSETS.find((a) => a.symbol === s)?.category ?? 'stable'
const iconKind = (s: string) => (['stock', 'etf'].includes(categoryOf(s)) ? 'stock' : 'coin')
const VERDICT: Record<PoolReview['verdict'], { label: MessageKey; className: string }> = {
  fits: { label: 'market.verdictFits', className: 'bg-primary/15 text-primary-ink' },
  too_risky: { label: 'market.verdictRisky', className: 'bg-destructive/15 text-destructive' },
  too_cautious: { label: 'market.verdictCautious', className: 'bg-gold/15 text-gold-ink' },
}

// Backtest chart with a hover/touch tooltip: date, pool value for the simulated amount, change.
// The last point is today's daily close, so point i is (n-1-i) days ago.
function Chart({ values, amount, locale }: { values: number[]; amount: number; locale: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (values.length < 2) return null
  const n = values.length
  const min = Math.min(...values, 1)
  const span = Math.max(...values, 1) - min || 1
  const y = (v: number) => 38 - ((v - min) / span) * 36
  const x = (i: number) => (i / (n - 1)) * 100
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const up = values[n - 1] >= 1

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1)))
  }
  const fmt = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 })
  const tip =
    hover === null
      ? null
      : {
          date: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short' }).format(Date.now() - (n - 1 - hover) * 86_400_000),
          value: `${fmt.format(amount * values[hover])} tUSDT`,
          change: (values[hover] - 1) * 100,
        }

  return (
    <div
      className="relative touch-none select-none"
      onPointerMove={pick}
      onPointerDown={pick}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-32 w-full" aria-hidden="true">
        <line x1="0" y1={y(1)} x2="100" y2={y(1)} strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-muted-foreground/40" />
        <polyline points={points} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className={up ? 'stroke-primary' : 'stroke-destructive'} />
        {hover !== null && (
          <line x1={x(hover)} y1="0" x2={x(hover)} y2="40" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-foreground/30" />
        )}
      </svg>
      {hover !== null && tip && (
        <>
          <span
            className={cn('pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card', up ? 'bg-primary' : 'bg-destructive')}
            style={{ left: `${x(hover)}%`, top: `${(y(values[hover]) / 40) * 100}%` }}
          />
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border bg-card px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
            // beside the guide line, flipping to the left near the right edge
            style={{ left: `${x(hover)}%`, transform: x(hover) > 60 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)' }}
          >
            <p className="text-muted-foreground">{tip.date}</p>
            <p className="font-semibold tabular-nums">{tip.value}</p>
            <p className={cn('tabular-nums', tip.change >= 0 ? 'text-primary-ink' : 'text-destructive')}>
              {tip.change >= 0 ? '+' : ''}
              {fmt.format(tip.change)}%
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', tone === 'up' && 'text-primary-ink', tone === 'down' && 'text-destructive')}>{value}</p>
    </div>
  )
}

export function MarketPage() {
  const t = useT()
  const { locale } = useSettings()
  const { address } = useWallet()
  const { market, loading, error, refresh } = useMarket()
  const [weights, setWeights] = useState<Weights>(PRESETS[0].weights)
  const [amount, setAmount] = useState('100')
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('crypto')
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<History | null>(null)
  const [historyError, setHistoryError] = useState(false)
  const [review, setReview] = useState<PoolReview | null>(null)
  const [reviewing, setReviewing] = useState(false)

  useEffect(() => {
    const pairs = POOL_ASSETS.flatMap((a) => (a.pair ? [a.pair] : []))
    fetchHistory(pairs, 90)
      .then((raw) => {
        if (!Object.keys(raw).length) return setHistoryError(true)
        setHistory(Object.fromEntries(POOL_ASSETS.filter((a) => a.pair && raw[a.pair]).map((a) => [a.symbol, raw[a.pair!]])))
      })
      .catch(() => setHistoryError(true))
  }, [])

  const { weights: clean, valid } = normalizeWeights(weights)
  const total = Object.values(clean).reduce((a, b) => a + (b ?? 0), 0)
  const stats = history && valid ? backtest(clean, history) : null // 90 points: cheap enough per render
  const money = Number(amount.replace(',', '.')) || 0
  const ranges = stats ? projectRange(money, stats.volatility) : []
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(x)}%`
  const usdt = (x: number) => `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(x)} tUSDT`

  const change90 = (s: PoolSymbol) => {
    const c = history?.[s]
    return c && c.length > 1 ? (c[c.length - 1] / c[0] - 1) * 100 : null
  }
  const held = Object.entries(clean) as [PoolSymbol, number][]
  const q = query.trim().toLowerCase()
  const tabAssets = POOL_ASSETS.filter(
    (a) =>
      TABS.find((x) => x.key === tab)!.categories.includes(a.category) &&
      (!q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
  )

  const setWeight = (s: PoolSymbol, v: number) => {
    setWeights((w) => ({ ...w, [s]: Math.max(0, Math.min(100, Math.round(v))) }))
    setReview(null)
  }
  const askAi = async () => {
    if (!address) return toast.error(t('common.connectFirst'))
    setReviewing(true)
    try {
      setReview((await agentApi.poolReview(address, clean as Record<string, number>, locale)).review)
    } catch (e) {
      toast.error(t('market.reviewFailed'), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setReviewing(false)
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.market')} caption={t('page.marketCaption')} />
      <MarketBoard market={market} loading={loading} error={error} onRefresh={() => void refresh()} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Builder */}
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>{t('market.poolTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p.label} variant="outline" size="sm" className="rounded-full" onClick={() => { setWeights(p.weights); setReview(null) }}>
                  {t(p.label)}
                </Button>
              ))}
            </div>
            {/* Composition across all tabs */}
            <div className="space-y-2">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {held.map(([sym, w]) => (
                  <div key={sym} className={cn('h-full border-r border-card last:border-r-0', CATEGORY_COLOR[categoryOf(sym)])} style={{ width: `${Math.min(w, 100)}%` }} title={`${sym} ${w}%`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {held.map(([sym, w]) => (
                  <span key={sym} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs tabular-nums">
                    <CoinIcon symbol={sym} size={14} kind={iconKind(sym)} />
                    {sym} {w}%
                  </span>
                ))}
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setQuery('') }}>
              <TabsList className="rounded-full">
                {TABS.map((x) => (
                  <TabsTrigger key={x.key} value={x.key} className="rounded-full px-4">
                    {t(x.label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {tab === 'stock' && (
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('market.searchStocks')} aria-label={t('market.searchStocks')} />
            )}
            <div className={cn('space-y-3', tab === 'stock' && 'max-h-[26rem] overflow-y-auto pr-1')}>
              {tabAssets.map((a) => {
                const c90 = change90(a.symbol)
                return (
                  <div key={a.symbol} className="grid grid-cols-[9.5rem_1fr_4.5rem] items-center gap-3">
                    <span className="flex items-center gap-2.5 text-sm">
                      <CoinIcon symbol={a.symbol} size={28} kind={iconKind(a.symbol)} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1 font-medium">
                          {a.symbol}
                          {a.category === 'etf' && <span className="rounded bg-muted px-1 text-[9px] font-semibold text-muted-foreground">ETF</span>}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {a.symbol === 'USDT' ? t('market.stable') : a.name}
                          {c90 !== null && (
                            <span className={cn('ml-1 tabular-nums', c90 >= 0 ? 'text-primary-ink' : 'text-destructive')}>{pct(c90)}</span>
                          )}
                        </span>
                      </span>
                    </span>
                    <Slider value={[weights[a.symbol] ?? 0]} min={0} max={100} step={5} onValueChange={(v) => setWeight(a.symbol, v[0])} aria-label={a.symbol} />
                    <div className="relative">
                      <Input
                        inputMode="numeric"
                        value={String(weights[a.symbol] ?? 0)}
                        onChange={(e) => setWeight(a.symbol, Number(e.target.value.replace(/\D/g, '')) || 0)}
                        className="pr-6 text-right tabular-nums"
                        aria-label={`${a.symbol} %`}
                      />
                      <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )
              })}
              {tab === 'stock' && <p className="text-xs text-muted-foreground">{t('market.stocksNote')}</p>}
            </div>
            <div className="flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-muted-foreground">{t('market.total')}</span>
              <span className={cn('font-semibold tabular-nums', !valid && 'text-destructive')}>
                {total}% {!valid && `· ${t('market.mustBe100')}`}
              </span>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pool-amount" className="text-sm font-medium">{t('market.amount')}</label>
              <div className="relative">
                <Input id="pool-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="pr-16 tabular-nums" />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">tUSDT</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Result */}
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>{t('market.resultTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {historyError ? (
              <p className="text-sm text-muted-foreground">{t('market.historyFailed')}</p>
            ) : !stats ? (
              valid ? <Skeleton className="h-64 w-full" /> : <p className="text-sm text-muted-foreground">{t('market.mustBe100')}</p>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('market.backtestLabel', { days: stats.days })}</p>
                  <Chart values={stats.values} amount={money} locale={locale} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label={t('market.return')} value={pct(stats.totalReturn)} tone={stats.totalReturn >= 0 ? 'up' : 'down'} />
                  <Stat label={t('market.poolVolatility')} value={`${stats.volatility.toFixed(0)}%`} />
                  <Stat label={t('market.drawdown')} value={pct(stats.maxDrawdown)} tone={stats.maxDrawdown < -10 ? 'down' : undefined} />
                </div>
                <div className="border-t pt-4">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('market.rangeLabel', { amount: usdt(money) })}</p>
                  <div className="mt-2 grid grid-cols-[6rem_1fr_1fr_1fr] gap-x-3 gap-y-1.5 text-sm tabular-nums">
                    <span />
                    <span className="text-xs text-muted-foreground">{t('market.low')}</span>
                    <span className="text-xs text-muted-foreground">{t('market.mid')}</span>
                    <span className="text-xs text-muted-foreground">{t('market.high')}</span>
                    {ranges.map((r) => (
                      <div key={r.months} className="contents">
                        <span className="text-muted-foreground">{t('proj.inMonths', { n: r.months })}</span>
                        <span>{usdt(r.low)}</span>
                        <span>{usdt(r.mid)}</span>
                        <span>{usdt(r.high)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t('market.rangeHint')}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI review */}
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('market.aiTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {review ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="space-y-2">
                <Badge variant="secondary" className={cn('text-[11px]', VERDICT[review.verdict].className)}>{t(VERDICT[review.verdict].label)}</Badge>
                <p className="text-sm leading-relaxed">{review.summary}</p>
                {review.reason && <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">{review.reason}</p>}
              </div>
              {review.suggestion && (
                <div className="space-y-2 rounded-xl border p-4">
                  <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('market.suggestion')}</p>
                  {Object.entries(review.suggestion).map(([s, v]) => (
                    <div key={s} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CoinIcon symbol={s} size={18} kind={iconKind(s)} />
                        {s}
                      </span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} />
                      </div>
                      <span className="text-right tabular-nums">{v}%</span>
                    </div>
                  ))}
                  {JSON.stringify(review.suggestion) !== JSON.stringify(clean) && (
                    <Button size="sm" variant="outline" className="mt-2 w-full rounded-full" onClick={() => { setWeights(review.suggestion!); setReview(null) }}>
                      {t('market.applySuggestion')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('market.aiHint')}</p>
          )}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground sm:max-w-xl">{t('market.poolDisclaimer')}</p>
            <Button className="shrink-0 rounded-full" disabled={!valid || reviewing} onClick={() => void askAi()}>
              {reviewing ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <BotIcon className="mr-2 size-4" />}
              {reviewing ? t('market.reviewing') : t('market.askAi')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
