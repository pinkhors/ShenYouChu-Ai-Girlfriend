import {
  AVATAR_SOURCE_OPTIONS,
  type CharacterAvatarSource
} from './avatarSourcePreferences'
import { cx } from './characterUiHelpers'

export interface AvatarSourcePickerProps {
  readonly source: CharacterAvatarSource
  readonly hasPortrait: boolean
  readonly disabled?: boolean
  readonly onChange: (source: CharacterAvatarSource) => void
}

/** 形象标签顶部的统一来源选择，捏脸/立绘两个子标签都可见。 */
export default function AvatarSourcePicker({
  source,
  hasPortrait,
  disabled = false,
  onChange
}: AvatarSourcePickerProps) {
  return (
    <section className="character-avatar-source" aria-labelledby="character-avatar-source-title">
      <div className="character-avatar-source__head">
        <div>
          <h3 className="character-avatar-source__title" id="character-avatar-source-title">
            形象来源
          </h3>
          <p className="character-avatar-source__hint">
            角色卡、切换器、会话列表、聊天与通话会统一使用这里的选择。
          </p>
        </div>
        <span className="character-avatar-source__current">
          {AVATAR_SOURCE_OPTIONS.find((option) => option.id === source)?.hint}
        </span>
      </div>
      <div className="character-avatar-source__options" role="group" aria-label="形象来源">
        {AVATAR_SOURCE_OPTIONS.map((option) => {
          const active = option.id === source
          const unavailable = option.id === 'portrait' && !hasPortrait
          return (
            <button
              key={option.id}
              className={cx(
                'character-avatar-source__option',
                active && 'character-avatar-source__option--active'
              )}
              type="button"
              aria-pressed={active}
              disabled={disabled || unavailable}
              title={unavailable ? '还没有导入或生成这个角色的立绘' : option.hint}
              onClick={() => {
                onChange(option.id)
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {!hasPortrait && (
        <p className="character-avatar-source__empty">
          还没有这个角色的立绘；导入后可以在“自动 / 立绘 / 捏脸”之间切换。
        </p>
      )}
    </section>
  )
}
