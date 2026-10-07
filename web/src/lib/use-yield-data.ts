import { useCallback, useEffect, useRef, useState } from 'react'
import { getVaults, type Vaults } from '@/lib/yield'

export function useYieldData() {
  const [vaults, setVaults] = useState<Vaults | null>(null)
  const [loading, setLoading] = useState(true)
  const runId = useRef(0)

  const load = useCallback(async () => {
    const id = ++runId.current
    setLoading(true)
    const next = await getVaults().catch(() => null)
    if (runId.current !== id) return
    setVaults(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { vaults, loading, refresh: load }
}
