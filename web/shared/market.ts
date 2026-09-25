// Market data shared by the app (market board) and the agent backend (Market Analyst).
// Spot prices come from Chainlink price feeds on BNB Smart Chain Testnet (the oracle BNB Chain
// recommends for BSC); trend and volatility come from Binance daily candles via the public
// market-data mirror, which — unlike api.binance.com — isn't geo-blocked for US-hosted functions.

import { Contract, JsonRpcProvider } from 'ethers'

// Chainlink proxies on BSC Testnet (chain 97), 8 decimals — docs.chain.link, feeds-bsc-testnet.
export const COINS = [
  { symbol: 'BNB', name: 'BNB', pair: 'BNBUSDT', feed: '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526' },
  { symbol: 'BTC', name: 'Bitcoin', pair: 'BTCUSDT', feed: '0x5741306c21795FdCBb9b265Ea0255F499DFe515C' },
  { symbol: 'ETH', name: 'Ethereum', pair: 'ETHUSDT', feed: '0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7' },
  { symbol: 'CAKE', name: 'PancakeSwap', pair: 'CAKEUSDT', feed: '0x81faeDDfeBc2F8Ac524327d70Cf913001732224C' },
] as const

export const ORACLE_RPC_URL = 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
const CANDLES_URL = 'https://data-api.binance.vision/api/v3/klines'
const FEED_ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)']

export type CoinMarket = {
  symbol: string
  name: string
  price: number // oracle price, or the latest candle close if the oracle read fails
  priceSource: 'chainlink' | 'binance'
  oracleUpdatedAt: number | null // unix seconds
  change24h: number // percent
  change7d: number
  change30d: number
  volatility30d: number // annualized, percent
  closes: number[] // last 31 daily closes, oldest first
}

export type MarketSnapshot = { at: string; coins: CoinMarket[] }

const pct = (from: number, to: number) => (from ? ((to - from) / from) * 100 : 0)
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

/** Annualized volatility (percent) from daily closes, using log returns. */
export function annualizedVolatility(closes: number[]): number {
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  if (r.length < 2) return 0
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)
  return Math.sqrt(variance) * Math.sqrt(365) * 100
}

async function dailyCloses(pair: string): Promise<number[]> {
  const res = await fetch(`${CANDLES_URL}?symbol=${pair}&interval=1d&limit=31`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`candles ${pair}: ${res.status}`)
  const rows = (await res.json()) as [number, string, string, string, string][]
  return rows.map((row) => Number(row[4]))
}

async function oraclePrice(provider: JsonRpcProvider, feed: string): Promise<{ price: number; updatedAt: number } | null> {
  try {
    const [, answer, , updatedAt] = (await new Contract(feed, FEED_ABI, provider).latestRoundData()) as bigint[]
    return { price: Number(answer) / 1e8, updatedAt: Number(updatedAt) }
  } catch {
    return null
  }
}

export async function fetchMarket(rpcUrl = ORACLE_RPC_URL): Promise<MarketSnapshot> {
  const provider = new JsonRpcProvider(rpcUrl, 97, { staticNetwork: true })
  const coins = await Promise.all(
    COINS.map(async (c): Promise<CoinMarket> => {
      const [closes, oracle] = await Promise.all([dailyCloses(c.pair), oraclePrice(provider, c.feed)])
      const last = closes.at(-1) ?? 0
      const price = oracle?.price ?? last
      const at = (daysAgo: number) => closes[Math.max(0, closes.length - 1 - daysAgo)] ?? last
      return {
        symbol: c.symbol,
        name: c.name,
        price: round(price, price < 10 ? 4 : 2),
        priceSource: oracle ? 'chainlink' : 'binance',
        oracleUpdatedAt: oracle?.updatedAt ?? null,
        change24h: round(pct(at(1), price)),
        change7d: round(pct(at(7), price)),
        change30d: round(pct(at(30), price)),
        volatility30d: round(annualizedVolatility(closes), 1),
        closes,
      }
    }),
  )
  return { at: new Date().toISOString(), coins }
}
