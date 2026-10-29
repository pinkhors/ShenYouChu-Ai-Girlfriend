import { useId, useState, type ReactElement, type ReactNode } from 'react'
import {
  ACCESSORIES,
  AVATAR_PRESETS,
  BROW_STYLES,
  DEFAULT_AVATAR,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  LIP_COLORS,
  OUTFIT_COLORS,
  OUTFIT_STYLES,
  SKIN_TONES,
  isSameAvatar,
  randomizeAvatar,
  type AvatarConfig,
  type HairStyleId
} from '../avatar/avatarConfig'
import GirlfriendAvatar from '../avatar/GirlfriendAvatar'
import Icon from '../ui/Icon'
import { cx, tierIndex } from './characterUiHelpers'

export interface AppearancePanelProps {
  readonly value: AvatarConfig
  readonly onChange: (next: AvatarConfig) => void
  readonly disabled?: boolean
}

type GroupId = 'outline' | 'features' | 'hair' | 'outfit'

const GROUPS: readonly { id: GroupId; title: string; summary: string }[] = [
  { id: 'outline', title: '轮廓', summary: '肤色、脸型、腮红' },
  { id: 'features', title: '五官', summary: '瞳色、眼型、眉形、唇色' },
  { id: 'hair', title: '发型', summary: '七种发型与发色' },
  { id: 'outfit', title: '服饰', summary: '风格、主色与配饰' }
]

const HAIR_HINTS: Record<HairStyleId, string> = {
  'long-straight': '垂顺、安静，露出完整脸型',
  'long-wave': '柔软波浪，偏温柔与成熟',
  bob: '齐肩内扣，利落又有亲和力',
  'twin-tails': '双马尾，元气感更强',
  updo: '低盘发，日常而克制',
  ponytail: '高马尾，轻快、行动派',
  short: '利落短发，清爽独立'
}

interface SwatchChoice<T extends string> {
  readonly id: T
  readonly label: string
  readonly color: string
}

