import { cn } from '@/lib/utils'

/**
 * Brand mark: Renders the coinAI logo image.
 */
export function LogoMark({ size = 24, className, forceDark }: { size?: number; className?: string; forceDark?: boolean }) {
  if (forceDark) {
    return (
      <img
        src="/logo-dark.png"
        width={size}
        height={size}
        className={cn('shrink-0 object-contain', className)}
        alt="coinAI Logo"
      />
    )
  }
  return (
    <>
      <img
        src="/logo-light.png"
        width={size}
        height={size}
        className={cn('shrink-0 object-contain dark:hidden', className)}
        alt="coinAI Logo"
      />
      <img
        src="/logo-dark.png"
        width={size}
        height={size}
        className={cn('shrink-0 object-contain hidden dark:block', className)}
        alt="coinAI Logo"
      />
    </>
  )
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={22} />
      <span className="text-lg font-semibold tracking-tight">coinAI</span>
    </span>
  )
}
