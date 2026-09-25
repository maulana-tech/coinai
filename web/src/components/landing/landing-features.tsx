import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { LandingSectionLabel } from './landing-section-label'

export function LandingFeatures() {
  const t = useT()
  const [selectedFeature, setSelectedFeature] = useState(0)

  const features = [
    { title: t('landing.feature1Title'), body: t('landing.feature1Body'), icon: '↔' },
    { title: t('landing.feature2Title'), body: t('landing.feature2Body'), icon: '↗' },
    { title: t('landing.feature3Title'), body: t('landing.feature3Body'), icon: '🔗' },
  ] as const

  return (
    <section className="relative z-20 paper-grain bg-[#c0d7bf] px-[clamp(20px,5vw,72px)] min-h-svh flex items-center" id="features">
      <div className="mx-auto w-full max-w-6xl">
        <LandingSectionLabel number="02">{t('landing.featureLabel')}</LandingSectionLabel>
        <h2
          className="mt-4 text-[clamp(2rem,4vw,3.4rem)] font-bold leading-[0.9] tracking-[-0.04em] text-[#193d2d]"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {t('landing.featureTitle')}
        </h2>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {features.map((feat, i) => (
            <button
              key={feat.title}
              type="button"
              onClick={() => setSelectedFeature(i)}
              className={`group relative flex flex-col items-start border-2 p-7 text-left transition-all duration-260 hover:-translate-y-[5px] ${
                selectedFeature === i
                  ? 'border-[#1c4934] bg-[#f4ede0] shadow-lg'
                  : 'border-[#739d7b]/40 bg-[#d2e1ce]/60 hover:border-[#739d7b] hover:bg-[#d2e1ce]'
              }`}
              aria-pressed={selectedFeature === i}
            >
              <span className={`mb-4 flex size-12 items-center justify-center text-2xl transition-transform duration-260 group-hover:rotate-12 ${
                selectedFeature === i ? 'bg-[#1c4934] text-[#f2ecda]' : 'bg-[#b7d6bd] text-[#1c4934]'
              }`}>
                {feat.icon}
              </span>
              <h3
                className="text-xl font-bold leading-[1.1] tracking-[-0.02em] text-[#193d2d]"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {feat.title}
              </h3>
              <p className="mt-3 text-sm font-medium leading-[1.6] text-[#526457]">{feat.body}</p>
              <span className="mt-auto pt-4 text-xs font-bold text-[#1c4934] opacity-0 transition-opacity duration-260 group-hover:opacity-100">
                Pilih ini →
              </span>
            </button>
          ))}
        </div>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <LandingSectionLabel number={String(selectedFeature + 1).padStart(2, '0')}>
              {features[selectedFeature].title}
            </LandingSectionLabel>
            <h3
              className="mt-2 text-[clamp(1.6rem,3vw,2.4rem)] font-bold leading-[0.95] tracking-[-0.03em] text-[#193d2d]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {features[selectedFeature].title}
            </h3>
            <p className="mt-4 text-[clamp(1rem,1.4vw,1.15rem)] font-medium leading-[1.6] text-[#526457]">
              {features[selectedFeature].body}
            </p>
          </div>

          <div className="relative bg-[#1c4b36] p-8 sm:p-10">
            <div className="absolute -top-3 -left-3 size-16 rounded-full border-2 border-[#d5aa61]/40" aria-hidden="true" />
            <p
              className="relative text-[clamp(1.2rem,2.2vw,1.8rem)] font-medium italic leading-[1.3] text-[#d5aa61]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              "{t('landing.quoteText')}"
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
