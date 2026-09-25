import type { ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { CopyIcon, ExternalLinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CONTRACT_ID, EXPLORER_CONTRACT_URL } from '@/lib/config'
import { useT } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'

function shortContract(id: string): string {
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

function SettingRow({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const { locale, setLocale, primaryCurrency, setPrimaryCurrency } = useSettings()
  const { theme, setTheme } = useTheme()

  const copyContract = async () => {
    await navigator.clipboard.writeText(CONTRACT_ID)
    toast.success(t('settings.copied'))
  }

  return (
    <section className="space-y-5">
      <PageHeader title={t('settings.title')} caption={t('page.settingsCaption')} />
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('settings.preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow label={t('settings.language')} htmlFor="settings-language">
            <Select
              value={locale}
              onValueChange={(v) => {
                if (v === 'en' || v === 'id' || v === 'zh') setLocale(v)
              }}
            >
              <SelectTrigger id="settings-language" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t('settings.langEn')}</SelectItem>
                <SelectItem value="id">{t('settings.langId')}</SelectItem>
                <SelectItem value="zh">{t('settings.langZh')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t('settings.currency')} htmlFor="settings-currency">
            <Select
              value={primaryCurrency}
              onValueChange={(v) => {
                if (v === 'usd' || v === 'idr' || v === 'fxrp' || v === 'cny') setPrimaryCurrency(v)
              }}
            >
              <SelectTrigger id="settings-currency" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">{t('settings.currencyUsd')}</SelectItem>
                <SelectItem value="idr">{t('settings.currencyIdr')}</SelectItem>
                <SelectItem value="fxrp">{t('settings.currencyFxrp')}</SelectItem>
                <SelectItem value="cny">{t('settings.currencyCny')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <p className="text-xs text-muted-foreground">{t('settings.preferencesHint')}</p>
          <SettingRow label={t('settings.theme')} htmlFor="settings-theme">
            <Select
              value={theme ?? 'system'}
              onValueChange={(v) => {
                if (v === 'light' || v === 'dark' || v === 'system') setTheme(v)
              }}
            >
              <SelectTrigger id="settings-theme" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
                <SelectItem value="system">{t('settings.themeSystem')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('settings.network')}</CardTitle>
          <CardDescription>{t('settings.networkTestnetHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t('settings.network')}</span>
            <span>{t('settings.networkTestnet')}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{t('settings.contract')}</span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-xs">{shortContract(CONTRACT_ID)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('settings.copy')}
                onClick={() => void copyContract()}
              >
                <CopyIcon />
              </Button>
            </span>
          </div>
          <a
            href={EXPLORER_CONTRACT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-primary-ink underline-offset-4 hover:underline"
          >
            {t('settings.viewExplorer')}
            <ExternalLinkIcon className="size-4" />
          </a>
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-none">
        <CardHeader>
          <CardTitle>{t('settings.aboutTitle')}</CardTitle>
          <CardDescription>{t('settings.about')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{t('settings.byline')}</p>
        </CardContent>
      </Card>
    </section>
  )
}
