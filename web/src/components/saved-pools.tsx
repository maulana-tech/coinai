import { useEffect, useState } from 'react'
import { CheckIcon, CopyPlusIcon, GlobeIcon, Trash2Icon, TrophyIcon } from 'lucide-react'
import { CoinIcon } from '@/components/brand/coin-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { publicApi, type PoolStore } from '@/lib/agent-api'
import { intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { backtest, POOL_ASSETS, vaultMix, type History, type PublicPool, type SavedPool, type VaultMix } from '../../shared/pool.js'

const MIX: { key: keyof VaultMix; label: MessageKey; className: string }[] = [
  { key: 'conservative', label: 'yield.sourceConservativeName', className: 'bg-muted-foreground/40' },
  { key: 'balanced', label: 'yield.sourceBalancedName', className: 'bg-primary' },
  { key: 'growth', label: 'yield.sourceGrowthName', className: 'bg-gold' },
]

const isStock = (s: string) => ['stock', 'etf'].includes(POOL_ASSETS.find((a) => a.symbol === s)?.category ?? '')

/** How a pool steers the agents: its share of calm / core / growth assets as a vault mix. */
export function VaultMixBar({ weights, compact }: { weights: SavedPool['weights']; compact?: boolean }) {
  const t = useT()
  const mix = vaultMix(weights)
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {MIX.map((m) => (
          <div key={m.key} className={cn('h-full', m.className)} style={{ width: `${mix[m.key]}%` }} />
        ))}
      </div>
      <div className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
        {MIX.map((m) => (
          <span key={m.key} className="flex items-center gap-1 tabular-nums">
            <span className={cn('size-1.5 rounded-full', m.className)} />
            {t(m.label)} {mix[m.key]}%
          </span>
        ))}
      </div>
    </div>
  )
}

export function SavedPools({
  store,
  history,
  editingId,
  busy,
  onSignIn,
  onLoad,
  onActivate,
  onDelete,
  onTogglePublic,
}: {
  store: PoolStore | null
  history: History | null
  editingId: string | null
  busy: boolean
  onSignIn: () => void
  onLoad: (p: SavedPool) => void
  onActivate: (id: string | null) => void
  onDelete: (id: string) => void
  onTogglePublic: (p: SavedPool) => void
}) {
  const t = useT()
  const { locale } = useSettings()
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(x)}%`

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('pools.title')}</CardTitle>
        <CardDescription>{t('pools.caption')}</CardDescription>
      </CardHeader>
      <CardContent>
        {store === null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{t('pools.signIn')}</p>
            <Button variant="outline" className="shrink-0 rounded-full" disabled={busy} onClick={onSignIn}>
              {t('pools.show')}
            </Button>
          </div>
        ) : store.pools.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pools.empty')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {store.pools.map((p) => {
              const active = store.activeId === p.id
              const stats = history ? backtest(p.weights, history) : null
              const held = Object.entries(p.weights).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
              return (
                <div
                  key={p.id}
                  className={cn('flex flex-col gap-3 rounded-2xl border p-4', active && 'border-primary/50 bg-primary/5', editingId === p.id && 'ring-2 ring-ring/40')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{p.name}</p>
                    {active && (
                      <Badge variant="secondary" className="shrink-0 bg-primary/15 text-[10px] text-primary-ink">
                        {t('pools.activeBadge')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {held.slice(0, 4).map(([s, w]) => (
                      <span key={s} className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] tabular-nums">
                        <CoinIcon symbol={s} size={12} kind={isStock(s) ? 'stock' : 'coin'} />
                        {s} {w}%
                      </span>
                    ))}
                    {held.length > 4 && <span className="px-1 text-[11px] text-muted-foreground">+{held.length - 4}</span>}
                  </div>
                  {stats && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {t('pools.stats', { days: stats.days, ret: pct(stats.totalReturn), vol: stats.volatility.toFixed(0) })}
                    </p>
                  )}
                  <VaultMixBar weights={p.weights} compact />
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => onLoad(p)}>
                      {t('pools.load')}
                    </Button>
                    <Button
                      size="sm"
                      variant={active ? 'outline' : 'default'}
                      className="flex-1 rounded-full"
                      disabled={busy}
                      onClick={() => onActivate(active ? null : p.id)}
                    >
                      {active ? t('pools.deactivate') : (
                        <>
                          <CheckIcon className="mr-1 size-3.5" />
                          {t('pools.activate')}
                        </>
                      )}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t(p.public ? 'pools.unshare' : 'pools.shareLeaderboard')}
                      title={t(p.public ? 'pools.unshare' : 'pools.shareLeaderboard')}
                      aria-pressed={!!p.public}
                      disabled={busy}
                      onClick={() => onTogglePublic(p)}
                      className={cn(p.public && 'text-primary-ink')}
                    >
                      <GlobeIcon />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t('pools.delete')} disabled={busy} onClick={() => onDelete(p.id)}>
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const WEEK_CLOSES = 8 // 7 daily returns

/**
 * C3: pools people shared, ranked by their backtest over the last week (same daily-rebalanced backtest as the
 * builder, on the last 8 closes). Copying one saves it as your own pool, ready to make the agents' benchmark.
 */
export function CommunityPools({ history, me, busy, onCopy }: { history: History | null; me: string | null; busy: boolean; onCopy: (p: PublicPool) => void }) {
  const t = useT()
  const { locale } = useSettings()
  const [pools, setPools] = useState<PublicPool[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    publicApi.publicPools().then(setPools, () => setFailed(true))
  }, [])
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(x)}%`
  const week = history ? (Object.fromEntries(Object.entries(history).map(([s, c]) => [s, c?.slice(-WEEK_CLOSES)])) as History) : null
  const ranked = (pools ?? [])
    .map((p) => ({ p, week: week ? backtest(p.weights, week).totalReturn : null, long: history ? backtest(p.weights, history) : null }))
    .sort((a, b) => (b.week ?? -Infinity) - (a.week ?? -Infinity))

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrophyIcon className="size-5 text-gold-ink" />
          {t('pools.communityTitle')}
        </CardTitle>
        <CardDescription>{t('pools.communityCaption')}</CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-muted-foreground">{t('pools.communityFailed')}</p>
        ) : pools === null ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}…</p>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pools.communityEmpty')}</p>
        ) : (
          <ol className="divide-y rounded-xl border">
            {ranked.map(({ p, week: w, long }, i) => {
              const mine = me !== null && p.owner === me.toLowerCase()
              return (
                <li key={`${p.owner}-${p.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className={cn('w-6 text-center font-semibold tabular-nums', i === 0 && 'text-gold-ink')}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {mine ? t('pools.yours') : `${p.owner.slice(0, 6)}…${p.owner.slice(-4)}`}
                      {long && ` · ${t('pools.longReturn', { days: long.days, ret: pct(long.totalReturn) })}`}
                    </span>
                  </span>
                  <span className={cn('w-16 text-right font-semibold tabular-nums', w !== null && (w >= 0 ? 'text-primary-ink' : 'text-destructive'))}>
                    {w === null ? '–' : pct(w)}
                  </span>
                  {!mine && (
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy || me === null} onClick={() => onCopy(p)}>
                      <CopyPlusIcon className="mr-1 size-3.5" />
                      {t('pools.copy')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
