// Group funds (evm/src/GroupFunds.sol): Patungan (chip-in, all or nothing), Iuran (recurring dues) and Donasi
// (fundraising). Reads go straight to the chain; writes are signed by the user's wallet.

import { Contract, EventLog, type ContractRunner } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { logsProvider, readProvider } from '@/lib/config'
import { coinai } from '@/lib/coinai'
import { getEthersSigner } from '@/lib/ethers-wagmi'
import { ensureTokenAllowance } from '@/lib/token'

export const GROUP_FUNDS_ADDRESS: string = import.meta.env.VITE_GROUP_FUNDS_ADDRESS ?? DEPLOYMENT.v2.groupFunds
const FROM_BLOCK = DEPLOYMENT.v2.deployBlock

export const FUND_KINDS = ['patungan', 'iuran', 'donasi'] as const
export type FundKind = (typeof FUND_KINDS)[number]
export const MAX_MESSAGE_BYTES = 140
export const MAX_TITLE_BYTES = 64

const ABI = [
  'function create(uint8 kind,address beneficiary,string title,uint128 target,uint64 deadline,uint128 dues,uint64 period) returns (uint256)',
  'function join(uint256 id)',
  'function contribute(uint256 id,uint256 amount,string message)',
  'function contributeFor(uint256 id,address member,uint256 amount,string message)',
  'function withdraw(uint256 id,uint256 amount,string memo)',
  'function cancel(uint256 id)',
  'function refund(uint256 id) returns (uint256)',
  'function fundCount() view returns (uint256)',
  'function fund(uint256 id) view returns ((address organizer,address beneficiary,uint8 kind,bool cancelled,uint64 start,uint64 deadline,uint64 period,uint128 target,uint128 dues,uint128 raised,uint128 withdrawn,uint32 contributors,uint32 members,string title))',
  'function isMember(uint256 id,address who) view returns (bool)',
  'function contributedOf(uint256 id,address who) view returns (uint256)',
  'function duesOf(uint256 id,address member) view returns (uint256 paid,uint256 owed)',
  'event FundCreated(uint256 indexed id,address indexed organizer,uint8 kind,address beneficiary,string title)',
  'event Joined(uint256 indexed id,address indexed member)',
  'event Contributed(uint256 indexed id,address indexed payer,address indexed member,uint256 amount,string message)',
  'event Withdrawn(uint256 indexed id,address to,uint256 amount,string memo)',
  'event Refunded(uint256 indexed id,address indexed member,uint256 amount)',
  'event Cancelled(uint256 indexed id)',
  'error InvalidFund()',
  'error NotFound()',
  'error Unauthorized()',
  'error Closed()',
  'error NotMember()',
  'error InvalidAmount()',
  'error TargetNotReached()',
  'error NothingToRefund()',
  'error TooLong()',
] as const

export type GroupFund = {
  id: number
  organizer: string
  beneficiary: string
  kind: FundKind
  cancelled: boolean
  start: number // unix seconds
  deadline: number // 0 = none
  period: number // Iuran: seconds
  target: bigint
  dues: bigint
  raised: bigint
  withdrawn: bigint
  contributors: number
  members: number
  title: string
}

/** What the fund is doing right now, from the rules in the contract. */
export type FundStatus = 'open' | 'reached' | 'failed' | 'ended' | 'cancelled'

export function fundStatus(f: GroupFund, now = Date.now() / 1000): FundStatus {
  if (f.cancelled) return 'cancelled'
  if (f.kind === 'patungan') {
    if (f.raised >= f.target) return 'reached'
    return now > f.deadline ? 'failed' : 'open'
  }
  if (f.deadline !== 0 && now > f.deadline) return 'ended'
  return 'open'
}

export const acceptsMoney = (f: GroupFund, now = Date.now() / 1000) =>
  !f.cancelled && (f.deadline === 0 || now <= f.deadline)

/** Patungan only: contributors can take their share back. */
export const refundsOpen = (f: GroupFund, now = Date.now() / 1000) =>
  f.kind === 'patungan' && (f.cancelled || (now > f.deadline && f.raised < f.target))

/** Iuran: index of the current period, and when it started / ends (unix seconds). */
export function currentPeriod(f: GroupFund, now = Date.now() / 1000) {
  const index = f.period ? Math.floor((now - f.start) / f.period) : 0
  const from = f.start + index * f.period
  return { index, from, to: from + f.period }
}

export type MemberDues = { paid: number; owed: number }
export const duesBehind = (d: MemberDues) => Math.max(0, d.owed - d.paid)

