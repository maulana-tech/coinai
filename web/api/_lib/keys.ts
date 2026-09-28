// Bring-your-own OpenRouter keys, per wallet. Stored AES-256-GCM encrypted in KV (key derived
// from SESSION_SECRET) because the daily cron and Telegram need them without the browser.
// Only a masked tail ever goes back to the client.

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { env } from './chain.js'
import { kv } from './kv.js'

export const MAX_KEYS = 10
type Stored = { id: string; enc: string; tail: string; addedAt: number }
export type MaskedKey = { id: string; tail: string; addedAt: number }

const keysKey = (user: string) => `llmkeys:${user.toLowerCase()}`
const secret = () => createHash('sha256').update(`byok:${env('SESSION_SECRET')}`).digest()

function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url')
}

function decrypt(enc: string): string | null {
  try {
    const raw = Buffer.from(enc, 'base64url')
    const d = createDecipheriv('aes-256-gcm', secret(), raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null // SESSION_SECRET rotated: the key is unreadable, the user re-adds it
  }
}

const load = async (user: string) => (await kv.get<Stored[]>(keysKey(user)).catch(() => null)) ?? []
const mask = (s: Stored[]): MaskedKey[] => s.map(({ id, tail, addedAt }) => ({ id, tail, addedAt }))

export async function listKeys(user: string): Promise<MaskedKey[]> {
  return mask(await load(user))
}

/** Plaintext keys for server-side LLM calls only. */
export async function userKeys(user: string): Promise<string[]> {
  return (await load(user)).map((k) => decrypt(k.enc)).filter((k): k is string => !!k)
}

export async function addKey(user: string, key: string): Promise<MaskedKey[]> {
  const stored = await load(user)
  if (stored.length >= MAX_KEYS) throw new Error('too_many_keys')
  if ((await userKeys(user)).includes(key)) throw new Error('duplicate_key')
  stored.push({ id: randomUUID(), enc: encrypt(key), tail: key.slice(-4), addedAt: Date.now() })
  await kv.set(keysKey(user), stored)
  return mask(stored)
}

export async function removeKey(user: string, id: string): Promise<MaskedKey[]> {
  const stored = (await load(user)).filter((k) => k.id !== id)
  await kv.set(keysKey(user), stored)
  return mask(stored)
}

/** Asks OpenRouter whether the key is real before storing it (free, no tokens spent). */
export async function verifyKey(key: string): Promise<boolean> {
  const res = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  return res?.ok === true
}
