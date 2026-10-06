// Client for the agent backend in web/api. Auth: sign a login message once with the
// wallet, get a 7-day bearer token (see api/_lib/http.ts). The message format must match
// loginMessage() there.
import { signMessage } from '@wagmi/core'
import { config } from '@/lib/wagmi'
import { AGENT_ADDRESS } from '@/lib/config'
import type { AgentPolicy, YieldTarget } from '@/lib/types'
import type { SavedPool, VaultMix } from '../../shared/pool.js'

export type AgentStep = {
  agent: 'market' | 'savings' | 'investment' | 'guard' | 'risk' | 'executor'
  proposal?: { kind: 'set_split' | 'invest'; bps?: number; amount?: string; target?: YieldTarget; reason: string }
  outcome: 'analyzed' | 'proposed' | 'skipped' | 'rejected' | 'approved' | 'executed' | 'failed'
  note?: string
  code?: LlmFailure
  txHash?: string
}

/** Why an LLM call failed (mirrors api/_lib/llm.ts); shown as agent.llm_<code>. */
export type LlmFailure = 'no_credit' | 'rate_limited' | 'bad_key' | 'timeout' | 'unavailable' | 'bad_output'

/** The AI failure that kept a run from doing anything, if any: shown as a banner instead of a silent "0 moves". */
export function runFailure(run: AgentRun): LlmFailure | null {
  if (run.mode !== 'agent' || run.executed.length > 0) return null
  return run.steps.find((s) => s.outcome === 'failed' && s.code)?.code ?? null
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

/** How the agents arrived at a run's numbers (mirrors `Decision` in api/_lib/swarm.ts). Older runs have none. */
export type AgentDecision = {
  reference: { source: 'strategy' | 'profile'; mix: VaultMix }
  mix: VaultMix | null
  investPercent: number
  clamped: boolean
  maxTilt: number
  minConfidence: number
  confidence: { savings: number | null; investment: number | null }
  split: { from: number; to: number | null }
  skipped: { savings?: string; investment?: string }
  spendable?: number
  previous: { at: string; mix: VaultMix | null; splitPercent: number | null } | null
}

export type AgentRun = {
  at: string
  mode: 'agent' | 'report-only'
  profile?: InvestorProfile
  market?: MarketAnalysis | null
  allocation?: Record<YieldTarget, number> | null
  strategy?: { name: string; vaultMix: VaultMix } | null
  decision?: AgentDecision | null
  steps: AgentStep[]
  executed: { kind: string; reason: string; txHash: string; explorer: string }[]
  reminders: string[]
  report: string
}

export type PoolStore = { pools: SavedPool[]; activeId: string | null }

/** Mirrors `Invoice` in api/_lib/invoices.ts. */
export type Invoice = {
  id: string
  to: string
  name: string
  memo: string
  reference: string
  currency: 'IDR' | 'USDT'
  amount: number
  createdAt: number
  status: 'open' | 'paid' | 'cancelled'
  paid?: { txHash: string; payer: string; amountUsdt: string; saved: string; idrPerUsd: number | null; at: number }
}
export type InvoiceInput = { name: string; memo: string; reference: string; currency: Invoice['currency']; amount: number }

export type PoolReview = {
  verdict: 'fits' | 'too_risky' | 'too_cautious'
  summary: string
  reason: string
  suggestion: Record<string, number> | null
}

export type LlmKey = { id: string; tail: string; addedAt: number }
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

// Public, no-signature endpoints: the server re-checks everything on-chain.
const post = (path: string, payload: object) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true })

export const autopilot = {
  /** Fire-and-forget after a payment: the recipient's agents invest the new savings, and with the tx hash the recipient gets a Telegram receipt. */
  nudge: (recipient: string, txHash?: string) =>
    void post('/api/agent/autopilot', { user: recipient, action: 'nudge', txHash }).catch(() => {}),
  /** Enrolls a wallet that authorized the agent in the daily run; resolves to whether autopilot is on. */
  register: async (address: string): Promise<boolean> => {
    const res = await post('/api/agent/autopilot', { user: address, action: 'register' }).catch(() => null)
    const body = res?.ok ? await res.json().catch(() => null) : null
    return body?.autopilot === true
  },
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `request_failed_${res.status}`)
  return body as T
}

