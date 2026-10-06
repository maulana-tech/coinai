import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LayoutGridIcon, LogOutIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { LogoWordmark } from '@/components/brand/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { errorKey } from '@/lib/errors'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

/** The translucent card surface of the standalone pages (same as /pay). */
export const GLASS = 'rounded-2xl shadow-none backdrop-blur-sm bg-card/80'

function WalletButton() {
  const t = useT()
  const { address, connecting, connect, disconnect } = useWallet()
  if (!address)
    return (
      <Button size="sm" className="rounded-full" disabled={connecting} onClick={() => void connect().catch((e) => toast.error(t(errorKey(e))))}>
        {connecting ? `${t('topbar.connecting')}...` : t('groups.connect')}
      </Button>
    )
  return (
    <span className="flex items-center gap-1 rounded-full border bg-card/80 py-1 pr-1 pl-1.5 backdrop-blur-sm">
      <AddressAvatar address={address} size={22} className="rounded-full" />
      <span className="hidden font-mono text-xs sm:inline">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
      <button
        type="button"
        aria-label={t('pay.switchWallet')}
        title={t('pay.switchWallet')}
        className="rounded-full p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => void disconnect()}
      >
        <LogOutIcon className="size-3.5" />
      </button>
    </span>
  )
}

/**
 * Standalone layout for the group pages, like /pay: the landing sky behind translucent cards, no app sidebar,
 * so the page is about one thing. Unlike /pay (one card, locked window) these pages run long, so the document
 * itself scrolls: Lenis smooth-scrolls the window, and an inner overflow container would be stuck under it.
 */
export function GroupShell({ children, width = 'wide' }: { children: ReactNode; width?: 'narrow' | 'wide' }) {
  const t = useT()
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-card/90 font-medium shadow-sm' : 'text-foreground/70 hover:text-foreground')
  return (
    <div className="relative min-h-svh">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: 'url(/assets/section1-bg.png)' }} />
      <div className="pointer-events-none fixed inset-0 z-0 bg-black/30" />
      <div className="relative z-10 flex min-h-svh flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/" aria-label="coinAI">
              <LogoWordmark className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" />
            </Link>
            <nav className="hidden items-center gap-1 rounded-full border bg-card/50 p-1 backdrop-blur-sm sm:flex">
              <NavLink to="/groups" end className={tab}>
                {t('nav.groups')}
              </NavLink>
              <NavLink to="/app" end className={tab}>
                {t('groups.backToApp')}
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden bg-card/60 text-muted-foreground backdrop-blur-sm md:inline-flex">
              {t('topbar.testnet')}
            </Badge>
            <Button asChild size="icon-sm" variant="outline" className="rounded-full bg-card/70 sm:hidden" aria-label={t('groups.backToApp')}>
              <Link to="/app">
                <LayoutGridIcon className="size-4" />
              </Link>
            </Button>
            <WalletButton />
          </div>
        </header>
        <main className={cn('mx-auto w-full flex-1 px-4 pt-4 pb-10 sm:px-6', width === 'narrow' ? 'max-w-xl' : 'max-w-[1260px]')}>{children}</main>
        <footer className="px-6 py-5 text-center text-sm text-white/80">{t('landing.footer')}</footer>
      </div>
    </div>
  )
}
