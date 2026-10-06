import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { GroupCard, KindIcon } from '@/components/groups/group-kit'
import { KIND, useMoney } from '@/components/groups/group-meta'
import { GLASS, GroupShell } from '@/components/groups/group-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidRecipientAddress } from '@/lib/address'
import { useAppState } from '@/lib/app-state'
import { errorKey } from '@/lib/errors'
import { parseToken } from '@/lib/format'
import { byteLength, createFund, FUND_KINDS, MAX_TITLE_BYTES, type FundKind, type GroupFund } from '@/lib/groups'
import { formatDate, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const DAY = 86_400
const DEADLINES = [3, 7, 14, 30] // days, Patungan
const DONASI_ENDS = [0, 30, 90] // days, 0 = no end
const PERIODS: { days: number; label: MessageKey }[] = [
  { days: 7, label: 'groups.periodWeekly' },
  { days: 30, label: 'groups.periodMonthly' },
]
const STEPS: MessageKey[] = ['groups.stepKind', 'groups.stepDetails', 'groups.stepReview']
const STEP_HINTS: MessageKey[] = ['groups.hintKind', 'groups.hintDetails', 'groups.hintReview']

function units(raw: string): bigint {
  try {
    return parseToken(raw.replace(',', '.'))
  } catch {
    return 0n
  }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        on ? 'border-primary bg-primary/10 font-medium text-primary-ink' : 'bg-card/60 hover:border-primary/40',
      )}
    >
      {children}
    </button>
  )
}

/** A kind as a radio card: the Withdraw panel's type (mono label, serif headline) on a plain surface, easy to read. */
function KindOption({ kind, selected, onSelect }: { kind: FundKind; selected: boolean; onSelect: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative flex h-full flex-col rounded-2xl border bg-card/70 p-5 text-left transition-[border-color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        selected ? 'border-primary shadow-md ring-1 ring-primary' : 'hover:border-primary/40 hover:shadow-sm',
      )}
    >
      <span
        className={cn(
          'absolute top-4 right-4 flex size-6 items-center justify-center rounded-full border-2',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {selected && <CheckIcon className="size-3.5" />}
      </span>
      <KindIcon kind={kind} className="size-12 rounded-2xl" />
      <span className="mt-4 font-mono text-[10px] font-bold tracking-[0.24em] text-muted-foreground uppercase">{t(KIND[kind].panelLabel)}</span>
      <span className="mt-2 font-serif text-2xl leading-tight font-medium">{t(KIND[kind].panelTitle)}</span>
      <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(KIND[kind].tagline)}</span>
      <span className="mt-auto hidden border-t pt-3 text-xs leading-relaxed text-muted-foreground md:block">{t(KIND[kind].rule)}</span>
    </button>
  )
}

/** One row: numbered steps joined by a line, done ones ticked. */
function Stepper({ step }: { step: number }) {
  const t = useT()
  return (
    <ol className="flex items-center gap-2" aria-label={t('groups.stepOf', { n: step + 1, total: STEPS.length })}>
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          {i > 0 && <span aria-hidden className={cn('h-px w-6 sm:w-10', i <= step ? 'bg-primary' : 'bg-border')} />}
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary text-primary-ink' : 'border text-muted-foreground',
            )}
          >
            {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
          </span>
          <span className={cn('text-sm', i === step ? 'font-medium' : 'text-muted-foreground', i !== step && 'hidden sm:inline')}>{t(label)}</span>
        </li>
      ))}
    </ol>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

