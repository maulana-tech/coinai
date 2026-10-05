// tBNB deposits through the DepositRouter (evm/src/DepositRouter.sol): priced by Chainlink BNB/USD,
// credited to the user's coinAI account as a payment. tUSDT deposits are plain coinai.pay(user, user).
import { Contract, type ContractRunner } from 'ethers'
import { DEPOSIT_ROUTER_ADDRESS, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'

const ROUTER_ABI = [
  'function quoteBNB(uint256 bnbIn) view returns (uint256 usdtOut, uint256 price)',
  'function depositBNB(uint256 minOut) payable returns (uint256 usdtOut)',
  'function reserve() view returns (uint256)',
  'error ZeroDeposit()',
  'error StalePrice()',
  'error Slippage()',
  'error ReserveTooLow()',
]

const router = (runner: ContractRunner = readProvider) => new Contract(DEPOSIT_ROUTER_ADDRESS, ROUTER_ABI, runner)

export async function quoteBNB(wei: bigint): Promise<{ usdtOut: bigint; price: bigint }> {
  const [usdtOut, price] = (await router().quoteBNB(wei)) as [bigint, bigint]
  return { usdtOut, price }
}

export const depositReserve = async (): Promise<bigint> => (await router().reserve()) as bigint

/** Accepts up to 1% price movement between quote and execution. */
export async function depositBNB(wei: bigint, quoted: bigint): Promise<{ hash: string }> {
  const c = router(await getEthersSigner())
  const minOut = (quoted * 99n) / 100n
  await c.depositBNB.staticCall(minOut, { value: wei }) // surface router errors before the wallet prompt
  const tx = await c.depositBNB(minOut, { value: wei, gasLimit: 300_000 })
  await tx.wait()
  return { hash: tx.hash as string }
}
