import { DEPLOYMENT } from '../../shared/deployment.js'
import { CALL_RPC, LOGS_RPC, rpcProvider } from '../../shared/rpc.js'

// BNB Smart Chain Testnet configuration
export const CHAIN_ID = 97
// publicnode serves eth_getLogs (≤50k blocks) with CORS; the data-seed-prebsc RPCs reject getLogs entirely.
export const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://bsc-testnet-rpc.publicnode.com'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL || 'https://testnet.bscscan.com'
// Zalalena needs only an address + captcha: no mainnet balance or account (the official one requires 0.002 BNB on mainnet)
// Shared read-only providers (see shared/rpc.ts): contract/balance reads on the BNB Chain RPC,
// event history (getLogs) on publicnode, the only public node that serves it.
export const readProvider = rpcProvider(import.meta.env.VITE_CALL_RPC_URL || CALL_RPC)
export const logsProvider = rpcProvider(import.meta.env.VITE_RPC_URL || LOGS_RPC)
export const TBNB_FAUCET_URL = 'https://faucet.zalalena.com/bsc'

// The app runs on the live coinAI v2 deployment (shared/deployment.ts). Every VITE_* setting that is unset OR
// empty falls back to it (`vercel env pull` writes empty values), so nothing silently turns into fake data.
// The in-memory mock (lib/coinai.mock.ts) is opt-in only: VITE_MOCK=1. Vault addresses come from CoinAI.vaultOf().
export const MOCK = import.meta.env.VITE_MOCK === '1'
export const COINAI_ADDRESS: string = MOCK ? '' : import.meta.env.VITE_COINAI_ADDRESS || DEPLOYMENT.v2.coinai
export const TOKEN_ADDRESS: string =
  import.meta.env.VITE_TOKEN_ADDRESS || import.meta.env.VITE_USDT_ADDRESS || DEPLOYMENT.token
const live = !MOCK
// coinAI v1: read only, so users who still hold funds there can take them out (lib/legacy.ts).
export const LEGACY_COINAI_ADDRESS: string = live ? DEPLOYMENT.coinai : ''
export const AGENT_REGISTRY_ADDRESS: string = live ? DEPLOYMENT.v2.agentRegistry : ''
// Empty hides the tBNB deposit option (v1's router pays into v1; mock mode has no deposits).
export const DEPOSIT_ROUTER_ADDRESS: string =
  live ? import.meta.env.VITE_DEPOSIT_ROUTER_ADDRESS || DEPLOYMENT.v2.depositRouter : ''
// Every router that ever paid into coinAI, so the activity list can label tBNB deposits.
export const DEPOSIT_ROUTERS: string[] = [DEPOSIT_ROUTER_ADDRESS, DEPLOYMENT.depositRouter].filter(Boolean)
// Public address of the backend agent wallet (AGENT_PRIVATE_KEY); users authorize it via setAgent.
export const AGENT_ADDRESS: string = import.meta.env.VITE_AGENT_ADDRESS || DEPLOYMENT.v2.agent
// Activity history is scanned from v1's deploy block, so it still shows what happened there.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || DEPLOYMENT.deployBlock)

export const EXPLORER_CONTRACT_URL = `${EXPLORER_URL}/address/${COINAI_ADDRESS}`

// Legacy aliases (used by activity, coinai, app-shell, settings)
export const CONTRACT_ID = COINAI_ADDRESS
export const EVM_RPC_URL = RPC_URL

export function explorerTxUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`
}
