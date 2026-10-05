import { Contract, Wallet, formatUnits, getAddress } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { CALL_RPC, rpcProvider } from '../../shared/rpc.js'
import { TARGETS, type Policy, type Proposal, type Target } from './guard.js'
import { kv } from './kv.js'

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

// ─── Testnet yield simulator ─────────────────────────────────────────────────
// SimpleVault's APY is only metadata, so on testnet nothing ever grows. The agent wallet tops each
// vault up with tUSDT in proportion to its APY and the time since the last drip; share price =
// vault balance / shares, so every depositor's position really grows on-chain. Time is sped up
// (YIELD_SPEEDUP, default 30×) so a demo shows movement within a day. tUSDT comes from the faucet.
// ponytail: testnet only; on mainnet the vaults route into Venus/Lista and earn real yield.

const DRIP_TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function faucet()',
  'function lastFaucetAt(address) view returns (uint256)',
]
const DRIP_MIN_INTERVAL = 600 // seconds between drips
const YEAR = 365 * 86400

export const yieldSpeedup = () => Number(process.env.YIELD_SPEEDUP || 30)

/** Simulated yield accrued since `elapsed` seconds for a vault (pure, for tests). */
export function dripAmount(tvl: bigint, apyBps: number, elapsed: number, speedup: number): bigint {
  if (tvl <= 0n || elapsed <= 0) return 0n
  return (tvl * BigInt(apyBps) * BigInt(Math.floor(elapsed * speedup))) / (10_000n * BigInt(YEAR))
}

export async function dripYield(): Promise<{ target: Target; amount: bigint; txHash: string }[]> {
  const now = Math.floor(Date.now() / 1000)
  const last = await kv.get<number>('drip:last').catch(() => null)
  if (last && now - last < DRIP_MIN_INTERVAL) return []
  await kv.set('drip:last', now) // claim before sending so concurrent runs don't double-drip
  const elapsed = Math.min(last ? now - last : 86400, 7 * 86400)

  const wallet = agentWallet()
  const coinai = new Contract(coinaiAddress(), COINAI_ABI, wallet)
  const token = new Contract(process.env.TOKEN_ADDRESS || DEPLOYMENT.token, DRIP_TOKEN_ABI, wallet)
  const plan = (
    await Promise.all(
      TARGETS.map(async (target, i) => {
        const vault = new Contract((await coinai.vaultOf(i)) as string, VAULT_ABI, wallet)
        const [tvl, apyBps] = await Promise.all([vault.totalAssets() as Promise<bigint>, vault.apyBps()])
        return { target, vault: await vault.getAddress(), amount: dripAmount(tvl, Number(apyBps), elapsed, yieldSpeedup()) }
      }),
    )
  ).filter((d) => d.amount > 0n)
  const total = plan.reduce((sum, d) => sum + d.amount, 0n)
  if (total === 0n) return []

  if ((await token.balanceOf(wallet.address)) < total) {
    const lastFaucet = Number(await token.lastFaucetAt(wallet.address))
    if (now < lastFaucet + 86400) return [] // reserve empty until tomorrow's faucet
    await (await token.faucet()).wait()
  }

  const out: { target: Target; amount: bigint; txHash: string }[] = []
  for (const d of plan) {
    const tx = await token.transfer(d.vault, d.amount)
    await tx.wait()
    out.push({ target: d.target, amount: d.amount, txHash: tx.hash as string })
  }
  return out
}
