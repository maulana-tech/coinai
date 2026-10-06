import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from 'next-themes'
import {
  ActivityIcon,
  ArrowUpRightIcon,
  BotIcon,
  ChartPieIcon,
  CandlestickChartIcon,
  MessageCircleIcon,
  DropletsIcon,
  ExternalLinkIcon,
  LandmarkIcon,
  Link2Icon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SunIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { LogoMark } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { EXPLORER_CONTRACT_URL } from '@/lib/config'
import { useT, type MessageKey } from '@/lib/i18n'
import { useScrollLock } from '@/lib/use-scroll-lock'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { WalletPicker } from '@/components/wallet-picker'

const ITEM =
  'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]'
const ITEM_IDLE = 'text-muted-foreground hover:bg-muted hover:text-foreground'
const ITEM_ACTIVE = 'bg-primary/10 text-primary-ink'

const PANEL_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

function greetingKey(hour: number): MessageKey {
  if (hour >= 5 && hour < 12) return 'greeting.morning'
  if (hour >= 12 && hour < 17) return 'greeting.afternoon'
  if (hour >= 17 && hour < 21) return 'greeting.evening'
  return 'greeting.night'
}

function labelClass(rail: boolean): string {
  return cn(
    'whitespace-nowrap transition-[opacity,translate] duration-[180ms] ease-out motion-reduce:transition-none',
    // collapse fades with no delay so text never outlives the shrinking panel
    rail ? '-translate-x-1 opacity-0' : 'translate-x-0 opacity-100 delay-[90ms]',
  )
}

// Grouped by what people come to do: their money, growing it, the AI team, doing it together.
const NAV_SECTIONS: { label: MessageKey; items: { to: string; label: MessageKey; icon: LucideIcon; end?: boolean }[] }[] = [
  {
    label: 'nav.sectionMoney',
    items: [
      { to: '/app', label: 'nav.dashboard', icon: LandmarkIcon, end: true },
      { to: '/app/activity', label: 'nav.activity', icon: ActivityIcon },
      { to: '/app/link', label: 'nav.paymentLink', icon: Link2Icon },
      { to: '/app/withdraw', label: 'nav.withdraw', icon: ArrowUpRightIcon },
    ],
  },
  {
    label: 'nav.sectionGrow',
    items: [
      { to: '/app/yield', label: 'nav.yield', icon: TrendingUpIcon },
      { to: '/app/portfolio', label: 'nav.portfolio', icon: ChartPieIcon },
      { to: '/app/market', label: 'nav.market', icon: CandlestickChartIcon },
    ],
  },
  {
    label: 'nav.sectionAi',
    items: [
      { to: '/app/agent', label: 'nav.agent', icon: BotIcon },
      { to: '/app/chat', label: 'nav.chat', icon: MessageCircleIcon },
    ],
  },
  { label: 'nav.sectionSocial', items: [{ to: '/groups', label: 'nav.groups', icon: UsersIcon }] },
]
// Settings-like pages share the pinned bottom section, so the scrolling part fits a laptop screen.
const MORE_ITEMS: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: '/app/rules', label: 'nav.rules', icon: SlidersHorizontalIcon },
  { to: '/app/faucet', label: 'nav.faucet', icon: DropletsIcon },
]

function SectionLabel({ rail, children }: { rail: boolean; children: string }) {
  return (
    <p
      className={cn(
        'px-3 pt-5 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase',
        labelClass(rail),
      )}
    >
      {children}
    </p>
  )
}

type SidebarContentProps = {
  rail?: boolean
  onNavigate?: () => void
  onToggle?: () => void
}

