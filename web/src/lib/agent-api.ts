// Client for the agent backend in web/api. Auth: sign a login message once with the
// wallet, get a 24h bearer token (see api/_lib/http.ts). The message format must match
// loginMessage() there.
import { signMessage } from '@wagmi/core'
import { config } from '@/lib/wagmi'
import type { YieldTarget } from '@/lib/types'

export type AgentStep = {
  agent: 'market' | 'savings' | 'investment' | 'guard' | 'risk' | 'executor'
  proposal?: { kind: 'set_split' | 'invest'; bps?: number; amount?: string; target?: YieldTarget; reason: string }
  outcome: 'analyzed' | 'proposed' | 'skipped' | 'rejected' | 'approved' | 'executed' | 'failed'
  note?: string
  txHash?: string
}

export type InvestorProfile = {
  risk: 'conservative' | 'moderate' | 'aggressive'
  horizon: 'short' | 'medium' | 'long'
  goal: string
}

export type MarketAnalysis = {
  regime: 'risk_on' | 'neutral' | 'risk_off'
  confidence: number
  summary: string
  signals: string[]
  at: string
}

export type AgentRun = {
  at: string
  mode: 'agent' | 'report-only'
  profile?: InvestorProfile
  market?: MarketAnalysis | null
  allocation?: Record<YieldTarget, number> | null
  steps: AgentStep[]
  executed: { kind: string; reason: string; txHash: string; explorer: string }[]
  reminders: string[]
  report: string
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type Subscription = { email?: string; telegramChatId?: number; locale: string } | null

const tokenKey = (address: string) => `coinai:agent-token:${address.toLowerCase()}`

// Token is a per-viewer convenience; storage may be unavailable (private mode), so fail soft.
function cachedToken(address: string): string | null {
  try {
    const token = localStorage.getItem(tokenKey(address))
    const exp = Number(token?.split('.')[1] ?? 0)
    return token && exp * 1000 > Date.now() + 60_000 ? token : null
  } catch {
    return null
  }
}

async function login(address: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const message = `coinAI login\naddress: ${address.toLowerCase()}\nissued: ${issuedAt}`
  const signature = await signMessage(config, { message })
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, issuedAt, signature }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.token) throw new Error(body.error ?? `agent_login_failed_${res.status}`)
  try {
    localStorage.setItem(tokenKey(address), body.token)
  } catch {
    // storage unavailable: token lives only for this call
  }
  return body.token as string
}

export function hasAgentSession(address: string): boolean {
  return cachedToken(address) !== null
}

async function call<T>(address: string, path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string) =>
    fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
  let res = await send(cachedToken(address) ?? (await login(address)))
  if (res.status === 401) res = await send(await login(address)) // token expired or secret rotated
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `agent_request_failed_${res.status}`)
  return body as T
}

export const agentApi = {
  run: (address: string, locale: string) =>
    call<AgentRun>(address, '/api/agent/run', { method: 'POST', body: JSON.stringify({ locale }) }),
  history: (address: string) => call<{ runs: AgentRun[] }>(address, '/api/agent/history'),
  chat: (address: string, messages: ChatMessage[], locale: string) =>
    call<{ reply: string; run?: AgentRun }>(address, '/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, locale }),
    }),
  subscription: (address: string) => call<{ subscription: Subscription }>(address, '/api/subscribe'),
  subscribeEmail: (address: string, email: string, locale: string) =>
    call<{ subscription: Subscription }>(address, '/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ channel: 'email', email, locale }),
    }),
  telegramLink: (address: string, locale: string) =>
    call<{ link: string }>(address, '/api/subscribe', {
      method: 'POST',
      body: JSON.stringify({ channel: 'telegram', locale }),
    }),
  profile: (address: string) => call<{ profile: InvestorProfile }>(address, '/api/agent/profile'),
  saveProfile: (address: string, profile: InvestorProfile) =>
    call<{ profile: InvestorProfile }>(address, '/api/agent/profile', { method: 'POST', body: JSON.stringify(profile) }),
  unsubscribe: (address: string, channel: 'email' | 'telegram') =>
    call<{ subscription: Subscription }>(address, '/api/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ channel }),
    }),
}
