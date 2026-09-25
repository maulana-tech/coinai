import { useT } from '@/lib/i18n'
import { LandingSectionLabel } from './landing-section-label'

export function LandingHowItWorks() {
  const t = useT()
  const steps = [
    { num: '01', title: t('landing.step1Title'), body: t('landing.step1Body') },
    { num: '02', title: t('landing.step2Title'), body: t('landing.step2Body') },
    { num: '03', title: t('landing.step3Title'), body: t('landing.step3Body') },
  ] as const

  return (
    <section className="relative z-20 paper-grain bg-[#173f2d] px-[clamp(20px,5vw,72px)] min-h-svh flex items-center" id="how">
      <div className="mx-auto w-full max-w-6xl">
        <LandingSectionLabel number="03">{t('landing.howLabel')}</LandingSectionLabel>
        <h2
          className="mt-4 text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[0.9] tracking-[-0.04em] text-[#f2ecda]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {t('landing.howWorkTitle')}
        </h2>

        <div className="relative mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
          <div className="absolute top-0 bottom-0 left-[33%] hidden w-px bg-[#789b7e]/30 sm:block" aria-hidden="true" />
          <div className="absolute top-0 bottom-0 right-[33%] hidden w-px bg-[#789b7e]/30 sm:block" aria-hidden="true" />

          {steps.map((step) => (
            <div key={step.num} className="relative flex flex-col">
              <p className="font-mono text-[10px] font-bold tracking-[0.23em] uppercase text-[#b7d6bd]">
                {step.num}
              </p>
              <h3
                className="mt-3 text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[1] tracking-[-0.03em] text-[#f2ecda]"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {step.title}
              </h3>
              <p className="mt-4 text-sm font-medium leading-[1.6] text-[#b7d6bd]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
