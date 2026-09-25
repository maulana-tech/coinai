import { useState } from 'react'
import { LockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatDate, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { CoinAIAccount } from '@/lib/types'
import { useWallet } from '@/lib/wallet'

type WithdrawCardProps = {
  account: CoinAIAccount
}

export function WithdrawCard({ account }: WithdrawCardProps) {
  const t = useT()
  const { address } = useWallet()
  const { busy, runAction } = useAppState()
  const { locale } = useSettings()
  const [spendValue, setSpendValue] = useState('')
  const [savingsValue, setSavingsValue] = useState('')
  const anyBusy = busy !== null

  const locked = Number(account.lockUntil) * 1000 > Date.now()
  const loadingLabel = `${t('common.loading')}...`

  const parseAmount = (raw: string): bigint | null => {
    try {
      const amount = parseToken(raw)
      if (amount <= 0n) throw new Error('invalid amount')
      return amount
    } catch {
      toast.error(t('errors.invalidAmount'))
      return null
    }
  }

  const handleWithdrawSpend = async () => {
    const amount = parseAmount(spendValue)
    if (amount === null || !address) return
    const ok = await runAction('spend', 'success.withdrewSpend', () =>
      coinai.withdrawSpend(address, amount),
    )
    if (ok) setSpendValue('')
  }

  const handleWithdrawSavings = async () => {
    const shares = parseAmount(savingsValue)
    if (shares === null || !address) return
    const ok = await runAction('savings', 'success.withdrewSavings', () =>
      coinai.withdrawSavings(address, shares),
    )
    if (ok) setSavingsValue('')
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('withdraw.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="spend">
          <TabsList className="w-full">
            <TabsTrigger value="spend">{t('withdraw.spendTab')}</TabsTrigger>
            <TabsTrigger value="savings">{t('withdraw.saveTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="spend" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <TokenIcon
                  token="usdt"
                  size={26}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <Input
                  value={spendValue}
                  placeholder={t('common.amountPlaceholder')}
                  inputMode="decimal"
                  className="pl-12 tabular-nums"
                  disabled={anyBusy}
                  onChange={(e) => setSpendValue(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={anyBusy}
                onClick={() => setSpendValue(tokenToInput(account.spend))}
              >
                {t('withdraw.max')}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => void handleWithdrawSpend()}
              disabled={anyBusy || spendValue.trim() === ''}
            >
              {busy === 'spend' ? loadingLabel : t('withdraw.button')}
            </Button>
          </TabsContent>
          <TabsContent value="savings" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Input
                value={savingsValue}
                placeholder={t('withdraw.sharesPlaceholder')}
                inputMode="decimal"
                className="tabular-nums"
                disabled={anyBusy || locked}
                onChange={(e) => setSavingsValue(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={anyBusy || locked}
                onClick={() => setSavingsValue(tokenToInput(account.shares))}
              >
                {t('withdraw.max')}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => void handleWithdrawSavings()}
              disabled={anyBusy || locked || savingsValue.trim() === ''}
            >
              {busy === 'savings' ? loadingLabel : t('withdraw.button')}
            </Button>
            {locked && (
              <p className="flex items-center gap-2 text-xs font-medium text-accent-foreground">
                <LockIcon className="size-4 shrink-0" />
                {t('withdraw.lockedReason', { date: formatDate(account.lockUntil, locale) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('withdraw.sharesHint')}</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
