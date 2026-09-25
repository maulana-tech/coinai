import { useEffect, useState } from 'react'
import { MinusIcon, TrendingUpIcon } from 'lucide-react'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useT } from '@/lib/i18n'

const TICK_MS = 1800
const TICK_STEP = 0.014 // a visible trickle for the demo, not a claimed APY

export function LandingComparison() {
  const t = useT()
  const [earned, setEarned] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setEarned((v) => v + TICK_STEP), TICK_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <section id="compare" className="mx-auto w-full max-w-4xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t('landing.compareTitle')}
        </h2>
        <p className="mt-3 text-muted-foreground">{t('landing.compareCaption')}</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border bg-muted/30 p-8">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MinusIcon className="size-5" />
          </span>
          <p className="mt-4 font-medium text-muted-foreground">
            {t('landing.compareWithoutLabel')}
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-muted-foreground/60 tabular-nums">
            +0.00
          </p>
          <p className="mt-3 text-sm text-muted-foreground">{t('landing.compareWithoutBody')}</p>
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-gold/5 p-8 shadow-lg shadow-gold/10">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 animate-liquid-shimmer bg-[linear-gradient(115deg,transparent,color-mix(in_oklch,var(--gold)_18%,transparent),transparent)] bg-[length:200%_100%] motion-reduce:animate-none"
          />
          <span className="relative flex size-10 items-center justify-center rounded-full bg-gold/20 text-gold-ink">
            <TrendingUpIcon className="size-5" />
          </span>
          <p className="relative mt-4 font-medium text-gold-ink">{t('landing.compareWithLabel')}</p>
          <p className="relative mt-2 text-4xl font-semibold tracking-tight text-gold-ink tabular-nums">
            +<NumberTicker value={earned} decimalPlaces={2} />
          </p>
          <p className="relative mt-3 text-sm text-muted-foreground">
            {t('landing.compareWithBody')}
          </p>
        </div>
      </div>
    </section>
  )
}
