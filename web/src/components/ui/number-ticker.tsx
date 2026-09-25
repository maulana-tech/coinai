import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  locale?: string
}

type Cell = {
  // position counted from the right, so a growing/shrinking digit count never reshuffles existing columns
  id: number
  char: string
}

const ROLL_MS = 550
const STAGGER_MS = 30
const MAX_STAGGER_STEPS = 6 // caps settle time under ~0.9s even for many-digit values
const FADE_MS = 150
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
// three laps so a roll can always travel a full 0-9 sweep before landing,
// however close the start and target digits are (including landing on itself)
const DIGITS_LOOP = [...DIGITS, ...DIGITS, ...DIGITS]

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function formatValue(value: number, locale: string, decimalPlaces: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value)
}

// Zero-padded to the same integer-digit count as `target` so every column
// already exists at mount and rolls into place, instead of most digits
// appearing as brand-new columns that only fade in (the roll was invisible
// whenever the starting value had fewer digits than the real balance).
function formatPadded(
  value: number,
  target: number,
  locale: string,
  decimalPlaces: number,
): string {
  const targetDigits = Math.max(1, Math.trunc(Math.abs(target)).toString().length)
  return new Intl.NumberFormat(locale, {
    minimumIntegerDigits: targetDigits,
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value)
}

function toCells(formatted: string): Cell[] {
  const chars = Array.from(formatted)
  const lastIndex = chars.length - 1
  return chars.map((char, i) => ({ id: lastIndex - i, char }))
}

function staggerDelay(id: number): number {
  return Math.min(id, MAX_STAGGER_STEPS) * STAGGER_MS
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  locale = "en-US",
  ...props
}: NumberTickerProps) {
  const reducedMotion = usePrefersReducedMotion()
  // "down" counts from value to startValue, matching the previous spring-based contract
  const target = direction === "down" ? startValue : value
  const initial = direction === "down" ? value : startValue

  const containerRef = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(false)
  const [cells, setCells] = useState<Cell[]>(() =>
    toCells(
      reducedMotion
        ? formatValue(target, locale, decimalPlaces)
        : formatPadded(initial, target, locale, decimalPlaces),
    )
  )
  const [exiting, setExiting] = useState<Cell[]>([])
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // bumped every time cells move to a freshly resolved value, so every digit
  // column re-sweeps even when its own digit happens not to change
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setInView(true)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    const formatted = formatValue(target, locale, decimalPlaces)

    if (reducedMotion) {
      setCells(toCells(formatted))
      return
    }

    const timer = setTimeout(() => {
      const next = toCells(formatted)
      setCells((prev) => {
        const nextIds = new Set(next.map((c) => c.id))
        const dropped = prev.filter((c) => !nextIds.has(c.id))
        if (dropped.length > 0) {
          // keep dropped columns mounted just long enough to fade out instead of jumping
          setExiting((prevExiting) => {
            const existingIds = new Set(prevExiting.map((c) => c.id))
            const newUnique = dropped.filter((c) => !existingIds.has(c.id))
            return [...newUnique, ...prevExiting]
          })
          if (exitTimer.current) clearTimeout(exitTimer.current)
          exitTimer.current = setTimeout(() => setExiting([]), FADE_MS + 80)
        }
        return next
      })
      setRevision((r) => r + 1)
    }, delay * 1000)

    return () => clearTimeout(timer)
  }, [inView, reducedMotion, target, locale, decimalPlaces, delay])

  useEffect(() => {
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
    }
  }, [])

  const text = cells.map((c) => c.char).join("")

  return (
    <span
      ref={containerRef}
      // no default text color: dark:* variants outrank a plain className color
      // utility in specificity, so a hardcoded color here would be unoverridable
      className={cn("inline-block tracking-wider tabular-nums", className)}
      {...props}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {exiting.map((cell) => (
          <ExitingCell key={`x${cell.id}`} cell={cell} />
        ))}
        {cells.map((cell) => (
          <TickerCell key={cell.id} cell={cell} reducedMotion={reducedMotion} revision={revision} />
        ))}
      </span>
    </span>
  )
}

