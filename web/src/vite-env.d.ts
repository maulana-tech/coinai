/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHAIN_MODE?: 'evm'
  readonly VITE_COINAI_ADDRESS?: string
  readonly VITE_FLARE_RPC_URL?: string
  readonly VITE_FLARE_EXPLORER_URL?: string
  readonly VITE_SPARKDEX_ROUTER?: string
  readonly VITE_FIRELIGHT_VAULT?: string
  readonly VITE_UPSHIFT_VAULT?: string
}
