import { ExternalLinkIcon, Loader2Icon, LockIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { formatMoney, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { EXPLORER_CONTRACT_URL, explorerAddressUrl } from '@/lib/config'
import { YIELD_TARGETS, type YieldTarget } from '@/lib/types'
import { VAULT_LOGO, type Vaults } from '@/lib/yield'
import type { FxRates } from '@/lib/rates'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

type YieldSourcesCardProps = {
  vaults: Vaults | null
  loading: boolean
  rates: FxRates
  selectedTarget?: YieldTarget
  // display only (no switching), e.g. on the agent role pages
  readOnly?: boolean
  onSwitched?: () => void
}

type SourceRow = {
  key: string
  logo: string
  // set only for transparent single-color glyphs; logos with their own background fill the circle
  logoBackdrop?: string
  website: string
  name: MessageKey
  route: MessageKey
  badge: 'active' | 'soon'
  target: YieldTarget | null
  apy: number | null
  tvl: bigint | null
  available: boolean
  risk: MessageKey
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

const SOURCE_KEYS: Record<YieldTarget, { name: MessageKey; route: MessageKey }> = {
  conservative: { name: 'yield.sourceConservativeName', route: 'yield.sourceConservativeRoute' },
  balanced: { name: 'yield.sourceBalancedName', route: 'yield.sourceBalancedRoute' },
  growth: { name: 'yield.sourceGrowthName', route: 'yield.sourceGrowthRoute' },
}

const RISK_KEYS: MessageKey[] = ['yield.riskLow', 'yield.riskLow', 'yield.riskMedium', 'yield.riskHigh']

export function YieldSourcesCard({
  vaults,
  loading,
  rates,
  selectedTarget,
  readOnly = false,
  onSwitched,
}: YieldSourcesCardProps) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { address } = useWallet()
  const { account, busy, runAction } = useAppState()
  const intl = intlLocale(locale)

  // The contract only lets you switch vault while no savings sit idle (SavingsNotZero).
  const canSwitch = !readOnly && !!address && account !== null && account.shares === 0n
  const busyTarget = busy?.startsWith('target-') ? (busy.slice('target-'.length) as YieldTarget) : null

  const selectTarget = async (target: YieldTarget) => {
    if (!address || !canSwitch || busy !== null) return
    const ok = await runAction(`target-${target}`, 'success.yieldTargetSaved', () => coinai.setYieldTarget(address, target))
    if (ok) onSwitched?.()
  }

  const sources: SourceRow[] = YIELD_TARGETS.map((target) => {
    const vault = vaults?.[target]
    return {
      key: target,
      logo: VAULT_LOGO[target],
      website: vault?.address ? explorerAddressUrl(vault.address) : EXPLORER_CONTRACT_URL,
      name: SOURCE_KEYS[target].name,
      route: SOURCE_KEYS[target].route,
      badge: 'active',
      target,
      apy: vault?.apy ?? null,
      tvl: vault?.tvl ?? null,
      available: vaults !== null,
      risk: RISK_KEYS[vault?.risk ?? 0] ?? 'yield.riskMedium',
    }
  })

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
              const clickable = canSwitch && !isSelected && source.available && busy === null

              return (
                <button
                  key={source.key}
                  type="button"
                  onClick={() => source.target && void selectTarget(source.target)}
                  disabled={!clickable}
                  className={cn(
                    'group relative flex w-64 md:w-auto shrink-0 snap-start flex-col gap-3 rounded-2xl border bg-card p-4 text-left outline-none transition-[transform,box-shadow,border-color] duration-150 cursor-default',
                    clickable && 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer',
                    isSelected && 'border-gold/50',
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
                    {t('yield.riskLabel')}{' '}
                    <span className="font-medium text-foreground">{t(source.risk)}</span>
                  </p>
                </button>
              )
            })}
          </div>
        )}
        {!readOnly && account !== null && account.shares > 0n ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockIcon className="size-3 shrink-0" />
            {t('yield.switchBlocked', { amount: formatMoney(account.shares, primaryCurrency, rates, locale) })}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">{t(readOnly ? 'yield.sourcesCaption' : 'yield.sourcesCaptionPick')}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{t('yield.mainnetRefCaption')}</p>
      </CardContent>
    </Card>
  )
}
