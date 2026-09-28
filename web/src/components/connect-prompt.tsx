import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/connect-button'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n'

export function ConnectPrompt() {
  const t = useT()
  const { status } = useAccount()

  // A returning wallet is restored on load; don't flash "connect your wallet" while that runs.
  if (status === 'reconnecting' || status === 'connecting') {
    return (
      <div className="space-y-4 py-2" aria-busy="true">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">{t('dashboard.connectTitle')}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{t('dashboard.connectCaption')}</p>
      <div className="mt-6">
        <ConnectButton />
      </div>
    </div>
  )
}
