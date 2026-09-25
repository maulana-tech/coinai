import { useMemo, useState } from 'react'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'
import { renderSVG } from 'uqr'
import { AddressAvatar } from '@/components/brand/address-avatar'
import { TokenIcon } from '@/components/brand/token-icon'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseUsdc } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useWallet } from '@/lib/wallet'

function buildLink(address: string, name: string, amount: string): string {
  const params = new URLSearchParams()
  const trimmedName = name.trim()
  if (trimmedName !== '') params.set('name', trimmedName)
  const trimmedAmount = amount.trim()
  try {
    if (parseUsdc(trimmedAmount) > 0n) params.set('amount', trimmedAmount)
  } catch {
    // invalid or empty preset amounts are simply left out of the link
  }
  const query = params.toString()
  return `${window.location.origin}/pay/${address}${query === '' ? '' : `?${query}`}`
}

export function PaymentLinkPage() {
  const t = useT()
  const { address } = useWallet()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  const link = useMemo(
    () => (address === null ? '' : buildLink(address, name, amount)),
    [address, name, amount],
  )
  const qr = useMemo(() => (link === '' ? '' : renderSVG(link)), [link])

  if (address === null) return <ConnectPrompt />

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success(t('settings.copied'))
  }

  return (
    <section className="space-y-5">
      <PageHeader title={t('paylink.title')} caption={t('paylink.caption')} />
      <Card className="rounded-2xl shadow-none">
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="paylink-name">{t('paylink.nameLabel')}</Label>
              <Input
                id="paylink-name"
                value={name}
                placeholder={t('paylink.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paylink-amount">{t('paylink.amountLabel')}</Label>
              <div className="relative">
                <TokenIcon
                  token="fxrp"
                  size={26}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <Input
                  id="paylink-amount"
                  value={amount}
                  placeholder={t('paylink.amountPlaceholder')}
                  inputMode="decimal"
                  className="pl-12 tabular-nums"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          {/* white card in both themes so scanners always see dark modules on white */}
          <div className="mx-auto w-fit rounded-2xl border bg-white p-4">
            <div
              className="size-52 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border bg-muted/50 py-2 pr-3 pl-2">
              <AddressAvatar address={address} size={24} className="rounded-md" />
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {link}
              </p>
            </div>
            <Button className="shrink-0" onClick={() => void copy()}>
              <CopyIcon />
              {t('paylink.copy')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
