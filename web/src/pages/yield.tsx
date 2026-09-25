import { useState, useEffect } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { getFxrpBalance } from '@/lib/fxrp'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import type { YieldTarget } from '@/lib/types'
import { YieldDepositCard } from '@/components/yield-deposit-card'
import { YieldDirectDepositCard } from '@/components/yield-direct-deposit-card'
import { YieldPositionCard } from '@/components/yield-position-card'
import { YieldSourcesCard } from '@/components/yield-sources-card'
import { useAppState } from '@/lib/app-state'
import { useT } from '@/lib/i18n'
import { coinai } from '@/lib/coinai'
import { useYieldData } from '@/lib/use-yield-data'
import { useWallet } from '@/lib/wallet'

export function YieldPage() {
  const { address } = useWallet()
  const { account, accountStatus, activity, rates, busy, runAction, refresh } = useAppState()
  const { data, loading, refresh: refreshYield } = useYieldData()
  const t = useT()

  if (!address) return <ConnectPrompt />

  const tvl =
    data.vaultStats.idle !== null && data.vaultStats.invested !== null
      ? data.vaultStats.idle + data.vaultStats.invested
      : null

  const handleDeposit = async (args: {
    shares: bigint
    tokenOut: string
    adapter: string
    amountOutMin: bigint
    deadline: bigint
  }) => {
    const result = await runAction(
      'yield-deposit',
      'success.yieldDeposited',
      () =>
        coinai.withdrawSavingsToAdapter(
          address,
          args.shares,
          args.tokenOut,
          args.adapter,
          args.amountOutMin,
          args.deadline,
        ),
    )
    if (result) {
      await refresh()
      await refreshYield()
    }
  }

  const [walletBalance, setWalletBalance] = useState(0n)
  
  useEffect(() => {
    if (address) {
      getFxrpBalance(address).then(setWalletBalance).catch(console.error)
    }
  }, [address, busy])

  const handleDirectDeposit = async (args: {
    shares: bigint
    tokenOut: string
    adapter: string
    amountOutMin: bigint
    deadline: bigint
  }) => {
    if (!address) return
    const result = await runAction(
      'yield-direct',
      'success.yieldDeposited',
      () =>
        coinai.depositYieldDirect!(
          args.shares,
          args.tokenOut,
          args.adapter,
          args.amountOutMin,
          args.deadline,
        ),
    )
    if (result) {
      await refresh()
      await refreshYield()
    }
  }

  const handleSelectTarget = async (target: YieldTarget) => {
    if (!address) return
    const result = await runAction(
      `target-${target}`,
      'success.yieldTargetSaved',
      () => coinai.setYieldTarget(address, target),
    )
    if (result) {
      await refresh()
      await refreshYield()
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={t('nav.yield')} caption={t('page.yieldCaption')} />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('yield.refresh')}
          disabled={loading}
          onClick={() => {
            void refresh()
            void refreshYield()
          }}
        >
          <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
      <YieldPositionCard
        account={account}
        activity={activity}
        sharePrice={data.sharePrice}
        sparkdexPoolInfo={data.sparkdexPoolInfo}
        upshiftStats={data.upshiftStats}
        loading={accountStatus === 'loading'}
        rates={rates}
      />
      {account && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <YieldDepositCard
            shares={account.shares}
            yieldTarget={account.yieldTarget}
            rates={rates}
            onDeposit={handleDeposit}
            busy={busy === 'yield-deposit'}
            available={data.targetHealth[account.yieldTarget]}
          />
          <YieldDirectDepositCard
            walletBalance={walletBalance}
            yieldTarget={account.yieldTarget}
            rates={rates}
            onDirectDeposit={handleDirectDeposit}
            busy={busy === 'yield-direct'}
            available={data.targetHealth[account.yieldTarget]}
          />
        </div>
      )}
      <YieldSourcesCard
        sparkdexApy={data.sparkdexPoolInfo.apy}
        sparkdexTvl={data.sparkdexPoolInfo.tvl}
        firelightApy={null}
        firelightTvl={tvl}
        upshiftApy={data.upshiftStats.apy}
        upshiftTvl={data.upshiftStats.tvl}
        mainnetApy={data.mainnetApy}
        loading={loading}
        rates={rates}
        selectedTarget={account?.yieldTarget}
        onSelectTarget={handleSelectTarget}
        busyTarget={busy?.startsWith('target-') ? (busy.replace('target-', '') as YieldTarget) : null}
        targetHealth={data.targetHealth}
      />
    </section>
  )
}
