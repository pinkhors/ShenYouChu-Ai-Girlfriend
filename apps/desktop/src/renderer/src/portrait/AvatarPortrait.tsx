import type { AvatarConfig } from '../avatar/avatarConfig'
import GirlfriendAvatar from '../avatar/GirlfriendAvatar'
import { resolvePortrait, type PortraitExpression, type PortraitSet } from './expression'

interface AvatarPortraitProps {
  readonly config: AvatarConfig
  readonly portraits: PortraitSet | null
  readonly expression?: PortraitExpression
  readonly variant?: 'portrait' | 'avatar'
  readonly size?: number
  readonly className?: string
}

/**
 * 统一头像：有导入立绘就用图，没有就回退到矢量捏脸形象。
 * 这样导航、会话列表、聊天和通话页可以共用一个组件。
 */
export default function AvatarPortrait({
  config,
  portraits,
  expression = 'neutral',
  variant = 'portrait',
  size,
  className
}: AvatarPortraitProps) {
  const source = resolvePortrait(portraits, expression)
  if (source === null) {
    return (
      <GirlfriendAvatar
        config={config}
        variant={variant}
        size={size}
        className={className}
      />
    )
  }

  const classes = ['avatar', 'avatar--image', `avatar--${variant}`, className].filter(Boolean).join(' ')
  return (
    <img
      className={classes}
      src={source}
      alt="沈幼楚"
      width={size}
      height={size}
      draggable={false}
    />
  )
}
