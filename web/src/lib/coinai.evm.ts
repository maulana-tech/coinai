import { Contract, Interface, MaxUint256, ZeroAddress, type ContractRunner } from 'ethers'
import { COINAI_ADDRESS, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'
import { ensureTokenAllowance } from '@/lib/token'
import {
  POSITIONS,
  YIELD_TARGETS,
  type AgentGrant,
  type AgentPolicy,
  type CoinAIAccount,
  type CoinAIService,
  type Position,
} from '@/lib/types'

// CoinAI v2 (evm/src/CoinAIV2.sol). Savings live inside the contract: idle tUSDT plus positions in the three
// yield vaults and the AI Smart Money basket, all held for the user.
export const COINAI_ABI = [
  'function accountOf(address user) view returns ((uint16 splitBps,uint128 spend,uint128 idle,uint64 lockUntil,uint256[4] positions,uint256[3] vaultShares))',
  'function policyOf(address user,address agent) view returns (uint8 skills,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry,uint128 payBudget,uint64 windowStart,uint128 paidInWindow)',
  'function agentsOf(address user) view returns (address[] agents,(uint8 skills,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry,uint128 payBudget,uint64 windowStart,uint128 paidInWindow)[] policies)',
  'function statsOf(address user) view returns (uint128 totalReceived,uint64 paymentCount,uint64 lastPaymentAt)',
  'function vaultOf(uint8 target) view returns (address)',
  'function pay(address from,address to,uint256 amount)',
  'function payMany(address[] to,uint256[] amounts)',
  'function withdrawSpend(address user,uint256 amount) returns (uint256)',
  'function withdrawSavings(address user,uint256 amount) returns (uint256)',
  'function withdrawPosition(address user,uint8 target,uint256 amount) returns (uint256)',
  'function investSavings(uint256 amount,uint8 target) returns (uint256)',
  'function rebalance(uint8 from,uint8 to,uint256 amount) returns (uint256)',
  'function contributeFromSpend(uint256 fundId,uint256 amount,string message)',
  'function setSplit(address user,uint16 bps)',
  'function setLock(address user,uint64 until)',
  'function setAgent(address agent,uint8 skills,uint16 minSplitBps,uint16 maxSplitBps,uint128 payBudget,uint64 expiry)',
  'function revokeAgent(address agent)',
  'error InvalidAddress()',
  'error InvalidAmount()',
  'error InvalidBps()',
  'error AmountOverflow()',
  'error InsufficientSpendable()',
  'error InsufficientShares()',
  'error EmptyWithdrawal()',
  'error Unauthorized()',
  'error LockActive()',
  'error LockCannotShrink()',
  'error LockTooLong()',
  'error NotAgent()',
  'error InvalidPolicy()',
  'error SplitOutOfRange()',
  'error InvalidTarget()',
  'error TooManyRecipients()',
  'error TransferFailed()',
  'error TooManyAgents()',
  'error NotMember()',
  'error OverBudget()',
] as const

// Contract error name → `Error(Contract, #N)`, localized via lib/errors.ts
export const ERROR_CODES: Record<string, number> = {
  InvalidAmount: 1,
  InvalidBps: 2,
  InsufficientSpendable: 3,
  InsufficientShares: 4,
  LockActive: 5,
  LockCannotShrink: 6,
  EmptyWithdrawal: 7,
  LockTooLong: 8,
  SavingsNotZero: 9, // v1 only
  InvalidAddress: 10,
  Unauthorized: 11,
  NotAgent: 12,
  InvalidPolicy: 13,
  SplitOutOfRange: 14,
  InvalidTarget: 15,
  TooManyRecipients: 16,
  TooManyAgents: 17,
  NotMember: 18,
  OverBudget: 19,
}

const iface = new Interface(COINAI_ABI)

export const toPositionIndex = (p: Position): number => POSITIONS.indexOf(p)

function reader(): Contract {
  return new Contract(COINAI_ADDRESS, COINAI_ABI, readProvider)
}

async function signerContract(): Promise<Contract> {
  return new Contract(COINAI_ADDRESS, COINAI_ABI, (await getEthersSigner()) as ContractRunner)
}

export function asContractError(error: unknown, contractIface: Interface = iface): Error | null {
  try {
    const e = error as { data?: string; info?: { error?: { data?: string } }; shortMessage?: string }
    const data = e.data ?? e.info?.error?.data
    if (typeof data === 'string') {
      const parsed = contractIface.parseError(data)
      const code = parsed ? ERROR_CODES[parsed.name] : undefined
      if (code) return new Error(`Error(Contract, #${code})`)
    }
    const msg = e.shortMessage ?? String(error)
    const hit = Object.entries(ERROR_CODES).find(([name]) => msg.includes(name))
    if (hit) return new Error(`Error(Contract, #${hit[1]})`)
    return null
  } catch {
    return null
  }
}

export async function sendTx(
  txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>,
  contractIface?: Interface,
): Promise<string> {
  try {
    const tx = await txPromise
    await tx.wait()
    return tx.hash
  } catch (error) {
    throw asContractError(error, contractIface) ?? error
  }
}

export async function simulate<T>(call: Promise<T>, contractIface?: Interface): Promise<T> {
  try {
    return await call
  } catch (error) {
    throw asContractError(error, contractIface) ?? error
  }
}

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

type PolicyStruct = {
  skills: bigint
  minSplitBps: bigint
  maxSplitBps: bigint
  expiry: bigint
  payBudget: bigint
  windowStart: bigint
  paidInWindow: bigint
}

function toPolicy(agent: string, p: PolicyStruct): AgentPolicy {
  if (Number(p.skills) === 0) return NO_AGENT
  return {
    agent,
    skills: Number(p.skills),
    minSplitBps: Number(p.minSplitBps),
    maxSplitBps: Number(p.maxSplitBps),
    payBudget: BigInt(p.payBudget),
    paidInWindow: BigInt(p.paidInWindow),
    windowStart: BigInt(p.windowStart),
    expiry: BigInt(p.expiry),
  }
}

export const coinaiEvm: CoinAIService = {
  async getAccount(user: string): Promise<CoinAIAccount> {
    const acc = await reader().accountOf(user)
    const positions = acc.positions as bigint[]
    const shares = acc.vaultShares as bigint[]
    return {
      splitBps: Number(acc.splitBps),
      spend: BigInt(acc.spend),
      idle: BigInt(acc.idle),
      lockUntil: BigInt(acc.lockUntil),
      positions: Object.fromEntries(POSITIONS.map((p, i) => [p, BigInt(positions[i])])) as CoinAIAccount['positions'],
      vaultShares: Object.fromEntries(YIELD_TARGETS.map((t, i) => [t, BigInt(shares[i])])) as CoinAIAccount['vaultShares'],
    }
  },

  async pay(from: string, to: string, amount: bigint) {
    const c = await signerContract()
    await ensureTokenAllowance(from, amount, c.runner!, COINAI_ADDRESS)
    const hash = await sendTx(c.pay(from, to, amount, { gasLimit: 300_000 }))
    return { hash }
  },

  async payMany(from: string, rows) {
    const c = await signerContract()
    const total = rows.reduce((sum, r) => sum + r.amount, 0n)
    const to = rows.map((r) => r.to)
    const amounts = rows.map((r) => r.amount)
    await ensureTokenAllowance(from, total, c.runner!, COINAI_ADDRESS)
    await simulate(c.payMany.staticCall(to, amounts))
    // ~60k per recipient (account + stats writes) on top of the transfer
    const hash = await sendTx(c.payMany(to, amounts, { gasLimit: 150_000 + 70_000 * rows.length }))
    return { hash }
  },

  async withdrawSpend(user: string, amount: bigint) {
    const c = await signerContract()
    const hash = await sendTx(c.withdrawSpend(user, amount, { gasLimit: 200_000 }))
    return { hash }
  },

  async withdrawSavings(user: string, amount: bigint) {
    const c = await signerContract()
    await simulate(c.withdrawSavings.staticCall(user, amount))
    const hash = await sendTx(c.withdrawSavings(user, amount, { gasLimit: 200_000 }))
    return { amount, hash }
  },

  async investSavings(_user: string, amount: bigint, target: Position) {
    const c = await signerContract()
    const i = toPositionIndex(target)
    const amountOut = BigInt(await simulate(c.investSavings.staticCall(amount, i)))
    // the basket buys every asset at its Chainlink price, so it needs more gas than a vault deposit
    const hash = await sendTx(c.investSavings(amount, i, { gasLimit: target === 'basket' ? 700_000 : 400_000 }))
    return { amountIn: amount, amountOut, hash }
  },

  async withdrawPosition(user: string, target: Position, amount: bigint | 'all') {
    const c = await signerContract()
    const i = toPositionIndex(target)
    const value = amount === 'all' ? MaxUint256 : amount
    const out = BigInt(await simulate(c.withdrawPosition.staticCall(user, i, value)))
    const hash = await sendTx(c.withdrawPosition(user, i, value, { gasLimit: target === 'basket' ? 600_000 : 300_000 }))
    return { amount: out, hash }
  },

  async rebalance(_user: string, from: Position, to: Position, amount: bigint | 'all') {
    const c = await signerContract()
    const args = [toPositionIndex(from), toPositionIndex(to), amount === 'all' ? MaxUint256 : amount] as const
    await simulate(c.rebalance.staticCall(...args))
    // leaving or entering the basket prices every coin, so it needs more gas than a vault-to-vault move
    const gas = from === 'basket' || to === 'basket' ? 900_000 : 500_000
    const hash = await sendTx(c.rebalance(...args, { gasLimit: gas }))
    return { hash }
  },

  async contributeFromSpend(_user: string, fundId: bigint, amount: bigint, message: string) {
    const c = await signerContract()
    await simulate(c.contributeFromSpend.staticCall(fundId, amount, message))
    const hash = await sendTx(c.contributeFromSpend(fundId, amount, message, { gasLimit: 300_000 }))
    return { hash }
  },

  async setSplit(user: string, bps: number) {
    const c = await signerContract()
    const hash = await sendTx(c.setSplit(user, bps, { gasLimit: 200_000 }))
    return { hash }
  },

  async setLock(user: string, until: bigint) {
    const c = await signerContract()
    const hash = await sendTx(c.setLock(user, until, { gasLimit: 200_000 }))
    return { hash }
  },

  async getAgent(user: string, agent: string) {
    if (!agent || agent === ZeroAddress) return NO_AGENT
    return toPolicy(agent, await reader().policyOf(user, agent))
  },

  async listAgents(user: string) {
    const [agents, policies] = (await reader().agentsOf(user)) as [string[], PolicyStruct[]]
    return agents.map((a, i) => toPolicy(a, policies[i]))
  },

  async getStats(user: string) {
    const s = await reader().statsOf(user)
    return { totalReceived: BigInt(s.totalReceived), paymentCount: Number(s.paymentCount), lastPaymentAt: BigInt(s.lastPaymentAt) }
  },

  async setAgent(_user: string, agent: string, g: AgentGrant) {
    const c = await signerContract()
    const args = [agent, g.skills, g.minSplitBps, g.maxSplitBps, g.payBudget, g.expiry] as const
    await simulate(c.setAgent.staticCall(...args))
    const hash = await sendTx(c.setAgent(...args, { gasLimit: 250_000 }))
    return { hash }
  },

  async revokeAgent(_user: string, agent: string) {
    const c = await signerContract()
    await simulate(c.revokeAgent.staticCall(agent))
    const hash = await sendTx(c.revokeAgent(agent, { gasLimit: 120_000 }))
    return { hash }
  },
}
