import { useState } from 'react'
import { CircleCheckIcon, Loader2Icon, LockIcon } from 'lucide-react'
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
import { formatDate, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import type { CoinAIAccount, YieldTarget } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

type RulesCardProps = {
  account: CoinAIAccount
}

const YIELD_SOURCES: { target: YieldTarget; logo: string; logoBackdrop?: string }[] = [
  { target: 'sparkdex', logo: '/logos/sparkdex-icon.svg' },
  { target: 'firelight', logo: '/logos/firelight-icon.svg' },
  { target: 'upshift', logo: '/logos/upshift-icon.svg' },
]

const YIELD_SOURCE_NAME_KEY: Record<YieldTarget, MessageKey> = {
  sparkdex: 'rules.yieldSourceSparkdexName',
  firelight: 'rules.yieldSourceFirelightName',
  upshift: 'rules.yieldSourceUpshiftName',
}

type YieldSourceOptionProps = {
  logo: string
  logoBackdrop?: string
  name: string
  selected: boolean
  selectedLabel: string
  locked: boolean
  pending: boolean
  onSelect: () => void
}

function YieldSourceOption({
  logo,
  logoBackdrop,
  name,
  selected,
  selectedLabel,
  locked,
  pending,
  onSelect,
}: YieldSourceOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={selected || locked}
      onClick={onSelect}
      className={cn(
        'group relative flex flex-1 items-center gap-3 rounded-xl border p-3 text-left outline-none transition-[border-color,box-shadow,transform] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        selected
          ? 'border-gold/60 bg-gold/5 shadow-[0_0_0_1px_var(--gold)_inset]'
          : locked
            ? 'cursor-not-allowed border-border opacity-60'
            : 'border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
        style={logoBackdrop ? { backgroundColor: logoBackdrop } : undefined}
      >
        <img
          src={logo}
          alt=""
          className={logoBackdrop ? 'h-[58%] w-[58%] object-contain' : 'h-full w-full object-cover'}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {selected && <span className="block text-xs text-gold-ink">{selectedLabel}</span>}
      </span>
      {selected ? (
        <CircleCheckIcon className="size-5 shrink-0 text-gold-ink" />
      ) : locked ? (
        <LockIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      {pending && (
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/80">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  )
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

  const canSwitchTarget = account.shares === 0n

  const handleSwitchTarget = async (target: YieldTarget) => {
    if (!address || anyBusy || target === account.yieldTarget) return
    await runAction('yieldTarget', 'success.yieldTargetSaved', () =>
      coinai.setYieldTarget(address, target),
    )
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
          <p className="text-sm font-medium">{t('rules.yieldSourceTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('rules.yieldSourceCaption')}</p>
          <div className="flex flex-wrap gap-2">
            {YIELD_SOURCES.map((source) => (
              <YieldSourceOption
                key={source.target}
                logo={source.logo}
                logoBackdrop={source.logoBackdrop}
                name={t(YIELD_SOURCE_NAME_KEY[source.target])}
                selected={account.yieldTarget === source.target}
                selectedLabel={t('yield.badgeSelected')}
                locked={
                  account.yieldTarget !== source.target && (!canSwitchTarget || anyBusy)
                }
                pending={busy === 'yieldTarget' && account.yieldTarget !== source.target}
                onSelect={() => void handleSwitchTarget(source.target)}
              />
            ))}
          </div>
          {!canSwitchTarget && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3" />
              {t('rules.yieldSourceSwitchHint')}
            </p>
          )}
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
