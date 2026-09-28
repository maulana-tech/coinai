import { JsonRpcProvider } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'

// BNB Smart Chain Testnet configuration
export const CHAIN_ID = 97
// publicnode serves eth_getLogs (≤50k blocks) with CORS; the data-seed-prebsc RPCs reject getLogs entirely.
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL ?? 'https://testnet.bscscan.com'
// Zalalena needs only an address + captcha: no mainnet balance or account (the official one requires 0.002 BNB on mainnet)
// Shared read-only provider. batchMaxCount 1: publicnode answers JSON-RPC batches very slowly
// (~10s for 3 calls vs ~0.25s sent individually), which made vault and balance reads crawl.
export const readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 })
export const TBNB_FAUCET_URL = 'https://faucet.zalalena.com/bsc'

// Contract addresses default to the live deployment (shared/deployment.ts). An explicitly empty
// VITE_COINAI_ADDRESS switches to mock mode. Vault addresses are read from CoinAI.vaultOf().
export const COINAI_ADDRESS: string = import.meta.env.VITE_COINAI_ADDRESS ?? DEPLOYMENT.coinai
export const TOKEN_ADDRESS: string =
  import.meta.env.VITE_TOKEN_ADDRESS ?? import.meta.env.VITE_USDT_ADDRESS ?? DEPLOYMENT.token
// Public address of the backend agent wallet (AGENT_PRIVATE_KEY); users authorize it via setAgent.
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
