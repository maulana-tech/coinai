import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppState } from '@/lib/app-state'
import { useT } from '@/lib/i18n'
import type { CoinAIAccount } from '@/lib/types'

type AccountPanelProps = {
  children: (account: CoinAIAccount) => ReactNode
}

export function AccountPanel({ children }: AccountPanelProps) {
  const { account, accountStatus, refresh } = useAppState()
  const t = useT()

  if (accountStatus === 'error') {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-4 text-sm">
        <span>{t('errors.loadFailed')}</span>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }
  if (account === null) return <Skeleton className="h-48 w-full rounded-2xl" />
  return <>{children(account)}</>
}
