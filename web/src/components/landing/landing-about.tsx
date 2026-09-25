import { useT } from '@/lib/i18n'
import { ScrollReveal } from '@/components/brand/scroll-reveal'
import { LandingSectionLabel } from './landing-section-label'

export function LandingAbout() {
  const t = useT()
  return (
    <section className="relative z-20 paper-grain bg-[#eee8d8] px-[clamp(20px,5vw,72px)] min-h-svh flex items-center" id="about">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div>
          <ScrollReveal
            containerClassName="max-w-lg"
            textClassName="text-[clamp(2.4rem,5vw,4.2rem)] font-bold leading-[0.84] tracking-[-0.045em] text-[#193d2d]"
            baseRotation={0}
            blurStrength={3}
          >
            {t('landing.aboutTitle')}
          </ScrollReveal>
        </div>

        <div className="lg:mt-8">
          <ScrollReveal textClassName="text-[clamp(1.05rem,1.55vw,1.2rem)] font-medium leading-[1.6] text-[#526457]" baseRotation={0} blurStrength={2}>
            {t('landing.aboutBody')}
          </ScrollReveal>

          <div className="mt-12 grid grid-cols-1 gap-0 sm:grid-cols-2">
            <div className="border-t border-[#c9bfa5] py-6 sm:border-r sm:pr-6">
              <LandingSectionLabel number="01">{t('landing.aboutStat1Label')}</LandingSectionLabel>
              <p className="mt-3 text-sm font-medium leading-[1.6] text-[#526457]">{t('landing.aboutStat1Body')}</p>
            </div>
            <div className="border-t border-[#c9bfa5] py-6 sm:pl-6">
              <LandingSectionLabel number="02">{t('landing.aboutStat2Label')}</LandingSectionLabel>
              <p className="mt-3 text-sm font-medium leading-[1.6] text-[#526457]">{t('landing.aboutStat2Body')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
