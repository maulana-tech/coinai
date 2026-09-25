import { ArrowDownLeftIcon, SplitIcon, SproutIcon, WalletIcon } from 'lucide-react'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const STEPS: { icon: typeof WalletIcon; title: MessageKey; body: MessageKey; tint: string }[] = [
  {
    icon: WalletIcon,
    title: 'landing.step1Title',
    body: 'landing.step1Body',
    tint: 'bg-accent text-accent-foreground',
  },
  {
    icon: ArrowDownLeftIcon,
    title: 'landing.step2Title',
    body: 'landing.step2Body',
    tint: 'bg-primary/15 text-primary-ink',
  },
  {
    icon: SplitIcon,
    title: 'landing.step3Title',
    body: 'landing.step3Body',
    tint: 'bg-secondary/15 text-secondary',
  },
  {
    icon: SproutIcon,
    title: 'landing.step4Title',
    body: 'landing.step4Body',
    tint: 'bg-growth/15 text-growth-ink',
  },
]

export function LandingHowItWorks() {
  const t = useT()
  return (
    <section id="how" className="mx-auto w-full max-w-5xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('landing.howTitle')}
        </h2>
        <p className="mt-3 text-muted-foreground">{t('landing.howCaption')}</p>
      </div>
      <div className="relative mt-14 grid gap-10 sm:grid-cols-4 sm:gap-6">
        <div
          aria-hidden="true"
          className="absolute top-7 right-[12.5%] left-[12.5%] hidden h-0.5 overflow-hidden rounded-full bg-border sm:block"
        >
          <span className="absolute top-1/2 h-2 w-20 -translate-y-1/2 animate-flow-line rounded-full bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] blur-[3px] motion-reduce:hidden" />
        </div>
        {STEPS.map((step, i) => (
          <div key={step.title} className="relative flex flex-col items-center text-center">
            <span
              className={cn(
                'relative z-10 flex size-14 items-center justify-center rounded-2xl ring-4 ring-background',
                step.tint,
              )}
            >
              <step.icon className="size-6" />
            </span>
            <p className="mt-4 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {String(i + 1).padStart(2, '0')}
            </p>
            <p className="mt-1 font-medium">{t(step.title)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t(step.body)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
