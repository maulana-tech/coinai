import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowRightIcon, CheckIcon } from 'lucide-react'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { Badge } from '@/components/ui/badge'
import { duesBehind, fundStatus, type FundKind, type FundStatus, type GroupFund, type MyStake } from '@/lib/groups'
import { useT, type MessageKey } from '@/lib/i18n'
import { KIND, useMoney, useRelative } from '@/components/groups/group-meta'
import { cn } from '@/lib/utils'

const STATUS: Record<FundStatus, { label: MessageKey; className: string }> = {
  open: { label: 'groups.statusOpen', className: 'border-primary/30 text-primary-ink' },
  reached: { label: 'groups.statusReached', className: 'border-transparent bg-primary text-primary-foreground' },
  failed: { label: 'groups.statusFailed', className: 'border-destructive/40 text-destructive' },
  ended: { label: 'groups.statusEnded', className: 'text-muted-foreground' },
  cancelled: { label: 'groups.statusCancelled', className: 'text-muted-foreground' },
}

export function KindIcon({ kind, className }: { kind: FundKind; className?: string }) {
  const Icon = KIND[kind].icon
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', KIND[kind].tint, className)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

export function KindBadge({ kind }: { kind: FundKind }) {
  const t = useT()
  const Icon = KIND[kind].icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', KIND[kind].tint)}>
      <Icon className="size-3.5" />
      {t(KIND[kind].label)}
    </span>
  )
}

export function StatusBadge({ fund, className }: { fund: GroupFund; className?: string }) {
  const t = useT()
  const s = STATUS[fundStatus(fund)]
  return (
    <Badge variant="outline" className={cn('text-[10px]', s.className, className)}>
      {t(s.label)}
    </Badge>
  )
}

