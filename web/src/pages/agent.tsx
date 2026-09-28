import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BellIcon,
  BotIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  SendIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ActivityList } from '@/components/activity-list'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { ProjectionCard } from '@/components/projection-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { agentApi, autopilot, hasAgentSession, type AgentRun, type AgentStep, type Subscription } from '@/lib/agent-api'
import { AGENT_ROLES, agentRoleFor } from '@/lib/agent-roles'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { AGENT_ADDRESS, explorerTxUrl } from '@/lib/config'
import { formatDate, formatDateTime, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { AgentPolicy, YieldTarget } from '@/lib/types'
import { useWallet } from '@/lib/wallet'

const DURATIONS = [7, 30, 90]
const DEFAULT_RANGE: [number, number] = [10, 40]

const OUTCOME: Record<AgentStep['outcome'], { label: MessageKey; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  analyzed: { label: 'agent.outcomeAnalyzed', variant: 'secondary' },
  proposed: { label: 'agent.outcomeProposed', variant: 'outline' },
  skipped: { label: 'agent.outcomeSkipped', variant: 'secondary' },
  rejected: { label: 'agent.outcomeRejected', variant: 'destructive' },
  approved: { label: 'agent.outcomeApproved', variant: 'secondary' },
  executed: { label: 'agent.outcomeExecuted', variant: 'default' },
  failed: { label: 'agent.outcomeFailed', variant: 'destructive' },
}

const VAULT_NAME_KEY: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function isActive(policy: AgentPolicy | null): boolean {
  return (
    !!policy?.agent &&
    !!AGENT_ADDRESS &&
    policy.agent.toLowerCase() === AGENT_ADDRESS.toLowerCase() &&
    Number(policy.expiry) * 1000 > Date.now()
  )
}

// ─── Permission ──────────────────────────────────────────────────────────────

function PermissionCard({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const { busy, runAction } = useAppState()
  const [policy, setPolicy] = useState<AgentPolicy | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [days, setDays] = useState(30)
  const anyBusy = busy !== null

  const [autopilotOn, setAutopilotOn] = useState(false)
  const load = useCallback(() => {
    coinai.getAgent(address).then(setPolicy).catch(() => setPolicy(null))
  }, [address])
  useEffect(load, [load])

  const active = isActive(policy)
  // Enroll in the daily run whenever the agent is authorized (idempotent; covers earlier enablers too).
  useEffect(() => {
    if (active) void autopilot.register(address).then(setAutopilotOn)
    else setAutopilotOn(false)
  }, [active, address])
  const [min, max] =
    range ?? (active && policy ? [policy.minSplitBps / 100, policy.maxSplitBps / 100] : DEFAULT_RANGE)

  const handleEnable = async () => {
    const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86_400)
    const ok = await runAction('agent-set', 'success.agentEnabled', () =>
      coinai.setAgent(address, AGENT_ADDRESS, min * 100, max * 100, expiry),
    )
    if (ok) {
      setRange(null)
      load()
    }
  }

  const handleRevoke = async () => {
    if (await runAction('agent-revoke', 'success.agentRevoked', () => coinai.revokeAgent(address))) load()
  }

  const status = active
    ? t('agent.statusActive', { date: formatDate(policy!.expiry, locale), min: policy!.minSplitBps / 100, max: policy!.maxSplitBps / 100 })
    : policy?.agent
      ? t('agent.statusExpired')
      : t('agent.statusOff')

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <BotIcon className="size-5 text-gold-ink" />
            {t('agent.permissionTitle')}
          </span>
          {active && (
            <Badge variant="secondary" className="bg-gold/15 text-[10px] text-gold-ink">
              {t('yield.badgeActive')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{status}</p>
        {active && autopilotOn && (
          <p className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            {t('agent.autopilotOn')}
          </p>
        )}
        {!AGENT_ADDRESS ? (
          <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">{t('agent.notConfigured')}</p>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{t('agent.rangeLabel')}</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">
                  {min}% – {max}%
                </p>
              </div>
              <Slider
                value={[min, max]}
                min={0}
                max={100}
                step={1}
                minStepsBetweenThumbs={0}
                disabled={anyBusy}
                onValueChange={(v) => setRange([v[0], v[1]])}
              />
              <p className="text-sm text-muted-foreground">{t('agent.rangeHint', { min, max })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('agent.durationLabel')}</p>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={days === d ? 'default' : 'outline'}
                    disabled={anyBusy}
                    onClick={() => setDays(d)}
                  >
                    {t('agent.days', { n: d })}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={anyBusy} onClick={() => void handleEnable()}>
                {busy === 'agent-set' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                {active ? t('agent.updateButton') : t('agent.enableButton')}
              </Button>
              {policy?.agent && (
                <Button variant="outline" disabled={anyBusy} onClick={() => void handleRevoke()}>
                  {busy === 'agent-revoke' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                  {t('agent.revokeButton')}
                </Button>
              )}
            </div>
          </>
        )}
        <Separator />
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
          {t('agent.guardrailNote')}
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export function StepRow({ step }: { step: AgentStep }) {
  const t = useT()
  const role = agentRoleFor(step.agent)
  const outcome = OUTCOME[step.outcome]
  const p = step.proposal
  const title = p
    ? p.kind === 'set_split'
      ? t('agent.proposalSplit', { pct: (p.bps ?? 0) / 100 })
      : t('agent.proposalInvest', { amount: p.amount ?? '', vault: t(VAULT_NAME_KEY[p.target ?? 'balanced']) })
    : null
  const detail = step.note || p?.reason
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
        <role.icon className="size-4 text-accent-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{t(role.name)}</span>
          <Badge variant={outcome.variant} className="text-[10px]">
            {t(outcome.label)}
          </Badge>
        </div>
        {title && <p className="text-sm">{title}</p>}
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        {step.txHash && (
          <a
            href={explorerTxUrl(step.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
          >
            {t('common.viewTx')} <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
    </li>
  )
}

function RunCard({
  address,
  run,
  onRun,
  remoteRunning,
}: {
  address: string
  run: AgentRun | null
  onRun: (run: AgentRun) => void
  remoteRunning: boolean
}) {
  const t = useT()
  const { locale } = useSettings()
  const [localRunning, setRunning] = useState(false)
  const running = localRunning || remoteRunning

  const handleRun = async () => {
    setRunning(true)
    try {
      onRun(await agentApi.run(address, locale))
    } catch (e) {
      toast.error(t('agent.runFailed'), { description: errorText(e) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agent.runTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('agent.runCaption')}</p>
        {remoteRunning && !localRunning && (
          <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">{t('agent.stillRunning')}</p>
        )}
        <Button className="w-full" disabled={running} onClick={() => void handleRun()}>
          {running ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <BotIcon className="mr-2 size-4" />}
          {running ? t('agent.running') : t('agent.runButton')}
        </Button>
        {run ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t('agent.lastRun', { time: formatDateTime(new Date(run.at), locale) })}
            </p>
            {run.steps.length > 0 && <ul className="divide-y">{run.steps.map((s, i) => <StepRow key={i} step={s} />)}</ul>}
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agent.reportTitle')}</p>
              <p className="mt-1 text-sm whitespace-pre-line">{run.report}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('agent.noRun')}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Notifications ───────────────────────────────────────────────────────────

export function NotificationsCard({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const [sub, setSub] = useState<Subscription>(null)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  // Only read the subscription when already signed in, so opening the page never pops a signature.
  useEffect(() => {
    if (!hasAgentSession(address)) return
    agentApi.subscription(address).then((r) => setSub(r.subscription)).catch(() => {})
  }, [address])

  const act = async (key: string, fn: () => Promise<void>) => {
    setPending(key)
    try {
      await fn()
    } catch (e) {
      toast.error(t('agent.notifyFailed'), { description: errorText(e) })
    } finally {
      setPending(null)
    }
  }

  const connectTelegram = () =>
    act('telegram', async () => {
      const { link } = await agentApi.telegramLink(address, locale)
      window.open(link, '_blank', 'noopener,noreferrer')
      toast.success(t('agent.telegramHint'))
    })

  const saveEmail = () =>
    act('email', async () => {
      setSub((await agentApi.subscribeEmail(address, email.trim(), locale)).subscription)
      setEmail('')
      toast.success(t('agent.notifySaved'))
    })

  const remove = (channel: 'email' | 'telegram') =>
    act(`remove-${channel}`, async () => {
      setSub((await agentApi.unsubscribe(address, channel)).subscription)
      toast.success(t('agent.notifySaved'))
    })

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-5 text-gold-ink" />
          {t('agent.notifyTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('agent.notifyCaption')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <SendIcon className="size-4" />
            {t('agent.telegram')}
            {sub?.telegramChatId && (
              <Badge variant="secondary" className="bg-gold/15 text-[10px] text-gold-ink">
                {t('agent.telegramConnected')}
              </Badge>
            )}
          </span>
          {sub?.telegramChatId ? (
            <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void remove('telegram')}>
              {t('agent.remove')}
            </Button>
          ) : (
            <Button size="sm" disabled={pending !== null} onClick={() => void connectTelegram()}>
              {pending === 'telegram' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {t('agent.telegramConnect')}
            </Button>
          )}
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MailIcon className="size-4" />
            {t('agent.email')}
          </span>
          {sub?.email ? (
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm text-muted-foreground">{sub.email}</span>
              <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void remove('email')}>
                {t('agent.remove')}
              </Button>
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void saveEmail()
              }}
            >
              <Input
                type="email"
                required
                value={email}
                placeholder={t('agent.emailPlaceholder')}
                aria-label={t('agent.email')}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={pending !== null || !email.trim()}>
                {pending === 'email' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                {t('agent.save')}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Team ────────────────────────────────────────────────────────────────────

function TeamCard() {
  const t = useT()
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agent.teamTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_ROLES.map((r, i) => (
            <Link
              key={r.slug}
              to={`/app/agent/${r.slug}`}
              className="group flex flex-col gap-2 rounded-2xl border bg-card p-4 outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent">
                  <r.icon className="size-4 text-accent-foreground" />
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">0{i + 1}</span>
              </span>
              <span className="text-sm font-medium">{t(r.name)}</span>
              <span className="text-xs text-muted-foreground">{t(r.tagline)}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AgentPage() {
  const t = useT()
  const { address } = useWallet()
  const { activity, activityLoading, refresh } = useAppState()
  const [run, setRun] = useState<AgentRun | null>(null)
  const [remoteRunning, setRemoteRunning] = useState(false)

  // Show the last run only if already signed in; a fresh visitor isn't asked to sign on page load.
  // If a run started earlier is still going (e.g. the page was closed mid-run), poll until it lands.
  useEffect(() => {
    setRun(null)
    setRemoteRunning(false)
    if (!address || !hasAgentSession(address)) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async (wasRunning: boolean) => {
      const r = await agentApi.history(address).catch(() => null)
      if (!alive || !r) return
      setRun(r.runs[0] ?? null)
      setRemoteRunning(r.running)
      if (r.running) timer = setTimeout(() => void poll(true), 4000)
      else if (wasRunning) void refresh()
    }
    void poll(false)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [address, refresh])

  if (!address) return <ConnectPrompt />

  const handleRun = (next: AgentRun) => {
    setRun(next)
    void refresh() // every run lands in Activity, even one that changed nothing on-chain
  }

  const decisions = activity.filter((item) => ['agent', 'run', 'agent_on', 'agent_off'].includes(item.kind))

  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.agent')} caption={t('page.agentCaption')} />
      <PermissionCard address={address} />
      <TeamCard />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <RunCard address={address} run={run} onRun={handleRun} remoteRunning={remoteRunning} />
        <ProjectionCard address={address} />
      </div>
      <NotificationsCard address={address} />
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('agent.logTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!activityLoading && decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('agent.logEmpty')}</p>
          ) : (
            <ActivityList items={decisions} loading={activityLoading} />
          )}
        </CardContent>
      </Card>
    </section>
  )
}
