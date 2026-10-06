import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusIcon, RefreshCwIcon } from 'lucide-react'
import { GroupCard, KindPanel } from '@/components/groups/group-kit'
import { KIND } from '@/components/groups/group-meta'
import { GLASS, GroupShell } from '@/components/groups/group-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FUND_KINDS, listFunds, myStake, type FundKind, type GroupFund, type MyStake } from '@/lib/groups'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

type Scope = 'all' | 'joined' | 'mine'

const TEMPLATES: { kind: FundKind; example: 'groups.exampleIuran' | 'groups.examplePatungan' | 'groups.exampleDonasi' }[] = [
  { kind: 'iuran', example: 'groups.exampleIuran' },
  { kind: 'patungan', example: 'groups.examplePatungan' },
  { kind: 'donasi', example: 'groups.exampleDonasi' },
]

// 388px cards, as many per row as fit, centred; a single card shrinks to the screen on phones.
const GRID = 'grid justify-center gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,388px),388px))]'

/** Start a fund of a kind, as 388 × 440 cards in the same grid as the groups (empty state, empty filter). */
function Templates() {
  const t = useT()
  return (
    <div className={GRID}>
      {TEMPLATES.map(({ kind, example }) => (
        <Link key={kind} to={`/groups/new?kind=${kind}`} className="group block w-full max-w-[388px] rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <KindPanel kind={kind} className="h-[440px] rounded-3xl transition-shadow group-hover:shadow-xl group-hover:shadow-black/20" bandClassName="flex h-[300px] flex-col">
            <span className="mt-3 line-clamp-3 text-xs leading-relaxed text-white/65">{t(KIND[kind].rule)}</span>
            <span className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 pt-3 text-xs text-white/70">
              <span className="truncate">{t(example)}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0b0b0b] transition-transform group-hover:translate-x-0.5">
                <PlusIcon className="size-3.5" /> {t('groups.start')}
              </span>
            </span>
          </KindPanel>
        </Link>
      ))}
    </div>
  )
}

export function GroupsPage() {
  const t = useT()
  const { address } = useWallet()
  const [funds, setFunds] = useState<GroupFund[] | null>(null)
  const [stakes, setStakes] = useState<Record<number, MyStake>>({})
  const [failed, setFailed] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [kind, setKind] = useState<FundKind | 'any'>('any')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    setFailed(false)
    listFunds(48).then(
      (list) => live && setFunds(list),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [reload])

  useEffect(() => {
    if (!address || !funds) {
      setStakes({})
      return
    }
    let live = true
    Promise.all(funds.map(async (f) => [f.id, await myStake(f, address)] as const)).then(
      (rows) => live && setStakes(Object.fromEntries(rows)),
      () => {},
    )
    return () => {
      live = false
    }
  }, [address, funds])

  const shown = useMemo(() => {
    if (!funds) return null
    return funds.filter((f) => {
      if (kind !== 'any' && f.kind !== kind) return false
      const s = stakes[f.id]
      if (scope === 'mine') return s?.organizer
      if (scope === 'joined') return s && (s.member || s.contributed > 0n || s.organizer)
      return true
    })
  }, [funds, stakes, scope, kind])

  return (
    <GroupShell>
      <div className="space-y-6">
        <Card className={GLASS}>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('groups.hubTitle')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('groups.caption')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" className="rounded-full" aria-label={t('groups.refresh')} onClick={() => setReload((n) => n + 1)}>
                  <RefreshCwIcon className="size-4" />
                </Button>
                <Button asChild className="rounded-full">
                  <Link to="/groups/new">
                    <PlusIcon className="size-4" /> {t('groups.new')}
                  </Link>
                </Button>
              </div>
            </div>
            {funds !== null && funds.length === 0 ? (
              <div className="border-t pt-5">
                <p className="font-medium">{t('groups.emptyTitle')}</p>
                <p className="text-sm text-muted-foreground">{t('groups.emptyBody')}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                {address ? (
                  <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
                    <TabsList className="rounded-full">
                      <TabsTrigger value="all" className="rounded-full px-4">{t('groups.scopeAll')}</TabsTrigger>
                      <TabsTrigger value="joined" className="rounded-full px-4">{t('groups.scopeJoined')}</TabsTrigger>
                      <TabsTrigger value="mine" className="rounded-full px-4">{t('groups.scopeMine')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('groups.connectForYours')}</p>
                )}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('groups.filterKind')}>
                  {(['any', ...FUND_KINDS] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        kind === k ? 'border-primary bg-primary/10 font-medium text-primary-ink' : 'bg-card/60 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {k === 'any' ? t('groups.kindAny') : t(KIND[k].label)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {failed ? (
          <Card className={GLASS}>
            <CardContent className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              {t('groups.loadFailed')}
              <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>{t('common.retry')}</Button>
            </CardContent>
          </Card>
        ) : shown === null ? (
          <div className={GRID}>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[440px] w-full max-w-[388px] rounded-3xl bg-card/60" />)}
          </div>
        ) : funds && funds.length === 0 ? (
          <Templates />
        ) : shown.length === 0 ? (
          <div className="space-y-4">
            <p className="rounded-full bg-card/80 px-4 py-2 text-center text-sm text-muted-foreground backdrop-blur-sm">
              {t(scope === 'all' ? 'groups.noneOfKind' : 'groups.noneYours')}
            </p>
            <Templates />
          </div>
        ) : (
          <div className={GRID}>
            {shown.map((f) => <GroupCard key={f.id} fund={f} stake={stakes[f.id]} />)}
          </div>
        )}
      </div>
    </GroupShell>
  )
}
