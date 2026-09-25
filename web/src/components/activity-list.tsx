import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ExternalLinkIcon,
  LockIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { TokenIcon } from '@/components/brand/token-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { YieldRouteBadge } from '@/components/yield-route-badge'
import { type ActivityItem } from '@/lib/activity'
import { useAppState } from '@/lib/app-state'
import { explorerTxUrl } from '@/lib/config'
import { formatDate, formatDateTime, formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const ICONS: Record<ActivityItem['kind'], typeof LockIcon> = {
  pay: ArrowDownLeftIcon,
  wd_spend: ArrowUpRightIcon,
  wd_save: ArrowUpRightIcon,
  split: SlidersHorizontalIcon,
  lock: LockIcon,
}

// pay/wd_spend/wd_save all move real USDC, so they share the brand yellow; split/lock
// are rule changes, sharing the Rules page's accent tone. Used on the large 36px tile,
// where a soft wash reads fine.
const KIND_TINT: Record<ActivityItem['kind'], { bg: string; fg: string }> = {
  pay: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  wd_spend: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  wd_save: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  split: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  lock: { bg: 'bg-accent', fg: 'text-accent-foreground' },
}

// Same kind colors, but solid instead of a wash: the corner badge on token rows is only
// ~16px, and a soft tint at that size just reads as a blur - small marks need real contrast.
const KIND_TINT_SOLID: Record<ActivityItem['kind'], { bg: string; fg: string }> = {
  pay: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  wd_spend: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  wd_save: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  split: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  lock: { bg: 'bg-accent', fg: 'text-accent-foreground' },
}

type ActivityListProps = {
  items: ActivityItem[]
  loading: boolean
}

const TOKEN_KINDS: readonly ActivityItem['kind'][] = ['pay', 'wd_spend', 'wd_save']

export function ActivityList({ items, loading }: ActivityListProps) {
  const { account, rates } = useAppState()
  const { locale, primaryCurrency } = useSettings()
  const { address } = useWallet()
  const t = useT()

  const money = (amount: bigint | undefined): string =>
    formatMoney(amount ?? 0n, primaryCurrency, rates, locale)

  const label = (item: ActivityItem): string => {
    switch (item.kind) {
      case 'pay':
        return t('activity.pay', { amount: money(item.amount), saved: money(item.saved) })
      case 'wd_spend':
        return t('activity.wdSpend', { amount: money(item.amount) })
      case 'wd_save':
        return t('activity.wdSave', { amount: money(item.amount) })
      case 'split':
        return t('activity.split', { pct: (item.bps ?? 0) / 100 })
      case 'lock':
        return t('activity.lock', { date: formatDate(item.until ?? 0n, locale) })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-9 w-3/5" />
      </div>
    )
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('activity.empty')}</p>
  }

  const showRoute = account !== null && items.some((item) => item.kind === 'pay' || item.kind === 'wd_save')

  return (
    <div className="space-y-3">
      {showRoute && <YieldRouteBadge target={account.yieldTarget} />}
      <ul className="-mx-2 space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.kind]
          const tint = KIND_TINT[item.kind]
          const externalPayer =
            item.kind === 'pay' && item.from !== undefined && item.from !== address
          return (
            <li key={item.id}>
              <a
                href={explorerTxUrl(item.txHash)}
                target="_blank"
                rel="noreferrer"
                title={t('activity.viewOnExplorer')}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="relative shrink-0">
                  {externalPayer ? (
                    <AddressAvatar address={item.from ?? ''} size={36} className="rounded-full" />
                  ) : TOKEN_KINDS.includes(item.kind) ? (
                    // token logo alone fills its own circle edge-to-edge, so the currency
                    // is recognizable at a glance without extra padding diluting it
                    <TokenIcon token="fxrp" size={36} />
                  ) : (
                    <span
                      className={cn(
                        'flex size-9 items-center justify-center rounded-full',
                        tint.bg,
                      )}
                    >
                      <Icon className={cn('size-4', tint.fg)} />
                    </span>
                  )}
                  {TOKEN_KINDS.includes(item.kind) &&
                    (externalPayer ? (
                      <span className="absolute -right-1 -bottom-1 flex rounded-full ring-2 ring-card">
                        <TokenIcon token="fxrp" size={18} />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-card',
                          KIND_TINT_SOLID[item.kind].bg,
                        )}
                      >
                        <Icon
                          className={cn('size-2.5', KIND_TINT_SOLID[item.kind].fg)}
                          strokeWidth={2.5}
                        />
                      </span>
                    ))}
                </span>
                <span className="min-w-0 flex-1">{label(item)}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(item.at, locale)}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
