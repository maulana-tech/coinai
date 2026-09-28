// RPC endpoints for BSC Testnet (chain 97), shared by the app and the agent backend.
import { JsonRpcProvider } from 'ethers'

// Measured: the official BNB Chain RPC answers 20 parallel eth_calls in ~1s, publicnode takes ~10s
// (it throttles bursts). But only publicnode serves eth_getLogs, so it's kept for event history.
export const CALL_RPC = 'https://bsc-testnet-dataseed.bnbchain.org'
export const LOGS_RPC = 'https://bsc-testnet-rpc.publicnode.com'

// batchMaxCount 1: JSON-RPC batches are far slower than single requests on these public nodes.
export const rpcProvider = (url: string) => new JsonRpcProvider(url, 97, { staticNetwork: true, batchMaxCount: 1 })
