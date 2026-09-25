import { useT, type MessageKey } from '@/lib/i18n'
import type { YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { VAULT_LOGO } from '@/lib/yield'

const SOURCE_NAME_KEY: Record<YieldTarget, MessageKey> = {
  conservative: 'rules.yieldSourceConservativeName',
  balanced: 'rules.yieldSourceBalancedName',
  growth: 'rules.yieldSourceGrowthName',
}

type YieldRouteBadgeProps = {
  target: YieldTarget
  className?: string
}

// Shows the account's current vault preference (the CURRENT target only, not per transaction).
export function YieldRouteBadge({ target, className }: YieldRouteBadgeProps) {
  const t = useT()
  const name = t(SOURCE_NAME_KEY[target])
  return (
    <div
      className={cn(
        'flex w-fit max-w-full items-center gap-2 rounded-full border bg-muted/40 py-1 pr-3 pl-1',
        className,
      )}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card ring-1 ring-border"
      >
        <img
          src={VAULT_LOGO[target]}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {t('yield.statusLabel')} <span className="font-medium text-foreground">{name}</span>
      </span>
    </div>
  )
}
