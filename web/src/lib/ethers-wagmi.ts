import { BrowserProvider, JsonRpcSigner } from 'ethers'
import type { Account, Chain, Client, Transport } from 'viem'
import { getAccount, getConnectorClient, switchChain } from '@wagmi/core'
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

// Asks the wallet to switch to (or add) BSC Testnet before signing. The account's chainId is read
// instead of client.chain: on a chain wagmi isn't configured for (e.g. BSC mainnet) client.chain is
// undefined, which used to crash with "Cannot read properties of undefined (reading 'id')".
export async function getEthersSigner() {
  if (getAccount(config).chainId !== CHAIN_ID) await switchChain(config, { chainId: CHAIN_ID })
  return clientToSigner(await getConnectorClient(config, { chainId: CHAIN_ID }))
}
