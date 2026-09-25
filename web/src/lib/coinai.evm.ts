import {
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  type ContractRunner,
} from 'ethers'
import { FLARE_RPC_URL, FXRP_ADDRESS, COINAI_ADDRESS, FLARE_CHAIN_ID, VAULT_ADAPTER, SPARKDEX_ROUTER } from '@/lib/config'
import { ensureFxrpAllowance, getBrowserSigner } from '@/lib/fxrp'
import type { CoinAIAccount, CoinAIService, YieldTarget } from '@/lib/types'

const COINAI_ABI = [
  'function accountOf(address user) view returns ((uint16 splitBps,uint128 spend,uint128 shares,uint64 lockUntil,uint8 yieldTarget))',
  'function pay(address from,address to,uint256 amount)',
  'function withdrawSpend(address user,uint256 amount) returns (uint256)',
  'function withdrawSavings(address user,uint256 shares) returns (uint256)',
  'function setSplit(address user,uint16 bps)',
  'function setLock(address user,uint64 until)',
  'function setYieldTarget(address user,uint8 target)',
  'function withdrawSavingsToAdapter(uint256 shares,address tokenIn,address tokenOut,address adapter,uint256 amountOutMin,uint256 deadline) returns (uint256)',
  'error InvalidAddress()',
  'error InvalidAmount()',
  'error InvalidBps()',
  'error InsufficientSpendable()',
  'error InsufficientShares()',
  'error LockActive()',
  'error LockCannotShrink()',
  'error EmptyWithdrawal()',
  'error LockTooLong()',
  'error SavingsNotZero()',
  'error Unauthorized()',
] as const

const ERROR_CODES: Record<string, number> = {
  InvalidAddress: 10,
  InvalidAmount: 1,
  InvalidBps: 2,
  InsufficientSpendable: 3,
  InsufficientShares: 4,
  LockActive: 5,
  LockCannotShrink: 6,
  EmptyWithdrawal: 7,
  LockTooLong: 8,
  SavingsNotZero: 9,
  Unauthorized: 11,
}

const iface = new Interface(COINAI_ABI)

// Flare yield target mapping: SparkDEX=0, Firelight=1, Upshift=2
function toYieldTarget(index: bigint): YieldTarget {
  if (index === 0n) return 'sparkdex'
  if (index === 2n) return 'upshift'
  return 'firelight'
}

function fromYieldTarget(target: YieldTarget): number {
  if (target === 'sparkdex') return 0
  if (target === 'upshift') return 2
  return 1 // firelight
}

function reader(): Contract {
  return new Contract(COINAI_ADDRESS, COINAI_ABI, new JsonRpcProvider(FLARE_RPC_URL))
}

import { getEthersSigner } from '@/lib/ethers-wagmi'

async function signerContract(): Promise<Contract> {
  const signer = await getEthersSigner()
  const network = await signer.provider.getNetwork()
  if (network.chainId !== BigInt(FLARE_CHAIN_ID)) {
    throw new Error(`Wrong network: please connect to Coston2`)
  }
  return new Contract(COINAI_ADDRESS, COINAI_ABI, signer as ContractRunner)
}

function asLegacyContractError(error: unknown): Error | null {
  try {
    const e = error as { data?: string; info?: { error?: { data?: string } }; shortMessage?: string }
    const data = e.data ?? e.info?.error?.data
    if (typeof data === 'string') {
      const parsed = iface.parseError(data)
      const code = parsed ? ERROR_CODES[parsed.name] : undefined
      if (code) return new Error(`Error(Contract, #${code})`)
    }
    const msg = e.shortMessage ?? String(error)
    const hit = Object.entries(ERROR_CODES).find(([name]) => msg.includes(name))
    if (hit) return new Error(`Error(Contract, #${hit[1]})`)
    return null
  } catch {
    return null
  }
}

async function sendTx(txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>): Promise<string> {
  try {
    const tx = await txPromise
    await tx.wait()
    return tx.hash
  } catch (error) {
    throw asLegacyContractError(error) ?? error
  }
}

