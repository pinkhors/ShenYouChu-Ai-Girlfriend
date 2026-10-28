import { test } from 'node:test'
import assert from 'node:assert/strict'
import { base64ToText, textToBase64 } from '../src/renderer/src/api/encoding'

test('textToBase64 matches Node Buffer encoding for Chinese text', () => {
  assert.equal(textToBase64('你好'), Buffer.from('你好', 'utf8').toString('base64'))
})

test('roundtrip preserves emoji and mixed text', () => {
  const original = 'a😀b沈幼楚'
  assert.equal(base64ToText(textToBase64(original)), original)
})

test('empty string encodes to empty base64', () => {
  assert.equal(textToBase64(''), '')
  assert.equal(base64ToText(''), '')
})