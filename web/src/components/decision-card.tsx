import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentDecision, AgentRun } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { formatDateTime, formatMoney, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { YIELD_TARGETS, type YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { VAULT_LOGO } from '@/lib/yield'
import type { VaultMix } from '../../shared/pool.js'

const VAULT_NAME: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}
const VAULT_COLOR: Record<YieldTarget, string> = {
  conservative: 'bg-muted-foreground/40',
  balanced: 'bg-primary',
  growth: 'bg-gold',
}
// Vault | (Now) | Reference | Tilt | Weight; "Now" only from sm up so the table fits a phone.
const ROW = 'grid grid-cols-[1fr_4rem_3.5rem_3.5rem] items-center gap-2 px-3 sm:grid-cols-[1fr_5.5rem_4.5rem_3.5rem_3.5rem]'

function Confidence({ value, min }: { value: number | null; min: number }) {
  const t = useT()
  if (value === null) return <span className="text-xs text-destructive">{t('decision.noConfidence')}</span>
  const low = value < min
  const dots = Math.round(value * 5)
  return (
    <span className={cn('flex items-center gap-1.5 text-xs tabular-nums', low ? 'text-destructive' : 'text-primary-ink')}>
      <span aria-hidden className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('size-1.5 rounded-full', i < dots ? 'bg-current' : 'bg-muted')} />
        ))}
      </span>
      {t('decision.confidenceValue', { pct: Math.round(value * 100) })}
    </span>
  )
}

function MixBar({ mix }: { mix: VaultMix }) {
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
      {YIELD_TARGETS.map((k) =>
        mix[k] > 0 ? (
          <div
            key={k}
            className={cn('h-full border-r border-card last:border-r-0', VAULT_COLOR[k])}
            style={{ width: `${mix[k]}%` }}
          />
        ) : null,
      )}
    </div>
  )
}

const tilt = (d: AgentDecision, k: YieldTarget) => (d.mix ? d.mix[k] - d.reference.mix[k] : 0)

/**
 * Why the agents invested the way they did: per vault, the reference mix (saved pool or profile), how far the
 * strategist tilted it, and the weight that came out; plus confidence, the savings split and the previous run.
 * Modelled on the "how Smart Money decides" table: inputs, the rule, then the result.
 */
