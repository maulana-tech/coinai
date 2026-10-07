import { Contract, Interface, type ContractRunner } from 'ethers'
import { useCallback, useEffect, useState } from 'react'
import { LEGACY_COINAI_ADDRESS, readProvider } from '@/lib/config'
import { sendTx, simulate } from '@/lib/coinai.evm'
import { getEthersSigner } from '@/lib/ethers-wagmi'

// coinAI v1 (evm/src/Save.sol), read only: users who still hold funds there take them back to their wallet
// (option 1 in next.md) and use v2 from then on. v1 vault shares sit in the user's own wallet.
const V1_ABI = [
  'function accountOf(address user) view returns ((uint16 splitBps,uint128 spend,uint128 shares,uint64 lockUntil,uint8 yieldTarget))',
  'function vaultOf(uint8 target) view returns (address)',
  'function withdrawSpend(address user,uint256 amount) returns (uint256)',
  'function withdrawSavings(address user,uint256 shares) returns (uint256)',
  'error LockActive()',
  'error InsufficientSpendable()',
  'error InsufficientShares()',
]
const VAULT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function redeem(uint256 shares,address receiver,address owner) returns (uint256)',
]
const iface = new Interface(V1_ABI)

export type LegacyHoldings = {
  spend: bigint
  savings: bigint // idle savings in v1
  lockUntil: bigint // v1's lock still blocks `savings`
  vaults: { address: string; shares: bigint; value: bigint }[] // v1 positions: shares in the user's wallet
  total: bigint
}

export async function getLegacyHoldings(user: string): Promise<LegacyHoldings | null> {
  if (!LEGACY_COINAI_ADDRESS) return null
  const v1 = new Contract(LEGACY_COINAI_ADDRESS, V1_ABI, readProvider)
  const [acc, addresses] = await Promise.all([
    v1.accountOf(user),
    Promise.all([0, 1, 2].map((i) => v1.vaultOf(i) as Promise<string>)),
  ])
  const vaults = await Promise.all(
    addresses.map(async (address) => {
      const v = new Contract(address, VAULT_ABI, readProvider)
      const shares = BigInt(await v.balanceOf(user))
      return { address, shares, value: shares === 0n ? 0n : BigInt(await v.convertToAssets(shares)) }
    }),
  )
  const spend = BigInt(acc.spend)
  const savings = BigInt(acc.shares)
  const total = vaults.reduce((sum, v) => sum + v.value, spend + savings)
  return { spend, savings, lockUntil: BigInt(acc.lockUntil), vaults, total }
}

export const legacyLocked = (h: LegacyHoldings) => h.savings > 0n && Number(h.lockUntil) * 1000 > Date.now()

/** Takes everything that can leave v1 back to the wallet, one transaction per pocket; returns the last hash. */
export async function withdrawLegacy(user: string, h: LegacyHoldings): Promise<{ hash: string }> {
  const signer = (await getEthersSigner()) as ContractRunner
  const v1 = new Contract(LEGACY_COINAI_ADDRESS, V1_ABI, signer)
  let hash = ''
  if (h.spend > 0n) hash = await sendTx(v1.withdrawSpend(user, h.spend, { gasLimit: 200_000 }), iface)
  if (h.savings > 0n && !legacyLocked(h)) {
    await simulate(v1.withdrawSavings.staticCall(user, h.savings), iface)
    hash = await sendTx(v1.withdrawSavings(user, h.savings, { gasLimit: 300_000 }), iface)
  }
  for (const v of h.vaults) {
    if (v.shares === 0n) continue
    const vault = new Contract(v.address, VAULT_ABI, signer)
    hash = await sendTx(vault.redeem(v.shares, user, user, { gasLimit: 200_000 }))
  }
  return { hash }
}

export function useLegacyHoldings(user: string | null) {
  const [holdings, setHoldings] = useState<LegacyHoldings | null>(null)
  const load = useCallback(async () => {
    setHoldings(user ? await getLegacyHoldings(user).catch(() => null) : null)
  }, [user])
  useEffect(() => {
    void load()
  }, [load])
  return { holdings, refresh: load }
}
