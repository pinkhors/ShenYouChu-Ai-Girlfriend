import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { ChatMessage, PendingUserMessage } from '../src/renderer/src/chat/pendingMessages'
import { createPendingUserMessage } from '../src/renderer/src/chat/pendingMessages'
import {
  addPendingMessage,
  clearPendingMessages,
  dropPendingMessage,
  getPendingMessages,
  reconcilePendingMessages,
  subscribePendingMessages
} from '../src/renderer/src/chat/pendingStore'

function serverMessage(id: string, content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id, role, content, createdAt: '2026-10-29T02:00:00.000Z' }
}

function localIds(messages: readonly PendingUserMessage[]): string[] {
  return messages.map((item) => item.localId)
}

beforeEach(() => {
  clearPendingMessages()
})

test('发送后切到角色页再切回：消息仍在（占位状态不随视图卸载丢失）', () => {
  const sent = createPendingUserMessage('我先说一句', '100')
  addPendingMessage('conv-1', sent)

  /* 视图卸载/挂载对 store 无影响：这里连续读取模拟多次挂载 */
  assert.deepEqual(localIds(getPendingMessages('conv-1')), [sent.localId])

  /* 切回后先按旧数据回源，服务端还没有这条消息 → 占位必须保留 */
  reconcilePendingMessages('conv-1', [serverMessage('100', '更早的一条')])
  assert.deepEqual(localIds(getPendingMessages('conv-1')), [sent.localId])
})

test('回复返回前反复切换角色/记忆页：占位消息始终可见', () => {
  const sent = createPendingUserMessage('反复切换也别丢', '200')
  addPendingMessage('conv-2', sent)

  for (let round = 0; round < 5; round += 1) {
    /* 每次切回都会重新拉一次消息列表，且此时回复仍未落库 */
    reconcilePendingMessages('conv-2', [serverMessage('200', '旧消息')])
    assert.deepEqual(localIds(getPendingMessages('conv-2')), [sent.localId])
  }
})

test('回复落库后由服务端消息顶替，占位移除且不重复', () => {
  const sent = createPendingUserMessage('收到回复了吗', '300')
  addPendingMessage('conv-3', sent)

  reconcilePendingMessages('conv-3', [
    serverMessage('300', '旧消息'),
    serverMessage('301', '收到回复了吗'),
    serverMessage('302', '收到啦', 'assistant')
  ])

  assert.deepEqual(getPendingMessages('conv-3'), [])
})

test('历史里出现同内容的旧消息时不会顶掉本次占位', () => {
  const sent = createPendingUserMessage('你好', '400')
  addPendingMessage('conv-4', sent)

  reconcilePendingMessages('conv-4', [serverMessage('390', '你好')])

  assert.deepEqual(localIds(getPendingMessages('conv-4')), [sent.localId])
})

test('发送失败时撤回占位消息', () => {
  const sent = createPendingUserMessage('发不出去的一句', null)
  addPendingMessage('conv-5', sent)

  dropPendingMessage('conv-5', sent.localId)

  assert.deepEqual(getPendingMessages('conv-5'), [])
})

test('不同会话的占位消息互不影响', () => {
  const first = createPendingUserMessage('会话 A', null)
  const second = createPendingUserMessage('会话 B', null)
  addPendingMessage('conv-a', first)
  addPendingMessage('conv-b', second)

  assert.deepEqual(localIds(getPendingMessages('conv-a')), [first.localId])
  assert.deepEqual(localIds(getPendingMessages('conv-b')), [second.localId])
})

test('变化时通知订阅者，取消订阅后不再通知', () => {
  let changes = 0
  const unsubscribe = subscribePendingMessages(() => {
    changes += 1
  })

  const sent = createPendingUserMessage('通知一下', null)
  addPendingMessage('conv-6', sent)
  assert.equal(changes, 1)

  reconcilePendingMessages('conv-6', [])
  assert.equal(changes, 1)

  dropPendingMessage('conv-6', sent.localId)
  assert.equal(changes, 2)

  unsubscribe()
  addPendingMessage('conv-6', createPendingUserMessage('之后不再通知', null))
  assert.equal(changes, 2)
})

test('没有变化时返回同一引用，避免 useSyncExternalStore 反复渲染', () => {
  const empty = getPendingMessages('conv-7')
  assert.equal(getPendingMessages('conv-7'), empty)

  const sent = createPendingUserMessage('快照稳定', null)
  addPendingMessage('conv-7', sent)
  const snapshot = getPendingMessages('conv-7')
  assert.equal(getPendingMessages('conv-7'), snapshot)
})
