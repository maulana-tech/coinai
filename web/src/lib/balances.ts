import { JsonRpcProvider } from 'ethers'
import { FLARE_RPC_URL } from '@/lib/config'

export async function getNativeBalance(address: string): Promise<bigint> {
  const provider = new JsonRpcProvider(FLARE_RPC_URL)
  return provider.getBalance(address)
}