const reader = () => new Contract(GROUP_FUNDS_ADDRESS, ABI, readProvider)
const writer = async () => new Contract(GROUP_FUNDS_ADDRESS, ABI, (await getEthersSigner()) as ContractRunner)

function toFund(id: number, r: Record<string, unknown> & unknown[]): GroupFund {
  return {
    id,
    organizer: String(r.organizer),
    beneficiary: String(r.beneficiary),
    kind: FUND_KINDS[Number(r.kind)] ?? 'donasi',
    cancelled: Boolean(r.cancelled),
    start: Number(r.start),
    deadline: Number(r.deadline),
    period: Number(r.period),
    target: BigInt(r.target as bigint),
    dues: BigInt(r.dues as bigint),
    raised: BigInt(r.raised as bigint),
    withdrawn: BigInt(r.withdrawn as bigint),
    contributors: Number(r.contributors),
    members: Number(r.members),
    title: String(r.title),
  }
}

export async function getFund(id: number): Promise<GroupFund> {
  return toFund(id, await reader().fund(id))
}

/** The newest `limit` funds, newest first. */
export async function listFunds(limit = 30): Promise<GroupFund[]> {
  const count = Number(await reader().fundCount())
  const ids = Array.from({ length: Math.min(limit, count) }, (_, i) => count - 1 - i)
  return Promise.all(ids.map(getFund))
}

/** The connected user's relation to each fund, for the cards. */
export type MyStake = { member: boolean; contributed: bigint; dues: MemberDues | null; organizer: boolean }

export async function myStake(f: GroupFund, user: string): Promise<MyStake> {
  const c = reader()
  const [member, contributed, dues] = await Promise.all([
    c.isMember(f.id, user) as Promise<boolean>,
    c.contributedOf(f.id, user) as Promise<bigint>,
    f.kind === 'iuran' ? (c.duesOf(f.id, user) as Promise<[bigint, bigint]>) : Promise.resolve(null),
  ])
  return {
    member,
    contributed: BigInt(contributed),
    dues: dues && member ? { paid: Number(dues[0]), owed: Number(dues[1]) } : null,
    organizer: f.organizer.toLowerCase() === user.toLowerCase(),
  }
}

// ─── History (events) ────────────────────────────────────────────────────────

export type FundEvent =
  | { kind: 'contributed'; at: number; tx: string; payer: string; member: string; amount: bigint; message: string }
  | { kind: 'withdrawn'; at: number; tx: string; to: string; amount: bigint; memo: string }
  | { kind: 'joined'; at: number; tx: string; member: string }
  | { kind: 'refunded'; at: number; tx: string; member: string; amount: bigint }
  | { kind: 'cancelled'; at: number; tx: string }

const CHUNK = 49_000
const timestamps = new Map<number, number>()

/**
 * The fund's history, newest first. Public RPCs cap getLogs at ~50k blocks and prune old history, so this
 * reads newest-first in chunks from the GroupFunds deploy block and keeps whatever it could read.
 */
export async function fundHistory(id: number): Promise<FundEvent[]> {
  const c = new Contract(GROUP_FUNDS_ADDRESS, ABI, logsProvider)
  const latest = await logsProvider.getBlockNumber()
  const idTopic = '0x' + id.toString(16).padStart(64, '0')
  const names = ['Contributed', 'Withdrawn', 'Joined', 'Refunded', 'Cancelled']
  const topics = [names.map((n) => c.interface.getEvent(n)!.topicHash), idTopic]
  const logs = []
  for (let to = latest; to >= FROM_BLOCK; to -= CHUNK) {
    try {
      logs.push(...(await logsProvider.getLogs({ address: GROUP_FUNDS_ADDRESS, fromBlock: Math.max(FROM_BLOCK, to - CHUNK + 1), toBlock: to, topics })))
    } catch {
      break
    }
  }
  await Promise.all(
    [...new Set(logs.map((l) => l.blockNumber))]
      .filter((b) => !timestamps.has(b))
      .map(async (b) => timestamps.set(b, Number((await logsProvider.getBlock(b))?.timestamp ?? 0))),
  )
  const out: FundEvent[] = []
  for (const raw of logs) {
    const log = new EventLog(raw, c.interface, c.interface.parseLog(raw)!.fragment)
    const base = { at: timestamps.get(log.blockNumber) ?? 0, tx: log.transactionHash }
    const a = log.args
    switch (log.fragment.name) {
      case 'Contributed':
        out.push({ kind: 'contributed', ...base, payer: a.payer, member: a.member, amount: BigInt(a.amount), message: a.message })
        break
      case 'Withdrawn':
        out.push({ kind: 'withdrawn', ...base, to: a.to, amount: BigInt(a.amount), memo: a.memo })
        break
      case 'Joined':
        out.push({ kind: 'joined', ...base, member: a.member })
        break
      case 'Refunded':
        out.push({ kind: 'refunded', ...base, member: a.member, amount: BigInt(a.amount) })
        break
      case 'Cancelled':
        out.push({ kind: 'cancelled', ...base })
    }
  }
  return out.sort((x, y) => y.at - x.at)
}

