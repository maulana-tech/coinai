// Flare Coston2 Testnet configuration
export const FLARE_CHAIN_ID = 114
export const FLARE_CHAIN_HEX = `0x${FLARE_CHAIN_ID.toString(16)}`
export const FLARE_RPC_URL =
  import.meta.env.VITE_FLARE_RPC_URL ?? 'https://coston2-api.flare.network/ext/C/rpc'
export const FLARE_EXPLORER_URL =
  import.meta.env.VITE_FLARE_EXPLORER_URL ?? 'https://coston2-explorer.flare.network'

// Contract addresses on Flare Coston2
export const COINAI_ADDRESS: string =
  import.meta.env.VITE_COINAI_ADDRESS ?? '0x588DeC15D915659E8BF36c01e662479916301d3A'
export const FXRP_ADDRESS: string =
  import.meta.env.VITE_FXRP_ADDRESS ?? '0x0b6A3645c240605887a5532109323A3E12273dc7' // FAssets FXRP on Coston2

// Yield protocol addresses (Flare ecosystem)
export const SPARKDEX_ROUTER: string =
  import.meta.env.VITE_SPARKDEX_ROUTER ?? '0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e'
export const SPARKDEX_ADAPTER: string =
  import.meta.env.VITE_SPARKDEX_ADAPTER ?? '0xD04A92C83AFe71f4f69F9FAD0A33229BFBdE33E6'
export const VAULT_ADAPTER: string =
  import.meta.env.VITE_VAULT_ADAPTER ?? '0x3c13BDd505DE69bB0DF0a2e68A0Cd93a44beB0b4'
export const FIRELIGHT_VAULT: string =
  import.meta.env.VITE_FIRELIGHT_VAULT ?? '0x780780D122f075ada1Fa86A18dE2e0763B2526Ec'
export const UPSHIFT_VAULT: string =
  import.meta.env.VITE_UPSHIFT_VAULT ?? '0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81'

// Output token used when routing savings through SparkDexAdapter (e.g. WFLR or USDT0)
export const YIELD_TOKEN_OUT: string =
  import.meta.env.VITE_YIELD_TOKEN_OUT ?? '0x8b322a30485C66C3fb3d052d921B6D218bE48fDD'

export const EXPLORER_CONTRACT_URL = `${FLARE_EXPLORER_URL}/address/${COINAI_ADDRESS}`

// Legacy aliases (used by activity, coinai, app-shell, settings)
export const IS_EVM = true
export const CONTRACT_ID = COINAI_ADDRESS
export const EVM_RPC_URL = FLARE_RPC_URL

export function explorerTxUrl(hash: string): string {
  return `${FLARE_EXPLORER_URL}/tx/${hash}`
}

export function explorerAddressUrl(address: string): string {
  return `${FLARE_EXPLORER_URL}/address/${address}`
}
