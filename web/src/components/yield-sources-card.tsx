import { ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMoney, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import type { YieldTarget } from '@/lib/types'
import type { FxRates } from '@/lib/rates'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

type YieldSourcesCardProps = {
  sparkdexApy: number | null
  sparkdexTvl: bigint | null
  firelightApy: number | null
  firelightTvl: bigint | null
  upshiftApy: number | null
  upshiftTvl: bigint | null
  mainnetApy: { sparkdex: number | null; firelight: number | null; upshift: number | null }
  loading: boolean
  rates: FxRates
  selectedTarget?: YieldTarget
  onSelectTarget?: (target: YieldTarget) => void
  busyTarget?: YieldTarget | null
  targetHealth?: { sparkdex: boolean; firelight: boolean; upshift: boolean }
}

type SourceRow = {
  key: string
  logo: string
  // set only for logos that are a transparent, single-color glyph with no
  // background of their own (Soroswap's icon); real backgrounded marks
  // (DeFindex, Blend) fill the circle edge-to-edge instead
  logoBackdrop?: string
  website: string
  name: MessageKey
  route: MessageKey
  badge: 'active' | 'soon'
  target: YieldTarget | null
  apy: number | null
  tvl: bigint | null
  available: boolean
  // A real rate from a live mainnet pool, purely for context on what real
  // borrowing/trading demand looks like - never the user's own position.
  mainnetApy: number | null
}

function formatApy(value: number | null, locale: string): string {
  if (value === null) return '-'
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function ProtocolLogo({ source }: { source: SourceRow }) {
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
      style={source.logoBackdrop ? { backgroundColor: source.logoBackdrop } : undefined}
    >
      <img
        src={source.logo}
        alt=""
        className={
          source.logoBackdrop ? 'h-[58%] w-[58%] object-contain' : 'h-full w-full object-cover'
        }
      />
    </span>
  )
}

export function YieldSourcesCard({
  sparkdexApy,
  sparkdexTvl,
  firelightApy,
  firelightTvl,
  upshiftApy,
  upshiftTvl,
  mainnetApy,
  loading,
  rates,
  selectedTarget,
  onSelectTarget,
  busyTarget,
  targetHealth = { sparkdex: true, firelight: true, upshift: true },
}: YieldSourcesCardProps) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const intl = intlLocale(locale)

  const sources: SourceRow[] = [
    {
      key: 'sparkdex',
      logo: '/logos/sparkdex-icon.svg',
      website: 'https://sparkdex.finance',
      name: 'yield.sourceSparkdexName',
      route: 'yield.sourceSparkdexRoute',
      badge: 'active',
      target: 'sparkdex',
      apy: sparkdexApy,
      tvl: sparkdexTvl,
      available: targetHealth.sparkdex,
      mainnetApy: mainnetApy.sparkdex,
    },
    {
      key: 'firelight',
      logo: '/logos/firelight-icon.svg',
      website: 'https://firelight.finance',
      name: 'yield.sourceFirelightName',
      route: 'yield.sourceFirelightRoute',
      badge: 'active',
      target: 'firelight',
      apy: firelightApy,
      tvl: firelightTvl,
      available: targetHealth.firelight,
      mainnetApy: mainnetApy.firelight,
    },
    {
      key: 'upshift',
      logo: '/logos/upshift-icon.svg',
      website: 'https://upshift.finance',
      name: 'yield.sourceUpshiftName',
      route: 'yield.sourceUpshiftRoute',
      badge: 'active',
      target: 'upshift',
      apy: upshiftApy,
      tvl: upshiftTvl,
      available: targetHealth.upshift,
      mainnetApy: mainnetApy.upshift,
    },
  ]

  const bestApy = sources.reduce<number | null>(
    (best, source) =>
      source.available && source.apy !== null && (best === null || source.apy > best)
        ? source.apy
        : best,
    null,
  )

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('yield.sourcesTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3">
            <Skeleton className="h-40 w-64 shrink-0 rounded-2xl md:w-auto" />
            <Skeleton className="h-40 w-64 shrink-0 rounded-2xl md:w-auto" />
            <Skeleton className="h-40 w-64 shrink-0 rounded-2xl md:w-auto" />
          </div>
        ) : (
          <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-3 md:overflow-visible">
            {sources.map((source) => {
              const isBest = bestApy !== null && source.apy === bestApy
              const isSelected = source.target !== null && source.target === selectedTarget
              const isBusy = source.target !== null && source.target === busyTarget

              return (
                <button
                  key={source.key}
                  type="button"
                  onClick={() => source.target && onSelectTarget?.(source.target)}
                  disabled={isSelected || isBusy || !source.target || !source.available}
                  className={cn(
                    'group relative flex w-64 md:w-auto shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-card p-4 text-left outline-none transition-[transform,box-shadow,border-color] duration-150',
                    !isSelected && source.available && 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer',
                    isSelected && 'border-gold/50 cursor-default',
                    isBusy && 'opacity-80 pointer-events-none',
                    !source.available && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <ProtocolLogo source={source} />
                      <div className="min-w-0">
                        <a 
                          href={source.website} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex items-center gap-1 text-sm font-medium hover:underline z-10 relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="truncate">{t(source.name)}</span>
                          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                        </a>
                        <p className="truncate text-xs text-muted-foreground">{t(source.route)}</p>
                      </div>
                    </div>
                    {isBusy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {!source.available ? (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('yield.badgeUnavailable')}
                      </Badge>
                    ) : isSelected ? (
                      <Badge variant="secondary" className="bg-gold/15 text-[10px] text-gold-ink">
                        {t('yield.badgeSelected')}
                      </Badge>
                    ) : (
                      <Badge
                        variant={source.badge === 'active' ? 'default' : 'outline'}
                        className="text-[10px]"
                      >
                        {t(source.badge === 'active' ? 'yield.badgeActive' : 'yield.badgeSoon')}
                      </Badge>
                    )}
                    {isBest && source.available && (
                      <Badge variant="secondary" className="bg-gold/15 text-[10px] text-gold-ink">
                        {t('yield.bestYield')}
                      </Badge>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">
                      {formatApy(source.apy, intl)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('yield.apyLabel')}
                      {source.tvl !== null && (
                        <>
                          {' - '}
                          {formatMoney(source.tvl, primaryCurrency, rates, locale)} {t('yield.tvlLabel')}
                        </>
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('yield.mainnetRefLabel')}{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {formatApy(source.mainnetApy, intl)}
                    </span>
                  </p>
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t('yield.sourcesCaption')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('yield.mainnetRefCaption')}</p>
      </CardContent>
    </Card>
  )
}
