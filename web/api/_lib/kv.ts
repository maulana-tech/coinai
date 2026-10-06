// Upstash Redis over REST (no client dependency). Vercel's Upstash integration sets
// KV_REST_API_URL / KV_REST_API_TOKEN; a direct Upstash database uses UPSTASH_REDIS_REST_*.

async function cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('missing env KV_REST_API_URL / KV_REST_API_TOKEN')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(args),
  })
  const body = (await res.json()) as { result?: T; error?: string }
  if (body.error) throw new Error(`kv: ${body.error}`)
  return body.result as T
}

const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await cmd<string | null>('GET', key)
    return raw == null ? null : (JSON.parse(raw) as T)
  },
  set(key: string, value: unknown, ttlSeconds?: number) {
    const raw = JSON.stringify(value, replacer)
    return ttlSeconds ? cmd('SET', key, raw, 'EX', ttlSeconds) : cmd('SET', key, raw)
  },
  /** Sets only if the key doesn't exist yet; true when this call set it (claim-once, e.g. a tx hash). */
  async setnx(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    const raw = JSON.stringify(value, replacer)
    const args: (string | number)[] = ttlSeconds ? ['SET', key, raw, 'NX', 'EX', ttlSeconds] : ['SET', key, raw, 'NX']
    return (await cmd<string | null>(...args)) === 'OK'
  },
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return []
    const raw = await cmd<(string | null)[]>('MGET', ...keys)
    return raw.map((r) => (r == null ? null : (JSON.parse(r) as T)))
  },
  del: (key: string) => cmd('DEL', key),
  sadd: (key: string, member: string) => cmd('SADD', key, member),
  smembers: (key: string) => cmd<string[]>('SMEMBERS', key),
  async push(key: string, value: unknown, keep: number) {
    await cmd('LPUSH', key, JSON.stringify(value, replacer))
    await cmd('LTRIM', key, 0, keep - 1)
  },
  async list<T>(key: string, count: number): Promise<T[]> {
    const raw = await cmd<string[]>('LRANGE', key, 0, count - 1)
    return raw.map((r) => JSON.parse(r) as T)
  },
  /** Fixed-window counter; returns the hit count within the window. */
  async hit(key: string, windowSeconds: number): Promise<number> {
    const n = await cmd<number>('INCR', key)
    if (n === 1) await cmd('EXPIRE', key, windowSeconds)
    return n
  },
}
