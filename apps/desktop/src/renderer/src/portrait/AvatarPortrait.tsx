import { useState } from 'react'
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
  readonly name?: string
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
  className,
  name = '沈幼楚'
}: AvatarPortraitProps) {
  const source = resolvePortrait(portraits, expression)
  const [failedSource, setFailedSource] = useState<string | null>(null)

  if (source === null || failedSource === source) {
    return (
      <GirlfriendAvatar
        config={config}
        variant={variant}
        size={size}
        className={className}
        name={name}
      />
    )
  }

  const classes = ['avatar', 'avatar--image', `avatar--${variant}`, className].filter(Boolean).join(' ')
  return (
    <img
      className={classes}
      src={source}
      alt={name}
      width={size}
      height={size}
      draggable={false}
      onError={() => {
        /* 损坏的 data URL / 解码失败：退回矢量形象，不让通话空白 */
        setFailedSource(source)
      }}
    />
  )
}
