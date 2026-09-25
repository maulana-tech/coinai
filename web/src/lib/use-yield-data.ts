import { useCallback, useEffect, useRef, useState } from 'react'
import { getVaults, type Vaults } from '@/lib/yield'

export function useYieldData(user: string | null = null) {
  const [vaults, setVaults] = useState<Vaults | null>(null)
  const [loading, setLoading] = useState(true)
  const runId = useRef(0)

  const load = useCallback(async () => {
    const id = ++runId.current
    setLoading(true)
    const next = await getVaults(user).catch(() => null)
    if (runId.current !== id) return
    setVaults(next)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  return { vaults, loading, refresh: load }
}
