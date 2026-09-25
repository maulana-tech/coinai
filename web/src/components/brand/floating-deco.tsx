import { useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

type DecoProps = { uid: string }

function CoinStack({ uid }: DecoProps) {
  const side = `${uid}-side`
  const top = `${uid}-top`
  const coin = (cx: number, topY: number) => (
    <g key={topY}>
      <ellipse cx={cx} cy={topY + 5} rx="20" ry="7.5" fill={`url(#${side})`} />
      <rect x={cx - 20} y={topY} width="40" height="5" fill={`url(#${side})`} />
      <ellipse cx={cx} cy={topY} rx="20" ry="7.5" fill={`url(#${top})`} />
      <ellipse cx={cx} cy={topY} rx="14" ry="4.8" fill="none" stroke="#c9992e" strokeWidth="1" opacity="0.6" />
    </g>
  )
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 5px 5px rgba(122, 84, 16, 0.3))' }}>
      <defs>
        <linearGradient id={side} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b9861f" />
          <stop offset="100%" stopColor="#8f6414" />
        </linearGradient>
        <linearGradient id={top} x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#f7dc94" />
          <stop offset="100%" stopColor="#d9a441" />
        </linearGradient>
      </defs>
      <g>
        {coin(32, 42)}
        {coin(30, 33)}
        {coin(33, 24)}
        <ellipse cx="27" cy="21.5" rx="8" ry="2.8" fill="#fff" opacity="0.6" transform="rotate(-8 27 21.5)" />
      </g>
    </svg>
  )
}

function LoopBlob({ uid }: DecoProps) {
  const body = `${uid}-body`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 5px 5px rgba(138, 108, 0, 0.32))' }}>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe98a" />
          <stop offset="55%" stopColor="#f4c81c" />
          <stop offset="100%" stopColor="#c79400" />
        </linearGradient>
      </defs>
      {/* the brand mark's twin arcs, rescaled from the 48-box logo to this 64-box deco */}
      <g
        fill="none"
        stroke={`url(#${body})`}
        strokeWidth="8.7"
        strokeLinecap="round"
      >
        <path d="M16,28 A13.33,13.33 0 0 1 42.67,28" />
        <path d="M21.33,36 A13.33,13.33 0 0 0 48,36" />
      </g>
      <ellipse cx="18" cy="14" rx="9" ry="4.2" fill="#fff" opacity="0.45" transform="rotate(-30 18 14)" />
    </svg>
  )
}

function Sparkle({ uid }: DecoProps) {
  const body = `${uid}-body`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 4px 4px rgba(28, 104, 138, 0.3))' }}>
      <defs>
        <radialGradient id={body} cx="40%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#e6f6fb" />
          <stop offset="55%" stopColor="#7fcbe3" />
          <stop offset="100%" stopColor="#38a3c8" />
        </radialGradient>
      </defs>
      <g>
        <path
          d="M32 5C34.5 23 41 29.5 59 32 41 34.5 34.5 41 32 59 29.5 41 23 34.5 5 32 23 29.5 29.5 23 32 5Z"
          fill={`url(#${body})`}
        />
        <ellipse cx="27" cy="22" rx="4.5" ry="2.4" fill="#fff" opacity="0.7" transform="rotate(-35 27 22)" />
      </g>
    </svg>
  )
}

function SoftArrow({ uid }: DecoProps) {
  const body = `${uid}-body`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 5px 5px rgba(23, 95, 125, 0.32))' }}>
      <defs>
        {/* sky-teal balances a page that now leans heavily gold */}
        <linearGradient id={body} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#a9def0" />
          <stop offset="55%" stopColor="#4fb0d3" />
          <stop offset="100%" stopColor="#1f7fa3" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${body})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 47 44 20" />
        <path d="M29 20h15v15" />
      </g>
      <ellipse cx="25" cy="37" rx="7" ry="2.2" fill="#fff" opacity="0.5" transform="rotate(-45 25 37)" />
    </svg>
  )
}

