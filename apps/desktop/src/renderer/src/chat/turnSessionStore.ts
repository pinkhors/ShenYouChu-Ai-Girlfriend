import type { TurnStreamHandlers } from '../api/turnStream'
import { createPendingUserMessage } from './pendingMessages'
import {
  addPendingMessage,
  clearPendingMessages,
  dropPendingMessage
} from './pendingStore'

/**
 * 会话级回合（SSE 流）状态仓库。
 *
 * 状态放在模块级而不是 `ChatView` 里：切换到角色 / 记忆 / 设置页或切换会话都会卸载
 * `ChatView`，组件内的流式文本、发送态与 AbortController 随之丢失 —— 回来时看不到
 * 流式文本、无法停止仍在进行的回合，还可能重复发送。
 *
 * 本文件保持零依赖 `api/client`（客户端模块使用 `import.meta`，与测试工程的 CommonJS
 * 目标冲突）；真实的流式与取消实现由组合根 `turnSessions.ts` 注入。
 */

/** 流式与取消能力；由组合根注入真实客户端实现，测试可注入假实现。 */
export interface TurnStreamDeps {
  stream(
    conversationId: string,
    text: string,
    handlers: TurnStreamHandlers,
    signal: AbortSignal
  ): Promise<void>
  cancel(conversationId: string, turnId: string): Promise<void>
}

/**
 * 单个会话的回合快照（不可变）：每次变化整体替换，保证 `useSyncExternalStore`
 * 能通过引用比较发现更新。
 */
export interface TurnSession {
  readonly conversationId: string
  /** 本轮已累积的助手流式文本；结束后保留到界面回源对齐再清空 */
  readonly streamingText: string
  /** 本轮是否仍在进行 */
  readonly isSending: boolean
  /** 服务端 `turn.started` 返回的轮次 ID；未知时为 null */
  readonly turnId: string | null
  /** 本轮失败文案；用户主动停止不写入，直到下一轮开始才清空 */
  readonly error: string | null
  /**
   * 服务端未落库就失败的那条用户消息正文。
   * 界面取走后回填输入框，避免“消息消失且要重新打字”；取走即由界面清除。
   */
  readonly failedText: string | null
}

export interface TurnSessionStore {
  /** 指定会话的回合快照；没有回合时返回共享的 EMPTY 常量。 */
  getSession(conversationId: string): TurnSession
  /** 订阅任意会话的回合状态变化；返回取消订阅函数。 */
  subscribe(listener: () => void): () => void
  /** 发起一轮；受理返回 true，该会话已有进行中的回合时忽略并返回 false。 */
  startTurn(conversationId: string, text: string, anchorId: string | null): boolean
  /** 停止该会话进行中的回合（abort 本地流，并尽力通知服务端取消）。 */
  stopTurn(conversationId: string): void
  /** 界面回源对齐后清空已结束回合的残留（流式文本 / turnId；保留错误提示）。 */
  clearSettledTurn(conversationId: string): void
  /** 界面已把失败文本回填到输入框，清除该标记避免重复回填。 */
  consumeFailedText(conversationId: string): void
  /** 订阅“某会话的一轮已结束”；用于刷新会话列表与回源。 */
  subscribeSettled(listener: (conversationId: string) => void): () => void
  /** 清空全部会话状态与占位消息（退出登录 / 401 / 删除账号）。 */
  reset(): void
}

/** 空会话共享同一引用，保证 useSyncExternalStore 的快照稳定。 */
const EMPTY: TurnSession = Object.freeze({
  conversationId: '',
  streamingText: '',
  isSending: false,
  turnId: null,
  error: null,
  failedText: null
})

