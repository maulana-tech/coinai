import { Contract } from 'ethers'
import { COINAI_ABI } from '@/lib/coinai.evm'
import { COINAI_ADDRESS, CONTRACT_ID, readProvider } from '@/lib/config'
import type { ActivityItem } from '@/lib/activity'
import { TOKEN_SCALE } from '@/lib/token'
import { YIELD_TARGETS, type YieldTarget } from '@/lib/types'

// The three SimpleVaults behind CoinAI (evm/src/SimpleVault.sol). APY is on-chain metadata:
// testnet has no real yield, mainnet would route to Venus / Lista / PancakeSwap.
export type VaultInfo = {
  target: YieldTarget
  address: string
  apy: number // 0.06 = 6%
  risk: number // 1 low, 2 medium, 3 high
  tvl: bigint
  sharePrice: bigint // tUSDT per 1 vault share (6 decimals)
  position: bigint // the user's holding in this vault, in tUSDT
  shares: bigint // the user's vault shares
}

export type Vaults = Record<YieldTarget, VaultInfo>

export const VAULT_LOGO: Record<YieldTarget, string> = {
  conservative: '/logos/conservative.svg',
  balanced: '/logos/balanced.svg',
  growth: '/logos/growth.svg',
}

const VAULT_ABI = [
  'function apyBps() view returns (uint16)',
  'function riskLevel() view returns (uint8)',
  'function totalAssets() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
]

const MOCK_VAULTS: Vaults = {
  conservative: { target: 'conservative', address: '', apy: 0.03, risk: 1, tvl: 2_500_000_000n, sharePrice: TOKEN_SCALE, position: 0n, shares: 0n },
  balanced: { target: 'balanced', address: '', apy: 0.06, risk: 2, tvl: 4_200_000_000n, sharePrice: TOKEN_SCALE, position: 0n, shares: 0n },
  growth: { target: 'growth', address: '', apy: 0.12, risk: 3, tvl: 1_300_000_000n, sharePrice: TOKEN_SCALE, position: 0n, shares: 0n },
}

export async function getVaults(user: string | null): Promise<Vaults> {
  if (CONTRACT_ID === '') return MOCK_VAULTS
  const provider = readProvider
  const coinai = new Contract(COINAI_ADDRESS, COINAI_ABI, provider)
  const list = await Promise.all(
    YIELD_TARGETS.map(async (target, i): Promise<VaultInfo> => {
      const address = (await coinai.vaultOf(i)) as string
      const v = new Contract(address, VAULT_ABI, provider)
      const [apyBps, risk, tvl, sharePrice, shares] = await Promise.all([
        v.apyBps(),
        v.riskLevel(),
        v.totalAssets(),
        v.convertToAssets(TOKEN_SCALE),
        user ? v.balanceOf(user) : 0n,
      ])
      const position = BigInt(shares) === 0n ? 0n : BigInt(await v.convertToAssets(shares))
      return {
        target,
        address,
        apy: Number(apyBps) / 10_000,
        risk: Number(risk),
        tvl: BigInt(tvl),
        sharePrice: BigInt(sharePrice),
        position,
        shares: BigInt(shares),
      }
    }),
  )
  return Object.fromEntries(list.map((v) => [v.target, v])) as Vaults
}

/** What the user put in, from chain state alone (public RPCs prune old event history):
 * idle savings + vault shares, since SimpleVault mints shares 1:1 while its price is 1.
 * ponytail: assumes deposits at share price 1 (true unless someone donates to a vault);
 * track per-deposit cost basis on-chain if vaults ever accrue real yield. */
export function principalOnChain(idleSavings: bigint, vaults: Vaults): bigint {
  return YIELD_TARGETS.reduce((sum, t) => sum + vaults[t].shares, idleSavings)
}

export function totalInvested(vaults: Vaults | null): bigint {
  return vaults ? YIELD_TARGETS.reduce((sum, t) => sum + vaults[t].position, 0n) : 0n
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
