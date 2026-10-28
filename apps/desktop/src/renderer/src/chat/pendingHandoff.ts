import type { PendingUserMessage } from './pendingMessages'

/**
 * 会话被切走时留下的本地占位消息。
 *
 * 场景：用户发出消息后还没等到回复就切到别的会话，此时界面会卸载；
 * 服务端仍在生成并最终落库，但再次进入该会话时首次拉取可能还没看到它。
 * 这里把占位消息暂存在内存里，下次进入会话先补上，等服务端列表刷新后由
 * {@link reconcilePending} 移除。仅渲染进程内存，进程退出即失效。
 */
const handoff = new Map<string, PendingUserMessage[]>()

/** 记录切走时尚未落库的占位消息；空列表等同于清除。 */
export function handoffPendingMessages(conversationId: string, messages: readonly PendingUserMessage[]): void {
  if (messages.length === 0) {
    handoff.delete(conversationId)
    return
  }
  handoff.set(conversationId, [...messages])
}

/** 取走并清空该会话的占位消息，保证同一条消息不会被补两次。 */
export function takePendingMessages(conversationId: string): PendingUserMessage[] {
  const messages = handoff.get(conversationId)
  if (messages === undefined) {
    return []
  }
  handoff.delete(conversationId)
  return messages
}

/** 撤回一条已交接但最终没有落库的占位消息（例如切走后请求失败）。 */
export function dropHandoffMessage(conversationId: string, localId: string): void {
  const messages = handoff.get(conversationId)
  if (messages === undefined) {
    return
  }
  const remaining = messages.filter((item) => item.localId !== localId)
  if (remaining.length === 0) {
    handoff.delete(conversationId)
    return
  }
  handoff.set(conversationId, remaining)
}
