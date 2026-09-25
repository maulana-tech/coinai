import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

const flareCoston2 = {
  id: 114,
  name: 'Flare Coston2',
  nativeCurrency: { name: 'Flare', symbol: 'C2FLR', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_FLARE_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc'] },
    public: { http: [import.meta.env.VITE_FLARE_RPC_URL || 'https://coston2-api.flare.network/ext/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Coston2 Explorer', url: 'https://coston2-explorer.flare.network' },
  },
  testnet: true,
} as const

export const config = createConfig({
  chains: [flareCoston2],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [flareCoston2.id]: http(flareCoston2.rpcUrls.default.http[0]),
  },
})
