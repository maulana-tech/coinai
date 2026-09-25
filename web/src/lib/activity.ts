import { Contract, EventLog, JsonRpcProvider, zeroPadValue } from 'ethers'
import { CONTRACT_ID, DEPLOY_BLOCK, EVM_RPC_URL } from '@/lib/config'
import { YIELD_TARGETS, type YieldTarget } from '@/lib/types'

export type ActivityItem = {
  id: string
  kind: 'pay' | 'wd_spend' | 'wd_save' | 'invest' | 'split' | 'lock' | 'agent'
  at: Date
  txHash: string
  from?: string
  amount?: bigint
  saved?: bigint
  shares?: bigint
  bps?: number
  until?: bigint
  target?: YieldTarget
  // agent rows: what the AI did and why (merged from the sibling SplitSet/SavingsInvested log)
  agentAction?: 'split' | 'invest'
  reason?: string
}

const SAVE_EVM_ABI = [
  'event PaymentRouted(address indexed from,address indexed to,uint256 amount,uint256 spendAmount,uint256 savingsAmount,uint8 yieldTarget)',
  'event SpendWithdrawn(address indexed user,uint256 amount)',
  'event SavingsWithdrawn(address indexed user,uint256 shares,uint256 amountOut)',
  'event SplitSet(address indexed user,uint16 bps)',
  'event LockSet(address indexed user,uint64 until)',
  'event SavingsInvested(address indexed user,uint8 target,address vault,uint256 amount,uint256 vaultShares)',
  'event AgentAction(address indexed user,address indexed agent,uint8 action,string reason)',
] as const

// Public BSC RPCs cap eth_getLogs ranges, so history is read newest-first in chunks.
// ponytail: capped at MAX_CHUNKS (~50k blocks, 1-2 days on BSC testnet); index events
// server-side (or via a subgraph) if older history matters.
const CHUNK = 5_000
const MAX_CHUNKS = 10
const blockTimestampCache = new Map<number, number>()

async function getBlockTimestamp(provider: JsonRpcProvider, blockNumber: number): Promise<number> {
  const cached = blockTimestampCache.get(blockNumber)
  if (cached !== undefined) return cached
  const block = await provider.getBlock(blockNumber)
  const ts = Number(block?.timestamp ?? 0)
  blockTimestampCache.set(blockNumber, ts)
  return ts
}

function decodeLogs(logs: EventLog[], user: string): ActivityItem[] {
  const userLc = user.toLowerCase()
  const out: ActivityItem[] = []
  for (const log of logs) {
    const base = {
      id: `${log.transactionHash}-${log.index}`,
      at: new Date((blockTimestampCache.get(log.blockNumber) ?? 0) * 1000),
      txHash: log.transactionHash,
    }
    const name = log.fragment?.name
    if (name === 'PaymentRouted') {
      const from = String(log.args.from)
      const to = String(log.args.to)
      if (to.toLowerCase() !== userLc) continue
      out.push({
        ...base,
        kind: 'pay',
        from,
        amount: BigInt(log.args.amount),
        saved: BigInt(log.args.savingsAmount),
      })
    } else if (name === 'SpendWithdrawn') {
      out.push({ ...base, kind: 'wd_spend', amount: BigInt(log.args.amount) })
    } else if (name === 'SavingsWithdrawn') {
      out.push({
        ...base,
        kind: 'wd_save',
        shares: BigInt(log.args.shares),
        amount: BigInt(log.args.amountOut),
      })
    } else if (name === 'SplitSet') {
      out.push({ ...base, kind: 'split', bps: Number(log.args.bps) })
    } else if (name === 'LockSet') {
      out.push({ ...base, kind: 'lock', until: BigInt(log.args.until) })
    } else if (name === 'SavingsInvested') {
      out.push({
        ...base,
        kind: 'invest',
        amount: BigInt(log.args.amount),
        target: YIELD_TARGETS[Number(log.args.target)],
      })
    } else if (name === 'AgentAction') {
      out.push({
        ...base,
        kind: 'agent',
        agentAction: Number(log.args.action) === 0 ? 'split' : 'invest',
        reason: String(log.args.reason),
      })
    }
  }
  return mergeAgentActions(out)
}

// An agent tx emits SplitSet/SavingsInvested plus AgentAction; show one row with the reason.
function mergeAgentActions(items: ActivityItem[]): ActivityItem[] {
  const agentTx = new Map(items.filter((i) => i.kind === 'agent').map((i) => [i.txHash, i]))
  return items.filter((item) => {
    const agent = agentTx.get(item.txHash)
    if (!agent || item === agent) return true
    if (item.kind === 'split') agent.bps = item.bps
    else if (item.kind === 'invest') Object.assign(agent, { amount: item.amount, target: item.target })
    else return true
    return false
  })
}

async function fetchEvmActivity(user: string): Promise<ActivityItem[]> {
  if (CONTRACT_ID === '') return []
  const provider = new JsonRpcProvider(EVM_RPC_URL, undefined, { staticNetwork: true })
  const c = new Contract(CONTRACT_ID, SAVE_EVM_ABI, provider)

  const latest = await provider.getBlockNumber()
  const floor = Math.max(DEPLOY_BLOCK, latest - CHUNK * MAX_CHUNKS, 0)

  // PaymentRouted indexes the recipient as topic2; every other event indexes the user as topic1.
  const userTopic = zeroPadValue(user, 32)
  const own = ['SpendWithdrawn', 'SavingsWithdrawn', 'SplitSet', 'LockSet', 'SavingsInvested', 'AgentAction'].map(
    (name) => c.interface.getEvent(name)!.topicHash,
  )
  const queries = (fromBlock: number, toBlock: number) => [
    provider.getLogs({ address: CONTRACT_ID, fromBlock, toBlock, topics: [c.interface.getEvent('PaymentRouted')!.topicHash, null, userTopic] }),
    provider.getLogs({ address: CONTRACT_ID, fromBlock, toBlock, topics: [own, userTopic] }),
  ]

  const ranges: [number, number][] = []
  for (let to = latest; to >= floor; to -= CHUNK) ranges.push([Math.max(to - CHUNK + 1, floor), to])
  const rawLogs = (await Promise.all(ranges.flatMap(([from, to]) => queries(from, to)))).flat()
  // getLogs returns plain Logs; parse them back into EventLogs so decodeLogs can read args
  const parsedLogs = rawLogs.map((log) => new EventLog(log, c.interface, c.interface.parseLog(log)!.fragment))

  // Pre-warm block timestamps for every unique block we just touched in parallel
  const uniqueBlocks = Array.from(new Set(parsedLogs.map((l) => l.blockNumber)))
  await Promise.all(uniqueBlocks.map((b) => getBlockTimestamp(provider, b)))

  // Decode using cached timestamps (no extra RPC calls needed)
  const decoded = decodeLogs(parsedLogs, user)

  return decoded
    .filter((item): item is ActivityItem => item !== null)
    .sort((a, b) => (a.at.getTime() < b.at.getTime() ? 1 : -1))
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
