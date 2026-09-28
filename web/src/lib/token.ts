// tUSDT (MockUSDT) utilities — 6-decimal test stablecoin on BSC Testnet, see evm/src/MockUSDT.sol

import { Contract, type ContractRunner } from 'ethers'
import { TOKEN_ADDRESS, COINAI_ADDRESS, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'

const TOKEN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function faucet()',
  'function lastFaucetAt(address) view returns (uint256)',
  'function FAUCET_AMOUNT() view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
] as const

export const TOKEN_DECIMALS = 6
export const TOKEN_SCALE = 10n ** 6n

export function tokenContract(runner?: ContractRunner): Contract {
  const provider = runner ?? readProvider
  return new Contract(TOKEN_ADDRESS, TOKEN_ABI, provider)
}

export async function getTokenBalance(address: string): Promise<bigint> {
  return tokenContract().balanceOf(address)
}

export async function getTokenAllowance(owner: string, spender: string): Promise<bigint> {
  return tokenContract().allowance(owner, spender)
}

export async function approveToken(spender: string, amount: bigint, signer: ContractRunner): Promise<string> {
  const c = tokenContract(signer)
  const tx = await c.approve(spender, amount, { gasLimit: 100_000 })
  await tx.wait()
  return tx.hash
}

export async function ensureTokenAllowance(
  owner: string,
  amount: bigint,
  signer: ContractRunner,
  spender: string = COINAI_ADDRESS
): Promise<boolean> {
  const c = tokenContract(signer)
  const current = (await c.allowance(owner, spender)) as bigint
  if (current >= amount) return false
  const tx = await c.approve(spender, amount, { gasLimit: 100_000 })
  await tx.wait()
  return true
}

export const FAUCET_COOLDOWN_SECONDS = 24 * 60 * 60

// Seconds since epoch when this address can call faucet() again (0 = now).
export async function faucetAvailableAt(address: string): Promise<number> {
  const last = Number(await tokenContract().lastFaucetAt(address))
  return last === 0 ? 0 : last + FAUCET_COOLDOWN_SECONDS
}

export async function mintTestTokens(): Promise<string> {
  const c = tokenContract(await getEthersSigner())
  const tx = await c.faucet({ gasLimit: 120_000 })
  await tx.wait()
  return tx.hash
}

export async function getBrowserSigner() {
  return getEthersSigner()
}
