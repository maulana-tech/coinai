import { TOKEN_SCALE } from '@/lib/token'

export function parseToken(input: string): bigint {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) throw new Error('Invalid amount')
  const [whole, frac = ''] = trimmed.split('.')
  return BigInt(whole) * TOKEN_SCALE + BigInt(frac.padEnd(6, '0'))
}

// plain decimal string that parseToken accepts, for prefilling inputs
export function tokenToInput(amount: bigint): string {
  const whole = (amount / TOKEN_SCALE).toString()
  const frac = (amount % TOKEN_SCALE).toString().padStart(6, '0').replace(/0+$/, '')
  return frac === '' ? whole : `${whole}.${frac}`
}

export function tokenToNumber(amount: bigint): number {
  return Number(amount) / Number(TOKEN_SCALE)
}

// Legacy aliases
export const parseUsdc = parseToken
export const usdcToNumber = tokenToNumber

// truncates a hex string (tx hash, address) for compact display: abcd1234...wxyz9876
export function shortHex(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-6)}`
}
