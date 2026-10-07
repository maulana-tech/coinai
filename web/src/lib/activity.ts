import { Contract, EventLog, JsonRpcProvider, ZeroHash, zeroPadValue } from 'ethers'
import { agentApi, hasAgentSession } from '@/lib/agent-api'
import { CONTRACT_ID, DEPLOY_BLOCK, DEPOSIT_ROUTERS, LEGACY_COINAI_ADDRESS, logsProvider, TOKEN_ADDRESS } from '@/lib/config'
import { POSITIONS, YIELD_TARGETS, type Position, type YieldTarget } from '@/lib/types'

export type ActivityItem = {
  id: string
  kind:
    | 'pay'
    | 'paid'
    | 'faucet'
    | 'wd_spend'
    | 'wd_save'
    | 'wd_vault'
    | 'invest'
    | 'move'
    | 'contribute'
    | 'split'
    | 'lock'
    | 'target'
    | 'agent_on'
    | 'agent_off'
    | 'agent'
    | 'run'
  at: Date
  txHash: string // '' for off-chain rows (agent runs)
  from?: string
  to?: string
  // pay rows that are the user's own deposit: from their wallet, or tBNB via the deposit router
  via?: 'wallet' | 'bnb'
  amount?: bigint
  saved?: bigint
  shares?: bigint
  bps?: number
  until?: bigint
  target?: Position
  fromTarget?: Position // move rows
  fundId?: bigint // contribute rows: the GroupFunds fund
  skills?: number // agent_on rows (v2): SKILL_* bits
  minBps?: number
  maxBps?: number
  // run rows: an agent team run from the backend, including runs that changed nothing on-chain
  runMode?: 'agent' | 'report-only'
  executed?: number
  rejected?: number
  summary?: string
  // agent rows: what the AI did and why (merged from the sibling SplitSet/SavingsInvested/PositionMoved/FundContributed log)
  agentAction?: 'split' | 'invest' | 'rebalance' | 'contribute'
  reason?: string
}

// Events of coinAI v2 and v1 (both are read, so history from before the move still shows). Shared events keep
// the same layout in both; AgentSet/AgentRevoked changed, so both versions are listed.
const AGENT_SET_V1 = 'AgentSet(address,address,uint16,uint16,uint64)'
const AGENT_SET_V2 = 'AgentSet(address,address,uint8,uint16,uint16,uint128,uint64)'
const AGENT_REVOKED_V1 = 'AgentRevoked(address)'
const AGENT_REVOKED_V2 = 'AgentRevoked(address,address)'
const COINAI_EVENTS_ABI = [
  'event PaymentRouted(address indexed from,address indexed to,uint256 amount,uint256 spendAmount,uint256 savingsAmount,uint8 yieldTarget)',
  'event SpendWithdrawn(address indexed user,uint256 amount)',
  'event SavingsWithdrawn(address indexed user,uint256 shares,uint256 amountOut)',
  'event SplitSet(address indexed user,uint16 bps)',
  'event LockSet(address indexed user,uint64 until)',
  'event SavingsInvested(address indexed user,uint8 target,address vault,uint256 amount,uint256 vaultShares)',
  'event AgentAction(address indexed user,address indexed agent,uint8 action,string reason)',
  'event YieldTargetSet(address indexed user,uint8 target)', // v1
  'event AgentSet(address indexed user,address indexed agent,uint16 minSplitBps,uint16 maxSplitBps,uint64 expiry)', // v1
  'event AgentRevoked(address indexed user)', // v1
  'event AgentSet(address indexed user,address indexed agent,uint8 skills,uint16 minSplitBps,uint16 maxSplitBps,uint128 payBudget,uint64 expiry)',
  'event AgentRevoked(address indexed user,address indexed agent)',
  'event PositionWithdrawn(address indexed user,uint8 indexed target,uint256 amount)',
  'event PositionMoved(address indexed user,uint8 from,uint8 to,uint256 amount)',
  'event FundContributed(address indexed user,uint256 indexed fundId,uint256 amount)',
  // tUSDT faucet mints (Transfer from the zero address), read from the token contract
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  // v1: the user taking a position out of one of the three vaults (SimpleVault, ERC-4626, shares in their wallet)
  'event Withdraw(address indexed caller,address indexed receiver,address indexed owner,uint256 assets,uint256 shares)',
  'function vaultOf(uint8 target) view returns (address)',
] as const

