import { useMemo } from 'react'
import { cn } from '@/lib/utils'

function getAddressColor(address: string): string {
  let hash = 0
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 75%, 65%)`
}

type AddressAvatarProps = {
  address: string
  size?: number
  className?: string
}

export function AddressAvatar({ address, size = 40, className }: AddressAvatarProps) {
  const bgColor = useMemo(() => getAddressColor(address), [address])
  const initials = address.length > 4 ? address.slice(2, 4).toUpperCase() : '??'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border/60 text-background font-mono text-xs font-bold select-none',
        className,
      )}
      style={{ width: size, height: size, backgroundColor: bgColor }}
    >
      {initials}
    </span>
  )
}
