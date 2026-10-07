import { useState } from 'react'
import { ArrowRightIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { POSITIONS, type CoinAIAccount, type Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { POSITION_NAME, VAULT_LOGO } from '@/lib/yield'

function tryParse(raw: string): bigint | null {
  try {
    const v = parseToken(raw)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/** CoinAIV2.rebalance: move value between the user's own positions. The money stays in savings, so it works while locked. */
export function MoveCard({ account, onMoved }: { account: CoinAIAccount; onMoved?: () => void }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { busy, rates, runAction } = useAppState()
  const { address } = useWallet()
  const held = POSITIONS.filter((p) => account.positions[p] > 0n)
  const [from, setFrom] = useState<Position | null>(null)
  const [to, setTo] = useState<Position | null>(null)
  const [value, setValue] = useState('')
  const [all, setAll] = useState(false)
  if (held.length === 0) return null

  const src = from && account.positions[from] > 0n ? from : held[0]
  const dst = to && to !== src ? to : src === 'conservative' ? 'balanced' : 'conservative'
  const available = account.positions[src]
  const amount = all ? available : tryParse(value)
  const tooMuch = amount !== null && amount > available
  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)

  const handleMove = async () => {
    if (amount === null || tooMuch) return
    const ok = await runAction('move', 'success.moved', () => coinai.rebalance(address ?? '', src, dst, all ? 'all' : amount))
    if (ok) {
      setValue('')
      setAll(false)
      onMoved?.()
    }
  }

  const picker = (v: Position, onPick: (p: Position) => void, disabled: (p: Position) => boolean) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={v === p}
          disabled={busy !== null || disabled(p)}
          onClick={() => onPick(p)}
          className={cn(
            'flex items-center gap-2 rounded-xl border p-2 text-left text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40',
            v === p ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
          )}
        >
          <img src={VAULT_LOGO[p]} alt="" className="size-5 shrink-0 rounded-full" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{t(POSITION_NAME[p])}</span>
            <span className="block text-muted-foreground tabular-nums">{money(account.positions[p])}</span>
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('move.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('move.caption')}</p>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('move.from')}</p>
          {picker(
            src,
            (p) => {
              setFrom(p)
              setValue('')
              setAll(false)
            },
            (p) => account.positions[p] === 0n,
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('move.to')}</p>
          {picker(dst, setTo, (p) => p === src)}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            placeholder="0"
            aria-label={t('withdraw.amountLabel')}
            value={all ? tokenToInput(available) : value}
            disabled={busy !== null}
            onChange={(e) => {
              setValue(e.target.value.replace(',', '.'))
              setAll(false)
            }}
            className={cn('tabular-nums', tooMuch && 'border-destructive')}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setAll(true)}>
            {t('withdraw.max')}
          </Button>
        </div>
        <Button className="w-full rounded-full" disabled={busy !== null || amount === null || tooMuch} onClick={() => void handleMove()}>
          {busy === 'move' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {t(POSITION_NAME[src])} <ArrowRightIcon className="mx-1 size-4" /> {t(POSITION_NAME[dst])}
          {amount !== null && !tooMuch && ` · ${money(amount)}`}
        </Button>
      </CardContent>
    </Card>
  )
}
