import {
  MAX_AGE,
  MAX_INTRO_LENGTH,
  MIN_AGE,
  type CharacterDraft
} from './characterTypes'
import { cx, errorOf } from './characterUiHelpers'

export interface IdentityPanelProps {
  readonly draft: CharacterDraft
  readonly onChange: (patch: Partial<CharacterDraft>) => void
  readonly errors: Readonly<Record<string, string>>
  readonly readOnly?: boolean
}

/** 基础身份：名字必填，年龄限定成年区间，一句话介绍带计数器。 */
export default function IdentityPanel({
  draft,
  onChange,
  errors,
  readOnly = false
}: IdentityPanelProps) {
  const nameError = errorOf(errors, 'displayName')
  const ageError = errorOf(errors, 'age')
  const introError = errorOf(errors, 'intro')

  return (
    <section className="character-panel" aria-labelledby="identity-title">
      <header className="character-panel__head">
        <div>
          <h2 className="character-panel__title" id="identity-title">
            基础
          </h2>
          <p className="character-panel__hint">
            名字会出现在角色卡、聊天头部和会话列表里；一句话介绍帮助她有自己的生活感。
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="character-panel__readonly" role="note">
          官方人设只读：名字、年龄与介绍来自官方设定。
        </p>
      )}

      <div className="character-form">
        <label className="character-field">
          <span className="character-field__label">
            名字
            <span className="character-field__required">必填</span>
          </span>
          <input
            className={cx('character-input', nameError !== undefined && 'character-input--error')}
            type="text"
            value={draft.displayName}
            maxLength={12}
            placeholder="例如：林晚"
            autoComplete="off"
            readOnly={readOnly}
            disabled={readOnly}
            aria-invalid={nameError !== undefined}
            onChange={(event) => {
              onChange({ displayName: event.target.value })
            }}
          />
          <span className="character-field__support">
            <span>2–12 个字符，不能与已有角色或官方角色重名。</span>
            <span className="character-field__count">{draft.displayName.length}/12</span>
          </span>
          {nameError !== undefined && (
            <span className="character-error" role="alert">
              {nameError}
            </span>
          )}
        </label>

        <label className="character-field">
          <span className="character-field__label">
            年龄
            <span className="character-field__support-inline">
              {MIN_AGE}–{MAX_AGE} 岁
            </span>
          </span>
          <input
            className={cx(
              'character-input character-input--number',
              ageError !== undefined && 'character-input--error'
            )}
            type="number"
            min={MIN_AGE}
            max={MAX_AGE}
            step={1}
            value={Number.isFinite(draft.age) ? draft.age : ''}
            readOnly={readOnly}
            disabled={readOnly}
            aria-invalid={ageError !== undefined}
            onChange={(event) => {
              const next = Number(event.target.value)
              onChange({ age: Number.isFinite(next) ? Math.trunc(next) : 0 })
            }}
          />
          <span className="character-field__support">
            仅支持 18 岁以上的成年角色。
          </span>
          {ageError !== undefined && (
            <span className="character-error" role="alert">
              {ageError}
            </span>
          )}
        </label>

        <label className="character-field">
          <span className="character-field__label">
            一句话介绍
            <span className="character-field__support-inline">选填</span>
          </span>
          <input
            className={cx(
              'character-input',
              introError !== undefined && 'character-input--error'
            )}
            type="text"
            value={draft.intro}
            maxLength={MAX_INTRO_LENGTH}
            placeholder="例如：独居插画师，养了一只叫年糕的橘猫。"
            autoComplete="off"
            readOnly={readOnly}
            disabled={readOnly}
            aria-invalid={introError !== undefined}
            onChange={(event) => {
              onChange({ intro: event.target.value })
            }}
          />
          <span className="character-field__support">
            <span>她是谁、过着怎样的生活，一句话就够。</span>
            <span className="character-field__count">
              {draft.intro.length}/{MAX_INTRO_LENGTH}
            </span>
          </span>
          {introError !== undefined && (
            <span className="character-error" role="alert">
              {introError}
            </span>
          )}
        </label>
      </div>

      <p className="character-panel__tip">
        角色均为成年人；名字与介绍只用于展示和对话，不会改变安全边界。
      </p>
    </section>
  )
}
