import { useCallback, useEffect, useState } from 'react'
import { fetchMarket, type MarketSnapshot } from '../../shared/market.js'
import type { MarketAnalysis } from '@/lib/agent-api'

// Prices/trends are public, so the board is computed in the browser (works without the backend).
// The Market Analyst's read comes from /api/market and is optional.
export function useMarket() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null)
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [m, a] = await Promise.allSettled([
      fetchMarket(),
      fetch('/api/market').then((r) => (r.ok ? r.json() : null)),
    ])
    if (m.status === 'fulfilled') setMarket(m.value)
    else setError(String(m.reason))
    if (a.status === 'fulfilled' && a.value?.analysis) setAnalysis(a.value.analysis as MarketAnalysis)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { market, analysis, loading, error, refresh: load }
}
