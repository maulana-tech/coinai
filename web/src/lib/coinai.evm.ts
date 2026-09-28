import { Contract, Interface, ZeroAddress, type ContractRunner } from 'ethers'
import { COINAI_ADDRESS, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'
import { ensureTokenAllowance } from '@/lib/token'
import { YIELD_TARGETS, type CoinAIAccount, type CoinAIService, type YieldTarget } from '@/lib/types'

export const COINAI_ABI = [
  'function accountOf(address user) view returns ((uint16 splitBps,uint128 spend,uint128 shares,uint64 lockUntil,uint8 yieldTarget))',
  'function agentOf(address user) view returns (address agent,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry)',
  'function statsOf(address user) view returns (uint128 totalReceived,uint64 paymentCount,uint64 lastPaymentAt)',
  'function vaultOf(uint8 target) view returns (address)',
  'function pay(address from,address to,uint256 amount)',
  'function withdrawSpend(address user,uint256 amount) returns (uint256)',
  'function withdrawSavings(address user,uint256 shares) returns (uint256)',
  'function investSavings(uint256 amount,uint8 target) returns (uint256)',
  'function setSplit(address user,uint16 bps)',
  'function setLock(address user,uint64 until)',
  'function setYieldTarget(address user,uint8 target)',
  'function setAgent(address agent,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry)',
  'function revokeAgent()',
  'error InvalidAddress()',
  'error InvalidAmount()',
  'error InvalidBps()',
  'error AmountOverflow()',
  'error InsufficientSpendable()',
  'error InsufficientShares()',
  'error LockActive()',
  'error LockCannotShrink()',
  'error EmptyWithdrawal()',
  'error LockTooLong()',
  'error SavingsNotZero()',
  'error Unauthorized()',
  'error NotAgent()',
  'error InvalidPolicy()',
  'error SplitOutOfRange()',
] as const

// Contract error name → `Error(Contract, #N)`, localized via lib/errors.ts
const ERROR_CODES: Record<string, number> = {
  InvalidAmount: 1,
  InvalidBps: 2,
  InsufficientSpendable: 3,
  InsufficientShares: 4,
  LockActive: 5,
  LockCannotShrink: 6,
  EmptyWithdrawal: 7,
  LockTooLong: 8,
  SavingsNotZero: 9,
  InvalidAddress: 10,
  Unauthorized: 11,
  NotAgent: 12,
  InvalidPolicy: 13,
  SplitOutOfRange: 14,
}

const iface = new Interface(COINAI_ABI)

const toYieldTarget = (index: bigint): YieldTarget => YIELD_TARGETS[Number(index)] ?? 'balanced'
const fromYieldTarget = (target: YieldTarget): number => YIELD_TARGETS.indexOf(target)

function reader(): Contract {
  return new Contract(COINAI_ADDRESS, COINAI_ABI, readProvider)
}

async function signerContract(): Promise<Contract> {
  return new Contract(COINAI_ADDRESS, COINAI_ABI, (await getEthersSigner()) as ContractRunner)
}

function asLegacyContractError(error: unknown): Error | null {
  try {
    const e = error as { data?: string; info?: { error?: { data?: string } }; shortMessage?: string }
    const data = e.data ?? e.info?.error?.data
    if (typeof data === 'string') {
      const parsed = iface.parseError(data)
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

async function sendTx(txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>): Promise<string> {
  try {
    const tx = await txPromise
    await tx.wait()
    return tx.hash
  } catch (error) {
    throw asLegacyContractError(error) ?? error
  }
}

async function simulate<T>(call: Promise<T>): Promise<T> {
  try {
    return await call
  } catch (error) {
    throw asLegacyContractError(error) ?? error
  }
}

export const coinaiEvm: CoinAIService = {
  async getAccount(user: string): Promise<CoinAIAccount> {
    const acc = await reader().accountOf(user)
    return {
      splitBps: Number(acc.splitBps),
      spend: BigInt(acc.spend),
      shares: BigInt(acc.shares),
      lockUntil: BigInt(acc.lockUntil),
      yieldTarget: toYieldTarget(BigInt(acc.yieldTarget)),
    }
  },

  async pay(from: string, to: string, amount: bigint) {
    const c = await signerContract()
    await ensureTokenAllowance(from, amount, c.runner!, COINAI_ADDRESS)
    const hash = await sendTx(c.pay(from, to, amount, { gasLimit: 300_000 }))
    return { hash }
  },

  async withdrawSpend(user: string, amount: bigint) {
    const c = await signerContract()
    const hash = await sendTx(c.withdrawSpend(user, amount, { gasLimit: 200_000 }))
    return { hash }
  },

  async withdrawSavings(user: string, shares: bigint) {
    const c = await signerContract()
    const amount = BigInt(await simulate(c.withdrawSavings.staticCall(user, shares)))
    const hash = await sendTx(c.withdrawSavings(user, shares, { gasLimit: 300_000 }))
    return { amount, hash }
  },

  async investSavings(_user: string, amount: bigint, target: YieldTarget) {
    const c = await signerContract()
    const amountOut = BigInt(await simulate(c.investSavings.staticCall(amount, fromYieldTarget(target))))
    const hash = await sendTx(c.investSavings(amount, fromYieldTarget(target), { gasLimit: 400_000 }))
    return { amountIn: amount, amountOut, hash }
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

  async setYieldTarget(user: string, target: YieldTarget) {
    const c = await signerContract()
    const hash = await sendTx(c.setYieldTarget(user, fromYieldTarget(target), { gasLimit: 200_000 }))
    return { hash }
  },

  async getAgent(user: string) {
    const p = await reader().agentOf(user)
    return {
      agent: p.agent === ZeroAddress ? null : (p.agent as string),
      minSplitBps: Number(p.minSplitBps),
      maxSplitBps: Number(p.maxSplitBps),
      expiry: BigInt(p.expiry),
    }
  },

  async getStats(user: string) {
    const s = await reader().statsOf(user)
    return { totalReceived: BigInt(s.totalReceived), paymentCount: Number(s.paymentCount), lastPaymentAt: BigInt(s.lastPaymentAt) }
  },

  async setAgent(_user: string, agent: string, minSplitBps: number, maxSplitBps: number, expiry: bigint) {
    const c = await signerContract()
    await simulate(c.setAgent.staticCall(agent, minSplitBps, maxSplitBps, expiry))
    const hash = await sendTx(c.setAgent(agent, minSplitBps, maxSplitBps, expiry, { gasLimit: 200_000 }))
    return { hash }
  },

  async revokeAgent() {
    const c = await signerContract()
    const hash = await sendTx(c.revokeAgent({ gasLimit: 100_000 }))
    return { hash }
  },
}
