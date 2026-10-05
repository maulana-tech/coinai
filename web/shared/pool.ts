// Pool simulator for the Market page: backtest a user-picked allocation on daily closes and give a
// volatility-based range for the future. Pure math, shared by the app and the AI reviewer.

// Tokenized stocks trade 24/7 on Binance (e.g. AAPLBUSDT tracks Apple), so they line up day by day
// with crypto; PAXG is tokenized gold. Some listings are younger than 90 days: the backtest window
// shrinks to the shortest history in the pool.
export type AssetCategory = 'crypto' | 'stock' | 'gold' | 'stable'

export const POOL_ASSETS = [
  { symbol: 'BNB', name: 'BNB', pair: 'BNBUSDT', category: 'crypto' },
  { symbol: 'BTC', name: 'Bitcoin', pair: 'BTCUSDT', category: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', pair: 'ETHUSDT', category: 'crypto' },
  { symbol: 'CAKE', name: 'PancakeSwap', pair: 'CAKEUSDT', category: 'crypto' },
  { symbol: 'SOL', name: 'Solana', pair: 'SOLUSDT', category: 'crypto' },
  { symbol: 'XRP', name: 'XRP', pair: 'XRPUSDT', category: 'crypto' },
  { symbol: 'DOGE', name: 'Dogecoin', pair: 'DOGEUSDT', category: 'crypto' },
  { symbol: 'LINK', name: 'Chainlink', pair: 'LINKUSDT', category: 'crypto' },
  { symbol: 'AVAX', name: 'Avalanche', pair: 'AVAXUSDT', category: 'crypto' },
  { symbol: 'AAPL', name: 'Apple', pair: 'AAPLBUSDT', category: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', pair: 'TSLABUSDT', category: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', pair: 'NVDABUSDT', category: 'stock' },
  { symbol: 'SPY', name: 'S&P 500 ETF', pair: 'SPYBUSDT', category: 'stock' },
  { symbol: 'COIN', name: 'Coinbase', pair: 'COINBUSDT', category: 'stock' },
  { symbol: 'MSTR', name: 'Strategy', pair: 'MSTRBUSDT', category: 'stock' },
  { symbol: 'PAXG', name: 'PAX Gold', pair: 'PAXGUSDT', category: 'gold' },
  { symbol: 'USDT', name: 'Stablecoin', pair: null, category: 'stable' },
] as const satisfies readonly { symbol: string; name: string; pair: string | null; category: AssetCategory }[]

export type PoolSymbol = (typeof POOL_ASSETS)[number]['symbol']
export type Weights = Partial<Record<PoolSymbol, number>> // percent, sums to 100
export type History = Partial<Record<PoolSymbol, number[]>> // daily closes, oldest first

export type PoolStats = {
  values: number[] // pool value per day, starting at 1
  totalReturn: number // percent over the window
  volatility: number // annualized, percent
  maxDrawdown: number // percent, <= 0
  days: number
}

const SYMBOLS = POOL_ASSETS.map((a) => a.symbol) as PoolSymbol[]

/** Keeps known assets with positive weight; true when they add up to 100. */
export function normalizeWeights(w: Weights): { weights: Weights; valid: boolean } {
  const weights: Weights = {}
  for (const s of SYMBOLS) {
    const v = Math.round(Number(w[s] ?? 0))
    if (v > 0) weights[s] = Math.min(100, v)
  }
  const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0)
  return { weights, valid: total === 100 }
}

/** Daily-rebalanced backtest. Stablecoin returns 0; assets without history are treated as stable. */
export function backtest(weights: Weights, history: History): PoolStats {
  const held = SYMBOLS.filter((s) => (weights[s] ?? 0) > 0)
  const lengths = held.map((s) => history[s]?.length ?? Infinity).filter(Number.isFinite)
  const n = lengths.length ? Math.min(...lengths) : 1
  const series = Object.fromEntries(held.map((s) => [s, history[s]?.slice(-n)])) as History

  const values = [1]
  const daily: number[] = []
  for (let t = 1; t < n; t++) {
    let r = 0
    for (const s of held) {
      const c = series[s]
      if (c) r += ((weights[s] ?? 0) / 100) * (c[t] / c[t - 1] - 1)
    }
    daily.push(r)
    values.push(values[t - 1] * (1 + r))
  }

  const mean = daily.reduce((a, b) => a + b, 0) / (daily.length || 1)
  const variance = daily.length > 1 ? daily.reduce((a, b) => a + (b - mean) ** 2, 0) / (daily.length - 1) : 0
  let peak = 1
  let maxDrawdown = 0
  for (const v of values) {
    peak = Math.max(peak, v)
    maxDrawdown = Math.min(maxDrawdown, (v / peak - 1) * 100)
  }
  return {
    values,
    totalReturn: (values[values.length - 1] - 1) * 100,
    volatility: Math.sqrt(variance) * Math.sqrt(365) * 100,
    maxDrawdown,
    days: n - 1,
  }
}

export type Range = { months: number; low: number; mid: number; high: number }

/**
 * 80% range for `amount` after each horizon from volatility alone: no view on direction
 * (zero drift), so the middle is roughly "unchanged" and the spread shows the risk taken.
 */
export function projectRange(amount: number, volatilityPct: number, horizons = [3, 6, 12]): Range[] {
  const sigma = volatilityPct / 100
  const z = 1.2816 // 10th / 90th percentile of a normal
  return horizons.map((months) => {
    const t = months / 12
    const s = sigma * Math.sqrt(t)
    const at = (k: number) => amount * Math.exp(k * s - (sigma * sigma * t) / 2)
    return { months, low: at(-z), mid: at(0), high: at(z) }
  })
}
