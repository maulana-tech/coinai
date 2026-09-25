import { RefreshCwIcon } from 'lucide-react'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import type { YieldTarget } from '@/lib/types'
import { YieldDepositCard } from '@/components/yield-deposit-card'
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
  const { vaults, loading, refresh: refreshYield } = useYieldData(address)
  const t = useT()

  if (!address) return <ConnectPrompt />

  const handleDeposit = async (amount: bigint) => {
    if (!account) return
    const result = await runAction('yield-deposit', 'success.yieldDeposited', () =>
      coinai.investSavings(address, amount, account.yieldTarget),
    )
    if (result) {
      await refresh()
      await refreshYield()
    }
  }

  const handleSelectTarget = async (target: YieldTarget) => {
    const result = await runAction(`target-${target}`, 'success.yieldTargetSaved', () =>
      coinai.setYieldTarget(address, target),
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
        vaults={vaults}
        loading={accountStatus === 'loading'}
        rates={rates}
      />
      {account && (
        <YieldDepositCard
          shares={account.shares}
          yieldTarget={account.yieldTarget}
          vaultAddress={vaults?.[account.yieldTarget].address || null}
          rates={rates}
          onDeposit={handleDeposit}
          busy={busy === 'yield-deposit'}
          available={vaults !== null}
        />
      )}
      <YieldSourcesCard
        vaults={vaults}
        loading={loading}
        rates={rates}
        selectedTarget={account?.yieldTarget}
        onSelectTarget={handleSelectTarget}
        busyTarget={busy?.startsWith('target-') ? (busy.replace('target-', '') as YieldTarget) : null}
      />
    </section>
  )
}
