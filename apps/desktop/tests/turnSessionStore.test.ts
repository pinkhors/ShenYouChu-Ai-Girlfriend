import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { TurnStreamHandlers } from '../src/renderer/src/api/turnStream'
import {
  createTurnSessionStore,
  type TurnStreamDeps
} from '../src/renderer/src/chat/turnSessionStore'
import { clearPendingMessages, getPendingMessages } from '../src/renderer/src/chat/pendingStore'

/**
 * 回合 store 的纯逻辑测试：注入假 stream / cancel，不触碰 fetch。
 * 这些用例与 pendingStore 的语义（占位登记 / 撤回）联动，因此每例前清空占位。
 */

interface StreamCall {
  readonly conversationId: string
  readonly text: string
  readonly handlers: TurnStreamHandlers
  readonly signal: AbortSignal
  resolve(): void
  reject(error: unknown): void
}

interface CancelledCall {
  readonly conversationId: string
  readonly turnId: string
}

interface FakeDeps {
  readonly deps: TurnStreamDeps
  readonly calls: StreamCall[]
  readonly cancelled: CancelledCall[]
}

/** 假流：可手动触发 started / delta / completed / failed，也可 resolve / reject。 */
function createFakeDeps(): FakeDeps {
  const calls: StreamCall[] = []
  const cancelled: CancelledCall[] = []
  const deps: TurnStreamDeps = {
    stream(conversationId, text, handlers, signal) {
      return new Promise<void>((resolve, reject) => {
        calls.push({ conversationId, text, handlers, signal, resolve, reject })
        signal.addEventListener('abort', () => {
          const abortError = new Error('已停止')
          abortError.name = 'AbortError'
          reject(abortError)
        })
      })
    },
    cancel(conversationId, turnId) {
      cancelled.push({ conversationId, turnId })
      return Promise.resolve()
    }
  }
  return { deps, calls, cancelled }
}

/** 让 store 内部 promise 的 then/catch 回调跑完。 */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function pendingContents(conversationId: string): string[] {
  return getPendingMessages(conversationId).map((item) => item.content)
}

const CONV = 'conv-1'

beforeEach(() => {
  clearPendingMessages()
})

test('开始回合：占位已登记、进入发送中且不提前通知结束', () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  assert.equal(store.startTurn(CONV, '在吗', '100'), true)

  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].conversationId, CONV)
  assert.equal(fake.calls[0].text, '在吗')
  assert.deepEqual(pendingContents(CONV), ['在吗'])

  const session = store.getSession(CONV)
  assert.equal(session.isSending, true)
  assert.equal(session.streamingText, '')
  assert.equal(session.turnId, null)
  assert.equal(session.error, null)
  assert.equal(session.failedText, null)
  assert.equal(settled, 0)
})

test('流式增量按顺序累积，并记录服务端 turnId', () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  store.startTurn(CONV, '讲个故事', null)

  const call = fake.calls[0]
  call.handlers.onStarted?.('turn-1')
  assert.equal(store.getSession(CONV).turnId, 'turn-1')
  call.handlers.onDelta?.('从')
  call.handlers.onDelta?.('前')
  call.handlers.onDelta?.('有')

  assert.equal(store.getSession(CONV).streamingText, '从前有')
  assert.equal(store.getSession(CONV).isSending, true)
})

test('正常完成：通知回源、保留流式文本并结束发送态', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '晚安', null)
  const call = fake.calls[0]
  call.handlers.onStarted?.('turn-2')
  call.handlers.onDelta?.('好梦')
  call.handlers.onCompleted?.('turn-2', 'message-2')

  assert.equal(settled, 1)
  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.streamingText, '好梦')
  assert.equal(session.error, null)

  /* 流随后正常 resolve：兜底收尾必须幂等，不能再次通知 */
  call.resolve()
  await flush()
  assert.equal(settled, 1)
})

test('流自行结束但没收到 turn.completed：兜底收尾，界面不会卡在发送中', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '只发了一半', null)
  fake.calls[0].handlers.onStarted?.('turn-x')
  fake.calls[0].handlers.onDelta?.('半句')
  fake.calls[0].resolve()
  await flush()

  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.error, null)
  assert.equal(session.streamingText, '半句')
  assert.equal(settled, 1)
})

