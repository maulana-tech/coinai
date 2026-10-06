// Agent team vs a fixed rule (roadmap A3). Run from web/:
//   npx tsx scripts/evaluate-agents.ts             replay + live-model spot check (needs OPENROUTER_API_KEY, OPENROUTER_MODEL)
//   npx tsx scripts/evaluate-agents.ts --no-llm    replay only
//   npx tsx scripts/evaluate-agents.ts --points 6  spot-check size (default 10)
//   npx tsx scripts/evaluate-agents.ts --days 180  window length (default 365, so calm, rallying and falling markets all show up)
// Writes src/lib/evaluation-results.ts (shown on AI Portfolio) and prints a Markdown table for the README.

import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fetchHistory } from '../shared/market.js'
import type { Evaluation, EvaluationRow, IncomePattern, LlmSpotCheck, Metrics, VaultModel } from '../shared/evaluation-types.js'
import { confidenceGate, fitAllocation, readConfidence, referenceMix } from '../api/_lib/decision.js'
import { agentMix, agentSplit, LIMITS, LOOKBACK, PATTERNS, regimeAt, replay, type PaymentState, type Prices } from '../api/_lib/evaluation.js'

const PATTERN_LIST: IncomePattern[] = ['salary', 'freelance', 'gig']
const MODELS: VaultModel[] = ['testnet', 'market']
const args = process.argv.slice(2)
const withLlm = !args.includes('--no-llm')
const flag = (name: string) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : NaN)
const points = flag('--points') || 10
const DAYS = Math.min(900, flag('--days') || 365) // Binance returns at most 1,000 candles per call

for (const f of ['.env', '.env.local']) if (existsSync(f)) process.loadEnvFile(f)

// ─── Replay ──────────────────────────────────────────────────────────────────

const history = await fetchHistory(['BNBUSDT', 'BTCUSDT', 'ETHUSDT'], LOOKBACK + DAYS)
const prices: Prices = { BNB: history.BNBUSDT, BTC: history.BTCUSDT, ETH: history.ETHUSDT }
for (const [k, v] of Object.entries(prices)) if (v?.length !== LOOKBACK + DAYS + 1) throw new Error(`${k}: got ${v?.length ?? 0} closes`)

const day = (d: number) => new Date(Date.now() - (DAYS - 1 - d) * 86_400_000).toISOString().slice(0, 10)
const regimeDays = { risk_on: 0, neutral: 0, risk_off: 0 }
for (let d = 0; d < DAYS; d++) regimeDays[regimeAt(prices, LOOKBACK + d + 1)]++

const strip = ({ states: _states, ...m }: ReturnType<typeof replay>): Metrics => m
const rows: EvaluationRow[] = MODELS.flatMap((model) =>
  PATTERN_LIST.map((pattern) => ({
    pattern,
    model,
    fixed: strip(replay('fixed', pattern, model, prices)),
    agent: strip(replay('agent', pattern, model, prices)),
  })),
)

// ─── Live-model spot check ───────────────────────────────────────────────────

async function spotCheck(): Promise<LlmSpotCheck | null> {
  if (!withLlm) return null
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL) {
    console.warn('Skipping the live-model spot check: set OPENROUTER_API_KEY and OPENROUTER_MODEL (or run with --no-llm).')
    return null
  }
  // Imported late: the agent backend reads its env when called, and --no-llm shouldn't need it.
  const { savingsStrategist, investmentStrategist, cleanAllocation, LANGUAGE } = await import('../api/_lib/swarm.js')
  const { modelFor } = await import('../api/_lib/llm.js')

  // Evenly spaced payment moments across the patterns, skipping each one's first two (too little data).
  const states = PATTERN_LIST.flatMap((p) => replay('agent', p, 'testnet', prices).states.slice(2))
  const step = Math.max(1, Math.floor(states.length / points))
  const sample = states.filter((_, i) => i % step === 0).slice(0, points)

  const profile = { risk: 'moderate' as const, horizon: 'medium' as const, goal: '' }
  const reference = referenceMix(profile, null)
  const out: LlmSpotCheck = { model: modelFor('strategist'), points: sample.length, splitMatched: 0, splitCompared: 0, mixDiffPoints: null, mixCompared: 0, skippedLowConfidence: 0, failed: 0 }
  const diffs: number[] = []

  for (const s of sample) {
    const c = context(s, profile, reference, LANGUAGE.en)
    const policySplit = Math.sign(agentSplit(s) - s.splitPercent)
    const policyMix = agentMix(s.regime)
    const [split, invest] = await Promise.allSettled([savingsStrategist(c), investmentStrategist(c)])

    if (split.status === 'rejected') out.failed++
    else {
      const gated = split.value.action === 'set_split' && confidenceGate(readConfidence(split.value.confidence)) !== null
      if (gated) out.skippedLowConfidence++
      const llmSplit = split.value.action === 'set_split' && !gated ? Math.sign(Math.round(Number(split.value.percent) || 0) - s.splitPercent) : 0
      out.splitCompared++
      if (llmSplit === policySplit) out.splitMatched++
    }

    if (invest.status === 'rejected') out.failed++
    else if (invest.value.action === 'invest') {
      if (confidenceGate(readConfidence(invest.value.confidence)) !== null) out.skippedLowConfidence++
      else {
        const mix = fitAllocation(cleanAllocation(invest.value.allocation), reference.mix).mix
        diffs.push((['conservative', 'balanced', 'growth'] as const).reduce((a, v) => a + Math.abs(mix[v] - policyMix[v]), 0) / 3)
        out.mixCompared++
      }
    }
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  out.mixDiffPoints = diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : null
  return out
}