/** 进行中回合的私有运行时状态：不进入快照，避免把 AbortController 暴露给界面。 */
interface TurnRuntime {
  readonly controller: AbortController
  /** 本轮占位消息的本地 ID，失败且服务端未落库时用于撤回 */
  readonly localId: string
  /** 本轮用户消息正文，未落库失败时回填输入框 */
  readonly text: string
  /** 创建时的代次；reset 后代次变化，迟到的回调会被忽略 */
  readonly epoch: number
  /** 是否已收到过 `turn.started`（服务端已落库） */
  started: boolean
  /** 用户已点击停止：立即忽略后续增量，避免“停止后又冒字” */
  stopping: boolean
}

/** 回合结束的两种结果；失败时保留原始异常用于判断是否为用户中止。 */
type TurnOutcome =
  | { readonly kind: 'completed' }
  | { readonly kind: 'failed'; readonly error: unknown }

/** 把 unknown 异常转成可展示的中文文案；不依赖 ApiError，保持零客户端依赖。 */
function turnErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message
  }
  return '发送失败，请稍后重试'
}

/** 鸭子类型判断用户中止：不依赖 DOMException，假实现抛普通 Error 也能识别。 */
function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export function createTurnSessionStore(deps: TurnStreamDeps): TurnSessionStore {
  const sessions = new Map<string, TurnSession>()
  const runtimes = new Map<string, TurnRuntime>()
  const listeners = new Set<() => void>()
  const settledListeners = new Set<(conversationId: string) => void>()
  /* 每次 reset 递增：阻止被取消的旧回合把状态写回已清空的 store */
  let epoch = 0

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function write(session: TurnSession): void {
    sessions.set(session.conversationId, session)
    notify()
  }

  function getSession(conversationId: string): TurnSession {
    return sessions.get(conversationId) ?? EMPTY
  }

  /** 回合仍属于当前 store 代次时才会被处理。 */
  function isCurrent(conversationId: string, runtime: TurnRuntime): boolean {
    return runtimes.get(conversationId) === runtime && runtime.epoch === epoch
  }

  function patch(
    conversationId: string,
    update: (current: TurnSession) => TurnSession
  ): void {
    const current = sessions.get(conversationId)
    if (current === undefined) {
      return
    }
    write(update(current))
  }

  function notifySettled(conversationId: string): void {
    for (const listener of settledListeners) {
      listener(conversationId)
    }
  }

  /**
   * 统一的收尾：结束发送态、保留流式文本（等界面回源后再清）、通知回源。
   * 重复调用（`turn.completed` 与流结束都会触发）是幂等的。
   *
   * 失败分两种：服务端未落库（未收到 started）时撤回占位并把正文交给界面回填；
   * 已落库时保留占位（消息确实存在），只提示错误。
   */
  function finalize(conversationId: string, runtime: TurnRuntime, outcome: TurnOutcome): void {
    if (!isCurrent(conversationId, runtime)) {
      return
    }
    runtimes.delete(conversationId)

    const current = sessions.get(conversationId)
    if (current === undefined) {
      return
    }

    const aborted = outcome.kind === 'failed' && isAbortError(outcome.error)
    const failed = outcome.kind === 'failed' && !aborted
    const persisted = runtime.started
    if (failed && !persisted) {
      /* 服务端没有落库：撤回占位，避免留下一条永远无法对齐的消息 */
      dropPendingMessage(conversationId, runtime.localId)
    }

    write({
      ...current,
      isSending: false,
      error: failed ? turnErrorMessage(outcome.error) : null,
      failedText: failed && !persisted ? runtime.text : null
    })
    notifySettled(conversationId)
  }

  function startTurn(conversationId: string, text: string, anchorId: string | null): boolean {
    const previous = getSession(conversationId)
    if (previous.isSending) {
      /* 同一会话同时只允许一轮，避免两轮回复交错落库 */
      return false
    }

    const pendingMessage = createPendingUserMessage(text, anchorId)
    /* 先本地占位：不等服务端落库，用户消息立刻出现，且不随视图卸载丢失 */
    addPendingMessage(conversationId, pendingMessage)

    const controller = new AbortController()
    const runtime: TurnRuntime = {
      controller,
      localId: pendingMessage.localId,
      text,
      epoch,
      started: false,
      stopping: false
    }
    runtimes.set(conversationId, runtime)
    write({
      conversationId,
      streamingText: '',
      isSending: true,
      turnId: null,
      error: null,
      failedText: null
    })

    const handlers: TurnStreamHandlers = {
      onStarted: (turnId) => {
        if (runtime.stopping || !isCurrent(conversationId, runtime)) {
          return
        }
        /* 收到 started 即代表服务端已落库：此后失败不再撤回占位 */
        runtime.started = true
        patch(conversationId, (current) => ({ ...current, turnId }))
      },
      onDelta: (delta) => {
        if (runtime.stopping || !isCurrent(conversationId, runtime) || delta === '') {
          return
        }
        patch(conversationId, (current) => ({
          ...current,
          streamingText: current.streamingText + delta
        }))
      },
      onCompleted: () => {
        finalize(conversationId, runtime, { kind: 'completed' })
      },
      onFailed: (code, message) => {
        if (runtime.stopping || !isCurrent(conversationId, runtime)) {
          return
        }
        const detail = message.trim() === '' ? code : message
        finalize(conversationId, runtime, { kind: 'failed', error: new Error(detail) })
      }
    }

    let streaming: Promise<void>
    try {
      streaming = deps.stream(conversationId, text, handlers, controller.signal)
    } catch (error) {
      /* 同步抛错（例如构造请求失败）同样走统一收尾 */
      finalize(conversationId, runtime, { kind: 'failed', error })
      return true
    }

    void streaming.then(
      () => {
        /*
         * 服务端可能只发 turn.failed / turn.cancelled 而不触发 onCompleted，
         * 流结束时兜底收尾，避免界面永远停在“发送中”（已收尾过则是幂等空转）。
         */
        finalize(conversationId, runtime, { kind: 'completed' })
      },
      (error: unknown) => {
        finalize(conversationId, runtime, { kind: 'failed', error })
      }
    )
    return true
  }

  function stopTurn(conversationId: string): void {
    const runtime = runtimes.get(conversationId)
    if (runtime === undefined) {
      return
    }
    /* 立即失效后续增量与重复点击；收尾仍由 abort 触发的 rejection 完成 */
    if (runtime.stopping) {
      return
    }
    runtime.stopping = true

    /* turnId 要在 abort 之前读取 */
    const turnId = getSession(conversationId).turnId
    runtime.controller.abort()
    if (turnId !== null) {
      try {
        void deps.cancel(conversationId, turnId).catch(() => {
          /* 轮次可能已自然结束（404），取消失败不影响界面 */
        })
      } catch {
        /* 同步抛错同样忽略：本地流已经中止 */
      }
    }
  }

  function clearSettledTurn(conversationId: string): void {
    const current = sessions.get(conversationId)
    if (current === undefined || current.isSending) {
      return
    }
    /* 错误与失败文本保留到下一轮开始：用户需要看到失败原因并被回填草稿 */
    if (current.streamingText === '' && current.turnId === null) {
      /* 没有残留，不产生无意义的重渲染 */
      return
    }
    write({ ...current, streamingText: '', turnId: null })
  }

  function consumeFailedText(conversationId: string): void {
    const current = sessions.get(conversationId)
    if (current === undefined || current.failedText === null) {
      return
    }
    write({ ...current, failedText: null })
  }

  function reset(): void {
    epoch += 1
    for (const runtime of runtimes.values()) {
      runtime.controller.abort()
    }
    runtimes.clear()
    const hadSessions = sessions.size > 0
    sessions.clear()
    /* 占位消息同样按会话清空，避免跨账号残留在内存里 */
    clearPendingMessages()
    if (hadSessions) {
      notify()
    }
  }

  return {
    getSession,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    subscribeSettled(listener: (conversationId: string) => void): () => void {
      settledListeners.add(listener)
      return () => {
        settledListeners.delete(listener)
      }
    },
    startTurn,
    stopTurn,
    clearSettledTurn,
    consumeFailedText,
    reset
  }
}
