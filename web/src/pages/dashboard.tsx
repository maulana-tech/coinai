import type { ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  Link2Icon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { ActivityCard } from '@/components/activity-card'
import { BalanceHero } from '@/components/balance-hero'
import { ConnectPrompt } from '@/components/connect-prompt'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { YieldSourcesCard } from '@/components/yield-sources-card'
import { cn } from '@/lib/utils'
import { useAppState } from '@/lib/app-state'
import { useT, type MessageKey } from '@/lib/i18n'
import { faucetedFlag } from '@/lib/use-faucet'
import { useYieldData } from '@/lib/use-yield-data'
import { useWallet } from '@/lib/wallet'

type SecondaryAction = {
  to: string
  icon: ComponentType<{ className?: string }>
  title: MessageKey
  caption: MessageKey
  tint: string
}

const SECONDARY_ACTIONS: SecondaryAction[] = [
  {
    to: '/app/withdraw',
    icon: ArrowUpRightIcon,
    title: 'nav.withdraw',
    caption: 'page.withdrawCaption',
    tint: 'bg-secondary/15 text-secondary',
  },
  {
    to: '/app/rules',
    icon: SlidersHorizontalIcon,
    title: 'nav.rules',
    caption: 'page.rulesCaption',
    tint: 'bg-accent text-accent-foreground',
  },
  {
    to: '/app/yield',
    icon: TrendingUpIcon,
    title: 'nav.yield',
    caption: 'page.yieldCaption',
    tint: 'bg-gold/15 text-gold-ink',
  },
]

export function Dashboard() {
  const { address } = useWallet()
  const { account, accountStatus, rates, activity, refresh } = useAppState()
  const { data: yieldData, loading: yieldLoading } = useYieldData()
  const navigate = useNavigate()
  const t = useT()

  if (!address) return <ConnectPrompt />

  const loading = accountStatus === 'loading'
  const funded = faucetedFlag(address) || activity.length > 0
  const received = activity.some((item) => item.kind === 'pay')
  // no unused onboarding variable
  const yieldTvl =
    yieldData.vaultStats.idle !== null && yieldData.vaultStats.invested !== null
      ? yieldData.vaultStats.idle + yieldData.vaultStats.invested
      : null

  return (
    <div key={address} className="space-y-5">
      {account !== null && (
        <OnboardingChecklist
          connected
          funded={funded}
          received={received}
          faucetBusy={false}
          onFaucet={() => navigate('/app/faucet')}
          onGoToPaymentLink={() => void navigate('/app/link')}
        />
      )}
      
      {accountStatus === 'error' ? (
        <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-4 text-sm">
          <span>{t('errors.loadFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <BalanceHero account={account} activity={activity} loading={loading} rates={rates} />
      )}
      {loading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {account !== null && (
        <>
          <section aria-label={t('dashboard.quickActions')} className="grid gap-3 md:grid-cols-2">
            <div className="grid grid-cols-3 gap-3">
              {SECONDARY_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="rounded-2xl border bg-card p-3.5 outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      'flex size-9 items-center justify-center rounded-xl',
                      action.tint,
                    )}
                  >
                    <action.icon className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-medium">{t(action.title)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {t(action.caption)}
                  </p>
                </Link>
              ))}
            </div>

            <Link
              to="/app/link"
              className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-5 outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md active:translate-y-0 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Link2Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-base font-semibold">Share your payment link</p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  Send your link to get paid for real. It splits into spending and savings the moment it arrives.
                </p>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </section>
          <YieldSourcesCard
            sparkdexApy={yieldData.sparkdexPoolInfo.apy}
            sparkdexTvl={yieldData.sparkdexPoolInfo.tvl}
            firelightApy={null}
            firelightTvl={yieldTvl}
            upshiftApy={yieldData.upshiftStats.apy}
            upshiftTvl={yieldData.upshiftStats.tvl}
            mainnetApy={yieldData.mainnetApy}
            loading={yieldLoading}
            rates={rates}
            selectedTarget={account?.yieldTarget}
            targetHealth={yieldData.targetHealth}
          />
          <ActivityCard />
        </>
      )}
    </div>
  )
}
