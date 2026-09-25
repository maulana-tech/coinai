import { useEffect, useState } from 'react'
import { TokenIcon } from '@/components/brand/token-icon'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useT } from '@/lib/i18n'

const DEMO_AMOUNTS = [128, 64, 245, 90]
const SPLIT_PCT = 20
const CYCLE_MS = 3600

// Cosmetic-only preview cycling through fake amounts, not tied to any wallet -
// it exists purely to make the split-and-earn idea legible in three seconds.
export function LandingHeroDemo() {
  const t = useT()
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  const amount = DEMO_AMOUNTS[step % DEMO_AMOUNTS.length]
  const saved = Math.round((amount * SPLIT_PCT) / 100)
  const spend = amount - saved

  return (
    <div className="relative w-full max-w-sm shrink-0 rounded-3xl border bg-card/90 p-5 text-left shadow-xl shadow-primary/5 backdrop-blur">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('landing.demoLabel')}
      </p>
      <p className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight tabular-nums">
        <TokenIcon token="fxrp" size={28} />
        <NumberTicker value={amount} decimalPlaces={0} />
        <span className="text-base font-normal text-muted-foreground">FXRP</span>
      </p>
      <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
        <div
          className="rounded-full bg-secondary transition-[width] duration-700 ease-out"
          style={{ width: `${100 - SPLIT_PCT}%` }}
        />
        <div className="relative flex-1 overflow-hidden rounded-full bg-gold">
          <span className="absolute inset-0 animate-liquid-shimmer bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,white_45%,transparent),transparent)] bg-[length:200%_100%] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            <span className="size-2 rounded-full bg-secondary" />
            {t('balances.spendable')}
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
            <NumberTicker value={spend} decimalPlaces={0} />
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            {t('balances.savings')}
            <span className="size-2 rounded-full bg-gold" />
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-gold-ink tabular-nums">
            <NumberTicker value={saved} decimalPlaces={0} />
          </p>
        </div>
      </div>
    </div>
  )
}