export const coinaiEvm: CoinAIService = {
  async getAccount(user: string): Promise<CoinAIAccount> {
    const contract = reader()
    const acc = await contract.accountOf(user)
    const rawTarget = BigInt(acc.yieldTarget)
    const spend = BigInt(acc.spend)
    const shares = BigInt(acc.shares)
    const splitBps = Number(acc.splitBps)
    // Uninitialized account: yieldTarget=0, spend=0, shares=0, splitBps=2000 (default)
    // Default to 'firelight' instead of 'sparkdex' (which has no valid tokenOut on testnet)
    const yieldTarget = (rawTarget === 0n && spend === 0n && shares === 0n && splitBps === 2000)
      ? 'firelight' as const
      : toYieldTarget(rawTarget)
    return { splitBps, spend, shares, lockUntil: BigInt(acc.lockUntil), yieldTarget }
  },

  async pay(from: string, to: string, amount: bigint) {
    const signer = await getBrowserSigner()
    await ensureFxrpAllowance(from, amount, signer)
    const c = new Contract(COINAI_ADDRESS, COINAI_ABI, signer as ContractRunner)
    const hash = await sendTx(c.pay(from, to, amount, { gasLimit: 300_000 }))
    return { hash }
  },

  async withdrawSpend(user: string, amount: bigint) {
    const c = await signerContract()
    const hash = await sendTx(c.withdrawSpend(user, amount, { gasLimit: 200_000 }))
    return { hash }
  },

  async withdrawSavings(user: string, shares: bigint) {
    const c = await signerContract()
    let amount = shares
    try {
      amount = BigInt(await c.withdrawSavings.staticCall(user, shares))
    } catch (error) {
      throw asLegacyContractError(error) ?? error
    }
    const hash = await sendTx(c.withdrawSavings(user, shares, { gasLimit: 300_000 }))
    return { amount, hash }
  },

  async setSplit(user: string, bps: number) {
    const c = await signerContract()
    const hash = await sendTx(c.setSplit(user, bps, { gasLimit: 200_000 }))
    return { hash }
  },

  async setLock(user: string, until: bigint) {
    const c = await signerContract()
    const hash = await sendTx(c.setLock(user, until, { gasLimit: 200_000 }))
    return { hash }
  },

  async setYieldTarget(user: string, target: YieldTarget) {
    const c = await signerContract()
    const hash = await sendTx(c.setYieldTarget(user, fromYieldTarget(target), { gasLimit: 200_000 }))
    return { hash }
  },

  async withdrawSavingsToAdapter(
    _user: string,
    shares: bigint,
    tokenOut: string,
    adapter: string,
    amountOutMin: bigint,
    deadline: bigint,
  ) {
    const c = await signerContract()
    let amountOut = 0n
    try {
      amountOut = BigInt(
        await c.withdrawSavingsToAdapter.staticCall(
          shares,
          FXRP_ADDRESS,
          tokenOut,
          adapter,
          amountOutMin,
          deadline,
        ),
      )
    } catch (error) {
      throw asLegacyContractError(error) ?? error
    }
    const hash = await sendTx(
      c.withdrawSavingsToAdapter(shares, FXRP_ADDRESS, tokenOut, adapter, amountOutMin, deadline, { gasLimit: 1_000_000 }),
    )
    return { amountIn: shares, amountOut, hash }
  },

  async depositYieldDirect(
    amount: bigint,
    tokenOut: string,
    adapter: string,
    amountOutMin: bigint,
    deadline: bigint,
  ) {
    let safeTokenOut: string
    try {
      safeTokenOut = getAddress(tokenOut)
    } catch {
      safeTokenOut = getAddress(tokenOut.toLowerCase())
    }

    const signer = await getBrowserSigner()
    const user = await (signer as any).getAddress()

    const network = await signer.provider.getNetwork()
    if (network.chainId !== BigInt(FLARE_CHAIN_ID)) {
      throw new Error(`Wrong network: please connect to Flare Coston2`)
    }

    if (adapter === VAULT_ADAPTER) {
      const vaultInterface = new Interface([
        'function deposit(uint256 assets, address receiver) external returns (uint256)',
      ])
      const vaultContract = new Contract(safeTokenOut, vaultInterface, signer as ContractRunner)

      await ensureFxrpAllowance(user, amount, signer, safeTokenOut)

      let amountOut = 0n
      try {
        amountOut = await vaultContract.deposit.staticCall(amount, user)
      } catch (staticErr: any) {
        const msg = staticErr?.shortMessage ?? staticErr?.message ?? String(staticErr)
        if (/maxDeposit|max deposit/i.test(msg)) {
          throw new Error('This vault is not accepting deposits right now.')
        }
        if (/allowance/i.test(msg)) {
          throw new Error('Token approval failed. Please try again.')
        }
        throw new Error('Vault deposit failed: ' + msg.slice(0, 120))
      }
      const hash = await sendTx(vaultContract.deposit(amount, user, { gasLimit: 500_000 }))
      return { amountIn: amount, amountOut, hash }
    } else {
      const routerAddress = SPARKDEX_ROUTER

      const provider = new JsonRpcProvider(FLARE_RPC_URL)
      const code = await provider.getCode(safeTokenOut)
      if (code === '0x') {
        throw new Error('This yield source is not available on the testnet right now.')
      }

      await ensureFxrpAllowance(user, amount, signer, routerAddress)
      const routerInterface = new Interface([
        'function exactInputSingle(tuple(address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) external returns (uint256)'
      ])
      const router = new Contract(routerAddress, routerInterface, signer as ContractRunner)
      const params = {
        tokenIn: FXRP_ADDRESS,
        tokenOut: safeTokenOut,
        fee: 3000n,
        recipient: user,
        deadline,
        amountIn: amount,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n
      }
      let amountOut = 0n
      try {
        amountOut = await router.exactInputSingle.staticCall(params)
      } catch {
        throw new Error('This yield source is not available on the testnet right now.')
      }
      const hash = await sendTx(router.exactInputSingle(params, { gasLimit: 500_000 }))
      return { amountIn: amount, amountOut, hash }
    }
  },
}