function ColorSwatches<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  readonly label: string
  readonly options: readonly SwatchChoice<T>[]
  readonly value: T
  readonly disabled: boolean
  readonly onChange: (next: T) => void
}) {
  return (
    <div className="character-control" role="group" aria-label={label}>
      <span className="character-control__head">
        <span className="character-control__label">{label}</span>
      </span>
      <div className="character-swatches">
        {options.map((option) => {
          const active = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              className={cx('character-swatch', active && 'character-swatch--active')}
              aria-pressed={active}
              aria-label={option.label}
              title={option.label}
              disabled={disabled}
              onClick={() => {
                onChange(option.id)
              }}
            >
              <span
                className="character-swatch__dot"
                style={{ background: option.color }}
                aria-hidden="true"
              >
                {active && <Icon name="check" size={12} />}
              </span>
              <span className="character-swatch__label">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TierSlider({
  label,
  labels,
  value,
  disabled,
  onChange
}: {
  readonly label: string
  readonly labels: readonly [string, string, string]
  readonly value: number
  readonly disabled: boolean
  readonly onChange: (next: number) => void
}) {
  const current = tierIndex(value)
  return (
    <label className="character-control">
      <span className="character-control__head">
        <span className="character-control__label">{label}</span>
        <span className="character-control__value">{labels[current]}</span>
      </span>
      <input
        className="character-range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={labels[current]}
        onChange={(event) => {
          onChange(Number(event.target.value) / 100)
        }}
      />
      <span className="character-range__scale" aria-hidden="true">
        {labels.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </span>
    </label>
  )
}

function ChoiceGrid({
  children
}: {
  readonly children: ReactNode
}) {
  return <div className="character-choice-grid">{children}</div>
}

/** 捏脸面板：预设只改外观；四组参数可折叠，默认展开发型与服饰。 */
export default function AppearancePanel({
  value,
  onChange,
  disabled = false
}: AppearancePanelProps) {
  const idPrefix = useId()
  const [open, setOpen] = useState<Record<GroupId, boolean>>({
    outline: false,
    features: false,
    hair: true,
    outfit: true
  })

  const patch = (next: Partial<AvatarConfig>): void => {
    onChange({ ...value, ...next })
  }

  const toggle = (id: GroupId): void => {
    setOpen((previous) => ({ ...previous, [id]: !previous[id] }))
  }

  const renderGroup = (id: GroupId, content: ReactNode): ReactElement => {
    const group = GROUPS.find((item) => item.id === id)
    const expanded = open[id]
    const panelId = `${idPrefix}-${id}`
    return (
      <section className="character-appearance-group" key={id}>
        <button
          className="character-appearance-group__head"
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => {
            toggle(id)
          }}
        >
          <span className="character-appearance-group__title">{group?.title ?? id}</span>
          <span className="character-appearance-group__summary">{group?.summary ?? ''}</span>
          <span className={cx('character-appearance-group__chevron', expanded && 'character-appearance-group__chevron--open')} aria-hidden="true">
            ▸
          </span>
        </button>
        {expanded && (
          <div className="character-appearance-group__body" id={panelId}>
            {content}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="character-panel character-appearance" aria-labelledby="character-appearance-title">
      <header className="character-panel__head">
        <div>
          <h2 className="character-panel__title" id="character-appearance-title">
            形象
          </h2>
          <p className="character-panel__hint">
            左侧预览实时跟随。没有导入立绘时，聊天与角色卡使用这套矢量形象。
          </p>
        </div>
        <div className="character-appearance__actions">
          <span className="character-appearance__badge">仅应用外观</span>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(randomizeAvatar())
            }}
          >
            随机
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(DEFAULT_AVATAR)
            }}
          >
            恢复默认
          </button>
        </div>
      </header>

      <section className="character-appearance__presets" aria-labelledby="character-appearance-preset-title">
        <h3 className="character-appearance__subtitle" id="character-appearance-preset-title">
          快捷预设
        </h3>
        <div className="character-appearance__preset-grid">
          {AVATAR_PRESETS.map((preset) => {
            const active = isSameAvatar(value, preset.config)
            return (
              <button
                key={preset.id}
                type="button"
                className={cx('character-appearance-preset', active && 'character-appearance-preset--active')}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => {
                  onChange(preset.config)
                }}
              >
                <span className="character-appearance-preset__thumb">
                  <GirlfriendAvatar config={preset.config} variant="avatar" name={preset.name} />
                </span>
                <span className="character-appearance-preset__text">
                  <span className="character-appearance-preset__name">{preset.name}</span>
                  <span className="character-appearance-preset__hint">{preset.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="character-appearance__note">预设只改外观，不会改变性格与家庭设定。</p>
      </section>

      <div className="character-appearance__groups">
        {renderGroup(
          'outline',
          <>
            <ColorSwatches
              label="肤色"
              options={SKIN_TONES.map((tone) => ({
                id: tone.id,
                label: tone.label,
                color: tone.base
              }))}
              value={value.skinTone}
              disabled={disabled}
              onChange={(skinTone) => {
                patch({ skinTone })
              }}
            />
            <TierSlider
              label="脸型"
              labels={['偏圆脸', '标准', '偏鹅蛋脸']}
              value={value.faceShape}
              disabled={disabled}
              onChange={(faceShape) => {
                patch({ faceShape })
              }}
            />
            <TierSlider
              label="腮红"
              labels={['无', '自然', '明显']}
              value={value.blush}
              disabled={disabled}
              onChange={(blush) => {
                patch({ blush })
              }}
            />
          </>
        )}

        {renderGroup(
          'features',
          <>
            <ColorSwatches
              label="瞳色"
              options={EYE_COLORS.map((eye) => ({
                id: eye.id,
                label: eye.label,
                color: eye.iris
              }))}
              value={value.eyeColor}
              disabled={disabled}
              onChange={(eyeColor) => {
                patch({ eyeColor })
              }}
            />
            <TierSlider
              label="眼睛大小"
              labels={['细长', '标准', '圆大']}
              value={value.eyeSize}
              disabled={disabled}
              onChange={(eyeSize) => {
                patch({ eyeSize })
              }}
            />
            <TierSlider
              label="眼距"
              labels={['偏近', '标准', '偏宽']}
              value={value.eyeSpacing}
              disabled={disabled}
              onChange={(eyeSpacing) => {
                patch({ eyeSpacing })
              }}
            />
            <div className="character-control" role="group" aria-label="眉形">
              <span className="character-control__head">
                <span className="character-control__label">眉形</span>
              </span>
              <div className="character-seg">
                {BROW_STYLES.map((brow) => {
                  const active = brow.id === value.browStyle
                  return (
                    <button
                      key={brow.id}
                      type="button"
                      className={cx('character-seg__item', active && 'character-seg__item--active')}
                      aria-pressed={active}
                      disabled={disabled}
                      onClick={() => {
                        patch({ browStyle: brow.id })
                      }}
                    >
                      {brow.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <ColorSwatches
              label="唇色"
              options={LIP_COLORS.map((lip) => ({
                id: lip.id,
                label: lip.label,
                color: lip.swatch
              }))}
              value={value.lipColor}
              disabled={disabled}
              onChange={(lipColor) => {
                patch({ lipColor })
              }}
            />
            <TierSlider
              label="唇厚"
              labels={['薄', '标准', '厚']}
              value={value.lipFullness}
              disabled={disabled}
              onChange={(lipFullness) => {
                patch({ lipFullness })
              }}
            />
          </>
        )}

        {renderGroup(
          'hair',
          <>
            <span className="character-control__label">发型</span>
            <ChoiceGrid>
              {HAIR_STYLES.map((style) => {
                const active = style.id === value.hairStyle
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={cx('character-choice', active && 'character-choice--active')}
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => {
                      patch({ hairStyle: style.id })
                    }}
                  >
                    <span className="character-choice__thumb">
                      <GirlfriendAvatar
                        config={{ ...value, hairStyle: style.id }}
                        variant="avatar"
                        name={style.label}
                      />
                    </span>
                    <span className="character-choice__label">{style.label}</span>
                    <span className="character-choice__hint">{HAIR_HINTS[style.id]}</span>
                  </button>
                )
              })}
            </ChoiceGrid>
            <ColorSwatches
              label="发色"
              options={HAIR_COLORS.map((tone) => ({
                id: tone.id,
                label: tone.label,
                color: tone.base
              }))}
              value={value.hairColor}
              disabled={disabled}
              onChange={(hairColor) => {
                patch({ hairColor })
              }}
            />
          </>
        )}

        {renderGroup(
          'outfit',
          <>
            <span className="character-control__label">服饰风格</span>
            <ChoiceGrid>
              {OUTFIT_STYLES.map((style) => {
                const active = style.id === value.outfitStyle
                return (
                  <button
                    key={style.id}
                    type="button"
                    className={cx('character-choice', active && 'character-choice--active')}
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => {
                      patch({ outfitStyle: style.id })
                    }}
                  >
                    <span className="character-choice__thumb">
                      <GirlfriendAvatar
                        config={{ ...value, outfitStyle: style.id }}
                        variant="avatar"
                        name={style.label}
                      />
                    </span>
                    <span className="character-choice__label">{style.label}</span>
                    <span className="character-choice__hint">{style.hint}</span>
                  </button>
                )
              })}
            </ChoiceGrid>
            <ColorSwatches
              label="主色"
              options={OUTFIT_COLORS.map((tone) => ({
                id: tone.id,
                label: tone.label,
                color: tone.base
              }))}
              value={value.outfitColor}
              disabled={disabled}
              onChange={(outfitColor) => {
                patch({ outfitColor })
              }}
            />
            <div className="character-control" role="group" aria-label="配饰">
              <span className="character-control__head">
                <span className="character-control__label">配饰</span>
              </span>
              <div className="character-seg">
                {ACCESSORIES.map((accessory) => {
                  const active = accessory.id === value.accessory
                  return (
                    <button
                      key={accessory.id}
                      type="button"
                      className={cx('character-seg__item', active && 'character-seg__item--active')}
                      aria-pressed={active}
                      disabled={disabled}
                      onClick={() => {
                        patch({ accessory: accessory.id })
                      }}
                    >
                      {accessory.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
