import type { ChatMessage } from './pendingMessages'

/**
 * 把“更早一页”的消息拼到当前列表前面（消息列表按时间升序渲染）。
 *
 * 服务端翻页游标是开区间，正常情况下不会重叠；这里仍按 id 去重，
 * 避免重复加载或并发刷新时出现重复气泡。
 */
export function prependOlderMessages(
  current: readonly ChatMessage[],
  older: readonly ChatMessage[]
): ChatMessage[] {
  const seen = new Set(current.map((item) => item.id))
  const merged: ChatMessage[] = []
  for (const item of older) {
    if (seen.has(item.id)) {
      continue
    }
    seen.add(item.id)
    merged.push(item)
  }
  return [...merged, ...current]
}