export function FundProgress({ fund, className }: { fund: GroupFund; className?: string }) {
  const pct = fund.target > 0n ? Math.min(100, Number((fund.raised * 1000n) / fund.target) / 10) : 0
  if (fund.target === 0n) return null
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full', fund.raised >= fund.target ? 'bg-primary' : 'bg-gold')} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** One line under the amount: the deadline, or the dues rhythm. */
export function FundMeta({ fund }: { fund: GroupFund }) {
  const t = useT()
  const relative = useRelative()
  const { main } = useMoney()
  const parts: string[] = []
  if (fund.kind === 'iuran') {
    parts.push(t(fund.period >= 28 * 86_400 ? 'groups.duesMonthly' : fund.period >= 7 * 86_400 ? 'groups.duesWeekly' : 'groups.duesEvery', { amount: main(fund.dues), days: Math.round(fund.period / 86_400) }))
    parts.push(t('groups.membersCount', { n: fund.members }))
  } else {
    parts.push(t('groups.contributorsCount', { n: fund.contributors }))
    if (fund.deadline) parts.push(fund.deadline > Date.now() / 1000 ? t('groups.endsIn', { when: relative(fund.deadline) }) : t('groups.endedOn', { when: relative(fund.deadline) }))
  }
  return <p className="text-xs text-muted-foreground">{parts.join(' · ')}</p>
}

/** The connected user's relation to the fund, in one chip. */
export function StakeChip({ fund, stake }: { fund: GroupFund; stake: MyStake }) {
  const t = useT()
  const { main } = useMoney()
  if (stake.organizer) return <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">{t('groups.youOrganize')}</span>
  if (fund.kind === 'iuran' && stake.dues) {
    const behind = duesBehind(stake.dues)
    return behind > 0 ? (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">{t('groups.youBehind', { n: behind })}</span>
    ) : (
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-ink">{t('groups.youPaidUp')}</span>
    )
  }
  if (stake.contributed > 0n)
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-ink">{t('groups.youGave', { amount: main(stake.contributed) })}</span>
  return null
}

/**
 * A kind of group, told like the Withdraw panels: the art behind, a dark band with a mono label, a serif
 * headline and one line of copy. `selected` turns it into a radio option; `children` adds a footer line.
 */
export function KindPanel({ kind, selected, className, bandClassName, children }: { kind: FundKind; selected?: boolean; className?: string; bandClassName?: string; children?: ReactNode }) {
  const t = useT()
  return (
    <span
      className={cn(
        'relative isolate flex min-h-52 w-full flex-col justify-end overflow-hidden rounded-2xl text-left',
        selected === true && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
        className,
      )}
    >
      <img src={KIND[kind].image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      {selected !== undefined && (
        <span
          className={cn(
            'absolute top-3 right-3 flex size-6 items-center justify-center rounded-full border-2 border-white/80',
            selected ? 'bg-primary text-primary-foreground' : 'bg-black/20',
          )}
        >
          {selected && <CheckIcon className="size-3.5" />}
        </span>
      )}
      <span className={cn('block bg-[#0b0b0b]/70 p-5 text-white backdrop-blur-[2px]', bandClassName)}>
        <span className="block font-mono text-[10px] font-bold tracking-[0.24em] text-white/70 uppercase">{t(KIND[kind].panelLabel)}</span>
        <span className="mt-2 block font-serif text-2xl leading-tight font-medium">{t(KIND[kind].panelTitle)}</span>
        <span className="mt-2 block text-sm leading-relaxed text-white/80">{t(KIND[kind].tagline)}</span>
        {children}
      </span>
    </span>
  )
}

/** The 388 × 440 group card: the kind's art as a cover, then title, money, progress and your status. */
export function GroupCard({ fund, stake, preview = false }: { fund: GroupFund; stake?: MyStake | null; preview?: boolean }) {
  const t = useT()
  const { main } = useMoney()
  const Icon = KIND[fund.kind].icon
  const body = (
    <article
      className={cn(
        'flex h-[440px] w-full max-w-[388px] flex-col overflow-hidden rounded-3xl border bg-card/90 backdrop-blur-sm transition-[transform,box-shadow]',
        !preview && 'group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/10',
      )}
    >
      <div className="relative isolate h-[148px] shrink-0 overflow-hidden">
        <img src={KIND[fund.kind].image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b0b0b]/75 via-[#0b0b0b]/25 to-transparent" />
        {!preview && (
          <span className="absolute top-3 right-3">
            <StatusBadge fund={fund} className="border-transparent bg-card/90 backdrop-blur-sm" />
          </span>
        )}
        <span className="absolute bottom-4 left-4 flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-card/90 shadow-sm">
            <Icon className={cn('size-5', KIND[fund.kind].tint.split(' ').find((c) => c.startsWith('text-')))} />
          </span>
          <span className="font-mono text-[10px] font-bold tracking-[0.24em] text-white/85 uppercase">{t(KIND[fund.kind].label)}</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
        <div>
          <p className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight">{fund.title || t('groups.untitled')}</p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <AddressAvatar address={fund.organizer} size={16} className="shrink-0 rounded-full" />
            <span className="truncate">{t('groups.by', { who: `${fund.organizer.slice(0, 6)}…${fund.organizer.slice(-4)}` })}</span>
          </p>
        </div>
        <div className="space-y-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
            <span className="text-2xl font-semibold tracking-tight">{main(fund.raised)}</span>
            {fund.target > 0n && <span className="text-xs text-muted-foreground">{t('groups.ofTarget', { target: main(fund.target) })}</span>}
          </p>
          {fund.target > 0n ? <FundProgress fund={fund} /> : <p className="text-xs text-muted-foreground">{t('groups.collected')}</p>}
          <FundMeta fund={fund} />
          {fund.kind === 'patungan' && fund.target > fund.raised && !fund.cancelled && (
            <p className="text-xs font-medium text-gold-ink tabular-nums">{t('groups.remaining', { amount: main(fund.target - fund.raised) })}</p>
          )}
        </div>
        <p className="mt-auto font-serif text-lg leading-snug text-muted-foreground italic">{t(KIND[fund.kind].panelTitle)}</p>
        {(stake || !preview) && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          {stake ? <StakeChip fund={fund} stake={stake} /> : <span />}
          {!preview && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink">
              {t('groups.open')}
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </div>
        )}
      </div>
    </article>
  )
  return preview ? (
    body
  ) : (
    <Link to={`/groups/${fund.id}`} className="group block w-full max-w-[388px] rounded-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {body}
    </Link>
  )
}
