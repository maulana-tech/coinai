import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EVALUATION } from '@/lib/evaluation-results'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { IncomePattern, Metrics, VaultModel } from '../../shared/evaluation-types.js'

const PATTERN: Record<IncomePattern, { label: MessageKey; caption: MessageKey }> = {
  salary: { label: 'eval.salary', caption: 'eval.salaryCaption' },
  freelance: { label: 'eval.freelance', caption: 'eval.freelanceCaption' },
  gig: { label: 'eval.gig', caption: 'eval.gigCaption' },
}
const ROW = 'grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] items-center gap-2 px-3 sm:grid-cols-[1fr_5rem_5rem_5rem_5rem]'

/** One metric, agent first, the fixed rule underneath; `better` colors the agent value when lower/higher wins. */
function Cell({ agent, fixed, unit = '', better, className }: { agent: number; fixed: number; unit?: string; better?: 'lower' | 'higher'; className?: string }) {
  const t = useT()
  const won = better && agent !== fixed && (better === 'lower' ? agent < fixed : agent > fixed)
  const lost = better && agent !== fixed && !won
  const fmt = (x: number) => `${Math.round(x * 10) / 10}${unit}`
  return (
    <span className={cn('text-right tabular-nums', className)}>
      <span className={cn('block font-semibold', won && 'text-primary-ink', lost && 'text-destructive')}>{fmt(agent)}</span>
      <span className="block text-[11px] text-muted-foreground">{t('eval.vsFixed', { value: fmt(fixed) })}</span>
    </span>
  )
}

/**
 * Agent team vs a fixed 20%-into-Balanced rule, replayed over real prices (scripts/evaluate-agents.ts), plus the
 * live-model spot check. Static: the numbers come from the generated src/lib/evaluation-results.ts.
 */
export function EvaluationCard() {
  const t = useT()
  const [model, setModel] = useState<VaultModel>('testnet')
  const e = EVALUATION
  const rows = e.rows.filter((r) => r.model === model)
  const money = (m: Metrics) => Math.round(m.contributed)
  const llm = e.llm

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('eval.title')}</CardTitle>
          <Tabs value={model} onValueChange={(v) => setModel(v as VaultModel)}>
            <TabsList className="rounded-full">
              <TabsTrigger value="testnet" className="rounded-full px-3 text-xs">
                {t('eval.modelTestnet')}
              </TabsTrigger>
              <TabsTrigger value="market" className="rounded-full px-3 text-xs">
                {t('eval.modelMarket')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('eval.caption', { days: e.window.days, from: e.window.from, to: e.window.to })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-xl border text-sm">
          <li className={cn(ROW, 'py-1.5 text-[10px] tracking-wider text-muted-foreground uppercase')}>
            <span>{t('eval.colIncome')}</span>
            <span className="text-right">{t('eval.colSaved')}</span>
            <span className="text-right">{t('eval.colShort')}</span>
            <span className="text-right">{t('eval.colDip')}</span>
            <span className="hidden text-right sm:block">{t('eval.colGain')}</span>
          </li>
          {rows.map((r) => (
            <li key={r.pattern} className={cn(ROW, 'py-2.5')}>
              <span className="min-w-0">
                <span className="block font-medium">{t(PATTERN[r.pattern].label)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(PATTERN[r.pattern].caption)} · {t('eval.avgSplit', { pct: r.agent.avgSplitPercent })}
                </span>
              </span>
              <Cell agent={money(r.agent)} fixed={money(r.fixed)} />
              <Cell agent={r.agent.shortDays} fixed={r.fixed.shortDays} better="lower" />
              <Cell agent={r.agent.worstDipPct} fixed={r.fixed.worstDipPct} unit="%" better="lower" />
              <Cell agent={r.agent.gainPct} fixed={r.fixed.gainPct} unit="%" className="hidden sm:block" />
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>{t(model === 'testnet' ? 'eval.noteTestnet' : 'eval.noteMarket')}</p>
          <p>{t('eval.notePolicy', { on: e.regimeDays.risk_on, neutral: e.regimeDays.neutral, off: e.regimeDays.risk_off })}</p>
          <p>
            {llm
              ? t('eval.llm', {
                  model: llm.model,
                  matched: llm.splitMatched,
                  compared: llm.splitCompared,
                  diff: llm.mixDiffPoints ?? '–',
                  skipped: llm.skippedLowConfidence,
                })
              : t('eval.llmPending')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
