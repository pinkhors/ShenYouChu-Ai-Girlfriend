import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createPendingUserMessage,
  newestMessageId,
  reconcilePending,
  toDisplayMessage,
  type ChatMessage
} from '../src/renderer/src/chat/pendingMessages'

function serverMessage(id: string, content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id, role, content, createdAt: '2026-10-28T08:00:00.000Z' }
}

test('creates a pending message with a unique local id and iso timestamp', () => {
  const first = createPendingUserMessage('你好', null)
  const second = createPendingUserMessage('你好', '100')

  assert.notEqual(first.localId, second.localId)
  assert.equal(first.content, '你好')
  assert.equal(first.anchorId, null)
  assert.equal(second.anchorId, '100')
  assert.ok(!Number.isNaN(Date.parse(first.createdAt)))
})

test('newestMessageId ignores order and tolerates non-numeric ids', () => {
  assert.equal(newestMessageId([]), null)
  assert.equal(newestMessageId([serverMessage('100', 'a'), serverMessage('300', 'b'), serverMessage('200', 'c')]), '300')
  assert.equal(newestMessageId([serverMessage('legacy-a', 'a'), serverMessage('legacy-b', 'b')]), 'legacy-b')
})

test('drops the pending message once the server returns it', () => {
  const pending = createPendingUserMessage('今天好累', '100')
  const remaining = reconcilePending([pending], [serverMessage('100', '旧消息'), serverMessage('101', '今天好累')])

  assert.deepEqual(remaining, [])
})

test('keeps the pending message when only an older identical message exists', () => {
  const pending = createPendingUserMessage('你好', '100')
  const remaining = reconcilePending([pending], [serverMessage('50', '你好'), serverMessage('100', '旧消息')])

  assert.equal(remaining.length, 1)
  assert.equal(remaining[0]?.localId, pending.localId)
})

test('pairs duplicate contents in order and keeps the unmatched one', () => {
  const first = createPendingUserMessage('在吗', '100')
  const second = createPendingUserMessage('在吗', '100')
  const remaining = reconcilePending([first, second], [serverMessage('101', '在吗')])

  assert.deepEqual(
    remaining.map((item) => item.localId),
    [second.localId]
  )
})

test('keeps pending messages that the server page has not reached yet', () => {
  const pending = createPendingUserMessage('晚安', '100')
  const remaining = reconcilePending([pending], [serverMessage('100', '旧消息'), serverMessage('101', '晚安', 'assistant')])

  assert.equal(remaining.length, 1)
})

test('toDisplayMessage keeps the local key for a stable render', () => {
  const pending = createPendingUserMessage('晚安', null)
  const display = toDisplayMessage(pending)

  assert.equal(display.id, pending.localId)
  assert.equal(display.role, 'user')
  assert.equal(display.content, '晚安')
  assert.equal(display.createdAt, pending.createdAt)
})
