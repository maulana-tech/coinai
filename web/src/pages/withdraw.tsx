import { AccountPanel } from '@/components/account-panel'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { WithdrawCard } from '@/components/withdraw-card'
import { useT } from '@/lib/i18n'
import { useWallet } from '@/lib/wallet'

export function WithdrawPage() {
  const t = useT()
  const { address } = useWallet()

  if (!address) return <ConnectPrompt />

  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.withdraw')} caption={t('page.withdrawCaption')} />
      <AccountPanel>{(account) => <WithdrawCard account={account} />}</AccountPanel>
    </section>
  )
}
