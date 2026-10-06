// Run: npx tsx --test api/_lib/invoices.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { covers, parseInvoiceInput, requiredUnits } from './invoices.ts'
import { receiptText } from './receipts.ts'

test('merchant input is validated and normalized', () => {
  assert.deepEqual(parseInvoiceInput({ memo: '  Kopi  susu ', amount: '25000.4', reference: 'INV-7' }), {
    currency: 'IDR',
    amount: 25000,
    memo: 'Kopi susu',
    name: '',
    reference: 'INV-7',
  })
  assert.equal(parseInvoiceInput({ memo: 'x', amount: 12.345, currency: 'USDT' }).amount, 12.35)
  assert.throws(() => parseInvoiceInput({ memo: '', amount: 5000 }), /memo_required/)
  assert.throws(() => parseInvoiceInput({ memo: 'x', amount: 500 }), /amount_too_small/)
  assert.throws(() => parseInvoiceInput({ memo: 'x', amount: 'abc' }), /invalid_amount/)
  assert.throws(() => parseInvoiceInput({ memo: 'x', amount: -1, currency: 'USDT' }), /invalid_amount/)
})

test('rupiah converts at the rate, rounded up to the cent', () => {
  assert.equal(requiredUnits({ currency: 'IDR', amount: 163_000 }, 16_300), 10_000_000n) // exactly 10 tUSDT
  assert.equal(requiredUnits({ currency: 'IDR', amount: 25_000 }, 16_300), 1_540_000n) // 1.5337… → 1.54
  assert.equal(requiredUnits({ currency: 'USDT', amount: 7.5 }, 0), 7_500_000n)
})

test('a payment covers the invoice; rupiah allows the 2% rate slack, tUSDT none', () => {
  const idr = { currency: 'IDR' as const, amount: 163_000 }
  assert.equal(covers(idr, 10_000_000n, 16_300), true)
  assert.equal(covers(idr, 9_800_000n, 16_300), true) // payer's rate 2% off
  assert.equal(covers(idr, 9_700_000n, 16_300), false)
  const usdt = { currency: 'USDT' as const, amount: 7.5 }
  assert.equal(covers(usdt, 7_500_000n, 0), true)
  assert.equal(covers(usdt, 7_490_000n, 0), false)
})

test('receipt names the payment, the invoice and what was saved, in the recipient language', () => {
  const p = { txHash: '0x' + 'ab'.repeat(32), from: '0x1234567890abcdef1234567890abcdef12345678', to: '0x0', amount: 10_000_000n, saved: 2_000_000n, at: 0 }
  const inv = { memo: 'Kopi susu', reference: 'INV-7', currency: 'IDR' as const, amount: 163_000 } as Parameters<typeof receiptText>[2]
  const id = receiptText(p, 'id', inv)
  assert.match(id, /Pembayaran masuk: 10\.00 tUSDT dari 0x1234…5678/)
  assert.match(id, /Invoice lunas: “Kopi susu” \(#INV-7\), Rp163\.000/)
  assert.match(id, /2\.00 tUSDT otomatis masuk tabungan/)
  assert.match(receiptText({ ...p, saved: 0n }, 'en'), /^Payment received: 10\.00 tUSDT[^\n]*\nhttps:\/\/testnet\.bscscan\.com\/tx\//)
})