function HeartBlob({ uid }: DecoProps) {
  const body = `${uid}-body`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 5px 5px rgba(140, 51, 85, 0.3))' }}>
      <defs>
        <radialGradient id={body} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#ffdbe3" />
          <stop offset="55%" stopColor="#ee8aa3" />
          <stop offset="100%" stopColor="#c2557a" />
        </radialGradient>
      </defs>
      <g>
        <path
          d="M32 55C13 42 7 28 15 19 21 12.5 30 14.5 32 21 34 14.5 43 12.5 49 19 57 28 51 42 32 55Z"
          fill={`url(#${body})`}
        />
        <ellipse cx="22" cy="24" rx="6" ry="3" fill="#fff" opacity="0.55" transform="rotate(-30 22 24)" />
      </g>
    </svg>
  )
}

function FxrpCoin({ uid }: DecoProps) {
  const rim = `${uid}-rim`
  const face = `${uid}-face`
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" overflow="visible" aria-hidden="true" style={{ filter: 'drop-shadow(0 5px 5px rgba(122, 84, 16, 0.3))' }}>
      <defs>
        <radialGradient id={rim} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffe9b8" />
          <stop offset="55%" stopColor="#d9a441" />
          <stop offset="100%" stopColor="#a9761f" />
        </radialGradient>
        <linearGradient id={face} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#f3d27e" />
          <stop offset="100%" stopColor="#cf9832" />
        </linearGradient>
      </defs>
      <g>
        <circle cx="32" cy="32" r="27" fill={`url(#${rim})`} />
        <circle cx="32" cy="32" r="21" fill={`url(#${face})`} />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#b07f22" strokeWidth="1.2" opacity="0.5" />
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fontFamily="'Geist Variable', system-ui, sans-serif"
          fontSize="14"
          fontWeight="700"
          fill="#8f6414"
        >
          FXRP
        </text>
        <ellipse cx="22" cy="16" rx="9" ry="4.2" fill="#fff" opacity="0.55" transform="rotate(-28 22 16)" />
      </g>
    </svg>
  )
}

type Placement = {
  obj: ComponentType<DecoProps>
  side: 'left' | 'right'
  top: string
  left?: string
  right?: string
  size: number
  rotate: number
  depth: number
  duration: number
  delay: number
}

const PLACEMENTS: Placement[] = [
  { obj: FxrpCoin, side: 'left', top: '12%', left: '6%', size: 96, rotate: -12, depth: 22, duration: 7, delay: 0 },
  { obj: Sparkle, side: 'left', top: '34%', left: '14%', size: 44, rotate: 8, depth: 28, duration: 5.5, delay: 0.8 },
  { obj: LoopBlob, side: 'left', top: '52%', left: '4%', size: 110, rotate: 6, depth: 12, duration: 8, delay: 0.4 },
  { obj: CoinStack, side: 'left', top: '76%', left: '12%', size: 76, rotate: -8, depth: 18, duration: 6.5, delay: 1.2 },
  { obj: FxrpCoin, side: 'left', top: '90%', left: '5%', size: 46, rotate: 10, depth: 24, duration: 6.2, delay: 0.7 },
  { obj: HeartBlob, side: 'right', top: '10%', right: '10%', size: 72, rotate: 10, depth: 20, duration: 7.5, delay: 0.6 },
  { obj: FxrpCoin, side: 'right', top: '24%', right: '18%', size: 50, rotate: -8, depth: 16, duration: 7.2, delay: 0.9 },
  { obj: SoftArrow, side: 'right', top: '36%', right: '4%', size: 88, rotate: 4, depth: 10, duration: 8.5, delay: 0.2 },
  { obj: FxrpCoin, side: 'right', top: '60%', right: '14%', size: 52, rotate: 14, depth: 26, duration: 5, delay: 1 },
  { obj: Sparkle, side: 'right', top: '80%', right: '7%', size: 40, rotate: -10, depth: 24, duration: 6, delay: 0.3 },
]

