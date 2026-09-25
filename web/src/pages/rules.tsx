import { AccountPanel } from '@/components/account-panel'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { RulesCard } from '@/components/rules-card'
import { useT } from '@/lib/i18n'
import { useWallet } from '@/lib/wallet'

export function RulesPage() {
  const t = useT()
  const { address } = useWallet()

  if (!address) return <ConnectPrompt />

  return (
    <section className="space-y-5">
      <PageHeader title={t('nav.rules')} caption={t('page.rulesCaption')} />
      <AccountPanel>{(account) => <RulesCard account={account} />}</AccountPanel>
    </section>
  )
}