// AgentAction.action in CoinAIV2 (v1 only had SetSplit and Invest)
const AGENT_ACTIONS = ['split', 'invest', 'rebalance', 'contribute'] as const

// Public BSC RPCs cap eth_getLogs ranges (publicnode: 50k blocks), so history is read newest-first
// in chunks, a few at a time to stay under rate limits.
// ponytail: capped at MAX_CHUNKS (1M blocks ≈ 8–9 days on BSC testnet); index events
// server-side (or via a subgraph) if older history matters.
const CHUNK = 50_000
const MAX_CHUNKS = 20
const PARALLEL_CHUNKS = 5
const blockTimestampCache = new Map<number, number>()

async function getBlockTimestamp(provider: JsonRpcProvider, blockNumber: number): Promise<number> {
  const cached = blockTimestampCache.get(blockNumber)
  if (cached !== undefined) return cached
  const block = await provider.getBlock(blockNumber)
  const ts = Number(block?.timestamp ?? 0)
  blockTimestampCache.set(blockNumber, ts)
  return ts
}

const position = (index: unknown): Position | undefined => POSITIONS[Number(index)]

function decodeLogs(logs: EventLog[], user: string, vaults: Map<string, YieldTarget>): ActivityItem[] {
  const userLc = user.toLowerCase()
  const routers = DEPOSIT_ROUTERS.map((a) => a.toLowerCase())
  const out: ActivityItem[] = []
  const seen = new Set<string>()
  for (const log of logs) {
    // a self-payment matches both the payer and the recipient query
    if (seen.has(`${log.transactionHash}-${log.index}`)) continue
    seen.add(`${log.transactionHash}-${log.index}`)
    const base = {
      id: `${log.transactionHash}-${log.index}`,
      at: new Date((blockTimestampCache.get(log.blockNumber) ?? 0) * 1000),
      txHash: log.transactionHash,
    }
    const name = log.fragment?.name
    if (name === 'PaymentRouted') {
      const from = String(log.args.from)
      const to = String(log.args.to)
      if (to.toLowerCase() === userLc) {
        const via = from.toLowerCase() === userLc ? 'wallet' : routers.includes(from.toLowerCase()) ? 'bnb' : undefined
        out.push({ ...base, kind: 'pay', from, via, amount: BigInt(log.args.amount), saved: BigInt(log.args.savingsAmount) })
      } else if (from.toLowerCase() === userLc) {
        out.push({ ...base, kind: 'paid', to, amount: BigInt(log.args.amount) })
      }
    } else if (name === 'Transfer') {
      out.push({ ...base, kind: 'faucet', amount: BigInt(log.args.value) })
    } else if (name === 'YieldTargetSet') {
      out.push({ ...base, kind: 'target', target: position(log.args.target) })
    } else if (name === 'AgentSet') {
      const v2 = log.fragment.inputs.length === 7
      out.push({
        ...base,
        kind: 'agent_on',
        skills: v2 ? Number(log.args.skills) : undefined,
        minBps: Number(log.args.minSplitBps),
        maxBps: Number(log.args.maxSplitBps),
        until: BigInt(log.args.expiry),
      })
    } else if (name === 'AgentRevoked') {
      out.push({ ...base, kind: 'agent_off' })
    } else if (name === 'SpendWithdrawn') {
      out.push({ ...base, kind: 'wd_spend', amount: BigInt(log.args.amount) })
    } else if (name === 'SavingsWithdrawn') {
      out.push({
        ...base,
        kind: 'wd_save',
        shares: BigInt(log.args.shares),
        amount: BigInt(log.args.amountOut),
      })
    } else if (name === 'Withdraw') {
      out.push({ ...base, kind: 'wd_vault', amount: BigInt(log.args.assets), target: vaults.get(log.address.toLowerCase()) })
    } else if (name === 'PositionWithdrawn') {
      out.push({ ...base, kind: 'wd_vault', amount: BigInt(log.args.amount), target: position(log.args.target) })
    } else if (name === 'PositionMoved') {
      out.push({
        ...base,
        kind: 'move',
        amount: BigInt(log.args.amount),
        fromTarget: position(log.args.from),
        target: position(log.args.to),
      })
    } else if (name === 'FundContributed') {
      out.push({ ...base, kind: 'contribute', amount: BigInt(log.args.amount), fundId: BigInt(log.args.fundId) })
    } else if (name === 'SplitSet') {
      out.push({ ...base, kind: 'split', bps: Number(log.args.bps) })
    } else if (name === 'LockSet') {
      out.push({ ...base, kind: 'lock', until: BigInt(log.args.until) })
    } else if (name === 'SavingsInvested') {
      out.push({
        ...base,
        kind: 'invest',
        amount: BigInt(log.args.amount),
        target: position(log.args.target),
      })
    } else if (name === 'AgentAction') {
      out.push({
        ...base,
        kind: 'agent',
        agentAction: AGENT_ACTIONS[Number(log.args.action)] ?? 'invest',
        reason: String(log.args.reason),
      })
    }
  }
  return mergeAgentActions(out)
}

