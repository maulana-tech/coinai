import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { errorKey } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { getNativeBalance } from '@/lib/balances'
import { faucetAvailableAt, getTokenBalance, mintTestTokens, TOKEN_SCALE } from '@/lib/token'
import { TBNB_FAUCET_URL, TOKEN_ADDRESS } from '@/lib/config'
import { useWallet } from '@/lib/wallet'

const FAUCET_STORAGE_KEY = 'coinai:faucet:v1'

const MIN_BNB = 1n * 10n ** 16n // 0.01 tBNB, enough gas for many txs
const MIN_TOKEN = 1n * TOKEN_SCALE // 1 tUSDT

export type FaucetBalance = {
  bnb: bigint
  usdt: bigint
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
  mintBusy: boolean
  mintAvailableAt: number
  mintTokens: () => Promise<string | null>
  refreshBalances: () => Promise<void>
} {
  const { address } = useWallet()
  const t = useT()
  const [balances, setBalances] = useState<FaucetBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mintBusy, setMintBusy] = useState(false)
  const [mintAvailableAt, setMintAvailableAt] = useState(0)

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setBalances(null)
      setError(null)
      return
    }
    setError(null)
    try {
      const [bnb, usdt, availableAt] = await Promise.all([
        getNativeBalance(address),
        TOKEN_ADDRESS ? getTokenBalance(address) : 0n,
        TOKEN_ADDRESS ? faucetAvailableAt(address) : 0,
      ])
      setBalances({ bnb, usdt })
      setMintAvailableAt(availableAt)
      const funded = bnb >= MIN_BNB && usdt >= MIN_TOKEN
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
    window.open(TBNB_FAUCET_URL, '_blank', 'noopener,noreferrer')
  }, [])

  // Returns the tx hash, or null after a toast. `error` stays for balance loading only.
  const mintTokens = useCallback(async () => {
    setMintBusy(true)
    try {
      const hash = await mintTestTokens()
      await refreshBalances()
      return hash
    } catch (e) {
      toast.error(t(errorKey(e)))
      return null
    } finally {
      setMintBusy(false)
    }
  }, [refreshBalances, t])

  const hasFunds = balances
    ? balances.bnb >= MIN_BNB && balances.usdt >= MIN_TOKEN
    : faucetedFlag(address ?? '')

  return {
    faucetBusy: false,
    anyBusy: mintBusy,
    mintBusy,
    mintAvailableAt,
    mintTokens,
    balances,
    error,
    hasFunds,
    runFaucet,
    refreshBalances,
  }
}
