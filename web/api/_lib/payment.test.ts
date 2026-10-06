// Run: npx tsx --test api/_lib/payment.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAYMENT_ROUTED, paymentFromLogs } from './chain.ts'

const COINAI = '0xdA174816F66E30eBB3a002bcf5a71AD00037eBD9'
const PAYER = '0x1111111111111111111111111111111111111111'
const SHOP = '0x2222222222222222222222222222222222222222'
const routed = (address: string) => {
  const ev = PAYMENT_ROUTED.getEvent('PaymentRouted')!
  const { topics, data } = PAYMENT_ROUTED.encodeEventLog(ev, [PAYER, SHOP, 10_000_000n, 8_000_000n, 2_000_000n, 1])
  return { address, topics, data }
}
// e.g. the tUSDT Transfer that sits next to it in the same receipt
const transfer = { address: '0x49eD8CC30FC55Ed36e976285d98eF00F213C31E2', topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'], data: '0x' }

test('reads the CoinAI payment out of a receipt', () => {
  assert.deepEqual(paymentFromLogs([transfer, routed(COINAI.toLowerCase())], COINAI), { from: PAYER, to: SHOP, amount: 10_000_000n, saved: 2_000_000n })
})

test('ignores the same event from any other contract', () => {
  assert.equal(paymentFromLogs([routed('0x3333333333333333333333333333333333333333')], COINAI), null)
  assert.equal(paymentFromLogs([transfer], COINAI), null)
})
