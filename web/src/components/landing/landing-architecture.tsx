import { useT } from '@/lib/i18n'
import { LandingSectionLabel } from './landing-section-label'

const PROTOCOLS = [
  { name: 'SparkDEX', logo: '/logos/sparkdex-icon.svg', href: 'https://sparkdex.finance' },
  { name: 'Firelight', logo: '/logos/firelight-icon.svg', href: 'https://firelight.finance' },
  { name: 'Upshift', logo: '/logos/upshift-icon.svg', href: 'https://upshift.finance' },
] as const

export function LandingArchitecture() {
  const t = useT()
  const steps = [
    { step: '01', label: t('landing.archStep1'), body: t('landing.archStep1Body') },
    { step: '02', label: t('landing.archStep2'), body: t('landing.archStep2Body') },
    { step: '03', label: t('landing.archStep3'), body: t('landing.archStep3Body') },
  ] as const

  return (
    <section className="relative z-20 paper-grain overflow-hidden bg-[#eee8d8] px-[clamp(20px,5vw,72px)] min-h-svh flex items-center" id="protocols">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.11]"
        aria-hidden="true"
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(28,73,52,1) 1px, transparent 1px), linear-gradient(180deg, rgba(28,73,52,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-start gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <LandingSectionLabel number="04">{t('landing.archLabel')}</LandingSectionLabel>
          <h2
            className="mt-4 text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[0.9] tracking-[-0.04em] text-[#193d2d]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {t('landing.archTitle')}
          </h2>
          <p className="mt-6 text-[clamp(1rem,1.4vw,1.15rem)] font-medium leading-[1.6] text-[#4c5d4a]">
            {t('landing.archBody')}
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            {PROTOCOLS.map((p) => (
              <a
                key={p.name}
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 rounded-full border border-[#4c5d4a]/30 bg-[#f4ede0]/60 px-4 py-2 text-sm font-semibold text-[#193d2d] transition-all hover:bg-[#f4ede0] hover:shadow-md"
              >
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e4c17b]/40">
                  <img src={p.logo} alt="" className="h-full w-full object-contain p-0.5" />
                </span>
                {p.name}
              </a>
            ))}
          </div>
        </div>

        <div className="relative bg-[#e4c17b]/50 p-8 sm:p-10 border border-[#4c5d4a]/20">
          <div className="flex flex-col gap-6">
            {steps.map((s, i) => (
              <div key={s.step}>
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#1c4934]/30 font-mono text-xs font-bold text-[#1c4934]">
                    {s.step}
                  </span>
                  <div>
                    <p className="font-bold text-[#193d2d]">{s.label}</p>
                    <p className="mt-1 text-sm text-[#4c5d4a]">{s.body}</p>
                  </div>
                </div>
                {i < 2 && (
                  <div className="ml-5 mt-3 mb-1 w-px h-6 border-l-2 border-dashed border-[#1c4934]/20" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
