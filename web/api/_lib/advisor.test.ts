// Run: npx tsx --test api/_lib/advisor.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plainText } from './advisor.ts'

test('strips markdown the models add', () => {
  assert.equal(plainText('Patokan di-set ke **Pool 1 Agresif**.\n- Konservatif 10%\n## Catatan\nok •'), 'Patokan di-set ke Pool 1 Agresif.\n• Konservatif 10%\nCatatan\nok')
})
