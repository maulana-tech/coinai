import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { LogoMark } from '@/components/brand/logo'

const PRODUCT_LINKS = [
  { to: '/app', labelKey: 'nav.dashboard' as const },
  { to: '/app/yield', labelKey: 'nav.yield' as const },
  { to: '/app/activity', labelKey: 'nav.activity' as const },
  { to: '/app/link', labelKey: 'nav.paymentLink' as const },
]

const PROTOCOL_LINKS = [
  { href: 'https://sparkdex.finance', logo: '/logos/sparkdex-icon.svg', name: 'SparkDEX' },
  { href: 'https://firelight.finance', logo: '/logos/firelight-icon.svg', name: 'Firelight' },
  { href: 'https://upshift.finance', logo: '/logos/upshift-icon.svg', name: 'Upshift' },
] as const

export function LandingFooter() {
  const t = useT()
  return (
    <footer className="relative z-10 border-t border-[#c9bfa5] bg-[#eee8d8] min-h-svh flex flex-col justify-center">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-14 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="text-lg font-semibold tracking-tight text-[#193d2d]">coinAI</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-[#526457]">{t('landing.footerTagline')}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.23em] uppercase text-[#526457]">{t('landing.footerProduct')}</p>
          <ul className="mt-3 space-y-2">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-sm text-[#526457] hover:text-[#193d2d] transition-colors">
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.23em] uppercase text-[#526457]">{t('landing.footerProtocols')}</p>
          <ul className="mt-3 space-y-2">
            {PROTOCOL_LINKS.map((p) => (
              <li key={p.href}>
                <a href={p.href} target="_blank" rel="noreferrer" className="group flex items-center gap-2 text-sm text-[#526457] hover:text-[#193d2d] transition-colors">
                  <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c9bf9f]/50">
                    <img src={p.logo} alt="" className="h-full w-full object-contain p-0.5" />
                  </span>
                  {p.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold tracking-[0.23em] uppercase text-[#526457]">{t('landing.footerResources')}</p>
          <ul className="mt-3 space-y-2">
            <li>
              <a href="https://dev.flare.network" target="_blank" rel="noreferrer" className="text-sm text-[#526457] hover:text-[#193d2d] transition-colors">
                Flare Docs
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#c9bfa5]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-[#526457]">
          <p>{t('landing.footer')}</p>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#c9bfa5] px-3 py-1.5 outline-none transition-colors hover:text-[#193d2d] hover:border-[#193d2d]"
          >
            {t('landing.backToTop')} ↑
          </button>
        </div>
      </div>
    </footer>
  )
}
