import { useState } from 'react'
import { ArrowDownIcon, LockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { TokenIcon } from '@/components/brand/token-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppState } from '@/lib/app-state'
import { coinai } from '@/lib/coinai'
import { parseToken, tokenToInput } from '@/lib/format'
import { formatDate, formatMoney, useT, type MessageKey } from '@/lib/i18n'
import { secondaryCurrencyFor, useSettings } from '@/lib/settings'
import { YIELD_TARGETS, type CoinAIAccount, type YieldTarget } from '@/lib/types'
import { useYieldData } from '@/lib/use-yield-data'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'
import { VAULT_LOGO } from '@/lib/yield'

type Pocket = 'spend' | 'savings' | 'vault'

const PANEL: Record<Pocket, { image: string; label: MessageKey; title: MessageKey; body: MessageKey }> = {
  spend: { image: '/landing/hero.jpg', label: 'withdraw.panelSpendLabel', title: 'withdraw.panelSpendTitle', body: 'withdraw.panelSpendBody' },
  savings: { image: '/landing/save.jpg', label: 'withdraw.panelSaveLabel', title: 'withdraw.panelSaveTitle', body: 'withdraw.panelSaveBody' },
  vault: { image: '/landing/agents.jpg', label: 'withdraw.panelVaultLabel', title: 'withdraw.panelVaultTitle', body: 'withdraw.panelVaultBody' },
}

const VAULT_NAME: Record<YieldTarget, MessageKey> = {
  conservative: 'yield.sourceConservativeName',
  balanced: 'yield.sourceBalancedName',
  growth: 'yield.sourceGrowthName',
}

// Parses what the user typed; null while empty or not a valid amount (no toast while typing).
function tryParse(raw: string): bigint | null {
  try {
    const v = parseToken(raw)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export function WithdrawCard({ account }: { account: CoinAIAccount }) {
  const t = useT()
  const { address } = useWallet()
  const { busy, rates, runAction } = useAppState()
  const { locale, primaryCurrency } = useSettings()
  const [pocket, setPocket] = useState<Pocket>('spend')
  const [value, setValue] = useState('')
  // "Max" on a vault redeems every share rather than the displayed amount, so no dust is left behind.
  const [all, setAll] = useState(false)
  const { vaults, refresh: refreshVaults } = useYieldData(address)
  const [picked, setPicked] = useState<YieldTarget | null>(null)
  const vaultTarget = picked ?? YIELD_TARGETS.find((k) => (vaults?.[k].position ?? 0n) > 0n) ?? 'balanced'
  const anyBusy = busy !== null

  const locked = Number(account.lockUntil) * 1000 > Date.now()
  const available = pocket === 'spend' ? account.spend : pocket === 'savings' ? account.shares : (vaults?.[vaultTarget].position ?? 0n)
  const blocked = pocket === 'savings' && locked
  const amount = tryParse(value)
  const tooMuch = amount !== null && amount > available
  const secondary = secondaryCurrencyFor(primaryCurrency, locale)
  const panel = PANEL[pocket]

  const switchPocket = (next: string) => {
    setPocket(next as Pocket)
    setValue('')
    setAll(false)
  }

  const handleWithdraw = async () => {
    if (!address) return
    if (amount === null) {
      toast.error(t('errors.invalidAmount'))
      return
    }
    const ok =
      pocket === 'spend'
        ? await runAction('spend', 'success.withdrewSpend', () => coinai.withdrawSpend(address, amount))
        : pocket === 'savings'
          ? await runAction('savings', 'success.withdrewSavings', () => coinai.withdrawSavings(address, amount))
          : await runAction('vault', 'success.withdrewVault', () =>
              coinai.withdrawFromVault(address, vaultTarget, all ? 'all' : amount),
            )
    if (ok) {
      setValue('')
      setAll(false)
      if (pocket === 'vault') void refreshVaults()
    }
  }

  const buttonLabel =
    busy === pocket
      ? `${t('common.loading')}...`
      : amount === null
        ? t('withdraw.enterAmount')
        : t('withdraw.buttonAmount', { amount: formatMoney(amount, 'usdt', rates, locale) })

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Visual panel */}
      <div className="relative isolate flex min-h-56 flex-col justify-end overflow-hidden rounded-2xl lg:min-h-[440px]">
        <img src={panel.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="bg-[#0b0b0b]/70 p-6 text-white backdrop-blur-[2px]">
          <p className="font-mono text-[10px] font-bold tracking-[0.24em] text-white/70 uppercase">{t(panel.label)}</p>
          <p className="mt-2 font-serif text-2xl leading-tight font-medium">{t(panel.title)}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/80">{t(panel.body)}</p>
        </div>
      </div>

      {/* Action card */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <Tabs value={pocket} onValueChange={switchPocket} className="items-center">
          <TabsList className="rounded-full">
            <TabsTrigger value="spend" className="rounded-full px-5">
              {t('withdraw.spendTab')}
            </TabsTrigger>
            <TabsTrigger value="savings" className="rounded-full px-5">
              {t('withdraw.saveTab')}
            </TabsTrigger>
            <TabsTrigger value="vault" className="rounded-full px-5">
              {t('withdraw.vaultTab')}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {pocket === 'vault' && (
          <div className="mt-5 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('withdraw.vaultTab')}>
            {YIELD_TARGETS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={vaultTarget === k}
                disabled={anyBusy}
                onClick={() => {
                  setPicked(k)
                  setValue('')
                  setAll(false)
                }}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                  vaultTarget === k ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                )}
              >
                <img src={VAULT_LOGO[k]} alt="" className="size-6 rounded-full" />
                <span className="w-full truncate text-xs font-medium">{t(VAULT_NAME[k])}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {vaults ? formatMoney(vaults[k].position, 'usdt', rates, locale) : '–'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TokenIcon token="usdt" size={36} />
            <div>
              <p className="font-semibold">
                {pocket === 'vault'
                  ? t('withdraw.fromVault', { vault: t(VAULT_NAME[vaultTarget]) })
                  : t(pocket === 'spend' ? 'withdraw.fromSpend' : 'withdraw.fromSave')}
              </p>
              <p className="font-mono text-xs text-muted-foreground">tUSDT</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{formatMoney(available, primaryCurrency, rates, locale)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">~ {formatMoney(available, secondary, rates, locale)}</p>
          </div>
        </div>

        <div className={cn('mt-5 rounded-2xl border bg-muted/30 p-4', tooMuch && 'border-destructive/50')}>
          <label htmlFor="withdraw-amount" className="text-sm text-muted-foreground">
            {t('withdraw.amountLabel')}
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input
              id="withdraw-amount"
              value={value}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              disabled={anyBusy || blocked}
              onChange={(e) => {
                setValue(e.target.value.replace(',', '.'))
                setAll(false)
              }}
              className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
            />
            <span className="flex shrink-0 items-center gap-2 rounded-full border bg-card py-1.5 pr-3 pl-1.5 text-sm font-medium">
              <TokenIcon token="usdt" size={24} />
              tUSDT
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">~ {formatMoney(amount ?? 0n, secondary, rates, locale)}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">
                {t('withdraw.available', { amount: formatMoney(available, 'usdt', rates, locale) })}
              </span>
              <button
                type="button"
                disabled={anyBusy || blocked || available === 0n}
                onClick={() => {
                  setValue(tokenToInput(available))
                  setAll(pocket === 'vault')
                }}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-ink uppercase transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                {t('withdraw.max')}
              </button>
            </span>
          </div>
        </div>

        <div className="-my-2.5 flex justify-center" aria-hidden="true">
          <span className="relative z-10 flex size-8 items-center justify-center rounded-full border bg-card">
            <ArrowDownIcon className="size-4 text-muted-foreground" />
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border p-4 text-sm">
          <span className="text-muted-foreground">{t('withdraw.destination')}</span>
          <span className="font-mono text-xs">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '-'}</span>
        </div>

        {tooMuch && (
          <p className="mt-3 text-sm text-destructive">
            {t(pocket === 'spend' ? 'errors.insufficientSpendable' : pocket === 'savings' ? 'errors.insufficientShares' : 'withdraw.vaultTooMuch')}
          </p>
        )}

        <Button
          size="lg"
          className="mt-5 h-12 w-full rounded-full text-base"
          disabled={anyBusy || blocked || amount === null || tooMuch}
          onClick={() => void handleWithdraw()}
        >
          {buttonLabel}
        </Button>

        {pocket === 'savings' && (
          <div className="mt-3 space-y-2">
            {locked && (
              <p className="flex items-center gap-2 text-xs font-medium text-accent-foreground">
                <LockIcon className="size-4 shrink-0" />
                {t('withdraw.lockedReason', { date: formatDate(account.lockUntil, locale) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('withdraw.sharesHint')}</p>
          </div>
        )}
        {pocket === 'vault' && (
          <p className="mt-3 text-xs text-muted-foreground">
            {vaults && available === 0n ? t('withdraw.vaultEmpty') : t('withdraw.vaultHint')}
          </p>
        )}
      </div>
    </div>
  )
}