test('未 started 就失败：撤回占位、写入错误、回传正文并通知回源', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '发不出去的一句', null)
  fake.calls[0].reject(new Error('网络中断'))
  await flush()

  assert.deepEqual(pendingContents(CONV), [])
  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.error, '网络中断')
  assert.equal(session.failedText, '发不出去的一句')
  assert.equal(settled, 1)
})

test('已 started 后失败：保留占位（服务端可能已落库）、不要求回填正文', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '问题', null)
  const call = fake.calls[0]
  call.handlers.onStarted?.('turn-3')
  call.handlers.onDelta?.('半句')
  call.reject(new Error('模型超时'))
  await flush()

  assert.deepEqual(pendingContents(CONV), ['问题'])
  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.error, '模型超时')
  assert.equal(session.failedText, null)
  assert.equal(session.streamingText, '半句')
  assert.equal(settled, 1)
})

test('服务端 turn.failed：即便流随后正常结束也要报错', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '这句会失败', null)
  const call = fake.calls[0]
  call.handlers.onFailed?.('INTERNAL_ERROR', '本轮回复失败，请重试')
  call.resolve()
  await flush()

  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.error, '本轮回复失败，请重试')
  assert.deepEqual(pendingContents(CONV), [])
  assert.equal(session.failedText, '这句会失败')
  assert.equal(settled, 1)
})

test('用户停止：不写错误但通知回源，已知 turnId 时通知服务端取消', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '算了', null)
  const call = fake.calls[0]
  call.handlers.onStarted?.('turn-stop')
  call.handlers.onDelta?.('前半')
  store.stopTurn(CONV)
  /* 停止后立刻到达的增量必须被忽略，不能“停了还冒字” */
  call.handlers.onDelta?.('后半')
  await flush()

  assert.equal(call.signal.aborted, true)
  assert.deepEqual(fake.cancelled, [{ conversationId: CONV, turnId: 'turn-stop' }])
  const session = store.getSession(CONV)
  assert.equal(session.error, null)
  assert.equal(session.isSending, false)
  assert.equal(session.streamingText, '前半')
  assert.equal(settled, 1)
  /* 停止不撤回占位：服务端可能已经落库 */
  assert.deepEqual(pendingContents(CONV), ['算了'])
})

test('重复点击停止只 abort 一次、只发一次取消', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '停了又点', null)
  fake.calls[0].handlers.onStarted?.('turn-stop-2')
  store.stopTurn(CONV)
  store.stopTurn(CONV)
  await flush()

  assert.equal(fake.cancelled.length, 1)
})

test('首个事件前停止：只 abort 本地流，不调用服务端取消', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '还没开始', null)
  store.stopTurn(CONV)
  await flush()

  assert.equal(fake.calls[0].signal.aborted, true)
  assert.deepEqual(fake.cancelled, [])
  assert.equal(store.getSession(CONV).isSending, false)
  assert.equal(store.getSession(CONV).error, null)
})

test('同一会话发送中重复开始被忽略', () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '第一条', null)
  fake.calls[0].handlers.onDelta?.('半句')

  assert.equal(store.startTurn(CONV, '第二条', null), false)
  assert.equal(fake.calls.length, 1)
  assert.deepEqual(pendingContents(CONV), ['第一条'])
  assert.equal(store.getSession(CONV).streamingText, '半句')
})

test('一轮结束后可以接着开始下一轮，流式文本与错误都重置', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '第一轮', null)
  fake.calls[0].handlers.onStarted?.('turn-a')
  fake.calls[0].handlers.onDelta?.('第一轮回复')
  fake.calls[0].handlers.onCompleted?.('turn-a', 'message-a')
  await flush()

  assert.equal(store.startTurn(CONV, '第二轮', null), true)
  assert.equal(fake.calls.length, 2)
  assert.deepEqual(pendingContents(CONV), ['第一轮', '第二轮'])
  const session = store.getSession(CONV)
  assert.equal(session.isSending, true)
  assert.equal(session.streamingText, '')
  assert.equal(session.error, null)
})

test('clearSettledTurn：不清发送中的文本，清已完成残留但保留错误', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '继续', null)
  const call = fake.calls[0]
  call.handlers.onDelta?.('进行中')
  store.clearSettledTurn(CONV)
  assert.equal(store.getSession(CONV).streamingText, '进行中')
  assert.equal(store.getSession(CONV).isSending, true)

  call.handlers.onStarted?.('turn-4')
  call.reject(new Error('模型超时'))
  await flush()

  store.clearSettledTurn(CONV)
  const session = store.getSession(CONV)
  assert.equal(session.streamingText, '')
  assert.equal(session.turnId, null)
  assert.equal(session.isSending, false)
  /* 错误必须留给用户看，不能被回源清掉 */
  assert.equal(session.error, '模型超时')
})

