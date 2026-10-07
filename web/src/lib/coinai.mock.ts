import { POSITIONS, YIELD_TARGETS, type AgentPolicy, type CoinAIAccount, type CoinAIService } from '@/lib/types'

const LATENCY_MS = 800
const DEFAULT_SPLIT_BPS = 2000
const BPS_DENOMINATOR = 10_000n

const accounts = new Map<string, CoinAIAccount>()
const agents = new Map<string, AgentPolicy>()
const NO_AGENT: AgentPolicy = {
  agent: null,
  skills: 0,
  minSplitBps: 0,
  maxSplitBps: 0,
  payBudget: 0n,
  paidInWindow: 0n,
  windowStart: 0n,
  expiry: 0n,
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS))
}

function account(user: string): CoinAIAccount {
  let acc = accounts.get(user)
  if (!acc) {
    acc = {
      splitBps: DEFAULT_SPLIT_BPS,
      spend: 0n,
      idle: 0n,
      lockUntil: 0n,
      positions: Object.fromEntries(POSITIONS.map((p) => [p, 0n])) as CoinAIAccount['positions'],
      vaultShares: Object.fromEntries(YIELD_TARGETS.map((t) => [t, 0n])) as CoinAIAccount['vaultShares'],
    }
    accounts.set(user, acc)
  }
  return acc
}

const copy = (acc: CoinAIAccount): CoinAIAccount => ({ ...acc, positions: { ...acc.positions }, vaultShares: { ...acc.vaultShares } })

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

// looks like a real 32-byte Ethereum tx hash so the confirmation UI has something to show
function mockHash(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function route(to: string, amount: bigint) {
  const acc = account(to)
  const saved = (amount * BigInt(acc.splitBps)) / BPS_DENOMINATOR
  acc.idle += saved
  acc.spend += amount - saved
}

// Same error format the EVM service surfaces for contract reverts, so errorKey maps it.
const fail = (code: number): never => {
  throw new Error(`Error(Contract, #${code})`)
}

export const coinaiMock: CoinAIService = {
  async getAccount(user) {
    await delay()
    return copy(account(user))
  },

  async pay(_from, to, amount) {
    await delay()
    route(to, amount)
    return { hash: mockHash() }
  },

  async payMany(_from, rows) {
    await delay()
    if (rows.length === 0 || rows.some((r) => r.amount <= 0n)) fail(1)
    if (rows.length > 50) fail(16)
    for (const r of rows) route(r.to, r.amount)
    return { hash: mockHash() }
  },

  async withdrawSpend(user, amount) {
    await delay()
    const acc = account(user)
    if (amount > acc.spend) fail(3)
    acc.spend -= amount
    return { hash: mockHash() }
  },

  async withdrawSavings(user, amount) {
    await delay()
    const acc = account(user)
    if (acc.lockUntil > nowSeconds()) fail(5)
    if (amount > acc.idle) fail(4)
    acc.idle -= amount
    return { amount, hash: mockHash() }
  },

  async investSavings(user, amount, target) {
    await delay()
    const acc = account(user)
    if (amount > acc.idle) fail(4)
    acc.idle -= amount
    acc.positions[target] += amount // 1:1 in the mock
    if (target !== 'basket') acc.vaultShares[target] += amount
    return { amountIn: amount, amountOut: amount, hash: mockHash() }
  },

  async withdrawPosition(user, target, amount) {
    await delay()
    const acc = account(user)
    if (acc.lockUntil > nowSeconds()) fail(5)
    const held = acc.positions[target]
    const out = amount === 'all' ? held : amount
    if (out === 0n) fail(7)
    if (out > held) fail(4)
    acc.positions[target] -= out
    if (target !== 'basket') acc.vaultShares[target] -= out
    return { amount: out, hash: mockHash() }
  },

  async rebalance(user, from, to, amount) {
    await delay()
    const acc = account(user)
    if (from === to) fail(15)
    const out = amount === 'all' ? acc.positions[from] : amount
    if (out === 0n) fail(7)
    if (out > acc.positions[from]) fail(4)
    acc.positions[from] -= out
    acc.positions[to] += out
    if (from !== 'basket') acc.vaultShares[from] -= out
    if (to !== 'basket') acc.vaultShares[to] += out
    return { hash: mockHash() }
  },

  async contributeFromSpend(user, _fundId, amount) {
    await delay()
    const acc = account(user)
    if (amount > acc.spend) fail(3)
    acc.spend -= amount
    return { hash: mockHash() }
  },

  async setSplit(user, bps) {
    await delay()
    account(user).splitBps = bps
    return { hash: mockHash() }
  },

  async setLock(user, until) {
    await delay()
    account(user).lockUntil = until
    return { hash: mockHash() }
  },

  async getAgent(user, agent) {
    await delay()
    return agents.get(`${user}:${agent}`.toLowerCase()) ?? NO_AGENT
  },

  async listAgents(user) {
    await delay()
    const prefix = `${user}:`.toLowerCase()
    return [...agents].filter(([k]) => k.startsWith(prefix)).map(([, p]) => p)
  },

  async getStats() {
    await delay()
    return { totalReceived: 0n, paymentCount: 0, lastPaymentAt: 0n }
  },

  async setAgent(user, agent, g) {
    await delay()
    if (g.skills === 0 || g.skills > 7 || g.minSplitBps > g.maxSplitBps || g.maxSplitBps > 10_000 || g.expiry <= nowSeconds()) fail(13)
    agents.set(`${user}:${agent}`.toLowerCase(), { ...NO_AGENT, ...g, agent })
    return { hash: mockHash() }
  },

  async revokeAgent(user, agent) {
    await delay()
    if (!agents.delete(`${user}:${agent}`.toLowerCase())) fail(12)
    return { hash: mockHash() }
  },
}
