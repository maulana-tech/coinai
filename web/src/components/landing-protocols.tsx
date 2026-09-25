import { ExternalLinkIcon } from 'lucide-react'
import { LandingProtocolDeco } from '@/components/landing-protocol-deco'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Protocol = {
  key: string
  logo: string
  logoBackdrop?: string
  website: string
  name: MessageKey
  route: MessageKey
  badge: 'active' | 'soon'
}

const PROTOCOLS: Protocol[] = [
  {
    key: 'sparkdex',
    logo: '/logos/sparkdex-icon.svg',
    website: 'https://sparkdex.finance',
    name: 'yield.sourceSparkdexName',
    route: 'yield.sourceSparkdexRoute',
    badge: 'active',
  },
  {
    key: 'firelight',
    logo: '/logos/firelight-icon.svg',
    website: 'https://firelight.finance',
    name: 'yield.sourceFirelightName',
    route: 'yield.sourceFirelightRoute',
    badge: 'active',
  },
  {
    key: 'upshift',
    logo: '/logos/upshift-icon.svg',
    website: 'https://upshift.finance',
    name: 'yield.sourceUpshiftName',
    route: 'yield.sourceUpshiftRoute',
    badge: 'active',
  },
]

export function LandingProtocols() {
  const t = useT()
  return (
    <section id="protocols" className="relative overflow-hidden px-6 py-20">
      <LandingProtocolDeco />
      <div className="relative mx-auto w-full max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t('landing.protocolsTitle')}
          </h2>
          <p className="mt-3 text-muted-foreground">{t('landing.protocolsCaption')}</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PROTOCOLS.map((p) => (
            <a
              key={p.key}
              href={p.website}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
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
              <div>
                <p className="flex items-center justify-center gap-1 font-medium">
                  {t(p.name)}
                  <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t(p.route)}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[10px] font-medium',
                  p.badge === 'active'
                    ? 'bg-primary text-primary-foreground'
                    : 'border text-muted-foreground',
                )}
              >
                {t(p.badge === 'active' ? 'yield.badgeActive' : 'yield.badgeSoon')}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
