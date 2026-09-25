import { BrowserProvider, JsonRpcSigner } from 'ethers'
import type { Account, Chain, Client, Transport } from 'viem'
import { getConnectorClient, switchChain } from '@wagmi/core'
import { CHAIN_ID } from '@/lib/config'
import { config } from '@/lib/wagmi'

export function clientToSigner(client: Client<Transport, Chain, Account>) {
  const { account, chain, transport } = client
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  }
  const provider = new BrowserProvider(transport, network)
  return new JsonRpcSigner(provider, account.address)
}

// Asks the wallet to switch to (or add) BSC Testnet before signing.
export async function getEthersSigner() {
  const client = await getConnectorClient(config)
  if (client.chain.id !== CHAIN_ID) {
    await switchChain(config, { chainId: CHAIN_ID })
    return clientToSigner(await getConnectorClient(config, { chainId: CHAIN_ID }))
  }
  return clientToSigner(client)
}