/** The Context a live run would build at this moment (describe() in chain.ts, from the replay's numbers). */
function context(s: PaymentState, profile: { risk: 'moderate'; horizon: 'medium'; goal: string }, reference: ReturnType<typeof referenceMix>, lang: string) {
  const fmt = (x: number) => `${x.toFixed(2)} tUSDT`
  const received = s.paymentAmounts.reduce((a, b) => a + b, 0)
  const t = LOOKBACK + s.day + 1
  const change = (xs: number[]) => Math.round(((xs[t] - xs[t - LOOKBACK]) / xs[t - LOOKBACK]) * 1000) / 10
  return {
    view: {
      now: `${day(s.day)}T08:00:00.000Z`,
      savingsSplitPercent: s.splitPercent,
      spendableBalance: fmt(s.spendable),
      idleSavings: fmt(s.idleSavings),
      savingsLockedUntil: null,
      currentVaultPreference: 'balanced',
      payments: {
        count: s.paymentDays.length,
        totalReceived: fmt(received),
        averagePayment: fmt(received / s.paymentDays.length),
        daysSinceLastPayment: 0, // autopilot runs right after the payment lands
      },
      agentLimits: { minSplitPercent: LIMITS.min, maxSplitPercent: LIMITS.max, expiresAt: '2027-01-01T00:00:00.000Z' },
      vaults: [
        { target: 'conservative', apyPercent: 3, risk: 'low' },
        { target: 'balanced', apyPercent: 6, risk: 'medium' },
        { target: 'growth', apyPercent: 12, risk: 'high' },
      ],
    },
    profile,
    market: {
      regime: s.regime,
      confidence: 0.7,
      summary: `30-day change: BNB ${change(prices.BNB)}%, BTC ${change(prices.BTC)}%.`,
      signals: [],
      at: `${day(s.day)}T07:30:00.000Z`,
    },
    strategy: null,
    reference,
    recent: [],
    lang,
  }
}

const evaluation: Evaluation = {
  generatedAt: new Date().toISOString(),
  window: { from: day(0), to: day(DAYS - 1), days: DAYS },
  regimeDays,
  rows,
  llm: await spotCheck(),
}

// ─── Output ──────────────────────────────────────────────────────────────────

const target = fileURLToPath(new URL('../src/lib/evaluation-results.ts', import.meta.url))
writeFileSync(
  target,
  `// Generated by scripts/evaluate-agents.ts — rerun it instead of editing by hand.\nimport type { Evaluation } from '../../shared/evaluation-types.js'\n\nexport const EVALUATION: Evaluation = ${JSON.stringify(evaluation, null, 2)}\n`,
)

const money = (x: number) => x.toFixed(2)
console.log(`\nWindow ${evaluation.window.from} → ${evaluation.window.to} · regime days ${JSON.stringify(regimeDays)}`)
console.log('Spending need per day:', Object.fromEntries(PATTERN_LIST.map((p) => [p, PATTERNS[p].dailySpend])))
for (const model of MODELS) {
  console.log(`\n**${model === 'testnet' ? 'Testnet vaults (fixed APY)' : 'Market-linked vaults (F6 preview)'}**\n`)
  console.log('| Income | Saved (fixed → agent) | Gain | Worst dip | Short days | Avg split |')
  console.log('|---|---|---|---|---|---|')
  for (const r of rows.filter((x) => x.model === model))
    console.log(
      `| ${r.pattern} | ${money(r.fixed.contributed)} → ${money(r.agent.contributed)} | ${r.fixed.gainPct}% → ${r.agent.gainPct}% | ${r.fixed.worstDipPct}% → ${r.agent.worstDipPct}% | ${r.fixed.shortDays} → ${r.agent.shortDays} | ${r.fixed.avgSplitPercent}% → ${r.agent.avgSplitPercent}% |`,
    )
}
if (evaluation.llm) console.log('\nLive-model spot check:', evaluation.llm)
console.log(`\nWrote ${target}`)