// The pay page's side of invoices: public, and the server reads the payment from the chain before marking it paid.
export const invoiceApi = {
  get: (id: string) =>
    fetch(`/api/invoices?id=${encodeURIComponent(id)}`).then((r) => readJson<{ invoice: Invoice; idrPerUsd: number | null }>(r)),
  markPaid: (id: string, txHash: string) => post('/api/invoices?paid', { id, txHash }).then((r) => readJson<{ invoice: Invoice }>(r)),
}

export const agentApi = {
  run: (address: string, locale: string) =>
    call<AgentRun>(address, '/api/agent/run', { method: 'POST', body: JSON.stringify({ locale }) }),
  history: (address: string) => call<{ runs: AgentRun[]; running: boolean }>(address, '/api/agent/run'),
  // One conversation per wallet, stored server-side and shared with Telegram.
  chatHistory: (address: string) => call<{ messages: ChatMessage[]; pending: boolean }>(address, '/api/agent/chat'),
  chat: (address: string, message: string, locale: string) =>
    call<{ reply: string; run?: AgentRun; messages: ChatMessage[] }>(address, '/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message, locale }),
    }),
  clearChat: (address: string) => call<{ messages: ChatMessage[] }>(address, '/api/agent/chat', { method: 'DELETE' }),
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
  // Saved pools; the active one is the benchmark the Investment Strategist follows.
  pools: (address: string) => call<PoolStore>(address, '/api/pools'),
  savePool: (address: string, pool: { id?: string; name: string; weights: Record<string, number> }) =>
    call<PoolStore>(address, '/api/pools', { method: 'POST', body: JSON.stringify(pool) }),
  setActivePool: (address: string, activeId: string | null) =>
    call<PoolStore>(address, '/api/pools', { method: 'PUT', body: JSON.stringify({ activeId }) }),
  deletePool: (address: string, id: string) =>
    call<PoolStore>(address, '/api/pools', { method: 'DELETE', body: JSON.stringify({ id }) }),
  // Market page: the Portfolio Reviewer judges a simulated pool ({ BNB: 70, BTC: 20, USDT: 10 }).
  poolReview: (address: string, weights: Record<string, number>, locale: string) =>
    call<{ review: PoolReview }>(address, '/api/pools?review', { method: 'POST', body: JSON.stringify({ weights, locale }) }),
  // Bring-your-own OpenRouter keys; the server only ever returns the last 4 characters.
  llmKeys: (address: string) => call<{ keys: LlmKey[] }>(address, '/api/agent/keys'),
  addLlmKey: (address: string, key: string) =>
    call<{ keys: LlmKey[] }>(address, '/api/agent/keys', { method: 'POST', body: JSON.stringify({ key }) }),
  removeLlmKey: (address: string, id: string) =>
    call<{ keys: LlmKey[] }>(address, '/api/agent/keys', { method: 'DELETE', body: JSON.stringify({ id }) }),
  // Invoices the wallet issued (last 50, newest first).
  invoices: (address: string) => call<{ invoices: Invoice[] }>(address, '/api/invoices'),
  createInvoice: (address: string, input: InvoiceInput) =>
    call<{ invoice: Invoice }>(address, '/api/invoices', { method: 'POST', body: JSON.stringify(input) }),
  cancelInvoice: (address: string, id: string) =>
    call<{ invoice: Invoice }>(address, '/api/invoices?cancel', { method: 'POST', body: JSON.stringify({ id }) }),
  unsubscribe: (address: string, channel: 'email' | 'telegram') =>
    call<{ subscription: Subscription }>(address, '/api/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ channel }),
    }),
}

/** True when the wallet's on-chain policy points at our agent and hasn't expired. */
export function isAgentActive(policy: AgentPolicy | null): boolean {
  return (
    !!policy?.agent &&
    !!AGENT_ADDRESS &&
    policy.agent.toLowerCase() === AGENT_ADDRESS.toLowerCase() &&
    Number(policy.expiry) * 1000 > Date.now()
  )
}
