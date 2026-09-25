import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangleIcon,
  DropletsIcon,
  ExternalLinkIcon,
  RefreshCcwIcon,
  WalletIcon,
} from 'lucide-react'
import { ConnectPrompt } from '@/components/connect-prompt'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EXPLORER_URL, TOKEN_ADDRESS } from '@/lib/config'
import { TOKEN_DECIMALS } from '@/lib/token'
import { useT } from '@/lib/i18n'
import { useFaucet } from '@/lib/use-faucet'
import { useWallet } from '@/lib/wallet'

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatUnits(wei: bigint | null, decimals: number): string {
  if (wei === null) return '—'
  if (wei === 0n) return '0'
  const s = wei.toString()
  if (s.length <= decimals) {
    const frac = s.padStart(decimals, '0').replace(/0+$/, '')
    return frac ? `0.${frac}` : '0'
  }
  const intPart = s.slice(0, s.length - decimals)
  const fracPart = s.slice(s.length - decimals, s.length - decimals + 4).replace(/0+$/, '')
  return fracPart ? `${intPart}.${fracPart}` : intPart
}

export function FaucetPage() {
  const t = useT()
  const { address } = useWallet()
  const { faucetBusy, balances, error, hasFunds, runFaucet, mintBusy, mintAvailableAt, mintTokens, refreshBalances } =
    useFaucet()
  const navigate = useNavigate()

  useEffect(() => {
    if (!address) return
    const id = setInterval(() => void refreshBalances(), 8000)
    return () => clearInterval(id)
  }, [address, refreshBalances])

  if (!address) return <ConnectPrompt />

  const explorerUrl = `${EXPLORER_URL}/address/${address}`
  const tokenExplorerUrl = `${EXPLORER_URL}/token/${TOKEN_ADDRESS}?a=${address}`
  const mintCoolingDown = mintAvailableAt * 1000 > Date.now()

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('faucet.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('faucet.caption')}</p>
      </div>

      <Card className="rounded-2xl shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <WalletIcon className="size-4" />
            {t('faucet.wallet')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-sm">{shortAddress(address)}</p>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
          >
            {t('faucet.viewOnExplorer')} <ExternalLinkIcon className="size-3" />
          </a>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('faucet.bnb')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balances ? (
              <p className="text-2xl font-semibold">{formatUnits(balances.bnb, 18)} tBNB</p>
            ) : (
              <Skeleton className="h-8 w-32" />
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t('faucet.bnbCaption')}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t('faucet.usdt')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {balances ? (
              <p className="text-2xl font-semibold">{formatUnits(balances.usdt, TOKEN_DECIMALS)} tUSDT</p>
            ) : (
              <Skeleton className="h-8 w-32" />
            )}
            <p className="mt-1 text-xs text-muted-foreground">{t('faucet.usdtCaption')}</p>
            {balances && balances.usdt === 0n && TOKEN_ADDRESS && (
              <a
                href={tokenExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
              >
                {t('faucet.checkToken')} <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t('errors.loadFailed')}</p>
            <p className="text-xs opacity-90">{error}</p>
          </div>
        </div>
      )}

      <Card className="rounded-2xl shadow-none">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
              <DropletsIcon className="size-5" />
            </div>
            <div>
              <h3 className="font-medium">{t('faucet.claimTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('faucet.claimCaption')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={mintBusy || mintCoolingDown || !TOKEN_ADDRESS}
              onClick={() => void mintTokens()}
            >
              {mintBusy ? (
                <RefreshCcwIcon className="mr-2 size-4 animate-spin" />
              ) : (
                <DropletsIcon className="mr-2 size-4" />
              )}
              {t('faucet.mintButton')}
            </Button>
            <Button variant="outline" className="flex-1" disabled={faucetBusy} onClick={() => void runFaucet()}>
              <ExternalLinkIcon className="mr-2 size-4" />
              {t('faucet.openButton')}
            </Button>
            <Button variant="outline" onClick={() => void refreshBalances()}>
              <RefreshCcwIcon className="mr-2 size-4" />
              {t('common.refresh')}
            </Button>
          </div>

          {mintCoolingDown && (
            <p className="text-xs text-muted-foreground">
              {t('faucet.mintCooldown', { time: new Date(mintAvailableAt * 1000).toLocaleString() })}
            </p>
          )}

          {hasFunds && (
            <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary-ink">
              {t('faucet.ready')}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="link" onClick={() => navigate('/app')}>
          {t('faucet.backToApp')}
        </Button>
      </div>
    </div>
  )
}
