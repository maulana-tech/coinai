import { useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { CopyIcon, ExternalLinkIcon, KeyRoundIcon, Trash2Icon } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { agentApi, type LlmKey } from '@/lib/agent-api'
import { CONTRACT_ID, EXPLORER_CONTRACT_URL } from '@/lib/config'
import { formatDateTime, useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { useWallet } from '@/lib/wallet'

const KEY_ERRORS: Record<string, MessageKey> = {
  invalid_key: 'settings.byokInvalid',
  key_rejected: 'settings.byokRejected',
  duplicate_key: 'settings.byokDuplicate',
  too_many_keys: 'settings.byokTooMany',
}

// BYOK: the wallet's own OpenRouter keys are tried before the shared server key, and a key
// that hits its limit is skipped for the next one. Keys are encrypted server-side.
function LlmKeysCard({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const [keys, setKeys] = useState<LlmKey[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<{ keys: LlmKey[] }>, success?: MessageKey) => {
    setBusy(true)
    try {
      setKeys((await fn()).keys)
      if (success) toast.success(t(success))
      return true
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e)
      toast.error(KEY_ERRORS[code] ? t(KEY_ERRORS[code]) : code)
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (await run(() => agentApi.addLlmKey(address, draft.trim()), 'settings.byokAdded')) setDraft('')
  }

  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle>{t('settings.byokTitle')}</CardTitle>
        <CardDescription>{t('settings.byokBody')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keys === null ? (
          <Button variant="outline" disabled={busy} onClick={() => void run(() => agentApi.llmKeys(address))}>
            <KeyRoundIcon className="mr-1.5 size-4" />
            {t('settings.byokManage')}
          </Button>
        ) : (
          <>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('settings.byokEmpty')}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {keys.map((k, i) => (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="font-mono text-xs">sk-or-…{k.tail}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{formatDateTime(new Date(k.addedAt), locale)}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('settings.byokRemove')}
                      disabled={busy}
                      onClick={() => void run(() => agentApi.removeLlmKey(address, k.id))}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void add()
              }}
            >
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                placeholder="sk-or-v1-…"
                aria-label={t('settings.byokPlaceholder')}
                onChange={(e) => setDraft(e.target.value)}
                className="font-mono text-xs"
              />
              <Button type="submit" disabled={busy || !draft.trim()}>
                {t('settings.byokAdd')}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              {t('settings.byokHint')}{' '}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" className="text-primary-ink hover:underline">
                openrouter.ai/settings/keys
              </a>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

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
  const { address } = useWallet()

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
                if (v === 'usd' || v === 'idr' || v === 'usdt' || v === 'cny') setPrimaryCurrency(v)
              }}
            >
              <SelectTrigger id="settings-currency" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">{t('settings.currencyUsd')}</SelectItem>
                <SelectItem value="idr">{t('settings.currencyIdr')}</SelectItem>
                <SelectItem value="usdt">{t('settings.currencyUsdt')}</SelectItem>
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
      {address && <LlmKeysCard key={address} address={address} />}
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
