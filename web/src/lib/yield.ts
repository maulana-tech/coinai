import { Contract } from 'ethers'
import { COINAI_ABI } from '@/lib/coinai.evm'
import { COINAI_ADDRESS, CONTRACT_ID, readProvider } from '@/lib/config'
import type { ActivityItem } from '@/lib/activity'
import type { MessageKey } from '@/lib/i18n'
import { TOKEN_SCALE } from '@/lib/token'
import { YIELD_TARGETS, totalSavings, type CoinAIAccount, type Position, type YieldTarget } from '@/lib/types'

// The three SimpleVaults behind CoinAI (evm/src/SimpleVault.sol). APY is on-chain metadata:
// testnet has no real yield, mainnet would route to Venus / Lista / PancakeSwap.
// What the user holds in each one comes from CoinAI.accountOf (the shares are held for them by coinAI).
export type VaultInfo = {
  target: YieldTarget
  address: string
  apy: number // 0.06 = 6%
  risk: number // 1 low, 2 medium, 3 high
  tvl: bigint
  sharePrice: bigint // tUSDT per 1 vault share (6 decimals)
}

export type Vaults = Record<YieldTarget, VaultInfo>

export const VAULT_LOGO: Record<Position, string> = {
  conservative: '/logos/conservative.svg',
  balanced: '/logos/balanced.svg',
  growth: '/logos/growth.svg',
  basket: '/logos/basket.svg',
}

export const POSITION_NAME: Record<Position, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
  basket: 'yield.sourceBasketName',
}

const VAULT_ABI = [
  'function apyBps() view returns (uint16)',
  'function riskLevel() view returns (uint8)',
  'function totalAssets() view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
]

const MOCK_VAULTS: Vaults = {
  conservative: { target: 'conservative', address: '', apy: 0.03, risk: 1, tvl: 2_500_000_000n, sharePrice: TOKEN_SCALE },
  balanced: { target: 'balanced', address: '', apy: 0.06, risk: 2, tvl: 4_200_000_000n, sharePrice: TOKEN_SCALE },
  growth: { target: 'growth', address: '', apy: 0.12, risk: 3, tvl: 1_300_000_000n, sharePrice: TOKEN_SCALE },
}

export async function getVaults(): Promise<Vaults> {
  if (CONTRACT_ID === '') return MOCK_VAULTS
  const provider = readProvider
  const coinai = new Contract(COINAI_ADDRESS, COINAI_ABI, provider)
  const list = await Promise.all(
    YIELD_TARGETS.map(async (target, i): Promise<VaultInfo> => {
      const address = (await coinai.vaultOf(i)) as string
      const v = new Contract(address, VAULT_ABI, provider)
      const [apyBps, risk, tvl, sharePrice] = await Promise.all([
        v.apyBps(),
        v.riskLevel(),
        v.totalAssets(),
        v.convertToAssets(TOKEN_SCALE),
      ])
      return {
        target,
        address,
        apy: Number(apyBps) / 10_000,
        risk: Number(risk),
        tvl: BigInt(tvl),
        sharePrice: BigInt(sharePrice),
      }
    }),
  )
  return Object.fromEntries(list.map((v) => [v.target, v])) as Vaults
}

/** The vault holding most of the user's savings, if any (v2 has no default target). */
export function mainVault(account: CoinAIAccount | null): YieldTarget | undefined {
  if (!account) return undefined
  const best = YIELD_TARGETS.reduce((a, b) => (account.positions[b] > account.positions[a] ? b : a))
  return account.positions[best] > 0n ? best : undefined
}

/** What the user put in, from chain state alone (public RPCs prune old event history):
 * idle savings + vault shares (SimpleVault mints shares 1:1 while its price is 1) + the basket at its value.
 * ponytail: assumes vault deposits at share price 1 (true unless someone donates to a vault), and counts the
 * basket at today's value so its price moves don't show as earnings; track cost basis on-chain if that matters. */
export function principalOnChain(account: CoinAIAccount): bigint {
  return YIELD_TARGETS.reduce((sum, t) => sum + account.vaultShares[t], account.idle + account.positions.basket)
}

/** Principal, value now and earnings of all savings. */
export function savingsPosition(account: CoinAIAccount): SavingsPosition {
  const principal = principalOnChain(account)
  const currentValue = totalSavings(account)
  return { principal, currentValue, earnings: currentValue - principal }
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
    } else if ((item.kind === 'wd_save' && item.shares !== undefined) || (item.kind === 'wd_vault' && item.amount !== undefined)) {
      // idle savings leave 1:1; a vault withdrawal counts its tUSDT (incl. earnings) against the same basis
      const out = item.kind === 'wd_save' ? item.shares! : item.amount!
      if (runningShares > 0n) basis -= (basis * (out > runningShares ? runningShares : out)) / runningShares
      runningShares -= out
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
