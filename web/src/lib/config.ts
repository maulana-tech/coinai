// BNB Smart Chain Testnet configuration
export const CHAIN_ID = 97
export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
export const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL ?? 'https://testnet.bscscan.com'
export const TBNB_FAUCET_URL = 'https://www.bnbchain.org/en/testnet-faucet'

// Contract addresses on BSC Testnet (see deployments.json). Empty CoinAI address = mock mode.
// Vault addresses are read from CoinAI.vaultOf(), so they aren't configured here.
export const COINAI_ADDRESS: string = import.meta.env.VITE_COINAI_ADDRESS ?? ''
export const TOKEN_ADDRESS: string = import.meta.env.VITE_TOKEN_ADDRESS ?? ''
// Public address of the backend agent wallet (AGENT_PRIVATE_KEY); users authorize it via setAgent.
export const AGENT_ADDRESS: string = import.meta.env.VITE_AGENT_ADDRESS ?? ''
// Block CoinAI was deployed at; activity history is scanned from here.
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK ?? 0)

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
