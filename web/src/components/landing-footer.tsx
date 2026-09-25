import { Link } from 'react-router-dom'
import { ArrowUpIcon } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'
import { EXPLORER_CONTRACT_URL } from '@/lib/config'
import { useT, type MessageKey } from '@/lib/i18n'

const PRODUCT_LINKS: { to: string; label: MessageKey }[] = [
  { to: '/app', label: 'nav.dashboard' },
  { to: '/app/yield', label: 'nav.yield' },
  { to: '/app/activity', label: 'nav.activity' },
  { to: '/app/link', label: 'nav.paymentLink' },
]

const PROTOCOL_LINKS: { href: string; logo: string; logoBackdrop?: string; name: MessageKey }[] = [
  { href: 'https://sparkdex.finance', logo: '/logos/sparkdex-icon.svg', name: 'yield.sourceSparkdexName' },
  { href: 'https://firelight.finance', logo: '/logos/firelight-icon.svg', name: 'yield.sourceFirelightName' },
  { href: 'https://upshift.finance', logo: '/logos/upshift-icon.svg', name: 'yield.sourceUpshiftName' },
]

function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function LandingFooter() {
  const t = useT()
  return (
    <footer className="relative z-10 border-t bg-card/40">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-14 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="text-lg font-semibold tracking-tight">coinAI</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            {t('landing.footerTagline')}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t('landing.footerProduct')}
          </p>
          <ul className="mt-3 space-y-2">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-muted-foreground hover:text-foreground">
                  {t(link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t('landing.footerProtocols')}
          </p>
          <ul className="mt-3 space-y-2">
            {PROTOCOL_LINKS.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
                    style={p.logoBackdrop ? { backgroundColor: p.logoBackdrop } : undefined}
                  >
                    <img
                      src={p.logo}
                      alt=""
                      className={
                        p.logoBackdrop ? 'h-[58%] w-[58%] object-contain' : 'h-full w-full object-cover'
                      }
                    />
                  </span>
                  {t(p.name)}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t('landing.footerResources')}
          </p>
          <ul className="mt-3 space-y-2">
            <li>
              <a
                href={EXPLORER_CONTRACT_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('landing.footerContract')}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
          <p>{t('landing.footer')}</p>
          <button
            type="button"
            onClick={scrollToTop}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 outline-none transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t('landing.backToTop')}
            <ArrowUpIcon className="size-3" />
          </button>
        </div>
      </div>
    </footer>
  )
}
