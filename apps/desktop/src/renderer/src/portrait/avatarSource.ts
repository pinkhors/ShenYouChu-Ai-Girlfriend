import { hasPortrait, type PortraitSet } from './expression'

/**
 * 通话形象来源判定（纯逻辑）。
 *
 * 优先级：加载中 → 用户立绘 → 矢量形象。
 * 立绘的“套内回退”（表情 → 基础 → 任意图）由 resolvePortrait 负责；
 * 立绘整张解码失败时由 AvatarPortrait 回退矢量。
 */

export type AvatarSource = 'loading' | 'portrait' | 'vector'

export function resolveAvatarSource(
  portraits: PortraitSet | null,
  loading: boolean
): AvatarSource {
  if (loading) {
    return 'loading'
  }
  return hasPortrait(portraits) ? 'portrait' : 'vector'
}

export function avatarSourceLabel(source: AvatarSource): string {
  switch (source) {
    case 'loading':
      return '正在加载形象'
    case 'portrait':
      return '用户立绘'
    default:
      return '默认矢量形象'
  }
}
