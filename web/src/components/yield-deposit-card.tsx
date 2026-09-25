import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowRightIcon, Loader2Icon, SparklesIcon, InfoIcon, XIcon } from 'lucide-react'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatMoney, useT, type MessageKey } from '@/lib/i18n'
import type { FxRates } from '@/lib/rates'
import { useSettings } from '@/lib/settings'
import type { YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const VAULT_NAME_KEY: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}

type YieldDepositCardProps = {
  shares: bigint
  yieldTarget: YieldTarget
  vaultAddress: string | null
  rates: FxRates
  onDeposit: (amount: bigint) => Promise<void>
  busy: boolean
  available?: boolean
}

export function YieldDepositCard({
  shares,
  yieldTarget,
  vaultAddress,
  rates,
  onDeposit,
  busy,
  available = true,
}: YieldDepositCardProps) {
  const t = useT()
  const { address } = useWallet()
  const { locale } = useSettings()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  const canDeposit = available && address && amount.trim() !== '' && !busy && shares > 0n

  const handleMax = () => {
    setAmount(tokenToInput(shares))
  }

  const handleDeposit = async () => {
    setError(null)
    if (!address) return
    try {
      const value = parseToken(amount)
      if (value <= 0n) {
        setError(t('errors.invalidAmount'))
        return
      }
      if (value > shares) {
        setError(t('errors.insufficientShares'))
        return
      }
      await onDeposit(value)
      setAmount('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'))
    }
  }

  return (
    <Card className="rounded-2xl shadow-none relative" style={{ perspective: 1000 }}>
      <AnimatePresence mode="wait">
        {!showInfo ? (
          <motion.div
            key="front"
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base font-medium">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-5 text-gold-ink" />
                  {t('yield.depositTitle')}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo(true)}>
                  <InfoIcon className="size-4 text-muted-foreground" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('yield.availableSavings')}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                    <TokenIcon token="usdt" size={22} />
                    {formatMoney(shares, 'usdt', rates, locale)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleMax} disabled={shares === 0n || busy}>
                  {t('yield.max')}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('yield.amount')}</label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={t('common.amountPlaceholder')}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    tUSDT
                  </span>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('yield.protocol')}</span>
                  <span className="font-medium">{t(VAULT_NAME_KEY[yieldTarget])}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">{t('yield.vault')}</span>
                  <span className="font-mono text-xs">{vaultAddress ? shortAddr(vaultAddress) : '-'}</span>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {!available && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {t('yield.targetUnavailable')}
                </p>
              )}

              <Button
                className={cn('w-full', yieldTarget === 'growth' ? 'bg-gold-ink hover:bg-gold-ink/90' : '')}
                disabled={!canDeposit}
                onClick={() => void handleDeposit()}
              >
                {busy ? (
                  <Loader2Icon className="mr-2 size-4 animate-spin" />
                ) : (
                  <ArrowRightIcon className="mr-2 size-4" />
                )}
                {busy ? t('common.loading') : t('yield.depositButton')}
              </Button>

              <p className="text-xs text-muted-foreground">{t('yield.depositHint')}</p>
            </CardContent>
          </motion.div>
        ) : (
          <motion.div
            key="back"
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-h-[380px] flex-col"
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base font-medium">
                <span>{t('yield.howTitle')}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo(false)}>
                  <XIcon className="size-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center px-6 pb-10 pt-2">
              <p className="text-[15px] leading-8 text-muted-foreground text-center px-2">
                {t('yield.howBody')}
              </p>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
