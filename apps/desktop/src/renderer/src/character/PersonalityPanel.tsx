import { useMemo, useState } from 'react'
import Icon from '../ui/Icon'
import type { AvatarConfig } from '../avatar/avatarConfig'
import {
  ADDRESS_PRESETS,
  DEFAULT_EXPRESSION,
  INTENSITY_OPTIONS,
  INITIATIVE_OPTIONS,
  JEALOUSY_OPTIONS,
  MAX_ADDRESS_LENGTH,
  MAX_MODIFIERS,
  PERSONALITY_ARCHETYPES,
  PERSONALITY_MODIFIERS,
  SELF_REF_PRESETS,
  personalitySummary,
  type ExpressionConfig,
  type IntensityId,
  type InitiativeId,
  type JealousyId,
  type PersonalityConfig,
  type PersonalityModifierId
} from './characterTypes'
import {
  EXPRESSION_TEMPERATURE_MAX,
  EXPRESSION_TEMPERATURE_MIN,
  TEMPERATURE_SCALE_TICKS,
  calculateExpressionTemperature,
  formatTemperature,
  roundTemperature
} from './expressionTemperature'
import {
  buildPersonalityPreview,
  buildProactiveOpeningLine,
  initiativeLabel,
  intensityLabel
} from './personaPreview'
import { cx, errorOf } from './characterUiHelpers'

export interface PersonalityPanelProps {
  readonly value: PersonalityConfig
  readonly avatarConfig: AvatarConfig
  readonly expression: ExpressionConfig
  readonly onChange: (next: PersonalityConfig) => void
  readonly onExpressionChange: (next: ExpressionConfig) => void
  readonly errors: Readonly<Record<string, string>>
  readonly readOnly?: boolean
}

const SCENARIOS = [
  '你说“今天好累”',
  '你夸“你今天真好看”',
  '你提到“周末和女同事吃饭”',
  '她主动开场'
] as const