// An agent tx emits SplitSet/SavingsInvested/PositionMoved/FundContributed plus AgentAction; show one row with the reason.
function mergeAgentActions(items: ActivityItem[]): ActivityItem[] {
  const agentTx = new Map(items.filter((i) => i.kind === 'agent').map((i) => [i.txHash, i]))
  return items.filter((item) => {
    const agent = agentTx.get(item.txHash)
    if (!agent || item === agent) return true
    if (item.kind === 'split') agent.bps = item.bps
    else if (item.kind === 'invest') Object.assign(agent, { amount: item.amount, target: item.target })
    else if (item.kind === 'move') Object.assign(agent, { amount: item.amount, target: item.target, fromTarget: item.fromTarget })
    else if (item.kind === 'contribute') Object.assign(agent, { amount: item.amount, fundId: item.fundId })
    else return true
    return false
  })
}

async function fetchEvmActivity(user: string): Promise<ActivityItem[]> {
  if (CONTRACT_ID === '') return []
  const provider = logsProvider
  const contracts = [CONTRACT_ID, LEGACY_COINAI_ADDRESS].filter(Boolean)
  const c = new Contract(CONTRACT_ID, COINAI_EVENTS_ABI, provider)

  // v1 vaults (the same three back v2) emit Withdraw with the user as owner only for v1 positions
  const [latest, vaultAddresses] = await Promise.all([
    provider.getBlockNumber(),
    Promise.all(YIELD_TARGETS.map((_, i) => c.vaultOf(i) as Promise<string>)),
  ])
  const vaults = new Map(vaultAddresses.map((a, i) => [a.toLowerCase(), YIELD_TARGETS[i]]))
  const floor = Math.max(DEPLOY_BLOCK, latest - CHUNK * MAX_CHUNKS, 0)

  // PaymentRouted indexes the payer as topic1 and the recipient as topic2; every other event
  // indexes the user as topic1. Faucet mints are Transfer(0x0 → user) on the token.
  const topic = (name: string) => c.interface.getEvent(name)!.topicHash
  const userTopic = zeroPadValue(user, 32)
  const own = [
    'PaymentRouted',
    'SpendWithdrawn',
    'SavingsWithdrawn',
    'SplitSet',
    'LockSet',
    'SavingsInvested',
    'AgentAction',
    'YieldTargetSet',
    AGENT_SET_V1,
    AGENT_SET_V2,
    AGENT_REVOKED_V1,
    AGENT_REVOKED_V2,
    'PositionWithdrawn',
    'PositionMoved',
    'FundContributed',
  ].map(topic)
  const queries = (fromBlock: number, toBlock: number) => [
    provider.getLogs({ address: contracts, fromBlock, toBlock, topics: [topic('PaymentRouted'), null, userTopic] }),
    provider.getLogs({ address: contracts, fromBlock, toBlock, topics: [own, userTopic] }),
    provider.getLogs({ address: TOKEN_ADDRESS, fromBlock, toBlock, topics: [topic('Transfer'), ZeroHash, userTopic] }),
    provider.getLogs({ address: vaultAddresses, fromBlock, toBlock, topics: [topic('Withdraw'), null, null, userTopic] }),
  ]

  const ranges: [number, number][] = []
  for (let to = latest; to >= floor; to -= CHUNK) ranges.push([Math.max(to - CHUNK + 1, floor), to])
  // Newest first; stop at the first failing chunk (public RPCs prune history beyond ~50–100k blocks),
  // keeping whatever recent history was readable.
  const rawLogs = []
  for (let i = 0; i < ranges.length; i += PARALLEL_CHUNKS) {
    const batch = await Promise.allSettled(ranges.slice(i, i + PARALLEL_CHUNKS).flatMap(([from, to]) => queries(from, to)))
    for (const r of batch) if (r.status === 'fulfilled') rawLogs.push(...r.value)
    if (batch.some((r) => r.status === 'rejected')) break
  }
  // getLogs returns plain Logs; parse them back into EventLogs so decodeLogs can read args
  const parsedLogs = rawLogs.map((log) => new EventLog(log, c.interface, c.interface.parseLog(log)!.fragment))

  // Pre-warm block timestamps for every unique block we just touched in parallel
  const uniqueBlocks = Array.from(new Set(parsedLogs.map((l) => l.blockNumber)))
  await Promise.all(uniqueBlocks.map((b) => getBlockTimestamp(provider, b)))

  // Decode using cached timestamps (no extra RPC calls needed)
  const decoded = decodeLogs(parsedLogs, user, vaults)

  return [...decoded, ...(await fetchRuns(user))].sort((a, b) => b.at.getTime() - a.at.getTime())
}

