import { readProvider } from '@/lib/config'

export async function getNativeBalance(address: string): Promise<bigint> {
  return readProvider.getBalance(address)
}
