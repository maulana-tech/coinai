import { useCallback, useEffect, useState } from 'react'
import { AwardIcon, CopyIcon, FlameIcon, GiftIcon, Loader2Icon, PlusIcon, Share2Icon, TargetIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { agentApi, hasAgentSession, publicApi, type Goal, type Rewards } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { BADGES, claimBadge, getBadges, type BadgeState } from '@/lib/badges'
import { formatDate, formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { renderShareCard } from '@/lib/share-card'
import { totalSavings } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const tokenUnits = (x: number) => BigInt(Math.round(x * 100)) * 10_000n // tUSDT (6 decimals) from a 2-decimal number

// ─── C1 goals ────────────────────────────────────────────────────────────────

type Draft = { name: string; target: string; share: string; date: string }
const EMPTY: Draft = { name: '', target: '', share: '', date: '' }

function GoalsCard({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { account, rates } = useAppState()
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const money = (x: number) => formatMoney(tokenUnits(x), primaryCurrency, rates, locale)
  const saved = account ? Number(totalSavings(account)) / 1e6 : 0
  const now = Date.now() / 1000

  // Goals live in the agent backend, behind the wallet sign-in: load silently if already signed in, else on request.
  const load = useCallback(async () => {
    try {
      setGoals((await agentApi.profile(address)).goals ?? [])
    } catch (e) {
      toast.error(errorText(e))
    }
  }, [address])
  useEffect(() => {
    if (hasAgentSession(address)) void load()
  }, [address, load])

  const save = async (next: Goal[]) => {
    setSaving(true)
    try {
      setGoals((await agentApi.saveGoals(address, next)).goals)
      return true
    } catch (e) {
      toast.error(t('goals.saveFailed'), { description: errorText(e) })
      return false
    } finally {
      setSaving(false)
    }
  }

  const used = (goals ?? []).reduce((s, g) => s + g.share, 0)
  const add = async () => {
    const goal: Goal = {
      id: '',
      name: draft.name.trim(),
      target: Number(draft.target.replace(',', '.')),
      share: Number(draft.share),
      deadline: draft.date ? Math.floor(new Date(`${draft.date}T23:59:59`).getTime() / 1000) : 0,
      createdAt: 0,
    }
    if (await save([...(goals ?? []), goal])) setDraft(EMPTY)
  }
  const valid = draft.name.trim() !== '' && Number(draft.target.replace(',', '.')) > 0 && Number(draft.share) >= 1 && Number(draft.share) + used <= 100

  const share = async (g: Goal) => {
    const held = (saved * g.share) / 100
    const blob = await renderShareCard(
      {
        image: '/landing/save.jpg',
        label: t('goals.cardLabel'),
        status: g.deadline ? t('goals.until', { date: formatDate(BigInt(g.deadline), locale) }) : t('goals.noDeadline'),
        title: g.name,
        amount: formatMoney(tokenUnits(held), 'usdt', rates, locale),
        amountOf: t('goals.ofTarget', { target: formatMoney(tokenUnits(g.target), 'usdt', rates, locale) }),
        progress: Math.min(1, held / g.target),
        done: held >= g.target,
        meta: t('goals.cardMeta'),
        cta: t('goals.cardCta'),
        link: `${window.location.origin}/pay/${address}`,
        scanHint: t('goals.cardScan'),
      },
      'post',
    )
    const file = new File([blob], 'coinai-goal.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: g.name }).catch(() => {})
    else {
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: 'coinai-goal.png' })
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TargetIcon className="size-5 text-gold-ink" />
          {t('goals.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('goals.caption')}</p>
        {goals === null ? (
          <Button variant="outline" onClick={() => void load()}>
            {t('goals.load')}
          </Button>
        ) : (
          <>
            {goals.length === 0 && <p className="text-sm text-muted-foreground">{t('goals.empty')}</p>}
            <ul className="space-y-3">
              {goals.map((g) => {
                const held = (saved * g.share) / 100
                const pct = Math.min(100, (held / g.target) * 100)
                const daysLeft = g.deadline ? Math.ceil((g.deadline - now) / 86400) : null
                return (
                  <li key={g.id} className="space-y-2 rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('goals.shareOf', { pct: g.share })}
                          {daysLeft !== null && ` · ${daysLeft > 0 ? t('goals.daysLeft', { n: daysLeft }) : t('goals.overdue')}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="icon-sm" variant="ghost" aria-label={t('goals.share')} onClick={() => void share(g)}>
                          <Share2Icon />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t('goals.remove')}
                          disabled={saving}
                          onClick={() => void save(goals.filter((x) => x.id !== g.id))}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-primary' : 'bg-gold')} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {money(held)} / {money(g.target)} · {Math.floor(pct)}%
                    </p>
                  </li>
                )
              })}
            </ul>
            {goals.length < 6 && (
              <div className="grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-[2fr_1fr_1fr_1.3fr_auto]">
                <Input placeholder={t('goals.namePlaceholder')} aria-label={t('goals.name')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Input inputMode="decimal" placeholder={t('goals.targetPlaceholder')} aria-label={t('goals.target')} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
                <Input
                  inputMode="numeric"
                  placeholder={t('goals.sharePlaceholder', { left: 100 - used })}
                  aria-label={t('goals.shareLabel')}
                  value={draft.share}
                  onChange={(e) => setDraft({ ...draft, share: e.target.value.replace(/\D/g, '') })}
                />
                <Input type="date" aria-label={t('goals.deadline')} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                <Button disabled={saving || !valid} onClick={() => void add()}>
                  {saving ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                  {t('goals.add')}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('goals.note')}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── C2 badges + streak ──────────────────────────────────────────────────────

function BadgesCard({ address, rewards }: { address: string; rewards: Rewards | null }) {
  const t = useT()
  const { locale } = useSettings()
  const { busy, runAction } = useAppState()
  const [state, setState] = useState<BadgeState | null>(null)
  const load = useCallback(() => {
    getBadges(address).then(setState).catch(() => setState(null))
  }, [address])
  useEffect(load, [load])

  const earned = state?.earnedAt.filter((x) => x > 0).length ?? 0

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AwardIcon className="size-5 text-gold-ink" />
            {t('badge.title')}
          </span>
          <span className="text-sm font-normal text-muted-foreground tabular-nums">{earned}/6</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
          <FlameIcon className={cn('size-6', (rewards?.streakWeeks ?? 0) > 0 ? 'text-gold-ink' : 'text-muted-foreground')} />
          <div>
            <p className="font-medium">{t('badge.streak', { n: rewards?.streakWeeks ?? 0 })}</p>
            <p className="text-xs text-muted-foreground">{t('badge.streakHint', { best: rewards?.bestStreak ?? 0 })}</p>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {BADGES.map((b) => {
            const at = state?.earnedAt[b.id] ?? 0
            const canClaim = b.claimable && !at && state?.eligible[b.id]
            return (
              <li key={b.id} className={cn('flex items-start gap-3 rounded-xl border p-3', at ? 'border-gold/50 bg-gold/5' : 'opacity-80')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', at ? 'bg-gold text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  <AwardIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t(b.title)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {at ? t('badge.earnedOn', { date: formatDate(BigInt(at), locale) }) : t(b.how)}
                  </span>
                </span>
                {canClaim && (
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void runAction(`badge-${b.id}`, 'success.badgeClaimed', () => claimBadge(b.id)).then((r) => r && load())}
                  >
                    {busy === `badge-${b.id}` && <Loader2Icon className="mr-1 size-4 animate-spin" />}
                    {t('badge.claim')}
                  </Button>
                )}
                {!at && !b.claimable && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t('badge.byAgent')}
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t('badge.note')}</p>
      </CardContent>
    </Card>
  )
}

// ─── C4 referrals ────────────────────────────────────────────────────────────

function ReferralCard({ address, rewards }: { address: string; rewards: Rewards | null }) {
  const t = useT()
  const link = `${window.location.origin}/pay/${address}`
  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success(t('settings.copied'))
  }
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GiftIcon className="size-5 text-gold-ink" />
          {t('referral.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('referral.points')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{rewards?.points ?? 0}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('referral.friends')}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{rewards?.referrals ?? 0}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('referral.how')}</p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-xl border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">{link}</p>
          <Button className="shrink-0" onClick={() => void copy()}>
            <CopyIcon />
            {t('paylink.copy')}
          </Button>
        </div>
        {rewards?.referredBy && (
          <p className="text-xs text-muted-foreground">
            {t('referral.joinedVia', { addr: `${rewards.referredBy.slice(0, 6)}…${rewards.referredBy.slice(-4)}` })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function RewardsPage() {
  const t = useT()
  const { address } = useWallet()
  const [rewards, setRewards] = useState<Rewards | null>(null)
  useEffect(() => {
    setRewards(null)
    if (address) publicApi.rewards(address).then(setRewards).catch(() => setRewards(null))
  }, [address])
  if (!address) return <ConnectPrompt />
  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.rewards')} caption={t('page.rewardsCaption')} />
      <GoalsCard address={address} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BadgesCard address={address} rewards={rewards} />
        <ReferralCard address={address} rewards={rewards} />
      </div>
    </section>
  )
}
