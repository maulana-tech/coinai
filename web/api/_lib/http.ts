import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAddress, verifyMessage } from 'ethers'
import { env } from './chain.js'

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function body<T>(req: Request): Promise<Partial<T>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Partial<T>
}

// ─── Wallet login → short-lived session token ───────────────────────────────
// The frontend signs loginMessage() with personal_sign; we return an HMAC token so
// chat/subscribe calls don't need a signature each time.

const TOKEN_TTL = 7 * 24 * 3600 // a week, so returning users aren't asked to sign again every day
const LOGIN_MAX_AGE = 10 * 60

export const loginMessage = (address: string, issuedAt: number) =>
  `coinAI login\naddress: ${address.toLowerCase()}\nissued: ${issuedAt}`

const mac = (payload: string) => createHmac('sha256', env('SESSION_SECRET')).update(payload).digest('base64url')

export function login(address: string, issuedAt: number, signature: string): string {
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > LOGIN_MAX_AGE) throw new Error('login expired')
  const user = getAddress(address)
  if (getAddress(verifyMessage(loginMessage(user, issuedAt), signature)) !== user) throw new Error('bad signature')
  const payload = `${user}.${now + TOKEN_TTL}`
  return `${payload}.${mac(payload)}`
}

/** Returns the checksummed address for a valid token, otherwise null. */
export function userFromToken(token: unknown): string | null {
  if (typeof token !== 'string') return null
  const [user, exp, sig] = token.split('.')
  if (!user || !exp || !sig || Number(exp) < Date.now() / 1000) return null
  const expected = Buffer.from(mac(`${user}.${exp}`))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? user : null
}

export function bearer(req: Request): string | null {
  return userFromToken(req.headers.get('authorization')?.replace(/^Bearer /, ''))
}
