import AvatarPortrait from '../portrait/AvatarPortrait'
import type { PortraitSet } from '../portrait/expression'
import {
  familySummary,
  personalitySummary,
  type CharacterDraft
} from './characterTypes'
import { displayNameOf } from './characterUiHelpers'

export interface CharacterPreviewCardProps {
  readonly draft: CharacterDraft
  readonly portraits?: PortraitSet | null
  readonly size?: 'card' | 'compact' | 'large'
  readonly showMeta?: boolean
}

/**
 * 角色预览：立绘存在时优先展示立绘，否则由 AvatarPortrait 回退到矢量捏脸。
 * 角色中心卡片、编辑器左栏和切换器共用同一套展示，避免多套“她”的样子。
 */
export default function CharacterPreviewCard({
  draft,
  portraits = null,
  size = 'card',
  showMeta = true
}: CharacterPreviewCardProps) {
  const name = displayNameOf(draft.displayName)

  return (
    <article
      className={`character-preview character-preview--${size}`}
      aria-label={`${name}的角色预览`}
    >
      <div className="character-preview__frame">
        <AvatarPortrait
          config={draft.avatarConfig}
          portraits={portraits ?? null}
          variant="portrait"
          name={name}
          className="character-preview__avatar"
        />
      </div>
      <div className="character-preview__body">
        <h3 className="character-preview__name">{name}</h3>
        {showMeta && (
          <div className="character-preview__meta">
            {draft.displayName.trim() === '' && (
              <p className="character-preview__hint">还没起名字</p>
            )}
            <p className="character-preview__line">
              {personalitySummary(draft.personality)}
            </p>
            <p className="character-preview__line character-preview__line--muted">
              {familySummary(draft.family)}
            </p>
          </div>
        )}
      </div>
    </article>
  )
}