/** Iuran members (from Joined events) with their dues status, most behind first. */
export async function membersWithDues(f: GroupFund, history: FundEvent[]): Promise<{ member: string; dues: MemberDues }[]> {
  const members = [...new Set(history.flatMap((e) => (e.kind === 'joined' ? [e.member] : [])))]
  const c = reader()
  const rows = await Promise.all(
    members.map(async (member) => {
      const [paid, owed] = (await c.duesOf(f.id, member)) as [bigint, bigint]
      return { member, dues: { paid: Number(paid), owed: Number(owed) } }
    }),
  )
  return rows.sort((a, b) => duesBehind(b.dues) - duesBehind(a.dues))
}

// ─── Writes ──────────────────────────────────────────────────────────────────

type Tx = { hash: string; wait: () => Promise<unknown> }

/** Contract reverts become `group:<ErrorName>` (localized in lib/errors.ts); a bare "Closed" would read as a cancelled wallet prompt. */
function groupError(e: unknown): unknown {
  const err = e as { revert?: { name?: string }; data?: string; info?: { error?: { data?: string } } }
  let name = err?.revert?.name
  if (!name) {
    const data = err?.data ?? err?.info?.error?.data
    if (typeof data === 'string') name = new Contract(GROUP_FUNDS_ADDRESS, ABI).interface.parseError(data)?.name
  }
  return name ? new Error(`group:${name}`) : e
}

async function send(p: Promise<Tx>) {
  try {
    const tx = await p
    await tx.wait()
    return { hash: tx.hash }
  } catch (e) {
    throw groupError(e)
  }
}

export type NewFund = {
  kind: FundKind
  beneficiary: string
  title: string
  target: bigint // patungan: required, donasi: optional (0)
  deadline: number // unix seconds; 0 = none
  dues: bigint // iuran
  period: number // iuran, seconds
}

/** Creates the fund and returns its id (read from the FundCreated event). */
export async function createFund(input: NewFund): Promise<{ hash: string; id: number }> {
  try {
    return await create(input)
  } catch (e) {
    throw groupError(e)
  }
}

async function create(input: NewFund): Promise<{ hash: string; id: number }> {
  const c = await writer()
  const tx = await c.create(
    FUND_KINDS.indexOf(input.kind),
    input.beneficiary,
    input.title,
    input.target,
    input.deadline,
    input.dues,
    input.period,
    { gasLimit: 400_000 },
  )
  const receipt = await tx.wait()
  const created = receipt.logs
    .map((l: { topics: string[]; data: string }) => c.interface.parseLog(l))
    .find((p: { name: string } | null) => p?.name === 'FundCreated')
  return { hash: tx.hash, id: Number(created?.args.id ?? (await reader().fundCount()) - 1n) }
}

export async function joinFund(id: number) {
  return send((await writer()).join(id, { gasLimit: 120_000 }))
}

/** Pays from the wallet (approving tUSDT once), crediting `member` (defaults to the payer). */
export async function contributeToFund(user: string, id: number, amount: bigint, message: string, member?: string) {
  const signer = (await getEthersSigner()) as ContractRunner
  await ensureTokenAllowance(user, amount, signer, GROUP_FUNDS_ADDRESS)
  const c = new Contract(GROUP_FUNDS_ADDRESS, ABI, signer)
  return send(
    member && member.toLowerCase() !== user.toLowerCase()
      ? c.contributeFor(id, member, amount, message, { gasLimit: 250_000 })
      : c.contribute(id, amount, message, { gasLimit: 250_000 }),
  )
}

/** Pays from the spendable balance inside coinAI (CoinAIV2.contributeFromSpend); always for the payer themself. */
export async function contributeFromSpendable(user: string, id: number, amount: bigint, message: string) {
  try {
    return await coinai.contributeFromSpend(user, BigInt(id), amount, message)
  } catch (e) {
    throw groupError(e)
  }
}

export async function withdrawFromFund(id: number, amount: bigint, memo: string) {
  return send((await writer()).withdraw(id, amount, memo, { gasLimit: 150_000 }))
}

export async function cancelFund(id: number) {
  return send((await writer()).cancel(id, { gasLimit: 100_000 }))
}

export async function refundFromFund(id: number) {
  return send((await writer()).refund(id, { gasLimit: 120_000 }))
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length
