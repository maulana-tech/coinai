import { Contract, Wallet, formatUnits, getAddress } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { CALL_RPC, rpcProvider } from '../../shared/rpc.js'
import { TARGETS, type Policy, type Proposal, type Target } from './guard.js'

const TOKEN_DECIMALS = 6 // tUSDT, see evm/src/MockUSDT.sol

const COINAI_ABI = [
  'function accountOf(address) view returns (tuple(uint16 splitBps,uint128 spend,uint128 shares,uint64 lockUntil,uint8 yieldTarget))',
  'function statsOf(address) view returns (uint128 totalReceived,uint64 paymentCount,uint64 lastPaymentAt)',
  'function agentOf(address) view returns (address agent,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry)',
  'function vaultOf(uint8) view returns (address)',
  'function agentSetSplit(address user,uint16 bps,string reason)',
  'function agentInvest(address user,uint256 amount,uint8 target,string reason) returns (uint256)',
]

const VAULT_ABI = [
  'function name() view returns (string)',
  'function apyBps() view returns (uint16)',
  'function riskLevel() view returns (uint8)',
  'function totalAssets() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256) view returns (uint256)',
]

export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing env ${name}`)
  return v
}

const provider = () => rpcProvider(process.env.BSC_RPC_URL || CALL_RPC)
const coinaiAddress = () => process.env.COINAI_ADDRESS || process.env.VITE_COINAI_ADDRESS || DEPLOYMENT.coinai
export const agentWallet = () => new Wallet(env('AGENT_PRIVATE_KEY'), provider())
export const explorerTx = (hash: string) => `https://testnet.bscscan.com/tx/${hash}`

export type VaultInfo = {
  target: Target
  address: string
  name: string
  apyBps: number
  riskLevel: number
  tvl: bigint
  userPosition: bigint
}

export type UserState = {
  user: string
  now: number
  agentAddress: string
  splitBps: number
  spend: bigint
  savings: bigint
  lockUntil: number
  yieldTarget: Target
  totalReceived: bigint
  paymentCount: number
  lastPaymentAt: number
  policy: Policy
  vaults: VaultInfo[]
}

export async function readUserState(userInput: string): Promise<UserState> {
  const user = getAddress(userInput)
  const p = provider()
  const c = new Contract(coinaiAddress(), COINAI_ABI, p)
  const [acc, stats, policy, block, vaultAddrs] = await Promise.all([
    c.accountOf(user),
    c.statsOf(user),
    c.agentOf(user),
    p.getBlock('latest'),
    Promise.all(TARGETS.map((_, i) => c.vaultOf(i) as Promise<string>)),
  ])

  const vaults = await Promise.all(
    vaultAddrs.map(async (address, i): Promise<VaultInfo> => {
      const v = new Contract(address, VAULT_ABI, p)
      const [name, apyBps, riskLevel, tvl, shares] = await Promise.all([
        v.name(),
        v.apyBps(),
        v.riskLevel(),
        v.totalAssets(),
        v.balanceOf(user),
      ])
      const userPosition: bigint = shares === 0n ? 0n : await v.convertToAssets(shares)
      return { target: TARGETS[i], address, name, apyBps: Number(apyBps), riskLevel: Number(riskLevel), tvl, userPosition }
    }),
  )

  return {
    user,
    now: block?.timestamp ?? Math.floor(Date.now() / 1000),
    agentAddress: agentWallet().address,
    splitBps: Number(acc.splitBps),
    spend: acc.spend,
    savings: acc.shares,
    lockUntil: Number(acc.lockUntil),
    yieldTarget: TARGETS[Number(acc.yieldTarget)] ?? 'balanced',
    totalReceived: stats.totalReceived,
    paymentCount: Number(stats.paymentCount),
    lastPaymentAt: Number(stats.lastPaymentAt),
    policy: {
      agent: policy.agent,
      minSplitBps: Number(policy.minSplitBps),
      maxSplitBps: Number(policy.maxSplitBps),
      expiry: Number(policy.expiry),
    },
    vaults,
  }
}

export const fmt = (x: bigint) => `${formatUnits(x, TOKEN_DECIMALS)} tUSDT`
const iso = (t: number) => (t ? new Date(t * 1000).toISOString() : null)
const days = (from: number, to: number) => Math.round(((to - from) / 86400) * 10) / 10

/** LLM-friendly view of the state: formatted units, no bigints. */
export function describe(s: UserState) {
  return {
    user: s.user,
    now: iso(s.now),
    savingsSplitPercent: s.splitBps / 100,
    spendableBalance: fmt(s.spend),
    idleSavings: fmt(s.savings),
    savingsLockedUntil: s.now < s.lockUntil ? iso(s.lockUntil) : null,
    currentVaultPreference: s.yieldTarget,
    payments: {
      count: s.paymentCount,
      totalReceived: fmt(s.totalReceived),
      averagePayment: s.paymentCount ? fmt(s.totalReceived / BigInt(s.paymentCount)) : null,
      daysSinceLastPayment: s.lastPaymentAt ? days(s.lastPaymentAt, s.now) : null,
    },
    agentLimits: {
      minSplitPercent: s.policy.minSplitBps / 100,
      maxSplitPercent: s.policy.maxSplitBps / 100,
      expiresAt: iso(s.policy.expiry),
    },
    vaults: s.vaults.map((v) => ({
      target: v.target,
      name: v.name,
      apyPercent: v.apyBps / 100,
      risk: ['', 'low', 'medium', 'high'][v.riskLevel] ?? 'unknown',
      tvl: fmt(v.tvl),
      userPosition: fmt(v.userPosition),
    })),
  }
}

/** Sends the proposal from the agent wallet and waits for it to be mined. */
export async function execute(user: string, p: Proposal): Promise<string> {
  const c = new Contract(coinaiAddress(), COINAI_ABI, agentWallet())
  const tx =
    p.kind === 'set_split'
      ? await c.agentSetSplit(user, p.bps, p.reason)
      : await c.agentInvest(user, p.amount, TARGETS.indexOf(p.target), p.reason)
  await tx.wait()
  return tx.hash as string
}
