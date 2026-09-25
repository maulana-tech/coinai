import { useT, type MessageKey } from '@/lib/i18n'
import type { YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'

const SOURCE_LOGO: Record<YieldTarget, string> = {
  sparkdex: '/logos/sparkdex-icon.svg',
  firelight: '/logos/firelight-icon.svg',
  upshift: '/logos/upshift-icon.svg',
}

const SOURCE_NAME_KEY: Record<YieldTarget, MessageKey> = {
  sparkdex: 'rules.yieldSourceSparkdexName',
  firelight: 'rules.yieldSourceFirelightName',
  upshift: 'rules.yieldSourceUpshiftName',
}

type YieldRouteBadgeProps = {
  target: YieldTarget
  className?: string
}

// Shows the account's current yield source. Deliberately shows the CURRENT target only,
// never a per-transaction historical one: pay/wd_save events don't carry which protocol
// was active at the time, and set_yield_target only allows switching at a zero balance -
// fabricating a per-row protocol would be a guess dressed up as data.
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
          src={SOURCE_LOGO[target]}
          alt=""
          className="h-[60%] w-[60%] object-contain"
        />
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {t('yield.statusLabel')} <span className="font-medium text-foreground">{name}</span>
      </span>
    </div>
  )
}