function Segmented<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange
}: {
  readonly label: string
  readonly options: readonly { readonly id: T; readonly label: string }[]
  readonly value: T
  readonly disabled: boolean
  readonly onChange: (next: T) => void
}) {
  return (
    <div className="character-control" role="group" aria-label={label}>
      <span className="character-control__head">
        <span className="character-control__label">{label}</span>
        <span className="character-control__value">
          {options.find((option) => option.id === value)?.label ?? ''}
        </span>
      </span>
      <div className="character-seg">
        {options.map((option) => {
          const active = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              className={cx('character-seg__item', active && 'character-seg__item--active')}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => {
                onChange(option.id)
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 性格面板：主性格、调味标签、表达方式与本地试聊预览。 */
export default function PersonalityPanel({
  value,
  avatarConfig,
  expression,
  onChange,
  onExpressionChange,
  errors,
  readOnly = false
}: PersonalityPanelProps) {
  const preview = useMemo(() => buildPersonalityPreview(value), [value])
  const modifierError = errorOf(errors, 'modifiers')
  const addressError = errorOf(errors, 'addressUser')
  const expressionError = errorOf(errors, 'expression')
  const [explainOpen, setExplainOpen] = useState(false)

  const autoTemperature = useMemo(
    () => calculateExpressionTemperature(value, avatarConfig),
    [value, avatarConfig]
  )
  const manualOverride = expression.mode === 'manual' ? expression.temperatureOverride : null
  const effectiveTemperature = manualOverride ?? autoTemperature.autoTemperature
  const overrideDelta =
    manualOverride === null ? 0 : roundTemperature(manualOverride - autoTemperature.autoTemperature)
  const overrideHint =
    manualOverride === null
      ? ''
      : overrideDelta === 0
        ? `与推荐值一致（${formatTemperature(autoTemperature.autoTemperature)}）`
        : `比推荐${overrideDelta > 0 ? '高' : '低'} ${formatTemperature(Math.abs(overrideDelta))}`

  const previewLines = useMemo(() => {
    const lines = [...preview.lines]
    lines[3] = buildProactiveOpeningLine(effectiveTemperature, value.addressUser)
    return lines
  }, [preview, effectiveTemperature, value.addressUser])

  const setExpressionMode = (mode: ExpressionConfig['mode']): void => {
    if (mode === 'auto') {
      onExpressionChange(DEFAULT_EXPRESSION)
      return
    }
    onExpressionChange({
      mode: 'manual',
      temperatureOverride: manualOverride ?? autoTemperature.autoTemperature
    })
  }

  const patch = (next: Partial<PersonalityConfig>): void => {
    onChange({ ...value, ...next })
  }

  const toggleModifier = (id: PersonalityModifierId): void => {
    if (readOnly) {
      return
    }
    const selected = value.modifiers.includes(id)
    if (selected) {
      patch({ modifiers: value.modifiers.filter((item) => item !== id) })
      return
    }
    if (value.modifiers.length >= MAX_MODIFIERS) {
      return
    }
    const option = PERSONALITY_MODIFIERS.find((item) => item.id === id)
    if (
      option?.conflictsWith !== undefined &&
      value.modifiers.includes(option.conflictsWith)
    ) {
      return
    }
    patch({ modifiers: [...value.modifiers, id] })
  }

  const slowWarmHint =
    value.modifiers.includes('slow-warm') &&
    (value.initiative === 'high' || value.modifiers.includes('clingy'))

  const jealousyLabel =
    JEALOUSY_OPTIONS.find((option) => option.id === value.jealousy)?.label ?? '中'

  return (
    <section className="character-panel personality" aria-labelledby="personality-title">
      <header className="character-panel__head">
        <div>
          <h2 className="character-panel__title" id="personality-title">
            性格
          </h2>
          <p className="character-panel__hint">
            主性格决定她怎么理解关系，调味标签决定她怎么把这种性格说出来。
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="character-panel__readonly" role="note">
          官方人设只读：主性格、调味标签与表达方式来自官方设定。
        </p>
      )}

      <div className="personality__layout">
        <div className="personality__main">
          <section className="personality__section" aria-labelledby="personality-archetype-title">
            <div className="personality__section-head">
              <h3 className="personality__subtitle" id="personality-archetype-title">
                主性格
              </h3>
              <span className="personality__section-hint">必选 1 个</span>
            </div>
            <div className="personality__grid" role="radiogroup" aria-label="主性格">
              {PERSONALITY_ARCHETYPES.map((item) => {
                const active = item.id === value.archetype
                return (
                  <div
                    className={cx('personality-card', active && 'personality-card--active')}
                    key={item.id}
                  >
                    <button
                      className="personality-card__select"
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={readOnly}
                      onClick={() => {
                        patch({ archetype: item.id })
                      }}
                    >
                      <span className="personality-card__head">
                        <span className="personality-card__label">{item.label}</span>
                        {active && (
                          <span className="personality-card__check">
                            <Icon name="check" size={13} />
                          </span>
                        )}
                      </span>
                      <span className="personality-card__keywords">
                        {item.keywords.join(' · ')}
                      </span>
                      <span className="personality-card__sample">
                        “{item.samples.tired}”
                      </span>
                    </button>
                    {active && (
                      <dl className="personality-card__detail">
                        <div>
                          <dt>关心方式</dt>
                          <dd>{item.care}</dd>
                        </div>
                        <div>
                          <dt>生气方式</dt>
                          <dd>{item.conflict}</dd>
                        </div>
                        <div>
                          <dt>说话特征</dt>
                          <dd>{item.speech}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="personality__section" aria-labelledby="personality-modifier-title">
            <div className="personality__section-head">
              <h3 className="personality__subtitle" id="personality-modifier-title">
                调味标签
              </h3>
              <span className="personality__section-hint">
                最多 {MAX_MODIFIERS} 个 · 已选 {value.modifiers.length}
              </span>
            </div>
            <div className="personality__chips" role="group" aria-label="调味标签">
              {PERSONALITY_MODIFIERS.map((item) => {
                const selected = value.modifiers.includes(item.id)
                const blocked =
                  !selected &&
                  item.conflictsWith !== undefined &&
                  value.modifiers.includes(item.conflictsWith)
                const capped = !selected && value.modifiers.length >= MAX_MODIFIERS
                const disabled = readOnly || blocked || capped
                const reason = blocked
                  ? `与已选的「${item.conflictsWith === 'independent' ? '独立' : '黏人'}」互斥`
                  : capped
                    ? `最多选 ${MAX_MODIFIERS} 个，先取消一个`
                    : item.description
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(
                      'personality-chip',
                      selected && 'personality-chip--active',
                      blocked && 'personality-chip--blocked'
                    )}
                    aria-pressed={selected}
                    aria-disabled={disabled}
                    title={reason}
                    disabled={disabled}
                    onClick={() => {
                      toggleModifier(item.id)
                    }}
                  >
                    {selected && <Icon name="check" size={12} />}
                    {item.label}
                  </button>
                )
              })}
            </div>
            {slowWarmHint && (
              <p className="personality__soft-hint" role="note">
                “慢热”和“主动/黏人”同时选，会让她的主动显得忽冷忽热；可以保留，也可以再调。
              </p>
            )}
            {modifierError !== undefined && (
              <p className="character-error" role="alert">
                {modifierError}
              </p>
            )}
          </section>

          <section className="personality__section" aria-labelledby="personality-expression-title">
            <div className="personality__section-head">
              <h3 className="personality__subtitle" id="personality-expression-title">
                表达方式
              </h3>
              <span className="personality__section-hint">细调，会逐字进入提示词</span>
            </div>
            <div className="personality__controls">
              <Segmented<IntensityId>
                label="表达强度"
                options={INTENSITY_OPTIONS}
                value={value.intensity}
                disabled={readOnly}
                onChange={(intensity) => {
                  patch({ intensity })
                }}
              />
              <Segmented<InitiativeId>
                label="主动程度"
                options={INITIATIVE_OPTIONS}
                value={value.initiative}
                disabled={readOnly}
                onChange={(initiative) => {
                  patch({ initiative })
                }}
              />
              {!readOnly && (
                <div
                  className="character-control"
                  role="group"
                  aria-label="表达温度"
                  style={{ gridColumn: '1 / -1' }}
                >
                  <span className="character-control__head">
                    <span className="character-control__label">表达温度</span>
                    <span className="character-control__value">
                      {formatTemperature(effectiveTemperature)} ·{' '}
                      {manualOverride === null ? '自动' : '手动'}
                    </span>
                  </span>
                  <div className="personality__address" role="radiogroup" aria-label="表达温度模式">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={manualOverride === null}
                      className={cx(
                        'personality-chip personality-chip--small',
                        manualOverride === null && 'personality-chip--active'
                      )}
                      onClick={() => {
                        setExpressionMode('auto')
                      }}
                    >
                      自动（推荐）
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={manualOverride !== null}
                      className={cx(
                        'personality-chip personality-chip--small',
                        manualOverride !== null && 'personality-chip--active'
                      )}
                      onClick={() => {
                        setExpressionMode('manual')
                      }}
                    >
                      手动覆盖
                    </button>
                  </div>
                  {manualOverride !== null && (
                    <>
                      <input
                        type="range"
                        min={EXPRESSION_TEMPERATURE_MIN}
                        max={EXPRESSION_TEMPERATURE_MAX}
                        step={0.01}
                        value={manualOverride}
                        aria-label="手动表达温度"
                        aria-valuetext={formatTemperature(manualOverride)}
                        onChange={(event) => {
                          onExpressionChange({
                            mode: 'manual',
                            temperatureOverride: roundTemperature(Number(event.target.value))
                          })
                        }}
                        style={{ width: '100%' }}
                      />
                      <div
                        className="personality__address"
                        style={{ justifyContent: 'space-between' }}
                      >
                        {TEMPERATURE_SCALE_TICKS.map((tick) => (
                          <span className="character-control__help" key={tick.value}>
                            {tick.label} {formatTemperature(tick.value)}
                          </span>
                        ))}
                      </div>
                      <span className="character-control__help">
                        {overrideHint}；推荐值 {formatTemperature(autoTemperature.autoTemperature)}
                        ，调整性格或形象会自动重算，但不会覆盖你的手动值。
                      </span>
                    </>
                  )}
                  <span className="character-control__help">
                    影响用词的跳跃度和主动分享的意愿；不改变她的性格和边界。
                  </span>
                  <div className="personality__address">
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      aria-expanded={explainOpen}
                      onClick={() => {
                        setExplainOpen((previous) => !previous)
                      }}
                    >
                      {explainOpen ? '收起说明' : '为什么是这个值'}
                    </button>
                    {manualOverride !== null && (
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => {
                          setExpressionMode('auto')
                        }}
                      >
                        恢复推荐值
                      </button>
                    )}
                  </div>
                  {explainOpen && (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {autoTemperature.explanation.map((line) => (
                        <li className="character-control__help" key={line}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {expressionError !== undefined && (
                    <span className="character-error" role="alert">
                      {expressionError}
                    </span>
                  )}
                </div>
              )}
              <Segmented<JealousyId>
                label="在意程度"
                options={JEALOUSY_OPTIONS}
                value={value.jealousy}
                disabled={readOnly}
                onChange={(jealousy) => {
                  patch({ jealousy })
                }}
              />

              <div className="character-control">
                <span className="character-control__head">
                  <span className="character-control__label">她怎么叫你</span>
                  <span className="character-control__value">
                    {value.addressUser.length}/{MAX_ADDRESS_LENGTH}
                  </span>
                </span>
                <div className="personality__address">
                  {ADDRESS_PRESETS.map((preset) => {
                    const active = value.addressUser === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={cx(
                          'personality-chip personality-chip--small',
                          active && 'personality-chip--active'
                        )}
                        aria-pressed={active}
                        disabled={readOnly}
                        onClick={() => {
                          patch({ addressUser: preset })
                        }}
                      >
                        {preset}
                      </button>
                    )
                  })}
                  <input
                    className={cx(
                      'character-input personality__address-input',
                      addressError !== undefined && 'character-input--error'
                    )}
                    type="text"
                    value={value.addressUser}
                    maxLength={MAX_ADDRESS_LENGTH}
                    placeholder="自定义 1–6 字"
                    autoComplete="off"
                    readOnly={readOnly}
                    disabled={readOnly}
                    aria-label="自定义她对你的称呼"
                    aria-invalid={addressError !== undefined}
                    onChange={(event) => {
                      patch({ addressUser: event.target.value })
                    }}
                  />
                </div>
                {addressError !== undefined && (
                  <span className="character-error" role="alert">
                    {addressError}
                  </span>
                )}
                <span className="character-control__help">
                  称呼会逐字进入提示词，但不会每句重复。
                </span>
              </div>

              <div className="character-control" role="group" aria-label="自称">
                <span className="character-control__head">
                  <span className="character-control__label">她怎么自称</span>
                </span>
                <div className="personality__address">
                  {SELF_REF_PRESETS.map((preset) => {
                    const active = value.selfRef === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={cx(
                          'personality-chip personality-chip--small',
                          active && 'personality-chip--active'
                        )}
                        aria-pressed={active}
                        disabled={readOnly}
                        onClick={() => {
                          patch({ selfRef: preset.id })
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <span className="character-control__help">
                  避免每句都带自称；“自己的名字”会替换成角色名。
                </span>
              </div>
            </div>
          </section>
        </div>

        <aside className="personality__preview" aria-labelledby="personality-preview-title">
          <div className="personality__section-head">
            <h3 className="personality__subtitle" id="personality-preview-title">
              她会这样回应
            </h3>
            <span className="personality__section-hint">试聊</span>
          </div>
          {!readOnly && (
            <p className="personality__preview-note">
              表达温度 {formatTemperature(effectiveTemperature)}（
              {manualOverride === null ? '自动' : '手动'}）· {personalitySummary(value)}
            </p>
          )}
          <p className="personality__preview-note">
            风格示例，实际对话由模型生成。
          </p>
          <ul className="personality__bubbles">
            {SCENARIOS.map((scenario, index) => (
              <li className="personality-bubble" key={scenario}>
                <span className="personality-bubble__scenario">{scenario}</span>
                <span className="personality-bubble__line">
                  {previewLines[index] ?? ''}
                </span>
              </li>
            ))}
          </ul>
          <div className="personality__summary">
            <span className="personality__summary-label">性格摘要</span>
            <p className="personality__summary-title">{personalitySummary(value)}</p>
            <p className="personality__summary-text">{preview.summary}</p>
            <p className="personality__tone">
              {intensityLabel(value.intensity)}表达 · {initiativeLabel(value.initiative)}主动 ·
              在意{jealousyLabel} · 自称“{value.selfRef === 'name' ? '自己的名字' : value.selfRef}”
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}