/** Create a group in three steps inside one card (kind, details, review), like the /pay flow. */
export function NewGroupPage() {
  const t = useT()
  const navigate = useNavigate()
  const { locale } = useSettings()
  const { address, connecting, connect } = useWallet()
  const { busy, runAction } = useAppState()
  const { main, approx } = useMoney()
  const [params] = useSearchParams()
  const initial = FUND_KINDS.find((k) => k === params.get('kind')) ?? null
  const [step, setStep] = useState(initial ? 1 : 0)
  const [kind, setKind] = useState<FundKind | null>(initial)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState(initial === 'donasi' ? 0 : 7) // Patungan deadline / Donasi end (0 = none)
  const [periodDays, setPeriodDays] = useState(30)
  const [toSelf, setToSelf] = useState(true)
  const [beneficiary, setBeneficiary] = useState('')

  const value = units(amount)
  const titleBytes = byteLength(title.trim())
  const target = kind === 'iuran' ? 0n : value
  const deadline = kind === 'iuran' || (kind === 'donasi' && days === 0) ? 0 : Math.floor(Date.now() / 1000) + days * DAY
  const to = toSelf ? (address ?? '') : beneficiary.trim()

  const detailsProblem: MessageKey | null =
    titleBytes === 0
      ? 'groups.needTitle'
      : titleBytes > MAX_TITLE_BYTES
        ? 'groups.titleTooLong'
        : (kind !== 'donasi' && value === 0n) || (kind === 'donasi' && amount.trim() !== '' && value === 0n)
          ? 'groups.needAmount'
          : !toSelf && !isValidRecipientAddress(to)
            ? 'groups.needBeneficiary'
            : null

  // What people will see, before anything is on-chain.
  const preview: GroupFund | null = useMemo(
    () =>
      kind && {
        id: -1,
        organizer: address ?? '0x0000000000000000000000000000000000000000',
        beneficiary: to,
        kind,
        cancelled: false,
        start: Math.floor(Date.now() / 1000),
        deadline,
        period: kind === 'iuran' ? periodDays * DAY : 0,
        target,
        dues: kind === 'iuran' ? value : 0n,
        raised: 0n,
        withdrawn: 0n,
        contributors: 0,
        members: 0,
        title: title.trim() || t('groups.untitled'),
      },
    [kind, address, to, deadline, periodDays, target, value, title, t],
  )

  const create = async () => {
    if (!kind || detailsProblem || !address) return
    const created = await runAction('group-create', 'groups.created', () =>
      createFund({ kind, beneficiary: to, title: title.trim(), target, deadline, dues: kind === 'iuran' ? value : 0n, period: kind === 'iuran' ? periodDays * DAY : 0 }),
    )
    if (created) navigate(`/groups/${created.id}?created=1`)
  }

  const amountLabel: MessageKey = kind === 'iuran' ? 'groups.duesLabel' : kind === 'patungan' ? 'groups.targetLabel' : 'groups.goalLabel'
  const canNext = step === 0 ? !!kind : step === 1 ? !detailsProblem : false

  return (
    <GroupShell>
      {/* overflow-visible: the Card clips by default, which would pin the sticky footer to the card instead of the screen */}
      <Card className={cn(GLASS, 'mx-auto max-w-5xl overflow-visible')}>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b pb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('groups.newTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t(STEP_HINTS[step])}</p>
            </div>
            <Stepper step={step} />
          </div>

          {/* 1. kind */}
          {step === 0 && (
            <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label={t('groups.pickKind')}>
              {FUND_KINDS.map((k) => (
                <KindOption
                  key={k}
                  kind={k}
                  selected={kind === k}
                  onSelect={() => {
                    setKind(k)
                    setDays(k === 'donasi' ? 0 : 7)
                  }}
                />
              ))}
            </div>
          )}

          {/* 2. details */}
          {step === 1 && kind && preview && (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_388px]">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label htmlFor="group-title">{t('groups.titleLabel')}</Label>
                  <span className={cn('text-xs tabular-nums', titleBytes > MAX_TITLE_BYTES ? 'text-destructive' : 'text-muted-foreground')}>
                    {titleBytes}/{MAX_TITLE_BYTES}
                  </span>
                </div>
                <Input
                  id="group-title"
                  value={title}
                  placeholder={t(kind === 'iuran' ? 'groups.exampleIuran' : kind === 'patungan' ? 'groups.examplePatungan' : 'groups.exampleDonasi')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="group-amount">
                  {t(amountLabel)}
                  {kind === 'donasi' && <span className="ml-1 font-normal text-muted-foreground">({t('groups.optional')})</span>}
                </Label>
                <div className="flex items-center gap-2">
                  <Input id="group-amount" value={amount} inputMode="decimal" placeholder="0" className="h-12 text-lg tabular-nums" onChange={(e) => setAmount(e.target.value)} />
                  <span className="shrink-0 text-sm text-muted-foreground">tUSDT</span>
                </div>
                {value > 0n && approx(value) && <p className="text-xs text-muted-foreground tabular-nums">{approx(value)}</p>}
              </div>

              {kind === 'iuran' ? (
                <div className="space-y-2">
                  <Label>{t('groups.periodLabel')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {PERIODS.map((p) => (
                      <Chip key={p.days} on={periodDays === p.days} onClick={() => setPeriodDays(p.days)}>
                        {t(p.label)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{t(kind === 'patungan' ? 'groups.deadlineLabel' : 'groups.endLabel')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {(kind === 'patungan' ? DEADLINES : DONASI_ENDS).map((d) => (
                      <Chip key={d} on={days === d} onClick={() => setDays(d)}>
                        {d === 0 ? t('groups.noEnd') : t('groups.inDays', { n: d })}
                      </Chip>
                    ))}
                  </div>
                  {deadline > 0 && <p className="text-xs text-muted-foreground">{t('groups.closesOn', { date: formatDate(BigInt(deadline), locale) })}</p>}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('groups.beneficiaryLabel')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip on={toSelf} onClick={() => setToSelf(true)}>{t('groups.beneficiaryMe')}</Chip>
                  <Chip on={!toSelf} onClick={() => setToSelf(false)}>{t('groups.beneficiaryOther')}</Chip>
                </div>
                {!toSelf && <Input value={beneficiary} placeholder="0x…" className="font-mono text-sm" onChange={(e) => setBeneficiary(e.target.value)} />}
                <p className="text-xs text-muted-foreground">{t('groups.beneficiaryHint')}</p>
              </div>
            </div>
            <div className="hidden space-y-2 lg:block">
              <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('groups.livePreview')}</p>
              <GroupCard fund={preview} preview />
            </div>
            </div>
          )}

          {/* 3. review */}
          {step === 2 && kind && preview && (
            <div className="grid items-start gap-8 lg:grid-cols-[388px_minmax(0,1fr)]">
              <div className="flex justify-center">
                <GroupCard fund={preview} preview />
              </div>
              <div className="space-y-5">
              <div className="divide-y rounded-2xl border bg-card/60 px-4">
                <Row label={t('groups.kindLabel')} value={t(KIND[kind].label)} />
                {kind === 'iuran' ? (
                  <Row label={t('groups.duesLabel')} value={`${main(value)} · ${t(periodDays === 7 ? 'groups.periodWeekly' : 'groups.periodMonthly')}`} />
                ) : (
                  <>
                    <Row label={t(amountLabel)} value={value > 0n ? main(value) : t('groups.noGoal')} />
                    <Row label={t(kind === 'patungan' ? 'groups.deadlineLabel' : 'groups.endLabel')} value={deadline ? formatDate(BigInt(deadline), locale) : t('groups.noEnd')} />
                  </>
                )}
                <Row label={t('groups.beneficiaryLabel')} value={toSelf ? t('groups.beneficiaryMe') : `${to.slice(0, 6)}…${to.slice(-4)}`} />
              </div>
              <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{t(KIND[kind].rule)}</p>
              <div className="space-y-2">
                <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{t('groups.whatNext')}</p>
                <ol className="space-y-2 text-sm">
                  {(['groups.next1', 'groups.next2', kind === 'iuran' ? 'groups.next3Iuran' : 'groups.next3'] as const).map((key, i) => (
                    <li key={key} className="flex gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary-ink">{i + 1}</span>
                      <span className="pt-0.5">{t(key)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              </div>
            </div>
          )}

          {/* footer */}
          {/* sticky on phones, so Next is always in reach after picking */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex items-center justify-between gap-3 rounded-b-2xl border-t bg-card/95 px-5 py-4 backdrop-blur-sm md:static md:mx-0 md:mb-0 md:rounded-none md:bg-transparent md:px-0 md:pt-5 md:pb-0 md:backdrop-blur-none">
            <Button variant="ghost" className="rounded-full" onClick={() => (step === 0 ? navigate('/groups') : setStep(step - 1))}>
              <ArrowLeftIcon className="size-4" />
              {step === 0 ? t('groups.backToGroups') : t('groups.back')}
            </Button>
            {step < 2 ? (
              <Button className="rounded-full" disabled={!canNext} onClick={() => setStep(step + 1)}>
                {step === 1 && detailsProblem ? t(detailsProblem) : step === 0 && !kind ? t('groups.pickKind') : t('groups.next')}
                {canNext && <ArrowRightIcon className="size-4" />}
              </Button>
            ) : address ? (
              <Button className="rounded-full" disabled={busy !== null} onClick={() => void create()}>
                {busy === 'group-create' && <Loader2Icon className="size-4 animate-spin" />}
                {t('groups.create')}
              </Button>
            ) : (
              <Button className="rounded-full" disabled={connecting} onClick={() => void connect().catch((e) => toast.error(t(errorKey(e))))}>
                {t('groups.connectToCreate')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </GroupShell>
  )
}
