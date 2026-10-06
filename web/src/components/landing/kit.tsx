import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useT, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function Star({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[13px] leading-none text-white/80', className)}>
      ✦
    </span>
  )
}

export function Reveal({ children, className, delay = 0, margin = '-15% 0px' }: { children: ReactNode; className?: string; delay?: number; margin?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function Title({ k, className }: { k: MessageKey; className?: string }) {
  const t = useT()
  return (
    // leading last: tailwind-merge drops it when className overrides the font size
    <h2 className={cn('font-serif text-[clamp(2.75rem,7vw,6.25rem)] font-light tracking-[-0.02em] whitespace-pre-line', className, 'leading-[0.95]')}>
      {t(k)}
    </h2>
  )
}