// Agent runs live in the backend, not on-chain; include them once the wallet has an agent
// session (never pop a signature just to render the activity list).
async function fetchRuns(user: string): Promise<ActivityItem[]> {
  if (!hasAgentSession(user)) return []
  const { runs } = await agentApi.history(user).catch(() => ({ runs: [] }))
  return runs.map((run) => ({
    id: `run-${run.at}`,
    kind: 'run' as const,
    at: new Date(run.at),
    txHash: '',
    runMode: run.mode,
    executed: run.executed.length,
    rejected: run.steps.filter((s) => s.outcome === 'rejected').length,
    summary: run.market?.summary ?? run.report.split('\n').find((l) => l.trim()),
  }))
}

const inflight = new Map<string, Promise<ActivityItem[]>>()
const cache = new Map<string, { ts: number; items: ActivityItem[] }>()
const CACHE_MS = 30_000

// `fresh` skips the short cache, for refreshes right after a tx (the cache would still hold pre-tx logs).
export async function fetchActivity(user: string, fresh = false): Promise<ActivityItem[]> {
  const key = user.toLowerCase()
  const now = Date.now()
  const cached = cache.get(key)
  if (!fresh && cached && now - cached.ts < CACHE_MS) return cached.items
  const pending = inflight.get(key)
  if (pending) return pending
  const p = fetchEvmActivity(key)
    .then((items) => {
      cache.set(key, { ts: Date.now(), items })
      return items
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}
