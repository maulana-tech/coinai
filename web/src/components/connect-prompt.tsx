import { ConnectButton } from '@/components/connect-button'
import { useT } from '@/lib/i18n'

export function ConnectPrompt() {
  const t = useT()

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