// a second composition (different positions, sizes, and left/right swaps of the same
// coins) so a page that shows the deco twice - e.g. hero and closing CTA - doesn't just
// repeat the identical layout
const PLACEMENTS_ALT: Placement[] = [
  { obj: CoinStack, side: 'left', top: '6%', left: '17%', size: 60, rotate: 7, depth: 14, duration: 7.6, delay: 0.3 },
  { obj: LoopBlob, side: 'left', top: '18%', left: '8%', size: 84, rotate: 15, depth: 18, duration: 6.8, delay: 0.1 },
  { obj: FxrpCoin, side: 'left', top: '42%', left: '4%', size: 58, rotate: -10, depth: 26, duration: 5.8, delay: 0.9 },
  { obj: Sparkle, side: 'left', top: '66%', left: '15%', size: 40, rotate: -6, depth: 22, duration: 5, delay: 0.5 },
  { obj: FxrpCoin, side: 'left', top: '88%', left: '9%', size: 52, rotate: 12, depth: 16, duration: 7.4, delay: 1.1 },
  { obj: FxrpCoin, side: 'right', top: '14%', right: '8%', size: 88, rotate: -14, depth: 20, duration: 7, delay: 0.4 },
  { obj: SoftArrow, side: 'right', top: '38%', right: '17%', size: 72, rotate: -6, depth: 12, duration: 8, delay: 0 },
  { obj: HeartBlob, side: 'right', top: '58%', right: '5%', size: 64, rotate: 8, depth: 24, duration: 6.3, delay: 1 },
  { obj: FxrpCoin, side: 'right', top: '80%', right: '15%', size: 46, rotate: 10, depth: 28, duration: 6.6, delay: 0.6 },
  { obj: Sparkle, side: 'right', top: '93%', right: '22%', size: 36, rotate: -12, depth: 30, duration: 5.4, delay: 0.7 },
]

const LERP = 0.08

export function FloatingDeco({
  side,
  variant = 'default',
  className,
}: {
  side: 'both' | 'left' | 'right'
  variant?: 'default' | 'alt'
  className?: string
}) {
  const allPlacements = variant === 'alt' ? PLACEMENTS_ALT : PLACEMENTS
  const items = side === 'both' ? allPlacements : allPlacements.filter((p) => p.side === side)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const depths = (side === 'both' ? allPlacements : allPlacements.filter((p) => p.side === side)).map(
      (p) => p.depth,
    )
    let raf = 0
    let running = false
    let targetX = 0
    let targetY = 0
    let curX = 0
    let curY = 0
    const tick = () => {
      curX += (targetX - curX) * LERP
      curY += (targetY - curY) * LERP
      for (let i = 0; i < depths.length; i++) {
        const el = itemRefs.current[i]
        if (!el) continue
        el.style.transform = `translate3d(${(curX * depths[i]).toFixed(2)}px, ${(curY * depths[i]).toFixed(2)}px, 0)`
      }
      if (Math.abs(targetX - curX) + Math.abs(targetY - curY) > 0.002) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
      }
    }
    const onMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth) * 2 - 1
      targetY = (e.clientY / window.innerHeight) * 2 - 1
      if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [side, allPlacements])

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 hidden select-none overflow-hidden md:block',
        className,
      )}
    >
      <style>{`
        @keyframes cel-deco-drift {
          from { transform: translateY(-7px); }
          to { transform: translateY(7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cel-deco-drift { animation: none !important; }
        }
      `}</style>
      {items.map((item, i) => {
        const Obj = item.obj
        return (
          <div
            key={`${item.side}-${i}`}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="absolute will-change-transform"
            style={{
              top: item.top,
              left: item.left,
              right: item.right,
              width: item.size,
              height: item.size,
            }}
          >
            <div
              className="cel-deco-drift h-full w-full"
              style={{
                animation: `cel-deco-drift ${item.duration}s ease-in-out ${item.delay}s infinite alternate`,
              }}
            >
              <div className="h-full w-full" style={{ transform: `rotate(${item.rotate}deg)` }}>
                <div className="pointer-events-auto h-full w-full transition-transform duration-300 ease-out hover:scale-110">
                  <Obj uid={`cel-${item.side}-${i}`} />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
