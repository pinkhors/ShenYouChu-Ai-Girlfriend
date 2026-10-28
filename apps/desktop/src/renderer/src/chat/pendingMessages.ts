/**
 * 渲染层用到的消息字段子集，与 `api/client` 的 `Message` 结构兼容。
 *
 * 这里不直接 import 客户端模块，是为了让本文件保持零依赖、可被 Node 直接测试
 * （客户端模块依赖 `import.meta.env`，与测试工程的 CommonJS 编译目标冲突）。
 */
export interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly createdAt: string
}

/**
 * 乐观展示的用户消息。
 *
 * 发送时立刻进入界面，避免“等服务端落库再刷新”造成的空窗；
 * 服务端消息列表刷新后由 {@link reconcilePending} 对齐并移除，不会长期滞留。
 * 只存在于渲染进程内存，不参与持久化。
 */
export interface PendingUserMessage {
  /** 本地临时 ID，仅用作 React key，不会发给服务端 */
  readonly localId: string
  readonly content: string
  /** ISO-8601，发送时刻；与服务端 createdAt 同格式，便于直接渲染 */
  readonly createdAt: string
  /**
   * 发送前列表中的最新服务端消息 ID。
   * 对齐时只认“比它更新”的同内容消息，避免把历史里相同的一句话误判成本次发送。
   */
  readonly anchorId: string | null
}

let localSequence = 0

/** 构造一条待定消息；`anchorId` 传 {@link newestMessageId}(当前列表)。 */
export function createPendingUserMessage(content: string, anchorId: string | null): PendingUserMessage {
  localSequence += 1
  return {
    localId: `local-${localSequence}`,
    content,
    createdAt: new Date().toISOString(),
    anchorId
  }
}

/** 消息 ID 为雪花 ID 的十进制字符串（ADR-0005），可直接按数值比较先后。 */
function toComparableId(id: string): bigint | null {
  return /^\d+$/.test(id) ? BigInt(id) : null
}

/** 服务端消息是否落在锚点之后；锚点为空表示此前没有任何消息。 */
function isNewerThan(id: string, anchorId: string | null): boolean {
  if (anchorId === null) {
    return true
  }
  const current = toComparableId(id)
  const anchor = toComparableId(anchorId)
  if (current === null || anchor === null) {
    /* 非雪花 ID（旧数据或测试桩）时退化为“不是同一条” */
    return id !== anchorId
  }
  return current > anchor
}

/** 列表中的最新消息 ID；空列表返回 null。 */
export function newestMessageId(messages: readonly ChatMessage[]): string | null {
  let newest: string | null = null
  for (const message of messages) {
    if (newest === null || isNewerThan(message.id, newest)) {
      newest = message.id
    }
  }
  return newest
}

/**
 * 与服务端消息对齐：同内容、且 ID 在锚点之后的消息视为已落库，从待定列表移除。
 *
 * 按顺序配对，因此连续发送相同文本也不会被一条服务端消息全部认领。
 * 返回新数组，未命中（例如分页还没取到）的待定消息继续展示。
 */
export function reconcilePending(
  pending: readonly PendingUserMessage[],
  serverMessages: readonly ChatMessage[]
): PendingUserMessage[] {
  const claimed = new Set<number>()
  const remaining: PendingUserMessage[] = []

  for (const item of pending) {
    let matched = -1
    for (let index = 0; index < serverMessages.length; index += 1) {
      const candidate = serverMessages[index]
      if (candidate === undefined || claimed.has(index)) {
        continue
      }
      if (
        candidate.role === 'user' &&
        candidate.content === item.content &&
        isNewerThan(candidate.id, item.anchorId)
      ) {
        matched = index
        break
      }
    }
    if (matched >= 0) {
      claimed.add(matched)
    } else {
      remaining.push(item)
    }
  }

  return remaining
}

/** 转为渲染用消息；key 使用本地 ID，落库前后不会闪动。 */
export function toDisplayMessage(pending: PendingUserMessage): ChatMessage {
  return {
    id: pending.localId,
    role: 'user',
    content: pending.content,
    createdAt: pending.createdAt
  }
}
