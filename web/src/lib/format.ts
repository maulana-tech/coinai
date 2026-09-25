import { FXRP_SCALE } from '@/lib/fxrp'

export function parseFxrp(input: string): bigint {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) throw new Error('Invalid amount')
  const [whole, frac = ''] = trimmed.split('.')
  return BigInt(whole) * FXRP_SCALE + BigInt(frac.padEnd(6, '0'))
}

// plain decimal string that parseFxrp accepts, for prefilling inputs
export function fxrpToInput(amount: bigint): string {
  const whole = (amount / FXRP_SCALE).toString()
  const frac = (amount % FXRP_SCALE).toString().padStart(6, '0').replace(/0+$/, '')
  return frac === '' ? whole : `${whole}.${frac}`
}

export function fxrpToNumber(amount: bigint): number {
  return Number(amount) / Number(FXRP_SCALE)
}

// Legacy aliases
export const parseUsdc = parseFxrp
export const usdcToNumber = fxrpToNumber

// truncates a hex string (tx hash, address) for compact display: abcd1234...wxyz9876
export function shortHex(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}...${value.slice(-6)}`
}
