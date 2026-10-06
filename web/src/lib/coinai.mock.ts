import type { AgentPolicy, CoinAIAccount, CoinAIService } from '@/lib/types'

const LATENCY_MS = 800
const DEFAULT_SPLIT_BPS = 2000
const BPS_DENOMINATOR = 10_000n

const accounts = new Map<string, CoinAIAccount>()
const agents = new Map<string, AgentPolicy>()
const NO_AGENT: AgentPolicy = { agent: null, minSplitBps: 0, maxSplitBps: 0, expiry: 0n }

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS))
}

function account(user: string): CoinAIAccount {
  let acc = accounts.get(user)
  if (!acc) {
    acc = { splitBps: DEFAULT_SPLIT_BPS, spend: 0n, shares: 0n, lockUntil: 0n, yieldTarget: 'balanced' }
    accounts.set(user, acc)
  }
  return acc
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

// looks like a real 32-byte Ethereum tx hash so the confirmation UI has something to show
function mockHash(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export const coinaiMock: CoinAIService = {
  async getAccount(user) {
    await delay()
    return { ...account(user) }
  },

  async pay(_from, to, amount) {
    await delay()
    const acc = account(to)
    const saved = (amount * BigInt(acc.splitBps)) / BPS_DENOMINATOR
    acc.shares += saved // mock vault mints shares 1:1 with deposited tUSDT
    acc.spend += amount - saved
    return { hash: mockHash() }
  },

  async withdrawSpend(user, amount) {
    await delay()
    const acc = account(user)
    // same format the SDK surfaces for real contract failures, so errorKey maps it
    if (amount > acc.spend) throw new Error('Error(Contract, #3)')
    acc.spend -= amount
    return { hash: mockHash() }
  },

  async withdrawSavings(user, shares) {
    await delay()
    const acc = account(user)
    if (acc.lockUntil > nowSeconds()) throw new Error('Error(Contract, #5)')
    if (shares > acc.shares) throw new Error('Error(Contract, #4)')
    acc.shares -= shares
    return { amount: shares, hash: mockHash() } // 1:1 redemption in mock
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

  async setYieldTarget(user, target) {
    await delay()
    const acc = account(user)
    if (acc.shares > 0n) throw new Error('Error(Contract, #9)')
    acc.yieldTarget = target
    return { hash: mockHash() }
  },

  async investSavings(user, amount, target) {
    await delay()
    const acc = account(user)
    if (acc.lockUntil > nowSeconds()) throw new Error('Error(Contract, #5)')
    if (amount > acc.shares) throw new Error('Error(Contract, #4)')
    acc.shares -= amount
    acc.yieldTarget = target
    return { amountIn: amount, amountOut: amount, hash: mockHash() } // 1:1 vault shares in mock
  },

  async withdrawFromVault() {
    await delay()
    // the mock keeps no vault positions (lib/yield.ts shows them empty), so there's nothing to take out
    throw new Error('Error(Contract, #7)')
  },

  async getAgent(user) {
    await delay()
    return agents.get(user) ?? NO_AGENT
  },

  async getStats() {
    await delay()
    return { totalReceived: 0n, paymentCount: 0, lastPaymentAt: 0n }
  },

  async setAgent(user, agent, minSplitBps, maxSplitBps, expiry) {
    await delay()
    if (minSplitBps > maxSplitBps || maxSplitBps > 10_000 || expiry <= nowSeconds()) throw new Error('Error(Contract, #13)')
    agents.set(user, { agent, minSplitBps, maxSplitBps, expiry })
    return { hash: mockHash() }
  },

  async revokeAgent(user) {
    await delay()
    agents.delete(user)
    return { hash: mockHash() }
  },
}
