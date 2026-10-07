import { Link } from 'react-router-dom'
import { ArrowRightIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppState } from '@/lib/app-state'
import { formatDate, formatMoney, useT } from '@/lib/i18n'
import { legacyLocked, useLegacyHoldings, withdrawLegacy } from '@/lib/legacy'
import { useSettings } from '@/lib/settings'
import { useWallet } from '@/lib/wallet'

/** Shown while the user still holds funds in coinAI v1: take them back to the wallet, then deposit into v2. */
export function LegacyBanner() {
  const t = useT()
  const { address } = useWallet()
  const { locale, primaryCurrency } = useSettings()
  const { busy, rates, runAction } = useAppState()
  const { holdings, refresh } = useLegacyHoldings(address)
  if (!address || !holdings || holdings.total === 0n) return null

  const locked = legacyLocked(holdings)
  const movable = locked ? holdings.total - holdings.savings : holdings.total
  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)

  const handleWithdraw = async () => {
    if (await runAction('legacy', 'success.legacyWithdrawn', () => withdrawLegacy(address, holdings))) void refresh()
  }

  return (
    <div role="status" className="mb-5 space-y-3 rounded-2xl border border-gold/40 bg-gold/5 p-4 text-sm">
      <div>
        <p className="font-medium">{t('legacy.title', { amount: money(holdings.total) })}</p>
        <p className="mt-1 text-muted-foreground">{t('legacy.body')}</p>
        {locked && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('legacy.locked', { amount: money(holdings.savings), date: formatDate(holdings.lockUntil, locale) })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {movable > 0n && (
          <Button size="sm" className="rounded-full" disabled={busy !== null} onClick={() => void handleWithdraw()}>
            {busy === 'legacy' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            {t('legacy.withdraw', { amount: money(movable) })}
          </Button>
        )}
        <Link to="/app/faucet#deposit" className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink hover:underline">
          {t('legacy.deposit')}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
