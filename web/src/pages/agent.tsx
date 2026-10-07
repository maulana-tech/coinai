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
import { Slider } from '@/components/ui/slider'
import { agentApi, isAgentActive as isActive, autopilot, hasAgentSession, runFailure, type AgentRun, type AgentStep, type Subscription } from '@/lib/agent-api'
import { AGENT_ROLES, agentRoleFor } from '@/lib/agent-roles'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { AGENT_ADDRESS, explorerTxUrl } from '@/lib/config'
import { formatDate, formatDateTime, formatMoney, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { parseToken, tokenToInput } from '@/lib/format'
import { getListings, hire, type Listing } from '@/lib/registry'
import { SKILL_INVEST, SKILL_PAY, SKILL_SPLIT, type AgentPolicy, type Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { POSITION_NAME } from '@/lib/yield'
import { useWallet } from '@/lib/wallet'

const DURATIONS = [7, 30, 90]

const OUTCOME: Record<AgentStep['outcome'], { label: MessageKey; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  analyzed: { label: 'agent.outcomeAnalyzed', variant: 'secondary' },
  proposed: { label: 'agent.outcomeProposed', variant: 'outline' },
  skipped: { label: 'agent.outcomeSkipped', variant: 'secondary' },
  rejected: { label: 'agent.outcomeRejected', variant: 'destructive' },
  approved: { label: 'agent.outcomeApproved', variant: 'secondary' },
  executed: { label: 'agent.outcomeExecuted', variant: 'default' },
  failed: { label: 'agent.outcomeFailed', variant: 'destructive' },
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))


// ─── Permission ──────────────────────────────────────────────────────────────

// Each skill is granted on-chain (CoinAIV2.setAgent) to the one agent wallet; the god names match the landing council.
const SKILLS: { bit: number; god: string; label: MessageKey; hint: MessageKey }[] = [
  { bit: SKILL_SPLIT, god: 'Demeter', label: 'agent.skillSplit', hint: 'agent.skillSplitHint' },
  { bit: SKILL_INVEST, god: 'Athena', label: 'agent.skillInvest', hint: 'agent.skillInvestHint' },
  { bit: SKILL_PAY, god: 'Hermes', label: 'agent.skillPay', hint: 'agent.skillPayHint' },
]
const PRESETS: { label: MessageKey; range: [number, number] }[] = [
  { label: 'agent.presetCareful', range: [10, 25] },
  { label: 'agent.presetBalanced', range: [10, 40] },
  { label: 'agent.presetAmbitious', range: [20, 60] },
]
const DEFAULT_SKILLS = SKILL_SPLIT | SKILL_INVEST
const DEFAULT_BUDGET = '10'
const EXAMPLE_PAYMENT = 100_000_000n // 100 tUSDT: the worked example under the split range

function PermissionCard({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { busy, rates, runAction } = useAppState()
  const [policy, setPolicy] = useState<AgentPolicy | null>(null)
  const [skills, setSkills] = useState<number | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const [budget, setBudget] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [others, setOthers] = useState<AgentPolicy[]>([])
  const anyBusy = busy !== null

  const [autopilotOn, setAutopilotOn] = useState(false)
  const load = useCallback(() => {
    coinai.getAgent(address, AGENT_ADDRESS).then(setPolicy).catch(() => setPolicy(null))
    coinai
      .listAgents(address)
      .then((list) => setOthers(list.filter((p) => p.agent && p.agent.toLowerCase() !== AGENT_ADDRESS.toLowerCase())))
      .catch(() => setOthers([]))
  }, [address])
  useEffect(load, [load])

  const active = isActive(policy)
  // Enroll in the daily run whenever the agent is authorized (idempotent; covers earlier enablers too).
  useEffect(() => {
    if (active) void autopilot.register(address).then(setAutopilotOn)
    else setAutopilotOn(false)
  }, [active, address])

  const granted = active && policy ? policy.skills : 0
  const picked = skills ?? (granted || DEFAULT_SKILLS)
  const [min, max] =
    range ?? (active && policy && policy.skills & SKILL_SPLIT ? [policy.minSplitBps / 100, policy.maxSplitBps / 100] : PRESETS[1].range)
  const budgetText = budget ?? (active && policy && policy.skills & SKILL_PAY ? tokenToInput(policy.payBudget) : DEFAULT_BUDGET)
  const budgetUnits = (() => {
    try {
      return parseToken(budgetText || '0')
    } catch {
      return null
    }
  })()
  const has = (bit: number) => (picked & bit) !== 0
  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)
  const invalid = picked === 0 || (has(SKILL_PAY) && (budgetUnits === null || budgetUnits <= 0n))

  const handleEnable = async () => {
    if (invalid || budgetUnits === null) return
    const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86_400)
    // without the split skill the range is meaningless; keep it valid (0–0) for the contract check
    const [lo, hi] = has(SKILL_SPLIT) ? [min * 100, max * 100] : [0, 0]
    const ok = await runAction('agent-set', 'success.agentEnabled', () =>
      coinai.setAgent(address, AGENT_ADDRESS, {
        skills: picked,
        minSplitBps: lo,
        maxSplitBps: hi,
        payBudget: has(SKILL_PAY) ? budgetUnits : 0n,
        expiry,
      }),
    )
    if (ok) {
      setSkills(null)
      setRange(null)
      setBudget(null)
      load()
    }
  }

  const handleRevoke = async (agent: string) => {
    if (await runAction(`agent-revoke-${agent}`, 'success.agentRevoked', () => coinai.revokeAgent(address, agent))) load()
  }

  const status = active
    ? t('agent.statusActiveV2', { date: formatDate(policy!.expiry, locale) })
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
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{status}</p>
          {active && policy && (
            <dl className="grid grid-cols-2 gap-4">
              {SKILLS.filter((s) => policy.skills & s.bit).map((s) => (
                <div key={s.bit}>
                  <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    {s.god} · {t(s.label)}
                  </dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums">
                    {s.bit === SKILL_SPLIT
                      ? `${policy.minSplitBps / 100}% – ${policy.maxSplitBps / 100}%`
                      : s.bit === SKILL_PAY
                        ? t('agent.budgetUsed', { used: money(policy.paidInWindow), budget: money(policy.payBudget) })
                        : t('agent.skillOn')}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {active && autopilotOn && (
            <p className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              {t('agent.autopilotOn')}
            </p>
          )}
          {has(SKILL_PAY) && <HermesHire address={address} />}
          {others.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agent.otherAgents')}</p>
              <ul className="space-y-1.5">
                {others.map((p) => (
                  <li key={p.agent} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono text-xs">
                      {p.agent!.slice(0, 6)}…{p.agent!.slice(-4)}
                      <span className="ml-2 font-sans text-muted-foreground">
                        {SKILLS.filter((s) => p.skills & s.bit).map((s) => t(s.label)).join(', ')}
                      </span>
                    </span>
                    <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => void handleRevoke(p.agent!)}>
                      {t('agent.revokeButton')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-auto flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
            {t('agent.guardrailNote')}
          </p>
        </div>
        {!AGENT_ADDRESS ? (
          <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">{t('agent.notConfigured')}</p>
        ) : (
          <div className="space-y-5 lg:border-l lg:pl-6">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('agent.skillsLabel')}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SKILLS.map((s) => (
                  <button
                    key={s.bit}
                    type="button"
                    aria-pressed={has(s.bit)}
                    disabled={anyBusy}
                    onClick={() => setSkills(picked ^ s.bit)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                      has(s.bit) ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-sm font-medium">
                      {s.god}
                      <span
                        className={cn('size-3.5 rounded-full border', has(s.bit) ? 'border-primary bg-primary' : 'border-muted-foreground/40')}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-xs font-medium">{t(s.label)}</span>
                    <span className="text-xs text-muted-foreground">{t(s.hint)}</span>
                  </button>
                ))}
              </div>
              {picked === 0 && <p className="text-xs text-destructive">{t('agent.skillsNone')}</p>}
            </div>
            {has(SKILL_SPLIT) && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{t('agent.rangeLabel')}</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {min}% – {max}%
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      type="button"
                      size="sm"
                      variant={min === p.range[0] && max === p.range[1] ? 'default' : 'outline'}
                      disabled={anyBusy}
                      onClick={() => setRange(p.range)}
                    >
                      {t(p.label)} · {p.range[0]}–{p.range[1]}%
                    </Button>
                  ))}
                </div>
                <Slider
                  value={[min, max]}
                  min={0}
                  max={100}
                  step={5}
                  minStepsBetweenThumbs={0}
                  disabled={anyBusy}
                  aria-label={t('agent.rangeLabel')}
                  onValueChange={(v) => setRange([v[0], v[1]])}
                />
                <p className="text-sm text-muted-foreground">
                  {t('agent.rangeExample', {
                    payment: money(EXAMPLE_PAYMENT),
                    min: money((EXAMPLE_PAYMENT * BigInt(min)) / 100n),
                    max: money((EXAMPLE_PAYMENT * BigInt(max)) / 100n),
                  })}
                </p>
              </div>
            )}
            {has(SKILL_PAY) && (
              <div className="space-y-1.5">
                <label htmlFor="pay-budget" className="text-sm font-medium">
                  {t('agent.budgetLabel')}
                </label>
                <div className="relative">
                  <Input
                    id="pay-budget"
                    inputMode="decimal"
                    value={budgetText}
                    disabled={anyBusy}
                    onChange={(e) => setBudget(e.target.value.replace(',', '.'))}
                    className="pr-16 tabular-nums"
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">tUSDT</span>
                </div>
                <p className={cn('text-xs', budgetUnits === null || budgetUnits <= 0n ? 'text-destructive' : 'text-muted-foreground')}>
                  {t('agent.budgetHint')}
                </p>
              </div>
            )}
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
              <Button disabled={anyBusy || invalid} onClick={() => void handleEnable()}>
                {busy === 'agent-set' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                {active ? t('agent.updateButton') : t('agent.enableButton')}
              </Button>
              {policy?.agent && (
                <Button variant="outline" disabled={anyBusy} onClick={() => void handleRevoke(AGENT_ADDRESS)}>
                  {busy === `agent-revoke-${AGENT_ADDRESS}` && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                  {t('agent.revokeButton')}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Hermes is listed in AgentRegistry for 1 tUSDT per 30 days; the backend only pays dues while he is hired.
function HermesHire({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const { busy, rates, runAction } = useAppState()
  const [listing, setListing] = useState<Listing | null>(null)
  const load = useCallback(() => {
    getListings(address)
      .then((all) => setListing(all.find((l) => l.name === 'Hermes' && l.active) ?? null))
      .catch(() => setListing(null))
  }, [address])
  useEffect(load, [load])
  if (!listing) return null

  const hiredUntil = Number(listing.rentedUntil) * 1000
  const hired = hiredUntil > Date.now()
  const handleHire = async () => {
    if (await runAction('hire', 'success.hired', () => hire(address, listing, 1))) load()
  }

  return (
    <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-medium">{t('agent.hermesTitle')}</p>
      <p className="text-xs text-muted-foreground">
        {hired
          ? t('agent.hermesHired', { date: formatDate(listing.rentedUntil, locale) })
          : t('agent.hermesNotHired', { fee: formatMoney(listing.feePer30Days, 'usdt', rates, locale) })}
      </p>
      <Button size="sm" variant={hired ? 'outline' : 'default'} disabled={busy !== null} onClick={() => void handleHire()}>
        {busy === 'hire' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
        {hired ? t('agent.hermesExtend') : t('agent.hermesHire')}
      </Button>
    </div>
  )
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export function StepRow({ step }: { step: AgentStep }) {
  const t = useT()
  const role = agentRoleFor(step.agent)
  const outcome = OUTCOME[step.outcome]
  const p = step.proposal
  const vault = (x: Position | undefined) => t(POSITION_NAME[x ?? 'balanced'])
  const title = !p
    ? null
    : p.kind === 'set_split'
      ? t('agent.proposalSplit', { pct: (p.bps ?? 0) / 100 })
      : p.kind === 'rebalance'
        ? t('agent.proposalRebalance', { amount: p.amount ?? '', from: vault(p.from), vault: vault(p.target) })
        : p.kind === 'contribute'
          ? t('agent.proposalContribute', { amount: p.amount ?? '', id: String(p.fundId ?? '') })
          : t('agent.proposalInvest', { amount: p.amount ?? '', vault: vault(p.target) })
  // An LLM failure reads as its cause in plain words; the raw provider message stays on hover.
  const detail = step.code ? t(`agent.llm_${step.code}` as MessageKey) : step.note || p?.reason
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent">
        <role.icon className="size-4 text-accent-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">
            {role.god} <span className="font-normal text-muted-foreground">· {t(role.name)}</span>
          </span>
          <Badge variant={outcome.variant} className="text-[10px]">
            {t(outcome.label)}
          </Badge>
        </div>
        {title && <p className="text-sm">{title}</p>}
        {detail && (
          <p className="text-xs text-muted-foreground" title={step.code ? step.note : undefined}>
            {detail}
          </p>
        )}
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
  const failure = run ? runFailure(run) : null

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
            {failure && (
              <div role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">{t(`agent.llm_${failure}` as MessageKey)}</p>
                <p className="mt-1 text-muted-foreground">{t('agent.llmNothingChanged')}</p>
              </div>
            )}
            {run.steps.length > 0 && (
              <ul className="max-h-96 divide-y overflow-y-auto pr-1">{run.steps.map((s, i) => <StepRow key={i} step={s} />)}</ul>
            )}
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
              <span className="text-sm font-medium">
                {r.god} <span className="font-normal text-muted-foreground">· {t(r.name)}</span>
              </span>
              <span className="text-xs text-muted-foreground">{t(r.tagline)}</span>
            </Link>
          ))}
          <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 p-4">
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agent.flowLabel')}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">{t('agent.runCaption')}</span>
          </div>
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
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
