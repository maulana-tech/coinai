import type { MessageKey } from '@/lib/i18n'

const CONTRACT_ERROR_KEYS: Record<number, MessageKey> = {
  1: 'errors.invalidAmount',
  2: 'errors.invalidSplit',
  3: 'errors.insufficientSpendable',
  4: 'errors.insufficientShares',
  5: 'errors.savingsLocked',
  6: 'errors.lockNotExtended',
  7: 'errors.emptyWithdrawal',
  8: 'errors.lockTooFar',
  9: 'errors.switchTargetWithBalance',
  1000: 'errors.paused',
}

// wallet kit rejects with plain { code, message } objects, not Error instances
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const message = (e as { message: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Something went wrong'
}

export function errorKey(e: unknown): MessageKey {
  const text = `${String(e)} ${errorMessage(e)}`
  const contract = /Error\(Contract, #(\d+)\)/.exec(text)
  if (contract) return CONTRACT_ERROR_KEYS[Number(contract[1])] ?? 'errors.generic'
  if (text.includes('faucet_unavailable')) return 'errors.faucetUnavailable'
  if (text.includes('faucet_maybe_funded')) return 'errors.faucetAlreadyFunded'
  if (text.includes('wallet_not_found')) return 'common.connectFirst'
  if (text.includes('wallet_timeout')) return 'errors.walletTimeout'
  if (/reject|declin|denied|closed/i.test(text)) return 'errors.walletCancelled'
  if (/wrong network|coston2/i.test(text)) return 'errors.wrongNetwork'
  if (/vault.*not accepting|maxDeposit|not accepting deposits/i.test(text)) return 'errors.vaultNotAccepting'
  if (/insufficient allowance|allowance/i.test(text)) return 'errors.insufficientAllowance'
  if (/CALL_EXCEPTION|execution reverted|transaction.*reverted/i.test(text)) return 'errors.txReverted'
  if (/Unauthorized/i.test(text)) return 'errors.unauthorized'
  return 'errors.generic'
}
