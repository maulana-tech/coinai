// Run: npx tsx --test api/_lib/llm.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LlmError, llmFailure } from './llm.ts'

test('provider statuses map to what the user can act on', () => {
  const at = (status: number) => llmFailure(new LlmError(`openrouter m ${status}: x`, false, status))
  assert.equal(at(401), 'bad_key')
  assert.equal(at(402), 'no_credit')
  assert.equal(at(403), 'no_credit')
  assert.equal(at(429), 'rate_limited')
  assert.equal(at(500), 'unavailable')
  assert.equal(at(404), 'unavailable')
})

test('timeouts, unreadable answers and anything else', () => {
  assert.equal(llmFailure(new DOMException('slow', 'TimeoutError')), 'timeout')
  assert.equal(llmFailure(new SyntaxError('Unexpected token')), 'bad_output')
  assert.equal(llmFailure(new Error('model returned no JSON')), 'bad_output')
  assert.equal(llmFailure(new Error('fetch failed')), 'unavailable')
  assert.equal(llmFailure(undefined), 'unavailable')
})
