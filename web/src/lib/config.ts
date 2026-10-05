import { DEPLOYMENT } from '../../shared/deployment.js'
import { CALL_RPC, LOGS_RPC, rpcProvider } from '../../shared/rpc.js'

// BNB Smart Chain Testnet configuration
export const CHAIN_ID = 97
// publicnode serves eth_getLogs (≤50k blocks) with CORS; the data-seed-prebsc RPCs reject getLogs entirely.
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL ?? 'https://testnet.bscscan.com'
// Zalalena needs only an address + captcha: no mainnet balance or account (the official one requires 0.002 BNB on mainnet)
// Shared read-only providers (see shared/rpc.ts): contract/balance reads on the BNB Chain RPC,
// event history (getLogs) on publicnode, the only public node that serves it.
export const readProvider = rpcProvider(import.meta.env.VITE_CALL_RPC_URL ?? CALL_RPC)
export const logsProvider = rpcProvider(import.meta.env.VITE_RPC_URL ?? LOGS_RPC)
export const TBNB_FAUCET_URL = 'https://faucet.zalalena.com/bsc'

// Contract addresses default to the live deployment (shared/deployment.ts). An explicitly empty
// VITE_COINAI_ADDRESS switches to mock mode. Vault addresses are read from CoinAI.vaultOf().
export const COINAI_ADDRESS: string = import.meta.env.VITE_COINAI_ADDRESS ?? DEPLOYMENT.coinai
export const TOKEN_ADDRESS: string =
  import.meta.env.VITE_TOKEN_ADDRESS ?? import.meta.env.VITE_USDT_ADDRESS ?? DEPLOYMENT.token
// Public address of the backend agent wallet (AGENT_PRIVATE_KEY); users authorize it via setAgent.
// Empty in mock mode (no tBNB deposits there).
export const DEPOSIT_ROUTER_ADDRESS: string =
  import.meta.env.VITE_DEPOSIT_ROUTER_ADDRESS ?? (COINAI_ADDRESS === '' ? '' : DEPLOYMENT.depositRouter)
export const AGENT_ADDRESS: string = import.meta.env.VITE_AGENT_ADDRESS ?? ''
// Block CoinAI was deployed at; activity history is scanned from here.
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
