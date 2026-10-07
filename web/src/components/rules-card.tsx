import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { formatDate, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { CoinAIAccount } from '@/lib/types'
import { useWallet } from '@/lib/wallet'

type RulesCardProps = {
  account: CoinAIAccount
}

export function RulesCard({ account }: RulesCardProps) {
  const t = useT()
  const { address } = useWallet()
  const { busy, runAction } = useAppState()
  const { locale } = useSettings()
  const [draft, setDraft] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const anyBusy = busy !== null

  const percent = draft ?? Math.round(account.splitBps / 100)
  const unchanged = percent * 100 === account.splitBps

  // local calendar date; toISOString would allow locking a date already past in UTC+ zones
  const next = new Date(Date.now() + 86_400_000)
  const tomorrow = [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-')
  const locked = Number(account.lockUntil) * 1000 > Date.now()

  const handleSaveSplit = async () => {
    if (!address) return
    const ok = await runAction('split', 'success.splitSaved', () =>
      coinai.setSplit(address, percent * 100),
    )
    if (ok) setDraft(null)
  }

  const handleLock = async () => {
    if (!address) return
    const until = BigInt(Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000))
    const ok = await runAction('lock', 'success.lockSet', () => coinai.setLock(address, until))
    if (ok) setDate('')
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('rules.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t('rules.splitLabel')}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{percent}%</p>
          </div>
          <Slider
            value={[percent]}
            min={0}
            max={100}
            step={1}
            disabled={anyBusy}
            onValueChange={(values) => setDraft(values[0])}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t('rules.splitSentence', { pct: percent })}
            </p>
            <Button
              size="sm"
              onClick={() => void handleSaveSplit()}
              disabled={anyBusy || unchanged}
            >
              {busy === 'split' ? `${t('common.loading')}...` : t('rules.saveButton')}
            </Button>
          </div>
        </div>
        <Separator />
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('rules.lockTitle')}</p>
          <p className="text-sm text-muted-foreground">
            {locked
              ? t('rules.lockedStatus', { date: formatDate(account.lockUntil, locale) })
              : t('rules.noLock')}
          </p>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label={t('rules.lockLabel')}
              min={tomorrow}
              value={date}
              disabled={anyBusy}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => void handleLock()}
              disabled={anyBusy || date === '' || date < tomorrow}
            >
              {busy === 'lock' ? `${t('common.loading')}...` : t('rules.lockButton')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('rules.lockCaption')}</p>
        </div>
      </CardContent>
    </Card>
  )
}
