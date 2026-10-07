import { Contract, Interface, type ContractRunner } from 'ethers'
import { useCallback, useEffect, useState } from 'react'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { sendTx, simulate } from '@/lib/coinai.evm'
import { CONTRACT_ID, logsProvider, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'

// The AI Smart Money basket (evm/src/BasketVault.sol): tUSDT plus BNB, BTC, ETH and CAKE at Chainlink prices.
// Plutus (the agent wallet, its curator) sets the weights with a reason; a saver follows them unless they set their own.
const BASKET_ABI = [
  'function assets() view returns ((string symbol,address feed,uint16 maxBps)[])',
  'function smartWeights() view returns (uint16[])',
  'function smartEpoch() view returns (uint64)',
  'function weightsOf(address user) view returns (uint16[] weights,bool custom)',
  'function prices() view returns (uint256[] p,bool[] fresh)',
  'function setWeights(uint16[] weights)',
  'event SmartWeightsSet(uint64 indexed epoch,uint16[] weights,string reason)',
  'error InvalidWeights()',
  'error StalePrice()',
]
const iface = new Interface(BASKET_ABI)

export const MIN_STABLE_BPS = 1_000 // BasketVault.MIN_STABLE_BPS: at least 10% in tUSDT

/** Why a set of weights (bps, in asset order) would revert in BasketVault._validate, or null when it's fine. */
export function weightsError(weights: number[], assets: Pick<BasketAsset, 'maxBps'>[]): 'sum' | 'stable' | 'cap' | null {
  if (weights.reduce((s, w) => s + w, 0) !== 10_000) return 'sum'
  if (weights[0] < MIN_STABLE_BPS) return 'stable'
  if (weights.some((w, i) => w < 0 || w > assets[i].maxBps)) return 'cap'
  return null
}

// Mock mode keeps the saver's own weights in memory, like coinai.mock.ts does for the account.
let mockCustom: number[] | null = null

/** The saver's own weights (bps, in asset order), or [] to follow the curator again. Rebalances what they hold. */
export async function setBasketWeights(weights: number[]): Promise<{ hash: string }> {
  if (CONTRACT_ID === '') {
    mockCustom = weights.length ? weights : null
    return { hash: '' }
  }
  const c = new Contract(DEPLOYMENT.v2.basketVault, BASKET_ABI, (await getEthersSigner()) as ContractRunner)
  await simulate(c.setWeights.staticCall(weights), iface)
  const hash = await sendTx(c.setWeights(weights, { gasLimit: 600_000 }), iface)
  return { hash }
}

export type BasketAsset = {
  symbol: string
  maxBps: number
  weightBps: number // the weights the user's basket follows
  smartBps: number // the curator's current weights
  priceUsd: number
  fresh: boolean // Chainlink answer younger than a day; deposits revert on a stale price
}

export type Basket = {
  address: string
  assets: BasketAsset[]
  custom: boolean
  epoch: number
  reason: string | null // why the curator set the current weights
  reasonAt: Date | null
}

const MOCK: Basket = {
  address: '',
  assets: [
    ['tUSDT', 10_000, 4_000, 1],
    ['BNB', 5_000, 2_000, 600],
    ['BTC', 5_000, 2_000, 60_000],
    ['ETH', 5_000, 1_500, 2_500],
    ['CAKE', 2_000, 500, 2],
  ].map(([symbol, maxBps, w, priceUsd]) => ({
    symbol: symbol as string,
    maxBps: maxBps as number,
    weightBps: w as number,
    smartBps: w as number,
    priceUsd: priceUsd as number,
    fresh: true,
  })),
  custom: false,
  epoch: 1,
  reason: 'initial weights',
  reasonAt: null,
}

// The latest SmartWeightsSet is at most a day old (Plutus runs daily); look back a few days of blocks.
const REASON_LOOKBACK = 200_000

async function lastReason(c: Contract, epoch: number): Promise<{ reason: string; at: Date } | null> {
  const filter = c.filters.SmartWeightsSet(epoch)
  const latest = await logsProvider.getBlockNumber()
  const from = Math.max(DEPLOYMENT.v2.deployBlock, latest - REASON_LOOKBACK)
  // publicnode serves getLogs in ranges of at most 50k blocks
  for (let to = latest; to >= from; to -= 50_000) {
    const logs = await c.connect(logsProvider).queryFilter(filter, Math.max(from, to - 49_999), to)
    const log = logs.at(-1)
    if (log && 'args' in log) {
      const block = await log.getBlock()
      return { reason: String(log.args.reason), at: new Date(block.timestamp * 1000) }
    }
  }
  return null
}

export async function getBasket(user: string | null): Promise<Basket> {
  if (CONTRACT_ID === '')
    return mockCustom
      ? { ...MOCK, custom: true, assets: MOCK.assets.map((a, i) => ({ ...a, weightBps: mockCustom![i] })) }
      : MOCK
  const address = DEPLOYMENT.v2.basketVault
  const c = new Contract(address, BASKET_ABI, readProvider)
  const [assets, smart, epoch, prices, own] = await Promise.all([
    c.assets() as Promise<{ symbol: string; maxBps: bigint }[]>,
    c.smartWeights() as Promise<bigint[]>,
    c.smartEpoch() as Promise<bigint>,
    c.prices() as Promise<[bigint[], boolean[]]>,
    user ? (c.weightsOf(user) as Promise<[bigint[], boolean]>) : null,
  ])
  const weights = own?.[0] ?? smart
  const why = await lastReason(c, Number(epoch)).catch(() => null)
  return {
    address,
    assets: assets.map((a, i) => ({
      symbol: a.symbol,
      maxBps: Number(a.maxBps),
      weightBps: Number(weights[i]),
      smartBps: Number(smart[i]),
      priceUsd: Number(prices[0][i]) / 1e18,
      fresh: prices[1][i],
    })),
    custom: own?.[1] ?? false,
    epoch: Number(epoch),
    reason: why?.reason ?? null,
    reasonAt: why?.at ?? null,
  }
}

export function useBasket(user: string | null) {
  const [basket, setBasket] = useState<Basket | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    setBasket(await getBasket(user).catch(() => null))
    setLoading(false)
  }, [user])
  useEffect(() => {
    void load()
  }, [load])
  return { basket, loading, refresh: load }
}
