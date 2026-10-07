import { useState } from 'react'
import { ExternalLinkIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppState } from '@/lib/app-state'
import { setBasketWeights, useBasket, weightsError } from '@/lib/basket'
import { explorerAddressUrl } from '@/lib/config'
import { formatDateTime, formatMoney, intlLocale, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { VAULT_LOGO } from '@/lib/yield'

const WEIGHT_ERROR: Record<'sum' | 'stable' | 'cap', MessageKey> = {
  sum: 'basket.errSum',
  stable: 'basket.errStable',
  cap: 'basket.errCap',
}

const BAR = ['bg-muted-foreground/40', 'bg-gold', 'bg-primary', 'bg-secondary', 'bg-accent-foreground/60']

/** The AI Smart Money basket: what the user holds, the weights Plutus set and why, and how fresh each price is. */
export function BasketCard({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { account, busy, rates, runAction } = useAppState()
  const { basket, loading, refresh } = useBasket(address)
  const [draft, setDraft] = useState<string[] | null>(null) // percent per asset while editing
  const usd = new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  const stale = basket?.assets.filter((a) => !a.fresh) ?? []
  const draftBps = draft?.map((x) => Math.round((Number(x.replace(',', '.')) || 0) * 100)) ?? null
  const draftError = basket && draftBps ? weightsError(draftBps, basket.assets) : null

  const save = async (weights: number[]) => {
    if (await runAction('basket-weights', 'success.basketWeights', () => setBasketWeights(weights))) {
      setDraft(null)
      void refresh()
    }
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <img src={VAULT_LOGO.basket} alt="" className="size-6 rounded-full" />
            {t('basket.title')}
          </span>
          <span className="text-base font-semibold tabular-nums">
            {account ? formatMoney(account.positions.basket, primaryCurrency, rates, locale) : '–'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || !basket ? (
          loading ? <Skeleton className="h-32 w-full" /> : <p className="text-sm text-muted-foreground">{t('basket.unavailable')}</p>
        ) : (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {basket.assets.map((a, i) =>
                a.weightBps > 0 ? <div key={a.symbol} className={cn('rounded-full', BAR[i % BAR.length])} style={{ width: `${a.weightBps / 100}%` }} /> : null,
              )}
            </div>
            <ul className="divide-y rounded-xl border text-sm">
              {basket.assets.map((a, i) => (
                <li key={a.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 tabular-nums">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={cn('size-2 rounded-full', BAR[i % BAR.length])} />
                    {a.symbol}
                  </span>
                  <span className={cn('text-xs', a.fresh ? 'text-muted-foreground' : 'text-destructive')}>
                    {a.fresh ? usd.format(a.priceUsd) : t('basket.stale')}
                  </span>
                  {draft ? (
                    <span className="flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        aria-label={`${a.symbol} %`}
                        value={draft[i]}
                        disabled={busy !== null}
                        onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))}
                        className="h-7 w-16 text-right tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </span>
                  ) : (
                    <span className="w-12 text-right font-semibold">{a.weightBps / 100}%</span>
                  )}
                </li>
              ))}
            </ul>
            {basket.reason && (
              <div className="border-l-2 border-gold pl-3">
                <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {t('basket.whyBy')}
                  {basket.reasonAt && ` · ${formatDateTime(basket.reasonAt, locale)}`}
                </p>
                <p className="mt-1 text-sm">{basket.reason}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                {basket.custom ? (
                  <Badge variant="outline" className="text-[10px]">{t('basket.custom')}</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-gold/15 text-[10px] text-gold-ink">{t('basket.followsAi')}</Badge>
                )}
                {stale.length > 0 && <span className="text-destructive">{t('basket.staleHint')}</span>}
              </span>
              {basket.address && (
                <a href={explorerAddressUrl(basket.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  BasketVault <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </div>
            {draft ? (
              <div className="space-y-2">
                <p className={cn('text-xs', draftError ? 'text-destructive' : 'text-muted-foreground')}>
                  {t(draftError ? WEIGHT_ERROR[draftError] : 'basket.editHint', {
                    sum: (draftBps ?? []).reduce((s, w) => s + w, 0) / 100,
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy !== null || draftError !== null} onClick={() => draftBps && void save(draftBps)}>
                    {busy === 'basket-weights' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                    {t('basket.saveWeights')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDraft(null)}>
                    {t('basket.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setDraft(basket.assets.map((a) => String(a.weightBps / 100)))}>
                  {t('basket.editWeights')}
                </Button>
                {basket.custom && (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void save([])}>
                    {busy === 'basket-weights' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                    {t('basket.followPlutus')}
                  </Button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('basket.caption')}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
