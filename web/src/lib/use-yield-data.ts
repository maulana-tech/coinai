import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSharePrice,
  getFirelightVaultStats,
  getSparkDexPoolInfo,
  getUpshiftStats,
  getTargetHealth,
  getSparkDexMainnetReferenceApy,
  getFirelightMainnetReferenceApy,
  getUpshiftMainnetReferenceApy,
  type SparkDexPoolInfo,
  type TargetHealth,
  type VaultStats,
  type UpshiftStats,
} from '@/lib/yield'

type MainnetReferenceApy = {
  upshift: number | null
  firelight: number | null
  sparkdex: number | null
}

type YieldData = {
  sharePrice: bigint | null
  vaultStats: VaultStats
  sparkdexPoolInfo: SparkDexPoolInfo
  upshiftStats: UpshiftStats
  mainnetApy: MainnetReferenceApy
  targetHealth: TargetHealth
}

const EMPTY_STATS: VaultStats = { totalSupply: null, idle: null, invested: null }
const EMPTY_SPARKDEX: SparkDexPoolInfo = { apy: null, tvl: null, feeRate: null }
const EMPTY_UPSHIFT: UpshiftStats = { apy: null, tvl: null }
const EMPTY_MAINNET_APY: MainnetReferenceApy = { upshift: null, firelight: null, sparkdex: null }
const EMPTY_HEALTH: TargetHealth = { sparkdex: true, firelight: true, upshift: true }

export function useYieldData() {
  const [data, setData] = useState<YieldData>({
    sharePrice: null,
    vaultStats: EMPTY_STATS,
    sparkdexPoolInfo: EMPTY_SPARKDEX,
    upshiftStats: EMPTY_UPSHIFT,
    mainnetApy: EMPTY_MAINNET_APY,
    targetHealth: EMPTY_HEALTH,
  })
  const [loading, setLoading] = useState(true)
  const runId = useRef(0)

  const load = useCallback(async () => {
    const id = ++runId.current
    setLoading(true)
    const [
      sharePrice,
      vaultStats,
      sparkdexPoolInfo,
      upshiftStats,
      targetHealth,
      sparkdexMainnetApy,
      firelightMainnetApy,
      upshiftMainnetApy,
    ] = await Promise.all([
      getSharePrice(),
      getFirelightVaultStats(),
      getSparkDexPoolInfo(),
      getUpshiftStats(),
      getTargetHealth(),
      getSparkDexMainnetReferenceApy(),
      getFirelightMainnetReferenceApy(),
      getUpshiftMainnetReferenceApy(),
    ])
    if (runId.current !== id) return
    setData({
      sharePrice,
      vaultStats,
      sparkdexPoolInfo,
      upshiftStats,
      mainnetApy: { sparkdex: sparkdexMainnetApy, firelight: firelightMainnetApy, upshift: upshiftMainnetApy },
      targetHealth,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, refresh: load }
}
