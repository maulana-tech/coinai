import { useMemo } from 'react'
import { HeartHandshakeIcon, PartyPopperIcon, RepeatIcon, type LucideIcon } from 'lucide-react'
import { useAppState } from '@/lib/app-state'
import type { FundKind } from '@/lib/groups'
import { formatMoney, intlLocale, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'

// What each kind of group fund looks like and how it's explained (kept out of group-kit.tsx so that file only
// exports components).
// image: the landing art behind the kind's panel and cards (same treatment as the Withdraw panels);
// panelLabel / panelTitle: the mono label and serif headline over it.
export const KIND: Record<
  FundKind,
  { icon: LucideIcon; label: MessageKey; tagline: MessageKey; rule: MessageKey; tint: string; cover: string; image: string; panelLabel: MessageKey; panelTitle: MessageKey }
> = {
  patungan: { icon: PartyPopperIcon, label: 'groups.kindPatungan', tagline: 'groups.taglinePatungan', rule: 'groups.rulePatungan', tint: 'bg-gold/15 text-gold-ink', cover: 'from-gold/50 via-gold/20 to-card/0 text-gold-ink', image: '/landing/agents.jpg', panelLabel: 'groups.panelLabelPatungan', panelTitle: 'groups.panelTitlePatungan' },
  iuran: { icon: RepeatIcon, label: 'groups.kindIuran', tagline: 'groups.taglineIuran', rule: 'groups.ruleIuran', tint: 'bg-primary/10 text-primary-ink', cover: 'from-primary/35 via-primary/10 to-card/0 text-primary-ink', image: '/landing/save.jpg', panelLabel: 'groups.panelLabelIuran', panelTitle: 'groups.panelTitleIuran' },
  donasi: { icon: HeartHandshakeIcon, label: 'groups.kindDonasi', tagline: 'groups.taglineDonasi', rule: 'groups.ruleDonasi', tint: 'bg-destructive/10 text-destructive', cover: 'from-destructive/30 via-destructive/10 to-card/0 text-destructive', image: '/landing/hero.jpg', panelLabel: 'groups.panelLabelDonasi', panelTitle: 'groups.panelTitleDonasi' },
}

/** "in 5 days" / "3 days ago", in the app language. */
export function useRelative() {
  const { locale } = useSettings()
  return (unixSeconds: number) => {
    const diff = unixSeconds - Date.now() / 1000
    const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
    const abs = Math.abs(diff)
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
    if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
    return rtf.format(Math.round(diff / 86_400), 'day')
  }
}

/**
 * Group money is set in tUSDT, so that's what is shown first ("10 tUSDT a month", as the organizer typed it);
 * `approx` adds the user's own currency when it isn't tUSDT ("≈ Rp163.000").
 */
export function useMoney() {
  const { locale, primaryCurrency } = useSettings()
  const { rates } = useAppState()
  // stable between renders, so it can sit in effect/memo dependencies (the share image re-renders on change)
  return useMemo(
    () => ({
      main: (x: bigint) => formatMoney(x, 'usdt', rates, locale),
      approx: (x: bigint) => (primaryCurrency === 'usdt' ? null : `≈ ${formatMoney(x, primaryCurrency, rates, locale)}`),
    }),
    [locale, primaryCurrency, rates],
  )
}