export function DecisionCard({
  runs,
  onLoad,
}: {
  runs: AgentRun[] | null
  /** Shown as a button while runs are hidden behind the wallet sign-in. */
  onLoad?: () => void
}) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { account, rates } = useAppState()
  const run = runs?.find((r) => r.decision) ?? null
  const d = run?.decision ?? null
  const legacy = !d ? (runs?.find((r) => r.allocation) ?? null) : null
  const pct = (n: number) => `${Math.round(n)}%`
  const signed = (n: number) => (n === 0 ? '–' : `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`)
  const gateText = (reason?: string) =>
    !reason ? null : reason.startsWith('no confidence') ? t('decision.noConfidence') : t('decision.lowConfidence', { min: Math.round((d?.minConfidence ?? 0.5) * 100) })
  const mixText = (m: VaultMix) => t('portfolio.strategyMix', m)

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('decision.title')}</CardTitle>
          {d?.mix && <Confidence value={d.confidence.investment} min={d.minConfidence} />}
        </div>
        <p className="text-sm text-muted-foreground">{t('decision.caption')}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {runs === null ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('portfolio.planHidden')}</p>
            {onLoad && (
              <Button variant="outline" size="sm" onClick={onLoad}>
                {t('portfolio.loadPlan')}
              </Button>
            )}
          </div>
        ) : !d && !legacy ? (
          <p className="text-sm text-muted-foreground">{t('decision.empty')}</p>
        ) : !d && legacy?.allocation ? (
          // Runs from before decisions were recorded: only the final weights are known.
          <div className="space-y-3">
            {YIELD_TARGETS.map((k) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span>{t(VAULT_NAME[k])}</span>
                <span className="font-semibold tabular-nums">{pct(legacy.allocation![k])}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t('decision.legacy')}</p>
          </div>
        ) : d && run ? (
          <>
            {/* the mix */}
            <div className="space-y-2">
              <MixBar mix={d.mix ?? d.reference.mix} />
              <div className="flex flex-wrap items-center gap-1.5">
                {YIELD_TARGETS.map((k) => {
                  const w = (d.mix ?? d.reference.mix)[k]
                  return w > 0 ? (
                    <span key={k} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs tabular-nums">
                      <span className={cn('size-2 rounded-full', VAULT_COLOR[k])} />
                      {t(VAULT_NAME[k])} {pct(w)}
                    </span>
                  ) : null
                })}
                {!d.mix && <span className="text-xs text-muted-foreground">{t('decision.referenceOnly')}</span>}
              </div>
            </div>

            {/* reference → tilt → weight */}
            <ul className="divide-y rounded-xl border text-sm">
              <li className={cn(ROW, 'py-1.5 text-[10px] tracking-wider text-muted-foreground uppercase')}>
                <span>{t('decision.colVault')}</span>
                <span className="hidden text-right sm:block">{t('decision.colNow')}</span>
                <span className="text-right">{t('decision.colReference')}</span>
                <span className="text-right">{t('decision.colTilt')}</span>
                <span className="text-right">{t('decision.colWeight')}</span>
              </li>
              {YIELD_TARGETS.map((k) => {
                const tl = tilt(d, k)
                return (
                  <li key={k} className={cn(ROW, 'py-2 tabular-nums')}>
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <img src={VAULT_LOGO[k]} alt="" className="size-5 shrink-0 rounded-full" />
                      <span className="truncate">{t(VAULT_NAME[k])}</span>
                    </span>
                    <span className="hidden text-right text-muted-foreground sm:block">
                      {account ? formatMoney(account.positions[k], primaryCurrency, rates, locale) : '–'}
                    </span>
                    <span className="text-right text-muted-foreground">{pct(d.reference.mix[k])}</span>
                    <span className={cn('text-right text-xs', tl > 0 ? 'text-primary-ink' : tl < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {d.mix ? signed(tl) : '–'}
                    </span>
                    <span className="text-right font-semibold">{d.mix ? pct(d.mix[k]) : '–'}</span>
                  </li>
                )
              })}
              {d.mix && (
                <li className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  <span>{t('decision.invested', { pct: d.investPercent })}</span>
                  <span>{t('decision.buffer', { pct: 100 - d.investPercent })}</span>
                </li>
              )}
            </ul>

            {(d.skipped.investment || d.clamped) && (
              <div className="flex flex-wrap gap-2">
                {d.skipped.investment && (
                  <Badge variant="outline" className="border-destructive/40 font-normal text-destructive">
                    {gateText(d.skipped.investment)}
                  </Badge>
                )}
                {d.clamped && (
                  <Badge variant="outline" className="font-normal">
                    {t('decision.clamped')}
                  </Badge>
                )}
              </div>
            )}

            {/* savings split */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t('decision.split')}</span>
              <span className="flex flex-wrap items-center justify-end gap-3">
                <span className="font-medium tabular-nums">
                  {d.split.to === null
                    ? t('decision.splitHold', { from: d.split.from })
                    : t('decision.splitChange', { from: d.split.from, to: d.split.to })}
                </span>
                {d.split.to !== null &&
                  (d.skipped.savings ? (
                    <span className="text-xs text-destructive">{gateText(d.skipped.savings)}</span>
                  ) : (
                    <Confidence value={d.confidence.savings} min={d.minConfidence} />
                  ))}
              </span>
            </div>

            <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <p>
                {d.reference.source === 'strategy' && run.strategy
                  ? t('decision.sourceStrategy', { name: run.strategy.name })
                  : run.profile
                    ? t('decision.sourceProfile', {
                        risk: t(`agentRole.risk_${run.profile.risk}` as MessageKey),
                        horizon: t(`agentRole.horizon_${run.profile.horizon}` as MessageKey),
                      })
                    : t('decision.sourceProfileShort')}{' '}
                {t('decision.rule', { tilt: d.maxTilt, min: Math.round(d.minConfidence * 100) })}
              </p>
              {d.previous && (
                <p>
                  {t('decision.previous', { time: formatDateTime(new Date(d.previous.at), locale) })}{' '}
                  {d.previous.mix ? mixText(d.previous.mix) : t('decision.previousNoMix')}
                  {d.previous.splitPercent !== null && ` · ${t('decision.previousSplit', { pct: d.previous.splitPercent })}`}
                </p>
              )}
              <p>{t('decision.meta', { time: formatDateTime(new Date(run.at), locale) })}</p>
            </div>
          </>
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </CardContent>
    </Card>
  )
}
