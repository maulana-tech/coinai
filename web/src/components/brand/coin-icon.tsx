import { useState } from 'react'
import { cn } from '@/lib/utils'

// Coin logos from Cryptofonts/cryptoicons (GPL-3.0, see public/coins/). Falls back to the ticker
// if a coin has no icon file.
export function CoinIcon({ symbol, size = 32, className }: { symbol: string; size?: number; className?: string }) {
  const [missing, setMissing] = useState(false)
  if (missing)
    return (
      <span
        className={cn('flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background', className)}
        style={{ width: size, height: size, fontSize: Math.max(7, size * (size < 24 ? 0.55 : 0.3)) }}
        aria-hidden="true"
      >
        {size < 24 ? symbol[0] : symbol.slice(0, 4)}
      </span>
    )
  return (
    <img
      src={`/coins/${symbol.toLowerCase()}.svg`}
      alt=""
      width={size}
      height={size}
      onError={() => setMissing(true)}
      className={cn('shrink-0 rounded-full', className)}
    />
  )
}
