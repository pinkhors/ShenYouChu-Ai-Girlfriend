import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropHandoffMessage, handoffPendingMessages, takePendingMessages } from '../src/renderer/src/chat/pendingHandoff'
import { createPendingUserMessage } from '../src/renderer/src/chat/pendingMessages'

test('take returns the handed off messages once and then clears them', () => {
  const message = createPendingUserMessage('还没等到回复', '100')

  handoffPendingMessages('conv-1', [message])
  assert.deepEqual(takePendingMessages('conv-1'), [message])
  assert.deepEqual(takePendingMessages('conv-1'), [])
})

test('take returns an empty list for a conversation that was never handed off', () => {
  assert.deepEqual(takePendingMessages('conv-missing'), [])
})

test('conversations keep their own handoff entries', () => {
  const first = createPendingUserMessage('A', null)
  const second = createPendingUserMessage('B', null)

  handoffPendingMessages('conv-a', [first])
  handoffPendingMessages('conv-b', [second])

  assert.deepEqual(takePendingMessages('conv-b'), [second])
  assert.deepEqual(takePendingMessages('conv-a'), [first])
})

test('handing off an empty list clears the stored entry', () => {
  const message = createPendingUserMessage('已经落库', null)

  handoffPendingMessages('conv-2', [message])
  handoffPendingMessages('conv-2', [])

  assert.deepEqual(takePendingMessages('conv-2'), [])
})

test('stored messages are a copy of the handed off list', () => {
  const message = createPendingUserMessage('快照', null)
  const source = [message]

  handoffPendingMessages('conv-3', source)
  source.push(createPendingUserMessage('后加的消息', null))

  assert.deepEqual(
    takePendingMessages('conv-3').map((item) => item.localId),
    [message.localId]
  )
})

test('drops a single handed off message and keeps the others', () => {
  const failed = createPendingUserMessage('最终还是没发出去', null)
  const waiting = createPendingUserMessage('仍然待定', null)

  handoffPendingMessages('conv-4', [failed, waiting])
  dropHandoffMessage('conv-4', failed.localId)

  assert.deepEqual(
    takePendingMessages('conv-4').map((item) => item.localId),
    [waiting.localId]
  )
})

test('dropping the only message clears the entry', () => {
  const message = createPendingUserMessage('失败', null)

  handoffPendingMessages('conv-5', [message])
  dropHandoffMessage('conv-5', message.localId)

  assert.deepEqual(takePendingMessages('conv-5'), [])
  assert.deepEqual(takePendingMessages('conv-unknown'), [])
})
