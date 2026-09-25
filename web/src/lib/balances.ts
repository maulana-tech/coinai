import { JsonRpcProvider } from 'ethers'
import { RPC_URL } from '@/lib/config'

export async function getNativeBalance(address: string): Promise<bigint> {
  const provider = new JsonRpcProvider(RPC_URL)
  return provider.getBalance(address)
}
