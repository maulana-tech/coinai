import { useState } from 'react'
import { cn } from '@/lib/utils'

// Coin logos from Cryptofonts/cryptoicons (GPL-3.0, public/coins/); stock logos built from
// Simple Icons (CC0, public/stocks/). Falls back to a ticker badge when there's no file.
export function CoinIcon({
  symbol,
  size = 32,
  kind = 'coin',
  className,
}: {
  symbol: string
  size?: number
  kind?: 'coin' | 'stock'
  className?: string
}) {
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
      src={`/${kind === 'stock' ? 'stocks' : 'coins'}/${symbol.toLowerCase()}.svg`}
      alt=""
      width={size}
      height={size}
      onError={() => setMissing(true)}
      className={cn('shrink-0 rounded-full', className)}
    />
  )
}
