import { Link } from 'react-router-dom'
import { useT } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

export function LandingCta() {
  const t = useT()
  return (
    <section className="relative z-20 min-h-svh flex items-center overflow-hidden px-[clamp(20px,5vw,72px)]">
      <img className="absolute inset-0 z-[-3] h-full w-full object-cover opacity-40 mix-blend-luminosity" src="/assets/section1-bg.png" alt="" />
      <div className="pointer-events-none absolute inset-0 z-[-2] bg-[radial-gradient(48%_56%_at_50%_47%,rgba(9,13,22,0.6),rgba(9,13,22,0.1)_76%),linear-gradient(to_bottom,rgba(29,34,21,0.6),transparent_22%,transparent_60%,rgba(9,13,22,0.7))]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-3xl text-center">
        <h2
          className="text-[clamp(2.4rem,5.5vw,4.8rem)] font-bold leading-[0.88] tracking-[-0.05em] text-[#f2ecda]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {t('landing.footerCtaTitle')}
        </h2>
        <p className="mt-6 text-lg text-[#b7d6bd] max-w-lg mx-auto">
          {t('landing.footerCtaBody')}
        </p>
        <Button asChild size="lg" className="mt-10 bg-[#d5aa61] text-[#193d2d] hover:bg-[#e4c17b] border-none font-bold rounded-lg px-10">
          <Link to="/app">{t('landing.cta')}</Link>
        </Button>
      </div>
    </section>
  )
}
