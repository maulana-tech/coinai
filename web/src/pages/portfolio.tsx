import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BotIcon, Loader2Icon, LockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ActivityList } from '@/components/activity-list'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { agentApi, hasAgentSession, isAgentActive, type AgentRun, type InvestorProfile, type MarketAnalysis } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { AGENT_ADDRESS } from '@/lib/config'
import { formatDate, formatDateTime, formatMoney, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { YIELD_TARGETS, type AgentPolicy, type YieldTarget } from '@/lib/types'
import { useYieldData } from '@/lib/use-yield-data'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { VAULT_LOGO } from '@/lib/yield'

const VAULT_NAME: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}
const REGIME: Record<MarketAnalysis['regime'], MessageKey> = {
  risk_on: 'market.regimeRiskOn',
  neutral: 'market.regimeNeutral',
  risk_off: 'market.regimeRiskOff',
}
const MIN_INVEST = 1_000_000n // mirrors the backend: under 1 tUSDT the agent doesn't invest
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Bar({ pct, muted }: { pct: number; muted?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', muted ? 'bg-gold' : 'bg-primary')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function Portfolio({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { account, activity, activityLoading, rates, refresh } = useAppState()
  const { vaults, loading: vaultsLoading, refresh: refreshVaults } = useYieldData(address)
  const [policy, setPolicy] = useState<AgentPolicy | null>(null)
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [profile, setProfile] = useState<InvestorProfile | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    coinai.getAgent(address).then(setPolicy).catch(() => setPolicy(null))
  }, [address])

  // The plan lives in the agent backend; load it silently if already signed in, else on request.
  const loadPlan = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([agentApi.history(address), agentApi.profile(address)])
      setRuns(h.runs)
      setProfile(p.profile)
    } catch (e) {
      toast.error(errorText(e))
    }
  }, [address])
  useEffect(() => {
    if (hasAgentSession(address)) void loadPlan()
  }, [address, loadPlan])

  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)
  const invested = vaults ? YIELD_TARGETS.reduce((s, k) => s + vaults[k].position, 0n) : 0n
  const idle = account?.shares ?? 0n
  const locked = !!account && Number(account.lockUntil) * 1000 > Date.now()
  const agentOn = isAgentActive(policy)
  const plan = runs?.find((r) => r.allocation) ?? null
  const reason = plan?.steps.find((s) => s.agent === 'investment' && s.proposal)?.proposal?.reason
  const buffer = plan?.allocation ? Math.max(0, 100 - YIELD_TARGETS.reduce((s, k) => s + plan.allocation![k], 0)) : 0
  const investHistory = activity.filter((i) => i.kind === 'agent' && i.agentAction === 'invest')

  const apply = async () => {
    setRunning(true)
    try {
      const run = await agentApi.run(address, locale)
      setRuns((r) => [run, ...(r ?? [])])
      void refresh()
      void refreshVaults()
      toast.success(t('portfolio.applied', { n: run.executed.length }))
    } catch (e) {
      toast.error(t('agent.runFailed'), { description: errorText(e) })
    } finally {
      setRunning(false)
    }
  }

  // One clear next step, in priority order.
  const action = (() => {
    if (!AGENT_ADDRESS || !account) return null
    if (!agentOn)
      return (
        <Button asChild className="rounded-full">
          <Link to="/app/agent">{t('portfolio.enableAgent')}</Link>
        </Button>
      )
    const blockedBy = locked
      ? t('portfolio.waitLock', { date: account ? formatDate(account.lockUntil, locale) : '' })
      : idle < MIN_INVEST
        ? t('portfolio.nothingIdle')
        : null
    return (
      <div className="space-y-2">
        <Button className="rounded-full" disabled={running || !!blockedBy} onClick={() => void apply()}>
          {running ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : <BotIcon className="mr-2 size-4" />}
          {running ? t('agent.running') : t('portfolio.apply')}
        </Button>
        {blockedBy && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            {locked && <LockIcon className="mt-0.5 size-3 shrink-0" />}
            {blockedBy}
          </p>
        )}
      </div>
    )
  })()

  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.portfolio')} caption={t('page.portfolioCaption')} />

      {/* Status */}
      <Card className="rounded-2xl shadow-none">
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label={t('portfolio.total')} value={account && vaults ? money(idle + invested) : '-'} />
          <Stat label={t('portfolio.invested')} value={vaults ? money(invested) : '-'} />
          <Stat label={t('portfolio.idle')} value={account ? money(idle) : '-'} />
          <Stat
            label={t('portfolio.agent')}
            value={agentOn ? t('portfolio.agentOn') : t('portfolio.agentOff')}
            note={
              locked
                ? t('portfolio.lockedUntil', { date: formatDate(account!.lockUntil, locale) })
                : agentOn
                  ? t('portfolio.schedule')
                  : undefined
            }
          />
          </div>
          {action && <div className="border-t pt-4">{action}</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {/* Plan vs position */}
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>{t('portfolio.planTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!vaults && vaultsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !vaults ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('yield.targetUnavailable')}</p>
                <Button variant="outline" size="sm" onClick={() => void refreshVaults()}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : (
              <>
                {YIELD_TARGETS.map((k) => {
                  const actual = invested > 0n ? Number((vaults[k].position * 10_000n) / invested) / 100 : 0
                  const target = plan?.allocation?.[k]
                  return (
                    <div key={k} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <img src={VAULT_LOGO[k]} alt="" className="size-5 rounded-full" />
                        <span className="flex-1 font-medium">{t(VAULT_NAME[k])}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{t('yield.apyValue', { apy: `${Math.round(vaults[k].apy * 100)}%` })}</span>
                      </div>
                      <div className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{t('portfolio.planLabel')}</span>
                        <Bar pct={target ?? 0} muted />
                        <span className="text-right tabular-nums">{target === undefined ? '-' : `${target}%`}</span>
                        <span className="text-muted-foreground">{t('portfolio.actualLabel')}</span>
                        <Bar pct={actual} />
                        <span className="text-right tabular-nums">{actual.toFixed(0)}%</span>
                      </div>
                      <p className="text-right text-xs text-muted-foreground tabular-nums">{money(vaults[k].position)}</p>
                    </div>
                  )
                })}
                <p className="text-xs text-muted-foreground">
                  {plan
                    ? t('portfolio.planMeta', { time: formatDateTime(new Date(plan.at), locale), buffer })
                    : runs === null
                      ? t('portfolio.planHidden')
                      : t('portfolio.planEmpty')}
                </p>
                {runs === null && (
                  <Button variant="outline" size="sm" onClick={() => void loadPlan()}>
                    {t('portfolio.loadPlan')}
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Why */}
        <Card className="rounded-2xl shadow-none">
          <CardHeader>
            <CardTitle>{t('portfolio.whyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {profile && (
              <div className="grid grid-cols-2 gap-4">
                <Stat label={t('agentRole.riskLabel')} value={t(`agentRole.risk_${profile.risk}` as MessageKey)} />
                <Stat label={t('agentRole.horizonLabel')} value={t(`agentRole.horizon_${profile.horizon}` as MessageKey)} />
                {profile.goal && <p className="col-span-2 text-muted-foreground">{profile.goal}</p>}
              </div>
            )}
            {plan?.market && (
              <div className="rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('proj.market')}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {t(REGIME[plan.market.regime])}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{plan.market.summary}</p>
              </div>
            )}
            {reason && (
              <div className="border-l-2 border-primary pl-3">
                <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('agent.roleInvestment')}</p>
                <p className="mt-1">{reason}</p>
              </div>
            )}
            {!profile && !plan && <p className="text-muted-foreground">{t('portfolio.whyEmpty')}</p>}
            <Link to="/app/agent/investment" className="inline-block text-xs text-primary-ink hover:underline">
              {t('portfolio.editProfile')}
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('portfolio.historyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!activityLoading && investHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('portfolio.historyEmpty')}</p>
          ) : (
            <ActivityList items={investHistory} loading={activityLoading} />
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function PortfolioPage() {
  const { address } = useWallet()
  if (!address) return <ConnectPrompt />
  return <Portfolio key={address} address={address} />
}
