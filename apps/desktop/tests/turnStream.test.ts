import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TurnStreamParser, type TurnStreamHandlers } from '../src/renderer/src/api/turnStream'

function recorder(): { events: string[]; handlers: TurnStreamHandlers } {
  const events: string[] = []
  return {
    events,
    handlers: {
      onStarted: (turnId) => events.push(`started:${turnId}`),
      onDelta: (delta) => events.push(`delta:${delta}`),
      onCompleted: (turnId, messageId) => events.push(`completed:${turnId}:${messageId}`),
      onFailed: (code, message) => events.push(`failed:${code}:${message}`)
    }
  }
}

test('handles one frame split across chunks', () => {
  const { events, handlers } = recorder()
  const parser = new TurnStreamParser(handlers)

  parser.push('event: turn.started\nda')
  parser.push('ta: {"turnId":"t1"}\n\n')

  assert.deepEqual(events, ['started:t1'])
  assert.equal(parser.pending(), '')
})

test('handles multiple frames in one chunk', () => {
  const { events, handlers } = recorder()
  const parser = new TurnStreamParser(handlers)

  parser.push(
    'event: turn.started\ndata: {"turnId":"t1"}\n\n' +
      'event: assistant.text.delta\ndata: {"delta":"你好"}\n\n' +
      'event: turn.completed\ndata: {"turnId":"t1","messageId":"m1"}\n\n'
  )

  assert.deepEqual(events, ['started:t1', 'delta:你好', 'completed:t1:m1'])
})

test('keeps trailing partial frame pending', () => {
  const { events, handlers } = recorder()
  const parser = new TurnStreamParser(handlers)

  parser.push('event: turn.started\ndata: {"turnId":"t1"}\n\nevent: assistant.text.delta\ndata: {"del')

  assert.deepEqual(events, ['started:t1'])
  assert.equal(parser.pending(), 'event: assistant.text.delta\ndata: {"del')
})

test('ignores unknown events and invalid json', () => {
  const { events, handlers } = recorder()
  const parser = new TurnStreamParser(handlers)

  parser.push('event: unknown\ndata: {"x":1}\n\n')
  parser.push('event: assistant.text.delta\ndata: not-json\n\n')
  parser.push('event: assistant.text.delta\ndata: {"delta":"ok"}\n\n')

  assert.deepEqual(events, ['delta:ok'])
})

test('surfaces turn.failed so the client can show the failure', () => {
  const { events, handlers } = recorder()
  const parser = new TurnStreamParser(handlers)

  parser.push(
    'event: turn.failed\ndata: {"code":"INTERNAL_ERROR","message":"本轮回复失败，请重试"}\n\n'
  )

  assert.deepEqual(events, ['failed:INTERNAL_ERROR:本轮回复失败，请重试'])
})