/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COINAI_ADDRESS?: string
  readonly VITE_TOKEN_ADDRESS?: string
  readonly VITE_USDT_ADDRESS?: string // alias of VITE_TOKEN_ADDRESS
  readonly VITE_DEPLOY_BLOCK?: string
  readonly VITE_AGENT_ADDRESS?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_CALL_RPC_URL?: string
  readonly VITE_DEPOSIT_ROUTER_ADDRESS?: string
  readonly VITE_EXPLORER_URL?: string
}
