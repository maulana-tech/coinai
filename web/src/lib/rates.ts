export type FxRates = { usd: number; idr: number; cny: number }

export const FALLBACK_RATES: FxRates = { usd: 1, idr: 16300, cny: 7.25 }

let cached: Promise<FxRates> | null = null

function pick(rates: Record<string, number> | undefined, code: string, fallback: number): number {
  const value = rates?.[code]
  return typeof value === 'number' && value > 0 ? value : fallback
}

async function fetchRates(): Promise<FxRates> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) throw new Error(`Rate fetch failed: ${res.status}`)
  const data = (await res.json()) as { rates?: Record<string, number> }
  return {
    usd: pick(data.rates, 'USD', FALLBACK_RATES.usd),
    idr: pick(data.rates, 'IDR', FALLBACK_RATES.idr),
    cny: pick(data.rates, 'CNY', FALLBACK_RATES.cny),
  }
}

export function getFxRates(): Promise<FxRates> {
  cached ??= fetchRates().catch(() => FALLBACK_RATES)
  return cached
}
