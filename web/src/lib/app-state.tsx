import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import { fetchActivity, type ActivityItem } from '@/lib/activity'
import { coinai } from '@/lib/coinai'
import { explorerTxUrl } from '@/lib/config'
import { errorKey } from '@/lib/errors'
import { shortHex } from '@/lib/format'
import { useT, type MessageKey } from '@/lib/i18n'
import { FALLBACK_RATES, getFxRates, type FxRates } from '@/lib/rates'
import type { CoinAIAccount } from '@/lib/types'
import { useWallet } from '@/lib/wallet'

type AccountStatus = 'disconnected' | 'loading' | 'ready' | 'error'

type AppStateValue = {
  account: CoinAIAccount | null
  accountStatus: AccountStatus
  rates: FxRates
  activity: ActivityItem[]
  activityLoading: boolean
  busy: string | null
  refresh: () => Promise<void>
  runAction: <T extends { hash: string }>(
    key: string,
    successKey: MessageKey,
    fn: () => Promise<T>,
  ) => Promise<T | null>
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet()
  const t = useT()
  const [account, setAccount] = useState<CoinAIAccount | null>(null)
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('disconnected')
  const [rates, setRates] = useState<FxRates>(FALLBACK_RATES)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const addressRef = useRef(address)

  useEffect(() => {
    void getFxRates().then(setRates)
  }, [])

  const load = useCallback(async (addr: string, initial: boolean) => {
    if (initial) {
      setAccount(null)
      setAccountStatus('loading')
      setActivity([])
      setActivityLoading(true)
    }
    const [accountResult, activityResult] = await Promise.allSettled([
      coinai.getAccount(addr),
      fetchActivity(addr, !initial),
    ])
    if (addressRef.current !== addr) return
    if (accountResult.status === 'fulfilled') {
      setAccount(accountResult.value)
      setAccountStatus('ready')
    } else {
      if (initial) setAccount(null) // keep stale data on refresh failure so cards stay usable
      setAccountStatus('error')
    }
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value)
    setActivityLoading(false)
  }, [])

  useEffect(() => {
    addressRef.current = address
    if (!address) {
      setAccount(null)
      setAccountStatus('disconnected')
      setActivity([])
      setActivityLoading(false)
      setBusy(null)
      return
    }
    void load(address, true)
  }, [address, load])

  const refresh = useCallback(async () => {
    if (addressRef.current) await load(addressRef.current, false)
  }, [load])

  const runAction = useCallback(
    async <T extends { hash: string }>(
      key: string,
      successKey: MessageKey,
      fn: () => Promise<T>,
    ): Promise<T | null> => {
      if (!address) {
        toast.error(t('common.connectFirst'))
        return null
      }
      setBusy(key)
      try {
        const result = await fn()
        // Wait 2s before reloading state to allow RPC nodes to sync
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await load(address, false)
        const hash = result.hash
        toast.success(t(successKey), {
          description: hash ? shortHex(hash) : undefined,
          action: hash
            ? {
                label: t('common.viewTx'),
                onClick: () => window.open(explorerTxUrl(hash), '_blank', 'noopener,noreferrer'),
              }
            : undefined,
        })
        return result
      } catch (e) {
        toast.error(t(errorKey(e)))
        return null
      } finally {
        setBusy(null)
      }
    },
    [address, load, t],
  )

  const value = useMemo(
    () => ({
      account,
      accountStatus,
      rates,
      activity,
      activityLoading,
      busy,
      refresh,
      runAction,
    }),
    [account, accountStatus, rates, activity, activityLoading, busy, refresh, runAction],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
