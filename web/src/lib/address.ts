import { isAddress } from 'ethers'

export function isValidRecipientAddress(address: string): boolean {
  return isAddress(address)
}
