import { useMemo, useState } from 'react'
import { Loader2Icon, UsersIcon } from 'lucide-react'
import { getAddress, isAddress } from 'ethers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { parseToken } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { PayManyRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const MAX_RECIPIENTS = 50 // CoinAIV2.MAX_RECIPIENTS

type Line = { n: number; raw: string; row: PayManyRow | null }

/** One "address, amount" per line (comma, semicolon, tab or space separated), as pasted from a sheet. */
function parseLines(text: string): Line[] {
  return text
    .split('\n')
    .map((raw, i) => ({ raw: raw.trim(), n: i + 1 }))
    .filter((l) => l.raw !== '')
    .map(({ raw, n }) => {
      const [addr, amount] = raw.split(/[\s,;]+/)
      try {
        const value = parseToken(amount ?? '')
        return { n, raw, row: isAddress(addr) && value > 0n ? { to: getAddress(addr), amount: value } : null }
      } catch {
        return { n, raw, row: null }
      }
    })
}

/** payMany: one payer, up to 50 recipients in one transaction; each recipient's own savings split applies. */
export function PayManyCard({ address }: { address: string }) {
  const t = useT()
  const { locale, primaryCurrency } = useSettings()
  const { busy, rates, runAction } = useAppState()
  const [text, setText] = useState('')
  const lines = useMemo(() => parseLines(text), [text])
  const rows = lines.flatMap((l) => (l.row ? [l.row] : []))
  const bad = lines.filter((l) => !l.row)
  const total = rows.reduce((sum, r) => sum + r.amount, 0n)
  const tooMany = rows.length > MAX_RECIPIENTS
  const money = (x: bigint) => formatMoney(x, primaryCurrency, rates, locale)

  const handlePay = async () => {
    if (await runAction('pay-many', 'success.paidMany', () => coinai.payMany(address, rows))) setText('')
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-5 text-gold-ink" />
          {t('payMany.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('payMany.caption')}</p>
        <textarea
          value={text}
          rows={6}
          spellCheck={false}
          aria-label={t('payMany.title')}
          placeholder={'0x1234…abcd, 25\n0x5678…ef01, 12.5'}
          disabled={busy !== null}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border bg-muted/30 p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        />
        {bad.length > 0 && (
          <p className="text-xs text-destructive">{t('payMany.badLines', { lines: bad.map((l) => l.n).join(', ') })}</p>
        )}
        {tooMany && <p className="text-xs text-destructive">{t('errors.tooManyRecipients')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <span className="text-muted-foreground">{t('payMany.summary', { n: rows.length })}</span>
          <span className={cn('font-semibold tabular-nums', rows.length === 0 && 'text-muted-foreground')}>{money(total)}</span>
        </div>
        <Button
          className="w-full rounded-full"
          disabled={busy !== null || rows.length === 0 || bad.length > 0 || tooMany}
          onClick={() => void handlePay()}
        >
          {busy === 'pay-many' && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          {t('payMany.button', { n: rows.length, amount: money(total) })}
        </Button>
        <p className="text-xs text-muted-foreground">{t('payMany.hint')}</p>
      </CardContent>
    </Card>
  )
}
