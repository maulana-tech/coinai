import { RefreshCwIcon } from 'lucide-react'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { BasketCard } from '@/components/basket-card'
import { MoveCard } from '@/components/move-card'
import type { Position } from '@/lib/types'
import { YieldDepositCard } from '@/components/yield-deposit-card'
import { YieldPositionCard } from '@/components/yield-position-card'
import { YieldSourcesCard } from '@/components/yield-sources-card'
import { useAppState } from '@/lib/app-state'
import { useT } from '@/lib/i18n'
import { coinai } from '@/lib/coinai'
import { useYieldData } from '@/lib/use-yield-data'
import { useWallet } from '@/lib/wallet'
import { mainVault } from '@/lib/yield'

export function YieldPage() {
  const { address } = useWallet()
  const { account, accountStatus, activity, rates, busy, runAction, refresh } = useAppState()
  const { vaults, loading, refresh: refreshYield } = useYieldData()
  const t = useT()

  if (!address) return <ConnectPrompt />

  const handleDeposit = async (amount: bigint, target: Position) => {
    const result = await runAction('yield-deposit', 'success.yieldDeposited', () =>
      coinai.investSavings(address, amount, target),
    )
    if (result) await refreshYield()
    return Boolean(result)
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
        loading={accountStatus === 'loading'}
        rates={rates}
      />
      {account && (
        <YieldDepositCard
          account={account}
          vaults={vaults}
          rates={rates}
          onDeposit={handleDeposit}
          busy={busy === 'yield-deposit'}
        />
      )}
      {account && <MoveCard account={account} />}
      <YieldSourcesCard
        vaults={vaults}
        loading={loading}
        rates={rates}
        selectedTarget={mainVault(account)}
      />
      <BasketCard address={address} />
    </section>
  )
}
