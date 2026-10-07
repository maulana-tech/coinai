import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRightIcon } from 'lucide-react'
import { KIND, useMoney } from '@/components/groups/group-meta'
import { fundStatus, listFunds, type FundKind, type FundStatus, type GroupFund } from '@/lib/groups'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Reveal, Star } from './kit'
import { mono } from './styles'

const KINDS: FundKind[] = ['patungan', 'iuran', 'donasi']
const SHOWN = 6
const STATUS: Record<FundStatus, MessageKey> = {
  open: 'groups.statusOpen',
  reached: 'groups.statusReached',
  failed: 'groups.statusFailed',
  ended: 'groups.statusEnded',
  cancelled: 'groups.statusCancelled',
}

/** The three kinds of group fund, each with the rule its contract enforces. */
export function GroupKinds() {
  const t = useT()
  return (
    <div className="grid border-t border-white/15 md:grid-cols-3">
      {KINDS.map((k, i) => {
        const Icon = KIND[k].icon
        return (
          <Reveal key={k} delay={i * 0.1} className={cn('relative px-6 py-10 md:px-10 lg:px-14', i > 0 && 'border-t border-white/15 md:border-t-0 md:border-l')}>
            {i === 0 && <Star className="top-0 left-0" />}
            <p className={cn(mono, 'flex items-center gap-2 text-white/55')}>
              <Icon className="size-3.5" />
              0{i + 1} · {t(KIND[k].label)}
            </p>
            <p className="mt-4 font-serif text-[clamp(1.5rem,2.4vw,2rem)] leading-[1.1] font-light">{t(KIND[k].tagline)}</p>
            <p className="mt-4 text-[14px] leading-relaxed text-white/65">{t(KIND[k].rule)}</p>
          </Reveal>
        )
      })}
    </div>
  )
}

/**
 * Groups that exist on BSC Testnet right now (GroupFunds, newest first). Nothing is made up: while loading, on an
 * RPC failure or with no groups yet, only the way in is shown.
 */
export function LiveGroups() {
  const t = useT()
  const { main } = useMoney()
  const [funds, setFunds] = useState<GroupFund[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    listFunds(SHOWN).then(setFunds, () => setFailed(true))
  }, [])

  const live = (funds ?? []).filter((f) => !f.cancelled)
  return (
    <div className="relative border-t border-white/15 px-6 py-14 md:px-10 lg:px-14">
      <Star className="top-0 left-0" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className={cn(mono, 'flex items-center gap-2 text-white/55')}>
          <span className={cn('size-1.5 rounded-full', failed ? 'bg-white/30' : 'animate-pulse bg-emerald-400')} />
          {t('lp.groupsLive')}
        </p>
        <Link to="/groups" className={cn(mono, 'flex items-center gap-1.5 text-white/70 hover:text-white')}>
          {t('lp.groupsBrowse')}
          <ArrowUpRightIcon className="size-3.5" />
        </Link>
      </div>

      {funds === null && !failed ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-[3px] border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : live.length === 0 ? (
        <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70">{t(failed ? 'lp.groupsUnavailable' : 'lp.groupsEmpty')}</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((f) => {
            const progress = f.target > 0n ? Math.min(1, Number((f.raised * 1000n) / f.target) / 1000) : null
            const status = fundStatus(f)
            return (
              <li key={f.id}>
                <Link
                  to={`/groups/${f.id}`}
                  className="group flex h-full flex-col gap-3 rounded-[3px] border border-white/15 bg-black/40 p-5 backdrop-blur-sm transition-colors hover:border-white/40"
                >
                  <span className={cn(mono, 'flex items-center justify-between gap-2 text-white/55')}>
                    {t(KIND[f.kind].label)}
                    <span className={status === 'reached' ? 'text-emerald-300' : status === 'open' ? 'text-white/70' : 'text-white/40'}>
                      {t(STATUS[status])}
                    </span>
                  </span>
                  <span className="line-clamp-2 font-serif text-xl leading-tight font-light">{f.title}</span>
                  <span className="mt-auto space-y-2">
                    {progress !== null && (
                      <span className="block h-1 overflow-hidden rounded-full bg-white/15">
                        <span className="block h-full rounded-full bg-[#d5aa61]" style={{ width: `${progress * 100}%` }} />
                      </span>
                    )}
                    <span className="flex items-baseline justify-between gap-2 text-[13px] text-white/75 tabular-nums">
                      <span>
                        {f.kind === 'iuran' ? t('groups.duesEvery', { amount: main(f.dues), days: Math.round(f.period / 86_400) }) : main(f.raised)}
                        {f.target > 0n && <span className="text-white/45"> {t('groups.ofTarget', { target: main(f.target) })}</span>}
                      </span>
                      <span className="text-white/45">
                        {f.kind === 'iuran' ? t('groups.membersCount', { n: f.members }) : t('groups.contributorsCount', { n: f.contributors })}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
