import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectPrompt } from '@/components/connect-prompt'
import { DecisionCard } from '@/components/decision-card'
import { MarketAnalysisCard, MarketBoard } from '@/components/market-board'
import { NotFoundContent } from '@/components/not-found-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { YieldSourcesCard } from '@/components/yield-sources-card'
import { agentApi, hasAgentSession, type AgentRun, type InvestorProfile } from '@/lib/agent-api'
import { AGENT_ROLES, type AgentRole } from '@/lib/agent-roles'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/config'
import { formatDate, formatDateTime, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { YIELD_TARGETS, type AgentPolicy, type YieldTarget } from '@/lib/types'
import { useMarket } from '@/lib/use-market'
import { useYieldData } from '@/lib/use-yield-data'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { NotificationsCard, StepRow } from '@/pages/agent'

const VAULT_NAME_KEY: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Runs live behind the wallet-signed session; only auto-load when one already exists.
function useAgentRuns(address: string) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRuns((await agentApi.history(address)).runs)
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [address])
  useEffect(() => {
    if (hasAgentSession(address)) void load()
  }, [address, load])
  return { runs, loading, load }
}

function usePolicy(address: string) {
  const [policy, setPolicy] = useState<AgentPolicy | null>(null)
  useEffect(() => {
    coinai.getAgent(address).then(setPolicy).catch(() => setPolicy(null))
  }, [address])
  return policy
}

// ─── Shared cards ────────────────────────────────────────────────────────────

