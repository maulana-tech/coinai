import { useId } from 'react'
import { usdcToNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SavingsHistoryPoint } from '@/lib/yield'

type Point = { x: number; y: number }

const WIDTH = 100
const HEIGHT = 56
const X_PAD = 3 // stroke-width safety margin on every edge
const LIVE_PAD = 8 // extra right-edge room reserved for the pulsing live-value ring
const TOP_PAD = 8
const BOTTOM_PAD = 6

// the chart line itself is a genuinely yellow hue (not the app's muted --gold/--gold-ink
// savings-badge tokens, which lean amber/brown at the lightness a visible stroke needs)
const STROKE_COLOR = 'color-mix(in oklch, var(--primary) 70%, var(--foreground) 30%)'

function catmullRomPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`
  let d = `M ${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

type SavingsWaveChartProps = {
  history: SavingsHistoryPoint[]
  currentValue: bigint | null
  className?: string
}

export function SavingsWaveChart({ history, currentValue, className }: SavingsWaveChartProps) {
  const gradientId = useId()

  const values = [0, ...history.map((p) => usdcToNumber(p.principal))]
  const hasLive = currentValue !== null
  if (hasLive) values.push(usdcToNumber(currentValue))

  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const xStart = X_PAD
  const xEnd = WIDTH - X_PAD - (hasLive ? LIVE_PAD : 0)

  const points: Point[] = values.map((v, i) => ({
    x: values.length > 1 ? xStart + (i / (values.length - 1)) * (xEnd - xStart) : (xStart + xEnd) / 2,
    y: HEIGHT - BOTTOM_PAD - ((v - min) / span) * (HEIGHT - TOP_PAD - BOTTOM_PAD),
  }))

  const linePath = catmullRomPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1].x},${HEIGHT} L ${points[0].x},${HEIGHT} Z`
  const lastPoint = points[points.length - 1]

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Savings principal over time"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${gradientId}-clip`}>
            <path d={areaPath} />
          </clipPath>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <g clipPath={`url(#${gradientId}-clip)`}>
          <rect
            x="-40"
            y="0"
            width="180"
            height={HEIGHT}
            className="animate-liquid-shimmer motion-reduce:animate-none"
            fill="color-mix(in oklch, var(--primary) 26%, transparent)"
          />
        </g>
        {/* preserveAspectRatio="none" above stretches x and y by different factors, so a
            <circle> drawn in this same viewBox would render as a squashed ellipse, not a dot -
            the live-value marker is rendered as a real HTML element below instead, sized in
            actual pixels so it stays round regardless of the chart's aspect ratio. */}
        <path
          d={linePath}
          fill="none"
          stroke={STROKE_COLOR}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {hasLive && lastPoint && (
        <div
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(lastPoint.x / WIDTH) * 100}%`, top: `${(lastPoint.y / HEIGHT) * 100}%` }}
        >
          <span
            className="absolute inset-0 rounded-full animate-liquid-pulse-ring motion-reduce:hidden"
            style={{ backgroundColor: 'var(--primary)' }}
          />
          <span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: STROKE_COLOR, boxShadow: '0 0 0 2px var(--card)' }}
          />
        </div>
      )}
    </div>
  )
}
