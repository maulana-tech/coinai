import { useEffect, useRef } from 'react'
import { TokenIcon } from '@/components/brand/token-icon'

function EthLogo() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full shadow-lg bg-[#ECF0F3] border border-border/40 p-2">
      <svg className="h-[75%] w-[75%]" viewBox="0 0 784 1277" xmlns="http://www.w3.org/2000/svg">
        <polygon points="392 0 383.5 29 383.5 873 392 881.5 784 650" fill="#343434" />
        <polygon points="392 0 0 650 392 881.5 392 472" fill="#8C8C8C" />
        <polygon points="392 956 387 962 387 1270 392 1277 784 725.5" fill="#3C3C3C" />
        <polygon points="392 1277 392 956 0 725.5" fill="#8C8C8C" />
        <polygon points="392 881.5 784 650 392 522" fill="#141414" />
        <polygon points="392 881.5 392 522 0 650" fill="#3C3C3C" />
      </svg>
    </div>
  )
}

function NoxLogo() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full shadow-lg bg-gradient-to-tr from-[#6366f1] to-[#a855f7] p-3 text-white">
      <svg className="h-[70%] w-[70%]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  )
}

function SwapLogo() {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full shadow-lg bg-pink-500 p-3 text-white">
      <svg className="h-[70%] w-[70%]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 4l4 4-4 4" />
        <path d="M3 20h18" />
        <path d="M21 8H3" />
        <path d="M7 20l-4-4 4-4" />
      </svg>
    </div>
  )
}

type Item = {
  render: () => React.ReactNode
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

const ITEMS: Item[] = [
  {
    render: () => <NoxLogo />,
    side: 'left',
    top: '14%',
    left: '8%',
    size: 68,
    rotate: -8,
    depth: 20,
    duration: 6.5,
    delay: 0,
  },
  {
    render: () => <EthLogo />,
    side: 'right',
    top: '18%',
    right: '10%',
    size: 62,
    rotate: 10,
    depth: 24,
    duration: 7.2,
    delay: 0.5,
  },
  {
    render: () => <SwapLogo />,
    side: 'left',
    top: '58%',
    left: '5%',
    size: 56,
    rotate: -6,
    depth: 16,
    duration: 6,
    delay: 0.9,
  },
  {
    render: () => <TokenIcon token="eth" size={48} />,
    side: 'right',
    top: '64%',
    right: '6%',
    size: 48,
    rotate: 6,
    depth: 26,
    duration: 6.8,
    delay: 0.3,
  },
  {
    render: () => <TokenIcon token="fxrp" size={44} />,
    side: 'left',
    top: '86%',
    left: '14%',
    size: 44,
    rotate: -10,
    depth: 18,
    duration: 5.6,
    delay: 1.1,
  },
]

const LERP = 0.08

export function LandingProtocolDeco() {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const depths = ITEMS.map((item) => item.depth)
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
  }, [])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden select-none overflow-hidden md:block"
    >
      <style>{`
        @keyframes cel-proto-deco-drift {
          from { transform: translateY(-6px); }
          to { transform: translateY(6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cel-proto-deco-drift { animation: none !important; }
        }
      `}</style>
      {ITEMS.map((item, i) => (
        <div
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          className="absolute will-change-transform"
          style={{ top: item.top, left: item.left, right: item.right, width: item.size, height: item.size }}
        >
          <div
            className="cel-proto-deco-drift h-full w-full"
            style={{ animation: `cel-proto-deco-drift ${item.duration}s ease-in-out ${item.delay}s infinite alternate` }}
          >
            <div className="h-full w-full" style={{ transform: `rotate(${item.rotate}deg)` }}>
              <div className="pointer-events-auto h-full w-full transition-transform duration-300 ease-out hover:scale-110">
                {item.render()}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
