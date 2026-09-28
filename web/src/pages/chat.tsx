import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLinkIcon, Loader2Icon, SendIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { LogoMark } from '@/components/brand/logo'
import { ConnectPrompt } from '@/components/connect-prompt'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { agentApi, hasAgentSession, type AgentRun, type ChatMessage } from '@/lib/agent-api'
import { useAppState } from '@/lib/app-state'
import { explorerTxUrl } from '@/lib/config'
import { useT, type MessageKey } from '@/lib/i18n'
import { useSettings } from '@/lib/settings'
import { useWallet } from '@/lib/wallet'

const SUGGESTIONS: MessageKey[] = ['chat.suggest1', 'chat.suggest2', 'chat.suggest3', 'chat.suggest4']
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Conversation({ address }: { address: string }) {
  const t = useT()
  const { locale } = useSettings()
  const { refresh } = useAppState()
  const [params, setParams] = useSearchParams()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState(params.get('q') ?? '')
  const [signedIn, setSignedIn] = useState(hasAgentSession(address))
  const [lastRun, setLastRun] = useState<AgentRun | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load the saved conversation; if a reply is still being written (page was closed mid-answer), poll for it.
  const load = useCallback(async () => {
    const r = await agentApi.chatHistory(address).catch((e) => {
      toast.error(t('chat.loadFailed'), { description: errorText(e) })
      return null
    })
    if (!r) return
    setSignedIn(true)
    setMessages(r.messages)
    setPending(r.pending)
    if (r.pending) setTimeout(() => void load(), 3000)
  }, [address, t])

  useEffect(() => {
    if (hasAgentSession(address)) void load()
  }, [address, load])

  useEffect(() => {
    if (params.get('q')) {
      setParams({}, { replace: true })
      inputRef.current?.focus()
    }
  }, [params, setParams])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || pending) return
    setDraft('')
    setMessages((m) => [...m, { role: 'user', content: message }])
    setPending(true)
    try {
      const res = await agentApi.chat(address, message, locale)
      setSignedIn(true)
      setMessages(res.messages)
      if (res.run) void refresh() // the run shows up in Activity either way
      if (res.run?.executed.length) setLastRun(res.run)
    } catch (e) {
      toast.error(t('agent.chatFailed'), { description: errorText(e) })
      const r = await agentApi.chatHistory(address).catch(() => null)
      if (r) setMessages(r.messages)
    } finally {
      setPending(false)
    }
  }

  const clear = async () => {
    try {
      setMessages((await agentApi.clearChat(address)).messages)
      setLastRun(null)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={t('nav.chat')} caption={t('page.chatCaption')} />
        {messages.length > 0 && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => void clear()}>
            <Trash2Icon className="mr-1.5 size-3.5" />
            {t('chat.clear')}
          </Button>
        )}
      </div>

      <div className="flex h-[calc(100svh-15rem)] min-h-[460px] flex-col overflow-hidden rounded-2xl border bg-card">
        <div ref={listRef} className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {messages.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <LogoMark size={40} />
              <p className="mt-4 font-serif text-2xl">{t('chat.emptyTitle')}</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('chat.emptyBody')}</p>
              <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => void send(t(k))}
                    className="rounded-xl border p-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
              {!signedIn && (
                <button type="button" onClick={() => void load()} className="mt-5 text-xs text-primary-ink hover:underline">
                  {t('chat.loadSaved')}
                </button>
              )}
            </div>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-line text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 shrink-0">
                    <LogoMark size={26} />
                  </span>
                  <div className="max-w-[85%]">
                    <p className="text-xs font-medium text-muted-foreground">coinAI</p>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{m.content}</p>
                  </div>
                </div>
              ),
            )
          )}

          {lastRun && (
            <div className="ml-9 rounded-xl border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{t('chat.teamRan', { n: lastRun.executed.length })}</p>
              <ul className="mt-1.5 space-y-1">
                {lastRun.executed.map((e) => (
                  <li key={e.txHash}>
                    <a
                      href={explorerTxUrl(e.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-ink hover:underline"
                    >
                      {e.reason.slice(0, 80)}
                      <ExternalLinkIcon className="size-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending && (
            <div className="flex gap-3">
              <span className="mt-0.5 shrink-0">
                <LogoMark size={26} />
              </span>
              <div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  {t('chat.thinking')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t('chat.canLeave')}</p>
              </div>
            </div>
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={2000}
            placeholder={t('agent.chatPlaceholder')}
            aria-label={t('agent.chatPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="icon" className="size-10 rounded-xl" aria-label={t('agent.chatSend')} disabled={pending || !draft.trim()}>
            <SendIcon className="size-4" />
          </Button>
        </form>
      </div>
      <p className="text-xs text-muted-foreground">{t('chat.savedNote')}</p>
    </section>
  )
}

export function ChatPage() {
  const { address } = useWallet()
  if (!address) return <ConnectPrompt />
  return <Conversation key={address} address={address} />
}
