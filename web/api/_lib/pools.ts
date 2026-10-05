// Saved pools per wallet; the active one is the strategy the Investment Strategist follows.
import { randomUUID } from 'node:crypto'
import { normalizeWeights, vaultMix, type SavedPool, type VaultMix, type Weights } from '../../shared/pool.js'
import { kv } from './kv.js'

export const MAX_POOLS = 10
type Store = { pools: SavedPool[]; activeId: string | null }

const key = (user: string) => `pools:${user.toLowerCase()}`
export const loadPools = async (user: string): Promise<Store> =>
  (await kv.get<Store>(key(user)).catch(() => null)) ?? { pools: [], activeId: null }
const save = (user: string, s: Store) => kv.set(key(user), s)

/** Creates (no id) or updates a pool. Throws on invalid input. */
export async function savePool(user: string, input: { id?: string; name?: string; weights?: Weights }): Promise<Store> {
  const name = String(input.name ?? '').trim().slice(0, 40)
  if (!name) throw new Error('name_required')
  const { weights, valid } = normalizeWeights(input.weights ?? {})
  if (!valid) throw new Error('weights_must_total_100')

  const s = await loadPools(user)
  const existing = input.id ? s.pools.find((p) => p.id === input.id) : undefined
  if (existing) Object.assign(existing, { name, weights })
  else {
    if (s.pools.length >= MAX_POOLS) throw new Error('too_many_pools')
    s.pools.push({ id: randomUUID(), name, weights, createdAt: Date.now() })
  }
  await save(user, s)
  return s
}

export async function deletePool(user: string, id: string): Promise<Store> {
  const s = await loadPools(user)
  s.pools = s.pools.filter((p) => p.id !== id)
  if (s.activeId === id) s.activeId = null
  await save(user, s)
  return s
}

export async function setActivePool(user: string, id: string | null): Promise<Store> {
  const s = await loadPools(user)
  s.activeId = id && s.pools.some((p) => p.id === id) ? id : null
  await save(user, s)
  return s
}

export type Strategy = { name: string; weights: Weights; vaultMix: VaultMix }

/** The user's chosen strategy for the agents, or null when no pool is active. */
export async function activeStrategy(user: string): Promise<Strategy | null> {
  const s = await loadPools(user)
  const p = s.pools.find((x) => x.id === s.activeId)
  return p ? { name: p.name, weights: p.weights, vaultMix: vaultMix(p.weights) } : null
}