test('consumeFailedText：取走正文后不再重复回填', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn(CONV, '要回填的一句', null)
  fake.calls[0].reject(new Error('网络中断'))
  await flush()

  assert.equal(store.getSession(CONV).failedText, '要回填的一句')
  store.consumeFailedText(CONV)
  assert.equal(store.getSession(CONV).failedText, null)
})

test('同步抛错：回合被受理但立即失败，占位撤回', () => {
  const store = createTurnSessionStore({
    stream() {
      throw new Error('同步失败')
    },
    cancel() {
      return Promise.resolve()
    }
  })

  assert.equal(store.startTurn(CONV, '同步失败的消息', null), true)
  const session = store.getSession(CONV)
  assert.equal(session.isSending, false)
  assert.equal(session.error, '同步失败')
  assert.deepEqual(pendingContents(CONV), [])
})

test('取消失败不影响本地收尾', async () => {
  const calls: AbortSignal[] = []
  const store = createTurnSessionStore({
    stream(_conversationId, _text, handlers, signal) {
      calls.push(signal)
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const abortError = new Error('已停止')
          abortError.name = 'AbortError'
          reject(abortError)
        })
        handlers.onStarted?.('turn-cancel-fail')
      })
    },
    cancel() {
      return Promise.reject(new Error('取消接口 404'))
    }
  })

  store.startTurn(CONV, '取消失败也要收尾', null)
  store.stopTurn(CONV)
  await flush()

  assert.equal(calls[0].aborted, true)
  assert.equal(store.getSession(CONV).isSending, false)
  assert.equal(store.getSession(CONV).error, null)
})

test('多会话互不影响：停止 A 不会中断 B', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  store.startTurn('conv-a', 'A 的话', null)
  store.startTurn('conv-b', 'B 的话', null)
  const callA = fake.calls[0]
  const callB = fake.calls[1]
  callA.handlers.onStarted?.('turn-a')
  callB.handlers.onStarted?.('turn-b')
  callA.handlers.onDelta?.('甲')
  callB.handlers.onDelta?.('乙')

  assert.equal(store.getSession('conv-a').streamingText, '甲')
  assert.equal(store.getSession('conv-b').streamingText, '乙')

  store.stopTurn('conv-a')
  await flush()

  assert.equal(callA.signal.aborted, true)
  assert.equal(callB.signal.aborted, false)
  assert.equal(store.getSession('conv-a').isSending, false)
  assert.equal(store.getSession('conv-b').isSending, true)
  assert.equal(store.getSession('conv-b').streamingText, '乙')
  assert.deepEqual(fake.cancelled, [{ conversationId: 'conv-a', turnId: 'turn-a' }])
})

test('reset 清空全部状态、撤回占位并 abort 进行中的流', async () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)
  let settled = 0
  store.subscribeSettled(() => {
    settled += 1
  })

  store.startTurn(CONV, '在吗', null)
  store.startTurn('conv-b', '还在吗', null)
  fake.calls[0].handlers.onDelta?.('半')
  store.reset()
  await flush()

  const empty = store.getSession(CONV)
  assert.equal(empty, store.getSession('conv-b'))
  assert.equal(empty.isSending, false)
  assert.equal(empty.streamingText, '')
  assert.equal(empty.turnId, null)
  assert.equal(empty.error, null)
  assert.deepEqual(getPendingMessages(CONV), [])
  assert.deepEqual(getPendingMessages('conv-b'), [])
  assert.equal(fake.calls[0].signal.aborted, true)
  assert.equal(fake.calls[1].signal.aborted, true)
  /* 清理期间的迟到回调不得再触发回源 */
  assert.equal(settled, 0)
})

test('无变化时快照引用稳定，没有回合的会话共享同一个空快照', () => {
  const fake = createFakeDeps()
  const store = createTurnSessionStore(fake.deps)

  const empty = store.getSession('conv-x')
  assert.equal(store.getSession('conv-y'), empty)

  store.startTurn(CONV, '快照稳定', null)
  const snapshot = store.getSession(CONV)
  assert.equal(store.getSession(CONV), snapshot)

  fake.calls[0].handlers.onDelta?.('变化')
  assert.notEqual(store.getSession(CONV), snapshot)
})
