import { reconcilePending, type ChatMessage, type PendingUserMessage } from './pendingMessages'

/**
 * 各会话尚未落库的本地消息（乐观占位）。
 *
 * 状态放在模块级而不是组件里：切换主导航（聊天 → 角色 / 记忆 / 设置）会卸载
 * `ChatView`，组件内的 state 随之丢失，用户刚发出的消息就“消失”到回复落库为止。
 * 这里按会话 id 保存，任何视图挂载后都能立刻读到，服务端列表刷新时再对齐移除。
 *
 * 仅存在于渲染进程内存，不参与持久化；进程重启后以服务端数据为准。
 */
const sessions = new Map<string, readonly PendingUserMessage[]>()
const listeners = new Set<() => void>()

/** 空列表共享同一个引用，保证 useSyncExternalStore 的快照稳定。 */
const EMPTY: readonly PendingUserMessage[] = Object.freeze([])

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function write(conversationId: string, next: readonly PendingUserMessage[]): void {
  if (next.length === 0) {
    sessions.delete(conversationId)
  } else {
    sessions.set(conversationId, next)
  }
  notify()
}

/** 订阅任意会话的占位消息变化；返回取消订阅函数。 */
export function subscribePendingMessages(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 当前会话尚未落库的占位消息快照；无变化时返回同一引用。 */
export function getPendingMessages(conversationId: string): readonly PendingUserMessage[] {
  return sessions.get(conversationId) ?? EMPTY
}

/** 发送时登记一条占位消息（跨视图保留，直到落库对齐或失败撤回）。 */
export function addPendingMessage(conversationId: string, message: PendingUserMessage): void {
  write(conversationId, [...getPendingMessages(conversationId), message])
}

/** 撤回一条占位消息（例如请求失败、确认没有写进服务端）。 */
export function dropPendingMessage(conversationId: string, localId: string): void {
  const current = getPendingMessages(conversationId)
  const next = current.filter((item) => item.localId !== localId)
  if (next.length === current.length) {
    return
  }
  write(conversationId, next)
}

/** 服务端消息列表刷新后对齐：已经落库的占位消息移除，避免重复展示。 */
export function reconcilePendingMessages(
  conversationId: string,
  serverMessages: readonly ChatMessage[]
): void {
  const current = getPendingMessages(conversationId)
  if (current.length === 0) {
    return
  }
  const next = reconcilePending(current, serverMessages)
  if (next.length === current.length) {
    return
  }
  write(conversationId, next)
}

/** 清空全部会话的占位消息（退出登录时调用，避免跨账号残留在内存里）。 */
export function clearPendingMessages(): void {
  if (sessions.size === 0) {
    return
  }
  sessions.clear()
  notify()
}
