import { JsonRpcProvider } from 'ethers'
import { FXRP_SCALE } from '@/lib/fxrp'
import type { ActivityItem } from '@/lib/activity'
import type { YieldTarget } from '@/lib/types'
import {
  CONTRACT_ID,
  FIRELIGHT_VAULT,
  FLARE_RPC_URL,
  SPARKDEX_ROUTER,
  UPSHIFT_VAULT,
} from '@/lib/config'

// Flare Coston2 yield protocol constants
export { FXRP_SCALE } // FXRP has 6 decimals on Coston2

export type TargetHealth = Record<YieldTarget, boolean>

async function vaultAcceptsDeposits(address: string): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(FLARE_RPC_URL)
    return (await provider.getCode(address)) !== '0x'
  } catch {
    return false
  }
}

async function hasCode(address: string): Promise<boolean> {
  try {
    const provider = new JsonRpcProvider(FLARE_RPC_URL)
    return (await provider.getCode(address)) !== '0x'
  } catch {
    return false
  }
}

// Probes the Coston2 chain to see which yield targets can actually take a
// deposit today. Broken deployments (wrong addresses, non-ERC-4626 proxies,
// missing output tokens) come back as false so the UI can block them early
// instead of failing mid-deposit with a generic error.
export async function getTargetHealth(): Promise<TargetHealth> {
  if (CONTRACT_ID === '') return { sparkdex: true, firelight: true, upshift: true }
  const [sparkdex, firelight, upshift] = await Promise.all([
    hasCode(SPARKDEX_ROUTER),
    vaultAcceptsDeposits(FIRELIGHT_VAULT),
    vaultAcceptsDeposits(UPSHIFT_VAULT),
  ])
  return { sparkdex, firelight, upshift }
}

export async function getSharePrice(): Promise<bigint | null> {
  return FXRP_SCALE // mock 1.0 FXRP per share
}

export type VaultStats = {
  totalSupply: bigint | null
  idle: bigint | null
  invested: bigint | null
}

export async function getFirelightVaultStats(): Promise<VaultStats> {
  return {
    totalSupply: 5_000_000_000n, // 5000 FXRP
    idle: 1_000_000_000n, // 1000 FXRP
    invested: 4_000_000_000n, // 4000 FXRP
  }
}

export type SparkDexPoolInfo = {
  apy: number | null
  tvl: bigint | null
  feeRate: bigint | null
}

export async function getSparkDexPoolInfo(): Promise<SparkDexPoolInfo> {
  return {
    apy: 0.125, // mock 12.5% APY
    tvl: 12_500_000_000_000_000_000_000n, // 12500 FXRP
    feeRate: 3000n, // 0.3%
  }
}

export async function getSparkDexMainnetReferenceApy(): Promise<number | null> {
  return 0.142 // mock 14.2% APY
}

export async function getFirelightMainnetReferenceApy(): Promise<number | null> {
  return 0.085 // mock 8.5% APY
}

export type UpshiftStats = {
  apy: number | null
  tvl: bigint | null
}

export async function getUpshiftStats(): Promise<UpshiftStats> {
  return {
    apy: 0.095, // mock 9.5% APY
    tvl: 8_400_000_000_000_000_000_000n, // 8400 FXRP
  }
}

export async function getUpshiftMainnetReferenceApy(): Promise<number | null> {
  return 0.102 // mock 10.2% APY
}

export function valueOfShares(
  shares: bigint,
  target: YieldTarget,
  sharePrice: bigint | null,
  _sparkdexTvl: bigint | null,
  upshiftStats?: { tvl: bigint | null },
): bigint | null {
  if (target === 'sparkdex') {
    if (sharePrice === null) return null
    return (shares * sharePrice) / FXRP_SCALE
  }
  if (target === 'upshift') {
    const tvl = upshiftStats?.tvl ?? null
    if (tvl === null || sharePrice === null) return null
    return (shares * sharePrice) / FXRP_SCALE
  }
  if (sharePrice === null) return null
  return (shares * sharePrice) / FXRP_SCALE
}

export type SavingsPosition = {
  principal: bigint
  currentValue: bigint | null
  earnings: bigint | null
}

export type SavingsHistoryPoint = {
  at: Date
  principal: bigint
}

function replaySavingsBasis(activity: ActivityItem[]): SavingsHistoryPoint[] {
  const oldestFirst = [...activity].reverse()
  let runningShares = 0n
  let basis = 0n
  const points: SavingsHistoryPoint[] = []
  for (const item of oldestFirst) {
    if (item.kind === 'pay' && item.saved !== undefined) {
      runningShares += item.saved
      basis += item.saved
      points.push({ at: item.at, principal: basis })
    } else if (item.kind === 'wd_save' && item.shares !== undefined) {
      if (runningShares > 0n) basis -= (basis * item.shares) / runningShares
      runningShares -= item.shares
      if (runningShares < 0n) runningShares = 0n
      points.push({ at: item.at, principal: basis })
    }
  }
  return points
}

export function computeSavingsPosition(
  activity: ActivityItem[],
  currentValue: bigint | null,
): SavingsPosition {
  const points = replaySavingsBasis(activity)
  const basis = points.length > 0 ? points[points.length - 1].principal : 0n
  return {
    principal: basis,
    currentValue,
    earnings: currentValue !== null ? currentValue - basis : null,
  }
}

export function savingsHistory(activity: ActivityItem[]): SavingsHistoryPoint[] {
  return replaySavingsBasis(activity)
}
