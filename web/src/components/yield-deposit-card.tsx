import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowRightIcon, Loader2Icon, SparklesIcon, InfoIcon, XIcon } from 'lucide-react'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SPARKDEX_ADAPTER, VAULT_ADAPTER, FIRELIGHT_VAULT, UPSHIFT_VAULT, YIELD_TOKEN_OUT } from '@/lib/config'
import { parseFxrp, fxrpToInput } from '@/lib/format'
import { formatMoney, useT } from '@/lib/i18n'
import type { FxRates } from '@/lib/rates'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const SLIPPAGE_PRESETS = [0.5, 1, 2, 5]

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

type YieldDepositCardProps = {
  shares: bigint
  yieldTarget: 'sparkdex' | 'firelight' | 'upshift'
  rates: FxRates
  onDeposit: (args: {
    shares: bigint
    tokenOut: string
    adapter: string
    amountOutMin: bigint
    deadline: bigint
  }) => Promise<void>
  busy: boolean
  available?: boolean
}

export function YieldDepositCard({
  shares,
  yieldTarget,
  rates,
  onDeposit,
  busy,
  available = true,
}: YieldDepositCardProps) {
  const t = useT()
  const { address } = useWallet()
  const { locale } = useSettings()
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1)
  const [customTokenOut, setCustomTokenOut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  const isVault = yieldTarget === 'firelight' || yieldTarget === 'upshift'
  const adapter = isVault ? VAULT_ADAPTER : SPARKDEX_ADAPTER
  const tokenOut = yieldTarget === 'firelight'
    ? FIRELIGHT_VAULT
    : yieldTarget === 'upshift'
      ? UPSHIFT_VAULT
      : isValidAddress(customTokenOut)
        ? customTokenOut
        : YIELD_TOKEN_OUT
  const hasTokenOut = isValidAddress(tokenOut)
  const canDeposit =
    available && address && hasTokenOut && amount.trim() !== '' && !busy && shares > 0n

  const handleMax = () => {
    setAmount(fxrpToInput(shares))
  }

  const handleDeposit = async () => {
    setError(null)
    if (!address || !hasTokenOut) return
    try {
      const sharesValue = parseFxrp(amount)
      if (sharesValue <= 0n) {
        setError(t('errors.invalidAmount'))
        return
      }
      if (sharesValue > shares) {
        setError(t('errors.insufficientShares'))
        return
      }
      const amountOutMin = (sharesValue * BigInt(10000 - Math.round(slippage * 100))) / 10000n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20)
      
      await onDeposit({
        shares: sharesValue,
        tokenOut,
        adapter,
        amountOutMin,
        deadline,
      })
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
                    <TokenIcon token="fxrp" size={22} />
                    {formatMoney(shares, 'fxrp', rates, locale)}
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
                    FXRP
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{t('yield.slippage')}</label>
                  <span className="text-sm tabular-nums">{slippage}%</span>
                </div>
                <div className="flex gap-2">
                  {SLIPPAGE_PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant={slippage === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSlippage(p)}
                      disabled={busy}
                    >
                      {p}%
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {isVault ? t('yield.vault') : t('yield.outputToken')}
                </label>
                {isVault ? (
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <span className="font-mono">{shortAddr(FIRELIGHT_VAULT)}</span>
                    <span className="text-xs text-muted-foreground">{t('yield.firelightVault')}</span>
                  </div>
                ) : YIELD_TOKEN_OUT ? (
                  <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <span className="font-mono">{shortAddr(YIELD_TOKEN_OUT)}</span>
                    <span className="text-xs text-muted-foreground">{t('yield.fromConfig')}</span>
                  </div>
                ) : (
                  <Input
                    type="text"
                    placeholder={t('yield.tokenOutPlaceholder')}
                    value={customTokenOut}
                    onChange={(e) => setCustomTokenOut(e.target.value)}
                    disabled={busy}
                  />
                )}
                {!hasTokenOut && (
                  <p className="text-xs text-destructive">{t('yield.tokenOutRequired')}</p>
                )}
              </div>

              <div className="rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('yield.protocol')}</span>
                  <span className="font-medium capitalize">{yieldTarget}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">{t('yield.adapter')}</span>
                  <span className="font-mono text-xs">{shortAddr(adapter)}</span>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {!available && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {t('yield.targetUnavailable')}
                </p>
              )}

              <Button
                className={cn('w-full', yieldTarget === 'sparkdex' ? 'bg-gold-ink hover:bg-gold-ink/90' : '')}
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
                <span>How this works</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowInfo(false)}>
                  <XIcon className="size-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center px-6 pb-10 pt-2">
              <p className="text-[15px] leading-8 text-muted-foreground text-center px-2">
                This option allows you to deposit the funds that were <strong className="text-foreground font-medium">automatically saved</strong> when you received payments via your Payment Link. 
                <br /><br />
                These funds are currently held inside the coinAI smart contract and will be routed into a yield-generating vault (like Firelight or SparkDEX) so your savings can grow over time.
              </p>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
