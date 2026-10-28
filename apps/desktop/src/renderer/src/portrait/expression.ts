/**
 * 立绘表情差分：纯逻辑，决定“请求某个表情时实际展示哪张图”。
 *
 * 立绘由用户从外部导入，不保证每套都齐；展示层必须能优雅降级：
 * 请求的表情 → 基础表情 → 任意已导入的表情 → 无图（回退矢量形象）。
 */

export const PORTRAIT_SLOTS = [
  { id: 'neutral', label: '基础', hint: '默认神态，必填' },
  { id: 'happy', label: '开心', hint: '微笑/笑眼' },
  { id: 'sad', label: '难过', hint: '低落' },
  { id: 'angry', label: '生气', hint: '小脾气' },
  { id: 'surprised', label: '惊讶', hint: '睁大眼睛' },
  { id: 'closed', label: '闭眼', hint: '眨眼用' },
  { id: 'talking', label: '说话', hint: '张嘴/说话中' }
] as const

export type PortraitExpression = (typeof PORTRAIT_SLOTS)[number]['id']

/** 每个表情对应一张 data URL；用户可能只导入了一部分。 */
export type PortraitSet = Partial<Record<PortraitExpression, string>>

export function hasPortrait(portraits: PortraitSet | null): portraits is PortraitSet {
  if (portraits === null) {
    return false
  }
  return PORTRAIT_SLOTS.some((slot) => typeof portraits[slot.id] === 'string')
}

/** 取一张可用的表情图；没有基础表情时退回任意一张，避免直接跌回矢量形象。 */
export function resolvePortrait(
  portraits: PortraitSet | null,
  expression: PortraitExpression
): string | null {
  if (portraits === null) {
    return null
  }
  const requested = portraits[expression]
  if (typeof requested === 'string' && requested !== '') {
    return requested
  }
  const neutral = portraits.neutral
  if (typeof neutral === 'string' && neutral !== '') {
    return neutral
  }
  for (const slot of PORTRAIT_SLOTS) {
    const candidate = portraits[slot.id]
    if (typeof candidate === 'string' && candidate !== '') {
      return candidate
    }
  }
  return null
}

/** 心情 → 默认表情：高亲密度时更常笑，低落时更常难过。 */
export function moodToExpression(mood: number | null): PortraitExpression {
  if (mood === null) {
    return 'neutral'
  }
  if (mood >= 70) {
    return 'happy'
  }
  if (mood <= 30) {
    return 'sad'
  }
  return 'neutral'
}

export function labelOfExpression(expression: PortraitExpression): string {
  return PORTRAIT_SLOTS.find((slot) => slot.id === expression)?.label ?? expression
}