function TickerCell({
  cell,
  reducedMotion,
  revision,
}: {
  cell: Cell
  reducedMotion: boolean
  revision: number
}) {
  const [visible, setVisible] = useState(reducedMotion)

  useEffect(() => {
    if (reducedMotion) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  const digit = cell.char >= "0" && cell.char <= "9" ? Number(cell.char) : null

  return (
    <span
      className="inline-block"
      style={{
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? undefined : `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      {digit === null ? (
        cell.char
      ) : (
        <DigitColumn
          digit={digit}
          delayMs={staggerDelay(cell.id)}
          reducedMotion={reducedMotion}
          revision={revision}
        />
      )}
    </span>
  )
}

function ExitingCell({ cell }: { cell: Cell }) {
  const [shown, setShown] = useState(true)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(false))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <span
      className="inline-block"
      style={{ opacity: shown ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-out` }}
    >
      {cell.char}
    </span>
  )
}

function DigitColumn({
  digit,
  delayMs,
  reducedMotion,
  revision,
}: {
  digit: number
  delayMs: number
  reducedMotion: boolean
  revision: number
}) {
  const stripRef = useRef<HTMLSpanElement>(null)
  const prevRevision = useRef(revision)
  // the digit this column is currently resting on, once any in-flight roll settles
  const restingDigit = useRef(digit)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // place the very first paint at rest, outside of any transition
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) return
    el.style.transitionProperty = "none"
    el.style.transform = `translateY(${-digit}em)`
    void el.offsetHeight
    el.style.transitionProperty = "transform, filter"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const el = stripRef.current
    const shouldSpin = prevRevision.current !== revision && !reducedMotion
    prevRevision.current = revision
    if (resetTimer.current) {
      clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
    if (!el) return
    if (!shouldSpin) {
      // no roll this pass (unchanged revision, or motion is reduced) - just
      // keep the resting position in sync with the current digit
      if (restingDigit.current !== digit) {
        el.style.transitionProperty = "none"
        el.style.transform = `translateY(${-digit}em)`
        void el.offsetHeight
        el.style.transitionProperty = "transform, filter"
      }
      restingDigit.current = digit
      return
    }
    // always land at least one full lap past the resting digit, so every
    // column visibly sweeps through 0-9 even when landing on itself or on
    // the very next digit, instead of taking the shortest single-row hop
    const from = restingDigit.current
    const offset = (digit - from + 10) % 10
    const target = from + 10 + offset
    // snap blur to its peak before the transition starts, then ease both the
    // roll and the blur back to sharp together so it never gets stuck hazy
    el.style.transitionProperty = "none"
    el.style.filter = "blur(1.5px)"
    void el.offsetHeight
    el.style.transitionProperty = "transform, filter"
    el.style.transform = `translateY(${-target}em)`
    el.style.filter = "blur(0px)"
    resetTimer.current = setTimeout(() => {
      const strip = stripRef.current
      restingDigit.current = digit
      if (!strip) return
      // rewind the extra laps silently so the strip never needs more than
      // three laps of rows, and the next roll has the same headroom again
      strip.style.transitionProperty = "none"
      strip.style.transform = `translateY(${-digit}em)`
      void strip.offsetHeight
      strip.style.transitionProperty = "transform, filter"
    }, delayMs + ROLL_MS + 40)
  }, [revision, digit, reducedMotion, delayMs])

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-hidden">
      <span
        ref={stripRef}
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transitionProperty: "transform, filter",
          transitionDuration: reducedMotion ? "0ms" : `${ROLL_MS}ms`,
          transitionDelay: reducedMotion ? "0ms" : `${delayMs}ms`,
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {DIGITS_LOOP.map((d, i) => (
          <span key={i} className="h-[1em] text-center leading-[1em]">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}
