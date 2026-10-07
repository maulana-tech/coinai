import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BanIcon, ExternalLinkIcon, HandCoinsIcon, Loader2Icon, MegaphoneIcon, SendIcon, Undo2Icon, UsersIcon } from 'lucide-react'
import { toast } from 'sonner'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { FundProgress, KindBadge, StatusBadge } from '@/components/groups/group-kit'
import { KIND, useMoney, useRelative } from '@/components/groups/group-meta'
import { GLASS, GroupShell } from '@/components/groups/group-shell'
import { SocialCard } from '@/components/groups/social-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { isValidRecipientAddress } from '@/lib/address'
import { useAppState } from '@/lib/app-state'
import { explorerAddressUrl, explorerTxUrl } from '@/lib/config'
import { errorKey } from '@/lib/errors'
import { parseToken } from '@/lib/format'
import {
  acceptsMoney,
  byteLength,
  cancelFund,
  contributeFromSpendable,
  contributeToFund,
  currentPeriod,
  duesBehind,
  fundHistory,
  getFund,
  joinFund,
  MAX_MESSAGE_BYTES,
  membersWithDues,
  myStake,
  refundFromFund,
  refundsOpen,
  withdrawFromFund,
  type FundEvent,
  type GroupFund,
  type MemberDues,
  type MyStake,
} from '@/lib/groups'
import { formatDate, useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { useWallet } from '@/lib/wallet'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const QUICK = ['5', '10', '25', '50']

function units(raw: string): bigint {
  try {
    return parseToken(raw.replace(',', '.'))
  } catch {
    return 0n
  }
}

function Label({ children }: { children: string }) {
  return <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{children}</p>
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero({ fund, members }: { fund: GroupFund; members: { member: string; dues: MemberDues }[] | null }) {
  const t = useT()
  const { locale } = useSettings()
  const { main, approx } = useMoney()
  const relative = useRelative()
  const period = currentPeriod(fund)
  return (
    <Card className={GLASS}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={fund.kind} />
          <StatusBadge fund={fund} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{fund.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <AddressAvatar address={fund.organizer} size={18} className="rounded-full" />
              {t('groups.by', { who: short(fund.organizer) })}
            </span>
            {fund.beneficiary !== fund.organizer && (
              <a href={explorerAddressUrl(fund.beneficiary)} target="_blank" rel="noreferrer" className="hover:underline">
                {t('groups.paysTo', { who: short(fund.beneficiary) })}
              </a>
            )}
          </p>
        </div>
        <div>
          <p className="flex flex-wrap items-baseline gap-2 tabular-nums">
            <span className="text-3xl font-semibold tracking-tight">{main(fund.raised)}</span>
            {fund.target > 0n && <span className="text-sm text-muted-foreground">{t('groups.ofTarget', { target: main(fund.target) })}</span>}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t('groups.collected')}
            {approx(fund.raised) && ` · ${approx(fund.raised)}`}
          </p>
        </div>
        <FundProgress fund={fund} className="h-2.5" />
        {fund.kind === 'patungan' && fund.target > fund.raised && !fund.cancelled && (
          <p className="-mt-2 text-xs text-muted-foreground tabular-nums">{t('groups.remaining', { amount: main(fund.target - fund.raised) })}</p>
        )}
        {fund.kind === 'iuran' && members && members.length > 0 && <PaidUpBar rows={members} />}
        <div className="grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-3">
          {fund.kind === 'iuran' ? (
            <>
              <div>
                <Label>{t('groups.duesLabel')}</Label>
                <p className="mt-1 font-medium tabular-nums">{main(fund.dues)}</p>
                <p className="text-xs text-muted-foreground">{t('groups.everyDays', { n: Math.round(fund.period / 86_400) })}</p>
              </div>
              <div>
                <Label>{t('groups.thisPeriod')}</Label>
                <p className="mt-1 font-medium">{t('groups.periodN', { n: period.index + 1 })}</p>
                <p className="text-xs text-muted-foreground">{t('groups.periodEnds', { when: relative(period.to) })}</p>
              </div>
              <div>
                <Label>{t('groups.membersLabel')}</Label>
                <p className="mt-1 font-medium tabular-nums">{fund.members}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>{t('groups.contributorsLabel')}</Label>
                <p className="mt-1 font-medium tabular-nums">{fund.contributors}</p>
              </div>
              <div>
                <Label>{t(fund.kind === 'patungan' ? 'groups.deadlineLabel' : 'groups.endLabel')}</Label>
                <p className="mt-1 font-medium">{fund.deadline ? formatDate(BigInt(fund.deadline), locale) : t('groups.noEnd')}</p>
                {fund.deadline > 0 && <p className="text-xs text-muted-foreground">{relative(fund.deadline)}</p>}
              </div>
              <div>
                <Label>{t('groups.paidOut')}</Label>
                <p className="mt-1 font-medium tabular-nums">{main(fund.withdrawn)}</p>
              </div>
            </>
          )}
        </div>
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">{t(KIND[fund.kind].rule)}</p>
      </CardContent>
    </Card>
  )
}

/** Iuran's progress: how many members are paid up for the current period. */
function PaidUpBar({ rows }: { rows: { dues: MemberDues }[] }) {
  const t = useT()
  const paid = rows.filter((r) => duesBehind(r.dues) === 0).length
  return (
    <div className="space-y-1.5">
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(paid / rows.length) * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{t('groups.paidUpCount', { paid, total: rows.length })}</p>
    </div>
  )
}

// ─── What the user can do ────────────────────────────────────────────────────

function Chips({ values, onPick, active }: { values: { key: string; label: string }[]; onPick: (k: string) => void; active: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={active === v.key}
          onClick={() => onPick(v.key)}
          className={cn(
            'rounded-full border px-3 py-1 text-sm tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            active === v.key ? 'border-primary bg-primary/10 font-medium text-primary-ink' : 'hover:border-primary/40',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

function ActionCard({ fund, stake, onDone }: { fund: GroupFund; stake: MyStake | null; onDone: () => void }) {
  const t = useT()
  const { address, connecting, connect } = useWallet()
  const { account, busy, runAction } = useAppState()
  const { main, approx } = useMoney()
  const [source, setSource] = useState<'wallet' | 'spend'>('wallet')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [periods, setPeriods] = useState<number | null>(null)
  const [forFriend, setForFriend] = useState(false)
  const [friend, setFriend] = useState('')

  const anyBusy = busy !== null
  const messageBytes = byteLength(message)
  const open = acceptsMoney(fund)

  if (!address)
    return (
      <Card className={GLASS}>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t(fund.kind === 'iuran' ? 'groups.connectToJoin' : 'groups.connectToGive')}</p>
          <Button className="w-full rounded-full" disabled={connecting} onClick={() => void connect().catch((e) => toast.error(t(errorKey(e))))}>
            {t('pay.connectCta')}
          </Button>
        </CardContent>
      </Card>
    )

  // Refund (failed or cancelled Patungan)
  if (refundsOpen(fund)) {
    const mine = stake?.contributed ?? 0n
    return (
      <Card className={GLASS}>
        <CardContent className="space-y-3">
          <p className="text-sm">{t(fund.cancelled ? 'groups.refundCancelled' : 'groups.refundFailed')}</p>
          {mine > 0n ? (
            <Button className="w-full rounded-full" disabled={anyBusy} onClick={() => void runAction('group-refund', 'groups.refunded', () => refundFromFund(fund.id)).then((r) => r && onDone())}>
              {busy === 'group-refund' ? <Loader2Icon className="size-4 animate-spin" /> : <Undo2Icon className="size-4" />}
              {t('groups.refundButton', { amount: main(mine) })}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t('groups.nothingToRefund')}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!open)
    return (
      <Card className={GLASS}>
        <CardContent className="text-sm text-muted-foreground">{t('groups.closedForMoney')}</CardContent>
      </Card>
    )

  // Iuran: join first (always the member's own tx), then pay periods
  if (fund.kind === 'iuran' && !stake?.member && !forFriend)
    return (
      <Card className={GLASS}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4" /> {t('groups.joinTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('groups.joinBody', { amount: main(fund.dues), days: Math.round(fund.period / 86_400) })}</p>
          <Button className="w-full rounded-full" disabled={anyBusy} onClick={() => void runAction('group-join', 'groups.joined', () => joinFund(fund.id)).then((r) => r && onDone())}>
            {busy === 'group-join' && <Loader2Icon className="size-4 animate-spin" />}
            {t('groups.joinButton')}
          </Button>
          <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setForFriend(true)}>
            {t('groups.payForFriend')}
          </button>
        </CardContent>
      </Card>
    )

  let total = 0n
  let canPay = false
  if (fund.kind === 'iuran') {
    const behind = stake?.dues ? duesBehind(stake.dues) : 0
    const n = periods ?? Math.max(1, behind)
    total = fund.dues * BigInt(n)
    canPay = !forFriend || isValidRecipientAddress(friend.trim())
  } else {
    total = units(amount)
    canPay = total > 0n
  }
  // coinAI pays only for the payer themself, from what's spendable there
  const spendable = account?.spend ?? 0n
  const fromSpend = source === 'spend' && !forFriend
  canPay = canPay && messageBytes <= MAX_MESSAGE_BYTES && (!fromSpend || total <= spendable)

  const pay = async () => {
    const member = forFriend ? friend.trim() : undefined
    const ok = await runAction('group-pay', fund.kind === 'iuran' ? 'groups.duesPaid' : 'groups.contributed', () =>
      fromSpend
        ? contributeFromSpendable(address, fund.id, total, message.trim())
        : contributeToFund(address, fund.id, total, message.trim(), member),
    )
    if (ok) {
      setAmount('')
      setMessage('')
      setPeriods(null)
      onDone()
    }
  }

  const remaining = fund.kind === 'patungan' && fund.target > fund.raised ? fund.target - fund.raised : 0n

  return (
    <Card className={GLASS}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HandCoinsIcon className="size-4" />
          {t(fund.kind === 'iuran' ? 'groups.payDuesTitle' : fund.kind === 'patungan' ? 'groups.chipInTitle' : 'groups.donateTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fund.kind === 'iuran' ? (
          <>
            {stake?.dues && !forFriend && <DuesSummary dues={stake.dues} />}
            {forFriend && (
              <div className="space-y-1.5">
                <p className="text-sm">{t('groups.friendAddress')}</p>
                <Input value={friend} placeholder="0x…" className="font-mono text-sm" onChange={(e) => setFriend(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t('groups.friendHint')}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-sm">{t('groups.howManyPeriods')}</p>
              <Chips
                active={String(periods ?? Math.max(1, stake?.dues ? duesBehind(stake.dues) : 0))}
                onPick={(k) => setPeriods(Number(k))}
                values={[1, 2, 3, 6].map((n) => ({ key: String(n), label: t('groups.nPeriods', { n }) }))}
              />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {stake && stake.contributed > 0n && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-ink">{t('groups.alreadyGave', { amount: main(stake.contributed) })}</p>
            )}
            <div className="flex items-center gap-2">
              <Input value={amount} inputMode="decimal" placeholder="0" className="text-lg tabular-nums" onChange={(e) => setAmount(e.target.value)} aria-label={t('groups.amountLabel')} />
              <span className="shrink-0 text-sm text-muted-foreground">tUSDT</span>
            </div>
            <Chips
              active={amount}
              onPick={setAmount}
              values={[
                ...QUICK.map((q) => ({ key: q, label: q })),
                ...(remaining > 0n ? [{ key: (Number(remaining) / 1e6).toString(), label: t('groups.fillRemaining') }] : []),
              ]}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>{t('groups.messageLabel')}</span>
            <span className={cn('text-xs tabular-nums', messageBytes > MAX_MESSAGE_BYTES ? 'text-destructive' : 'text-muted-foreground')}>
              {messageBytes}/{MAX_MESSAGE_BYTES}
            </span>
          </div>
          <Input value={message} placeholder={t('groups.messagePlaceholder')} onChange={(e) => setMessage(e.target.value)} />
        </div>

        {!forFriend && spendable > 0n && (
          <div className="space-y-1.5">
            <p className="text-sm">{t('groups.payFrom')}</p>
            <Chips
              active={source}
              onPick={(k) => setSource(k as 'wallet' | 'spend')}
              values={[
                { key: 'wallet', label: t('groups.payFromWallet') },
                { key: 'spend', label: t('groups.payFromSpend', { amount: main(spendable) }) },
              ]}
            />
            {fromSpend && total > spendable && <p className="text-xs text-destructive">{t('errors.insufficientSpendable')}</p>}
          </div>
        )}

        <Button size="lg" className="w-full rounded-full" disabled={anyBusy || !canPay} onClick={() => void pay()}>
          {busy === 'group-pay' ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          {total > 0n ? t('groups.payButton', { amount: main(total) }) : t('groups.enterAmount')}
        </Button>
        {total > 0n && (
          <p className="-mt-2 text-center text-xs text-muted-foreground tabular-nums">
            {t(fromSpend ? 'groups.fromSpendShort' : 'groups.fromWalletShort')}
            {approx(total) && ` · ${approx(total)}`}
          </p>
        )}
        {fund.kind === 'iuran' && (
          <button type="button" className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setForFriend((f) => !f)}>
            {t(forFriend ? 'groups.payForMe' : 'groups.payForFriend')}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

function DuesSummary({ dues }: { dues: MemberDues }) {
  const t = useT()
  const behind = duesBehind(dues)
  const ahead = dues.paid - dues.owed
  return (
    <div className={cn('rounded-xl p-3 text-sm', behind > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary-ink')}>
      <p className="font-medium">{behind > 0 ? t('groups.youBehind', { n: behind }) : t('groups.youPaidUp')}</p>
      <p className="text-xs opacity-80">{ahead > 0 ? t('groups.paidAhead', { n: ahead }) : t('groups.paidOfOwed', { paid: dues.paid, owed: dues.owed })}</p>
    </div>
  )
}

// ─── Members, history, organizer, share ─────────────────────────────────────

function MembersCard({ rows, me }: { rows: { member: string; dues: MemberDues }[] | null; me: string | null }) {
  const t = useT()
  return (
    <Card className={GLASS}>
      <CardHeader>
        <CardTitle>{t('groups.membersTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('groups.noMembers')}</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {rows.map(({ member, dues }) => {
              const behind = duesBehind(dues)
              return (
                <li key={member} className="flex items-center gap-3 px-3 py-2.5">
                  <AddressAvatar address={member} size={28} className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">
                      {short(member)}
                      {me && member.toLowerCase() === me.toLowerCase() && <span className="ml-1.5 font-sans text-muted-foreground">({t('groups.you')})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {dues.paid > dues.owed ? t('groups.paidAhead', { n: dues.paid - dues.owed }) : t('groups.paidOfOwed', { paid: dues.paid, owed: dues.owed })}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', behind > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary-ink')}>
                    {behind > 0 ? t('groups.behindN', { n: behind }) : t('groups.paidUp')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function FeedCard({ events }: { events: FundEvent[] | null }) {
  const t = useT()
  const { main } = useMoney()
  const relative = useRelative()
  return (
    <Card className={GLASS}>
      <CardHeader>
        <CardTitle>{t('groups.feedTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <Skeleton className="h-32 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('groups.feedEmpty')}</p>
        ) : (
          <ol className="space-y-4">
            {events.map((e) => {
              const who = e.kind === 'contributed' ? e.payer : e.kind === 'withdrawn' ? e.to : e.kind === 'cancelled' ? null : e.member
              const line =
                e.kind === 'contributed'
                  ? e.payer.toLowerCase() === e.member.toLowerCase()
                    ? t('groups.evContributed', { who: short(e.payer), amount: main(e.amount) })
                    : t('groups.evContributedFor', { who: short(e.payer), amount: main(e.amount), member: short(e.member) })
                  : e.kind === 'withdrawn'
                    ? t('groups.evWithdrawn', { amount: main(e.amount), who: short(e.to) })
                    : e.kind === 'joined'
                      ? t('groups.evJoined', { who: short(e.member) })
                      : e.kind === 'refunded'
                        ? t('groups.evRefunded', { who: short(e.member), amount: main(e.amount) })
                        : t('groups.evCancelled')
              const note = e.kind === 'contributed' ? e.message : e.kind === 'withdrawn' ? e.memo : ''
              return (
                <li key={`${e.tx}-${e.kind}`} className="flex gap-3">
                  {who ? <AddressAvatar address={who} size={28} className="mt-0.5 shrink-0 rounded-full" /> : <BanIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{line}</p>
                    {note && (
                      <p className={cn('mt-1 inline-block rounded-2xl rounded-tl-sm px-3 py-1.5 text-sm', e.kind === 'withdrawn' ? 'bg-accent text-accent-foreground' : 'bg-muted')}>
                        {e.kind === 'withdrawn' && <span className="mr-1 text-xs font-medium uppercase">{t('groups.memo')}:</span>}
                        {note}
                      </p>
                    )}
                    <a href={explorerTxUrl(e.tx)} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      {relative(e.at)} <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        <p className="mt-4 text-xs text-muted-foreground">{t('groups.feedNote')}</p>
      </CardContent>
    </Card>
  )
}

function OrganizerCard({ fund, onDone }: { fund: GroupFund; onDone: () => void }) {
  const t = useT()
  const { busy, runAction } = useAppState()
  const { main } = useMoney()
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [confirm, setConfirm] = useState(false)
  const available = fund.raised - fund.withdrawn
  const locked = fund.kind === 'patungan' && fund.raised < fund.target
  const value = units(amount)
  const memoBytes = byteLength(memo.trim())
  const anyBusy = busy !== null
  const canCancel = !fund.cancelled && !(fund.kind === 'patungan' && fund.withdrawn > 0n)

  const withdraw = async () => {
    if (await runAction('group-withdraw', 'groups.withdrawn', () => withdrawFromFund(fund.id, value, memo.trim()))) {
      setAmount('')
      setMemo('')
      onDone()
    }
  }
  const cancel = async () => {
    setConfirm(false)
    if (await runAction('group-cancel', 'groups.cancelledToast', () => cancelFund(fund.id))) onDone()
  }

  return (
    <Card className={cn(GLASS, 'border-dashed')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MegaphoneIcon className="size-4" /> {t('groups.organizerTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{t('groups.available')}</span>
          <span className="font-semibold tabular-nums">{main(available)}</span>
        </div>
        {locked ? (
          <p className="text-xs text-muted-foreground">{t('groups.lockedUntilTarget')}</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Input value={amount} inputMode="decimal" placeholder="0" className="tabular-nums" onChange={(e) => setAmount(e.target.value)} aria-label={t('groups.amountLabel')} />
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount((Number(available) / 1e6).toString())}>
                {t('withdraw.max')}
              </Button>
            </div>
            <Input value={memo} placeholder={t('groups.memoPlaceholder')} onChange={(e) => setMemo(e.target.value)} aria-label={t('groups.memo')} />
            <Button
              className="w-full rounded-full"
              disabled={anyBusy || value === 0n || value > available || memoBytes === 0 || memoBytes > MAX_MESSAGE_BYTES}
              onClick={() => void withdraw()}
            >
              {busy === 'group-withdraw' && <Loader2Icon className="size-4 animate-spin" />}
              {memoBytes === 0 && value > 0n ? t('groups.memoRequired') : t('groups.withdrawTo', { who: short(fund.beneficiary) })}
            </Button>
          </>
        )}
        {canCancel && (
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" disabled={anyBusy} onClick={() => setConfirm(true)}>
            {t('groups.cancelFund')}
          </Button>
        )}
      </CardContent>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('groups.cancelConfirmTitle')}</DialogTitle>
            <DialogDescription>{t(fund.kind === 'patungan' ? 'groups.cancelConfirmPatungan' : 'groups.cancelConfirmOther')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>{t('groups.keepOpen')}</Button>
            <Button variant="destructive" onClick={() => void cancel()}>{t('groups.cancelFund')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

function GroupDetail({ id }: { id: number }) {
  const t = useT()
  const { address } = useWallet()
  const [params] = useSearchParams()
  const [fund, setFund] = useState<GroupFund | null | 'missing'>(null)
  const [stake, setStake] = useState<MyStake | null>(null)
  const [events, setEvents] = useState<FundEvent[] | null>(null)
  const [members, setMembers] = useState<{ member: string; dues: MemberDues }[] | null>(null)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let live = true
    getFund(id).then(
      (f) => live && setFund(f),
      () => live && setFund('missing'),
    )
    fundHistory(id).then(
      (h) => live && setEvents(h),
      () => live && setEvents([]),
    )
    return () => {
      live = false
    }
  }, [id, tick])

  useEffect(() => {
    if (!address || !fund || fund === 'missing') return setStake(null)
    let live = true
    myStake(fund, address).then((s) => live && setStake(s), () => {})
    return () => {
      live = false
    }
  }, [address, fund])

  useEffect(() => {
    if (!fund || fund === 'missing' || fund.kind !== 'iuran' || !events) return
    let live = true
    membersWithDues(fund, events).then((m) => live && setMembers(m), () => live && setMembers([]))
    return () => {
      live = false
    }
  }, [fund, events])

  if (fund === 'missing')
    return (
      <Card className={GLASS}>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="font-medium">{t('groups.notFound')}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/groups">{t('groups.backToGroups')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  if (!fund)
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-2xl bg-card/60" />
        <Skeleton className="h-40 rounded-2xl bg-card/60" />
      </div>
    )

  const organizer = !!address && fund.organizer.toLowerCase() === address.toLowerCase()
  const actions = (
    <>
      {organizer && <OrganizerCard fund={fund} onDone={refresh} />}
      <ActionCard fund={fund} stake={stake} onDone={refresh} />
    </>
  )
  return (
    <div className="space-y-5">
      {params.get('created') && <SocialCard fund={fund} members={members} highlight />}
      {/* Phones get the action right under the summary; laptops keep it in the sticky side column. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Hero fund={fund} members={members} />
          <div className="space-y-5 lg:hidden">{actions}</div>
          {fund.kind === 'iuran' && <MembersCard rows={members} me={address} />}
          <FeedCard events={events} />
          {!params.get('created') && (
            <div className="lg:hidden">
              <SocialCard fund={fund} members={members} highlight={false} />
            </div>
          )}
        </div>
        <div className="hidden space-y-5 lg:sticky lg:top-4 lg:block lg:self-start">
          {actions}
          {!params.get('created') && <SocialCard fund={fund} members={members} highlight={false} />}
        </div>
      </div>
    </div>
  )
}

/** /groups/:id and the short share link /g/:id: a standalone page like /pay, readable without a wallet. */
export function GroupPage() {
  const { id = '' } = useParams()
  return (
    <GroupShell>
      <GroupDetail key={id} id={Number(id)} />
    </GroupShell>
  )
}