function SidebarContent({ rail = false, onNavigate, onToggle }: SidebarContentProps) {
  const t = useT()
  const { address, connecting, disconnect } = useWallet()
  const label = labelClass(rail)
  const [pickerOpen, setPickerOpen] = useState(false)

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(ITEM, isActive ? ITEM_ACTIVE : ITEM_IDLE)

  return (
    <div className="flex h-full flex-col p-4">
      <div className={cn("flex items-center pt-1 pb-2", rail ? "justify-center" : "justify-between px-[9px]")}>
        <div className={cn("flex items-center gap-2", rail && "hidden")}>
          <LogoMark size={22} />
          <span className={cn('text-lg font-semibold tracking-tight', label)}>coinAI</span>
        </div>
        {onToggle && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Toggle Sidebar" className={cn(rail && "size-10")}>
            <PanelLeftIcon className={cn("text-muted-foreground", rail ? "size-5" : "size-4")} />
          </Button>
        )}
      </div>
      <nav className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <SectionLabel rail={rail}>{t(section.label)}</SectionLabel>
            {section.items.map(({ to, label: itemLabel, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onNavigate} className={navClass}>
                <Icon className="size-[18px] shrink-0" />
                <span className={label}>{t(itemLabel)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-2 flex flex-col pt-2 border-t">
        <SectionLabel rail={rail}>{t('nav.sectionMore')}</SectionLabel>
        {MORE_ITEMS.map(({ to, label: itemLabel, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className={navClass}>
            <Icon className="size-[18px] shrink-0" />
            <span className={label}>{t(itemLabel)}</span>
          </NavLink>
        ))}
        <NavLink to="/app/settings" onClick={onNavigate} className={navClass}>
          <SettingsIcon className="size-[18px] shrink-0" />
          <span className={label}>{t('settings.title')}</span>
        </NavLink>
        <a
          href={EXPLORER_CONTRACT_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(ITEM, ITEM_IDLE, 'mb-2')}
        >
          <ExternalLinkIcon className="size-[18px] shrink-0" />
          <span className={label}>{t('nav.viewContract')}</span>
        </a>
        {address ? (
          <button
            type="button"
            className={cn(ITEM, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
            onClick={() => void disconnect()}
          >
            <LogOutIcon className="size-[18px] shrink-0" />
            <span className={label}>{t('nav.disconnect')}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              className={cn(
                ITEM,
                'text-primary-ink hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50',
              )}
              disabled={connecting}
              onClick={() => setPickerOpen(true)}
            >
              <WalletIcon className="size-[18px] shrink-0" />
              <span className={label}>
                {connecting ? `${t('topbar.connecting')}...` : t('topbar.connect')}
              </span>
            </button>
            <WalletPicker open={pickerOpen} onOpenChange={setPickerOpen} />
          </>
        )}
      </div>
    </div>
  )
}

function ThemeToggle() {
  const t = useT()
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('shell.theme')}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  )
}

function AddressChip({ address }: { address: string }) {
  const t = useT()

  const copy = async () => {
    await navigator.clipboard.writeText(address)
    toast.success(t('settings.copied'))
  }

  return (
    <button
      type="button"
      aria-label={t('shell.copyAddress')}
      className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 font-mono text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => void copy()}
    >
      <AddressAvatar address={address} size={24} className="rounded-full" />
      {shortAddress(address)}
    </button>
  )
}

// inline transition-duration on the aside beats any motion-reduce: class, so query directly
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function AppShell() {
  const t = useT()
  const { address } = useWallet()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const asideRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useScrollLock()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  return (
    <div className="relative min-h-svh">
      <aside
        ref={asideRef}
        id="app-sidebar"
        className={cn(
          'fixed top-4 bottom-4 left-4 z-40 hidden flex-col overflow-hidden rounded-2xl border bg-card shadow-lg shadow-stone-950/10 transition-[width] md:flex',
          sidebarOpen ? 'w-[264px]' : 'w-[72px]'
        )}
        style={{
          transitionTimingFunction: PANEL_EASE,
          transitionDuration: reducedMotion ? '0ms' : '300ms',
        }}
      >
        <SidebarContent rail={!sidebarOpen} onToggle={toggleSidebar} />
      </aside>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          className="w-72"
          closeLabel={t('common.close')}
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
          <SidebarContent onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
      <div 
        ref={scrollRef} 
        className={cn(
          "relative z-10 w-full transition-[padding] duration-300",
          sidebarOpen ? "md:pl-[280px]" : "md:pl-[88px]"
        )}
      >
        <main className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl px-4 pt-6 pb-12 md:pt-16">
          {/* touch tablets pass md: but never fire mouse hot zones, so keep the sheet toggle */}
          <div className="mb-4 flex md:pointer-fine:hidden">
            <button
              type="button"
              aria-label={t('shell.openMenu')}
              aria-haspopup="dialog"
              className="flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm outline-none transition-all duration-200 hover:shadow-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
              onClick={() => setSheetOpen(true)}
            >
              <LogoMark size={22} />
            </button>
          </div>
          <div className="mb-8 flex items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t(greetingKey(new Date().getHours()))}
            </h1>
            <div className="flex items-center gap-2">
              {address && <AddressChip address={address} />}
              <ThemeToggle />
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
