import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  BotIcon,
  DropletsIcon,
  LandmarkIcon,
  TrendingUpIcon,
  ArrowUpRightIcon,
  ExternalLinkIcon,
  LockIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from 'lucide-react'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { TokenIcon } from '@/components/brand/token-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { YieldRouteBadge } from '@/components/yield-route-badge'
import { type ActivityItem } from '@/lib/activity'
import { useAppState } from '@/lib/app-state'
import { explorerTxUrl } from '@/lib/config'
import { formatDate, formatDateTime, formatMoney, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const ICONS: Record<ActivityItem['kind'], typeof LockIcon> = {
  pay: ArrowDownLeftIcon,
  paid: ArrowUpRightIcon,
  faucet: DropletsIcon,
  target: LandmarkIcon,
  agent_on: ShieldCheckIcon,
  agent_off: ShieldOffIcon,
  run: UsersIcon,
  wd_spend: ArrowUpRightIcon,
  wd_save: ArrowUpRightIcon,
  invest: TrendingUpIcon,
  split: SlidersHorizontalIcon,
  lock: LockIcon,
  agent: BotIcon,
}

// pay/wd_spend/wd_save all move real tUSDT, so they share the brand yellow; split/lock
// are rule changes, sharing the Rules page's accent tone. Used on the large 36px tile,
// where a soft wash reads fine.
const KIND_TINT: Record<ActivityItem['kind'], { bg: string; fg: string }> = {
  pay: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  paid: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  faucet: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  target: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  agent_on: { bg: 'bg-gold/15', fg: 'text-gold-ink' },
  agent_off: { bg: 'bg-gold/15', fg: 'text-gold-ink' },
  run: { bg: 'bg-gold/15', fg: 'text-gold-ink' },
  wd_spend: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  wd_save: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  invest: { bg: 'bg-primary/15', fg: 'text-primary-ink' },
  split: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  lock: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  agent: { bg: 'bg-gold/15', fg: 'text-gold-ink' },
}

// Same kind colors, but solid instead of a wash: the corner badge on token rows is only
// ~16px, and a soft tint at that size just reads as a blur - small marks need real contrast.
const KIND_TINT_SOLID: Record<ActivityItem['kind'], { bg: string; fg: string }> = {
  pay: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  paid: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  faucet: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  target: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  agent_on: { bg: 'bg-gold', fg: 'text-primary-foreground' },
  agent_off: { bg: 'bg-gold', fg: 'text-primary-foreground' },
  run: { bg: 'bg-gold', fg: 'text-primary-foreground' },
  wd_spend: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  wd_save: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  invest: { bg: 'bg-primary', fg: 'text-primary-foreground' },
  split: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  lock: { bg: 'bg-accent', fg: 'text-accent-foreground' },
  agent: { bg: 'bg-gold', fg: 'text-primary-foreground' },
}

const VAULT_NAME_KEY: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}

type ActivityListProps = {
  items: ActivityItem[]
  loading: boolean
}

const TOKEN_KINDS: readonly ActivityItem['kind'][] = ['pay', 'paid', 'faucet', 'wd_spend', 'wd_save', 'invest']

const short = (a: string | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

// On-chain rows open the explorer; agent runs (off-chain) open the AI Agent page.
function RowLink({ item, className, children }: { item: ActivityItem; className: string; children: ReactNode }) {
  const t = useT()
  if (!item.txHash) {
    return (
      <Link to="/app/agent" className={className}>
        {children}
      </Link>
    )
  }
  return (
    <a href={explorerTxUrl(item.txHash)} target="_blank" rel="noreferrer" title={t('activity.viewOnExplorer')} className={className}>
      {children}
    </a>
  )
}

export function ActivityList({ items, loading }: ActivityListProps) {
  const { account, rates } = useAppState()
  const { locale, primaryCurrency } = useSettings()
  const { address } = useWallet()
  const t = useT()

  const money = (amount: bigint | undefined): string =>
    formatMoney(amount ?? 0n, primaryCurrency, rates, locale)

  const vaultName = (item: ActivityItem): string =>
    t(VAULT_NAME_KEY[item.target ?? 'balanced'])

  const pct = (bps: number | undefined) => (bps ?? 0) / 100

  // Title says what happened; the muted second line says who/why.
  const describe = (item: ActivityItem): { title: string; detail?: string } => {
    switch (item.kind) {
      case 'pay':
        if (item.via)
          return {
            title: t('activity.deposit', { amount: money(item.amount), saved: money(item.saved) }),
            detail: t(item.via === 'bnb' ? 'activity.depositViaBnb' : 'activity.depositViaWallet'),
          }
        return {
          title: t('activity.pay', { amount: money(item.amount), saved: money(item.saved) }),
          detail: item.from && item.from.toLowerCase() !== address?.toLowerCase() ? t('activity.fromAddr', { addr: short(item.from) }) : undefined,
        }
      case 'paid':
        return { title: t('activity.paid', { amount: money(item.amount) }), detail: t('activity.toAddr', { addr: short(item.to) }) }
      case 'faucet':
        return { title: t('activity.faucet', { amount: money(item.amount) }) }
      case 'wd_spend':
        return { title: t('activity.wdSpend', { amount: money(item.amount) }) }
      case 'wd_save':
        return { title: t('activity.wdSave', { amount: money(item.amount) }) }
      case 'split':
        return { title: t('activity.split', { pct: pct(item.bps) }) }
      case 'lock':
        return { title: t('activity.lock', { date: formatDate(item.until ?? 0n, locale) }) }
      case 'target':
        return { title: t('activity.target', { vault: vaultName(item) }) }
      case 'invest':
        return { title: t('activity.invest', { amount: money(item.amount), vault: vaultName(item) }) }
      case 'agent_on':
        return {
          title: t('activity.agentOn'),
          detail: t('activity.agentOnDetail', { min: pct(item.minBps), max: pct(item.maxBps), date: formatDate(item.until ?? 0n, locale) }),
        }
      case 'agent_off':
        return { title: t('activity.agentOff') }
      case 'agent':
        return {
          title:
            item.agentAction === 'split'
              ? t('activity.agentSplit', { pct: pct(item.bps) })
              : t('activity.agentInvest', { amount: money(item.amount), vault: vaultName(item) }),
          detail: item.reason,
        }
      case 'run':
        return {
          title:
            item.runMode === 'report-only'
              ? t('activity.runReport')
              : t('activity.run', { executed: item.executed ?? 0, rejected: item.rejected ?? 0 }),
          detail: item.summary,
        }
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
          const { title, detail } = describe(item)
          const externalPayer =
            item.kind === 'pay' && item.from !== undefined && item.from !== address
          return (
            <li key={item.id}>
              <RowLink
                item={item}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="relative shrink-0">
                  {externalPayer ? (
                    <AddressAvatar address={item.from ?? ''} size={36} className="rounded-full" />
                  ) : TOKEN_KINDS.includes(item.kind) ? (
                    // token logo alone fills its own circle edge-to-edge, so the currency
                    // is recognizable at a glance without extra padding diluting it
                    <TokenIcon token="usdt" size={36} />
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
                        <TokenIcon token="usdt" size={18} />
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
                <span className="min-w-0 flex-1">
                  <span className="block">{title}</span>
                  {detail && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{detail}</span>}
                </span>
                {item.txHash ? (
                  <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                ) : (
                  <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(item.at, locale)}
                </span>
              </RowLink>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
