import { cn } from '@/lib/utils'

export type TokenSymbol = 'fxrp' | 'flr' | 'eth'

type TokenIconProps = {
  token: TokenSymbol
  size?: number
  className?: string
}

export function TokenIcon({ token, size = 24, className }: TokenIconProps) {
  if (token === 'eth') {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#ECF0F3] border border-border/40',
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          width={Math.round(size * 0.6)}
          height={Math.round(size * 0.9)}
          viewBox="0 0 784 1277"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="392 0 383.5 29 383.5 873 392 881.5 784 650" fill="#343434" />
          <polygon points="392 0 0 650 392 881.5 392 472" fill="#8C8C8C" />
          <polygon points="392 956 387 962 387 1270 392 1277 784 725.5" fill="#3C3C3C" />
          <polygon points="392 1277 392 956 0 725.5" fill="#8C8C8C" />
          <polygon points="392 881.5 784 650 392 522" fill="#141414" />
          <polygon points="392 881.5 392 522 0 650" fill="#3C3C3C" />
        </svg>
      </span>
    )
  }
  const src = token === 'fxrp' ? '/tokens/fxrp.svg' : '/tokens/flr.svg'
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('shrink-0 overflow-hidden rounded-full', className)}
    />
  )
}
