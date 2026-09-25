import { useState } from 'react'
import type { ReactNode } from 'react'
import { CircleCheckIcon, CircleIcon, ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConnectButton } from '@/components/connect-button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type OnboardingChecklistProps = {
  connected: boolean
  funded: boolean
  received: boolean
  faucetBusy: boolean
  onFaucet: () => void
  onGoToPaymentLink: () => void
}

type StepProps = {
  done: boolean
  title: string
  caption: string
  doneLabel: string
  action?: ReactNode
}

function Step({ done, title, caption, doneLabel, action }: StepProps) {
  return (
    <li className="flex items-center gap-3">
      {done ? (
        <CircleCheckIcon aria-label={doneLabel} className="size-5 shrink-0 text-primary-ink" />
      ) : (
        <CircleIcon aria-hidden className="size-5 shrink-0 text-muted-foreground/40" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium transition-colors", done && "text-muted-foreground line-through opacity-70")}>{title}</p>
        <p className={cn("text-xs text-muted-foreground transition-opacity", done && "opacity-60")}>{caption}</p>
      </div>
      {!done && action}
    </li>
  )
}

export function OnboardingChecklist({
  connected,
  funded,
  received,
  faucetBusy,
  onFaucet,
  onGoToPaymentLink,
}: OnboardingChecklistProps) {
  const t = useT()
  const isDone = connected && funded && received
  const [isOpen, setIsOpen] = useState(!isDone)

  return (
    <Card className="rounded-2xl shadow-none overflow-hidden transition-all duration-300">
      <CardHeader 
        className="cursor-pointer select-none flex flex-row items-center justify-between hover:bg-muted/30 transition-colors" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <CardTitle className="m-0">{t('onboarding.title')}</CardTitle>
          {isDone && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
              <CircleCheckIcon className="size-3" /> Done
            </span>
          )}
        </div>
        <ChevronDownIcon className={cn("size-5 text-muted-foreground transition-transform duration-300", isOpen && "rotate-180")} />
      </CardHeader>
      
      <div 
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <CardContent className="pt-0">
            <ul className="space-y-4">
              <Step
                done={connected}
                title={t('onboarding.step1Title')}
                caption={t('onboarding.step1Caption')}
                doneLabel={t('onboarding.done')}
                action={<ConnectButton />}
              />
              <Step
                done={funded}
                title={t('onboarding.step2Title')}
                caption={t('onboarding.step2Caption')}
                doneLabel={t('onboarding.done')}
                action={
                  <Button variant="outline" size="sm" disabled={faucetBusy} onClick={onFaucet}>
                    {faucetBusy ? `${t('common.loading')}...` : t('faucet.button')}
                  </Button>
                }
              />
              <Step
                done={received}
                title={t('onboarding.step3Title')}
                caption={t('onboarding.step3Caption')}
                doneLabel={t('onboarding.done')}
                action={
                  <Button variant="outline" size="sm" onClick={onGoToPaymentLink}>
                    {t('nav.paymentLink')}
                  </Button>
                }
              />
            </ul>
          </CardContent>
        </div>
      </div>
    </Card>
  )
}
