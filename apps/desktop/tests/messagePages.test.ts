import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prependOlderMessages } from '../src/renderer/src/chat/messagePages'
import type { ChatMessage } from '../src/renderer/src/chat/pendingMessages'

function message(id: string): ChatMessage {
  return { id, role: 'user', content: `消息 ${id}`, createdAt: '2026-10-28T08:00:00.000Z' }
}

test('puts older messages before the current list', () => {
  const merged = prependOlderMessages([message('5'), message('6')], [message('3'), message('4')])

  assert.deepEqual(
    merged.map((item) => item.id),
    ['3', '4', '5', '6']
  )
})

test('drops duplicates that are already in the current list', () => {
  const merged = prependOlderMessages([message('4'), message('5')], [message('3'), message('4')])

  assert.deepEqual(
    merged.map((item) => item.id),
    ['3', '4', '5']
  )
})

test('keeps the current list untouched when there is nothing older', () => {
  const current = [message('5'), message('6')]

  assert.deepEqual(prependOlderMessages(current, []), current)
})

test('dedupes within the older page as well', () => {
  const merged = prependOlderMessages([], [message('1'), message('1')])

  assert.deepEqual(
    merged.map((item) => item.id),
    ['1']
  )
})