function AboutCard({ role }: { role: AgentRole }) {
  const t = useT()
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="grid gap-5 md:grid-cols-3">
        <p className="text-sm leading-relaxed md:col-span-3">{t(role.body)}</p>
        <div className="md:col-span-1">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agentRole.readsLabel')}</p>
          <p className="mt-1 text-sm">{t(role.reads)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agentRole.limitsLabel')}</p>
          <p className="mt-1 text-sm">{t(role.limits)}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function HistoryCard({
  role,
  runs,
  loading,
  onLoad,
}: {
  role: AgentRole
  runs: AgentRun[] | null
  loading: boolean
  onLoad: () => void
}) {
  const t = useT()
  const { locale } = useSettings()
  const rows = (runs ?? []).flatMap((run) => run.steps.filter((s) => s.agent === role.step).map((step) => ({ run, step }))).slice(0, 12)
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agentRole.historyTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {runs === null ? (
          <Button variant="outline" disabled={loading} onClick={onLoad}>
            {loading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {t('agentRole.loadHistory')}
          </Button>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('agentRole.historyEmpty')}</p>
        ) : (
          <div className="divide-y">
            {rows.map(({ run, step }, i) => (
              <div key={i}>
                <p className="pt-2 text-[11px] text-muted-foreground">{formatDateTime(new Date(run.at), locale)}</p>
                <ul>
                  <StepRow step={step} />
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Role-specific panels ────────────────────────────────────────────────────

function MarketPanel() {
  const { market, analysis, loading, error, refresh } = useMarket()
  return (
    <>
      <MarketBoard market={market} loading={loading} error={error} onRefresh={() => void refresh()} />
      <MarketAnalysisCard analysis={analysis} />
    </>
  )
}

function SavingsPanel({ address }: { address: string }) {
  const t = useT()
  const { account } = useAppState()
  const policy = usePolicy(address)
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agentRole.currentSplit')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{account ? `${account.splitBps / 100}%` : '-'}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agent.rangeLabel')}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {policy?.agent ? `${policy.minSplitBps / 100}% – ${policy.maxSplitBps / 100}%` : '-'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

const RISKS: InvestorProfile['risk'][] = ['conservative', 'moderate', 'aggressive']
const HORIZONS: InvestorProfile['horizon'][] = ['short', 'medium', 'long']

function ProfileCard({ address }: { address: string }) {
  const t = useT()
  const [profile, setProfile] = useState<InvestorProfile>({ risk: 'moderate', horizon: 'medium', goal: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!hasAgentSession(address)) return
    agentApi.profile(address).then((r) => setProfile(r.profile)).catch(() => {})
  }, [address])

  const save = async () => {
    setSaving(true)
    try {
      setProfile((await agentApi.saveProfile(address, profile)).profile)
      toast.success(t('agentRole.profileSaved'))
    } catch (e) {
      toast.error(t('agentRole.profileFailed'), { description: errorText(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agentRole.profileTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('agentRole.profileCaption')}</p>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('agentRole.riskLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {RISKS.map((r) => (
              <Button key={r} size="sm" variant={profile.risk === r ? 'default' : 'outline'} onClick={() => setProfile((p) => ({ ...p, risk: r }))}>
                {t(`agentRole.risk_${r}` as MessageKey)}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('agentRole.horizonLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {HORIZONS.map((h) => (
              <Button key={h} size="sm" variant={profile.horizon === h ? 'default' : 'outline'} onClick={() => setProfile((p) => ({ ...p, horizon: h }))}>
                {t(`agentRole.horizon_${h}` as MessageKey)}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="goal" className="text-sm font-medium">
            {t('agentRole.goalLabel')}
          </label>
          <Input
            id="goal"
            value={profile.goal}
            maxLength={140}
            placeholder={t('agentRole.goalPlaceholder')}
            onChange={(e) => {
              const goal = e.target.value
              setProfile((p) => ({ ...p, goal }))
            }}
          />
        </div>
        <Button disabled={saving} onClick={() => void save()}>
          {saving && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {t('agent.save')}
        </Button>
      </CardContent>
    </Card>
  )
}

function InvestmentPanel({ address, runs }: { address: string; runs: AgentRun[] | null }) {
  const { rates } = useAppState()
  const { account } = useAppState()
  const { vaults, loading } = useYieldData(address)
  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ProfileCard address={address} />
        <DecisionCard runs={runs} vaults={vaults} />
      </div>
      <YieldSourcesCard vaults={vaults} loading={loading} rates={rates} selectedTarget={account?.yieldTarget} readOnly />
    </>
  )
}

function GuardrailsPanel({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const { account } = useAppState()
  const policy = usePolicy(address)
  const { vaults } = useYieldData(address)
  const locked = account && Number(account.lockUntil) * 1000 > Date.now()
  const rules: { label: MessageKey; value: string }[] = [
    { label: 'agent.rangeLabel', value: policy?.agent ? `${policy.minSplitBps / 100}% – ${policy.maxSplitBps / 100}%` : t('agentRole.notSet') },
    { label: 'agentRole.expiresLabel', value: policy?.agent ? formatDate(policy.expiry, locale) : t('agentRole.notSet') },
    { label: 'agentRole.lockLabel', value: locked ? formatDate(account!.lockUntil, locale) : t('agentRole.unlocked') },
  ]
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agentRole.rulesTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          {rules.map((r) => (
            <div key={r.label} className="rounded-xl border p-3">
              <dt className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t(r.label)}</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agentRole.vaultWhitelist')}</p>
          <ul className="mt-2 space-y-1.5">
            {YIELD_TARGETS.map((target) => (
              <li key={target} className="flex items-center justify-between gap-3 text-sm">
                {t(VAULT_NAME_KEY[target])}
                {vaults?.[target].address ? (
                  <a
                    href={explorerAddressUrl(vaults[target].address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-primary-ink hover:underline"
                  >
                    {vaults[target].address.slice(0, 6)}…{vaults[target].address.slice(-4)}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-1.5 border-t pt-3 text-sm text-muted-foreground">
          {(['agentRole.rule1', 'agentRole.rule2', 'agentRole.rule3', 'agentRole.rule4'] as MessageKey[]).map((k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden="true">•</span>
              {t(k)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RiskPanel({ runs }: { runs: AgentRun[] | null }) {
  const t = useT()
  const reviews = (runs ?? []).flatMap((r) => r.steps.filter((s) => s.agent === 'risk' && s.proposal))
  const approved = reviews.filter((s) => s.outcome === 'approved').length
  const vetoed = reviews.filter((s) => s.outcome === 'rejected').length
  return (
    <Card className="rounded-2xl shadow-none">
      <CardContent className="grid grid-cols-2 gap-4">
        {[
          { label: 'agentRole.approved' as MessageKey, value: approved, tone: 'text-primary-ink' },
          { label: 'agentRole.vetoed' as MessageKey, value: vetoed, tone: 'text-destructive' },
        ].map((x) => (
          <div key={x.label}>
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t(x.label)}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', x.tone)}>{runs ? x.value : '-'}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ExecutorPanel({ runs }: { runs: AgentRun[] | null }) {
  const t = useT()
  const { locale } = useSettings()
  const txs = (runs ?? []).flatMap((r) => r.executed.map((e) => ({ ...e, at: r.at }))).slice(0, 10)
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('agentRole.txTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('agentRole.txEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {txs.map((tx) => (
              <li key={tx.txHash} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(tx.kind === 'set_split' ? 'agentRole.txSplit' : 'agentRole.txInvest')}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{tx.reason}</p>
                </div>
                <a
                  href={explorerTxUrl(tx.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-primary-ink hover:underline"
                >
                  {formatDateTime(new Date(tx.at), locale)}
                  <ExternalLinkIcon className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ReporterPanel({ address, runs, loading, onLoad }: { address: string; runs: AgentRun[] | null; loading: boolean; onLoad: () => void }) {
  const t = useT()
  const { locale } = useSettings()
  const last = runs?.[0]
  return (
    <>
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            {t('agentRole.latestReport')}
            {last && <Badge variant="secondary" className="text-[10px]">{formatDateTime(new Date(last.at), locale)}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs === null ? (
            <Button variant="outline" disabled={loading} onClick={onLoad}>
              {loading && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              {t('agentRole.loadHistory')}
            </Button>
          ) : last ? (
            <>
              <p className="text-sm whitespace-pre-line">{last.report}</p>
              {last.reminders.length > 0 && (
                <ul className="space-y-1 border-t pt-3 text-sm text-muted-foreground">
                  {last.reminders.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('agent.noRun')}</p>
          )}
        </CardContent>
      </Card>
      <NotificationsCard address={address} />
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

function RoleView({ role, address }: { role: AgentRole; address: string }) {
  const t = useT()
  const { runs, loading, load } = useAgentRuns(address)
  const history = () => void load()

  return (
    <section className="space-y-5">
      <Link to="/app/agent" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t('agentRole.backToTeam')}
      </Link>
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent">
          <role.icon className="size-5 text-accent-foreground" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t(role.name)}</h2>
          <p className="text-sm text-muted-foreground">{t(role.tagline)}</p>
        </div>
      </header>
      <AboutCard role={role} />
      {role.slug === 'market' && <MarketPanel />}
      {role.slug === 'savings' && <SavingsPanel address={address} />}
      {role.slug === 'investment' && <InvestmentPanel address={address} runs={runs} />}
      {role.slug === 'guardrails' && <GuardrailsPanel address={address} />}
      {role.slug === 'risk' && <RiskPanel runs={runs} />}
      {role.slug === 'executor' && <ExecutorPanel runs={runs} />}
      {role.slug === 'reporter' && <ReporterPanel address={address} runs={runs} loading={loading} onLoad={history} />}
      {role.step && <HistoryCard role={role} runs={runs} loading={loading} onLoad={history} />}
    </section>
  )
}

export function AgentRolePage() {
  const { role: slug } = useParams()
  const { address } = useWallet()
  const role = AGENT_ROLES.find((r) => r.slug === slug)
  if (!role) return <NotFoundContent />
  if (!address) return <ConnectPrompt />
  return <RoleView key={`${role.slug}:${address}`} role={role} address={address} />
}
