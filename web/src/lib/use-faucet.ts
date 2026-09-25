import { useCallback, useEffect, useState } from 'react'
import { getNativeBalance } from '@/lib/balances'
import { getFxrpBalance, FXRP_SCALE } from '@/lib/fxrp'
import { useWallet } from '@/lib/wallet'

const FAUCET_URL = 'https://faucet.flare.network/coston2'
const FAUCET_STORAGE_KEY = 'coinai:faucet:v1'

const MIN_C2FLR = 1n * 10n ** 17n // 0.1 C2FLR
const MIN_FXRP = 1n * FXRP_SCALE // 1 FXRP

export type FaucetBalance = {
  c2flr: bigint
  fxrp: bigint
}

export function faucetedFlag(address: string): boolean {
  try {
    const raw = localStorage.getItem(FAUCET_STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as Record<string, boolean>
    return data[address.toLowerCase()] === true
  } catch {
    return false
  }
}

function setFaucetedFlag(address: string, value: boolean) {
  try {
    const raw = localStorage.getItem(FAUCET_STORAGE_KEY)
    const data = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    data[address.toLowerCase()] = value
    localStorage.setItem(FAUCET_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export function useFaucet(): {
  faucetBusy: boolean
  anyBusy: boolean
  balances: FaucetBalance | null
  error: string | null
  hasFunds: boolean
  runFaucet: () => Promise<void>
  refreshBalances: () => Promise<void>
} {
  const { address } = useWallet()
  const [balances, setBalances] = useState<FaucetBalance | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances(null)
      setError(null)
      return
    }
    setError(null)
    try {
      const [c2flr, fxrp] = await Promise.all([
        getNativeBalance(address),
        getFxrpBalance(address),
      ])
      setBalances({ c2flr, fxrp })
      const funded = c2flr >= MIN_C2FLR || fxrp >= MIN_FXRP
      setFaucetedFlag(address, funded)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'balance_fetch_failed')
      setBalances(null)
    }
  }, [address])

  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  const runFaucet = useCallback(async () => {
    window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const hasFunds = balances
    ? balances.c2flr >= MIN_C2FLR || balances.fxrp >= MIN_FXRP
    : faucetedFlag(address ?? '')

  return {
    faucetBusy: false,
    anyBusy: false,
    balances,
    error,
    hasFunds,
    runFaucet,
    refreshBalances,
  }
}
