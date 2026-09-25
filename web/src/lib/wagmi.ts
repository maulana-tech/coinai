import { createConfig, http } from 'wagmi'
import { bscTestnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { RPC_URL } from '@/lib/config'

export const config = createConfig({
  chains: [bscTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [bscTestnet.id]: http(RPC_URL),
  },
})
