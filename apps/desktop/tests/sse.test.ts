import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFrame, readPayloadField } from '../src/renderer/src/api/sse'

test('parses event and data lines', () => {
  const frame = parseFrame('event: turn.started\ndata: {"turnId":"t1"}')
  assert.deepEqual(frame, { event: 'turn.started', data: '{"turnId":"t1"}' })
})

test('defaults event to message when only data is present', () => {
  const frame = parseFrame('data: {"delta":"你好"}')
  assert.equal(frame?.event, 'message')
  assert.equal(frame?.data, '{"delta":"你好"}')
})

test('returns null for frames without data', () => {
  assert.equal(parseFrame(': keep-alive'), null)
  assert.equal(parseFrame('event: ping'), null)
})

test('joins multiple data lines', () => {
  const frame = parseFrame('event: x\ndata: line1\ndata: line2')
  assert.equal(frame?.data, 'line1\nline2')
})

test('readPayloadField extracts string field', () => {
  assert.equal(readPayloadField('{"turnId":"t1"}', 'turnId'), 't1')
  assert.equal(readPayloadField('{"turnId":123}', 'turnId'), undefined)
})

test('readPayloadField tolerates invalid json', () => {
  assert.equal(readPayloadField('not-json', 'turnId'), undefined)
})