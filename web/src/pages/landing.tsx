import { LandingAbout } from '@/components/landing/landing-about'
import { LandingArchitecture } from '@/components/landing/landing-architecture'
import { LandingCta } from '@/components/landing/landing-cta'
import { LandingFeatures } from '@/components/landing/landing-features'
import { LandingFooter } from '@/components/landing/landing-footer'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingHero } from '@/components/landing/landing-hero'
import { LandingHowItWorks } from '@/components/landing/landing-how-it-works'

export function Landing() {
  return (
    <div className="relative">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingAbout />
        <LandingFeatures />
        <LandingHowItWorks />
        <LandingArchitecture />
        <LandingCta />
      </main>
      <LandingFooter />
    </div>
  )
}
