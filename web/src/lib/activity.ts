import { Contract, JsonRpcProvider, type EventLog } from 'ethers'
import { CONTRACT_ID, EVM_RPC_URL } from '@/lib/config'

export type ActivityItem = {
  id: string
  kind: 'pay' | 'wd_spend' | 'wd_save' | 'split' | 'lock'
  at: Date
  txHash: string
  from?: string
  amount?: bigint
  saved?: bigint
  shares?: bigint
  bps?: number
  until?: bigint
}

const SAVE_EVM_ABI = [
  'event PaymentRouted(address indexed from,address indexed to,uint256 amount,uint256 spendAmount,uint256 savingsAmount,uint8 yieldTarget)',
  'event SpendWithdrawn(address indexed user,uint256 amount)',
  'event SavingsWithdrawn(address indexed user,uint256 shares,uint256 amountOut)',
  'event SplitSet(address indexed user,uint16 bps)',
  'event LockSet(address indexed user,uint64 until)',
] as const

const BLOCK_LOOKBACK = 5_000
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
    }
  }
  return out
}

async function fetchEvmActivity(user: string): Promise<ActivityItem[]> {
  if (CONTRACT_ID === '') return []
  const provider = new JsonRpcProvider(EVM_RPC_URL, undefined, { staticNetwork: true })
  const c = new Contract(CONTRACT_ID, SAVE_EVM_ABI, provider)

  const latest = await provider.getBlockNumber()
  const fromBlock = Math.max(latest - BLOCK_LOOKBACK, 0)

  // Build all five filter topics up-front and fire as ONE batched getLogs call
  // (the RPC supports up to N topics in a single request, which is much faster
  // than five parallel calls because we skip the per-call handshake overhead).
  const topics: (string | null)[][] = [
    [c.filters.PaymentRouted(null, user).fragment.topicHash],
    [c.filters.SpendWithdrawn(user).fragment.topicHash],
    [c.filters.SavingsWithdrawn(user).fragment.topicHash],
    [c.filters.SplitSet(user).fragment.topicHash],
    [c.filters.LockSet(user).fragment.topicHash],
  ]

  const rawLogs = await Promise.all(
    topics.map((t) =>
      provider.getLogs({ address: CONTRACT_ID, topics: t, fromBlock, toBlock: latest }),
    ),
  )

  // Pre-warm block timestamps for every unique block we just touched in parallel
  const uniqueBlocks = Array.from(new Set(rawLogs.flat().map((l) => l.blockNumber)))
  await Promise.all(uniqueBlocks.map((b) => getBlockTimestamp(provider, b)))

  // Decode using cached timestamps (no extra RPC calls needed)
  const allLogs = rawLogs.flat() as EventLog[]
  const decoded = decodeLogs(allLogs, user)

  return decoded
    .filter((item): item is ActivityItem => item !== null)
    .sort((a, b) => (a.at.getTime() < b.at.getTime() ? 1 : -1))
}

const inflight = new Map<string, Promise<ActivityItem[]>>()
const cache = new Map<string, { ts: number; items: ActivityItem[] }>()
const CACHE_MS = 30_000

export async function fetchActivity(user: string): Promise<ActivityItem[]> {
  const key = user.toLowerCase()
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && now - cached.ts < CACHE_MS) return cached.items
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
