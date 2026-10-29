import {
  ECONOMY_OPTIONS,
  GROWTH_OPTIONS,
  MAX_EXTRA_NOTE_LENGTH,
  RELATIONS_OPTIONS,
  familyInfluence,
  familySummary,
  type EconomyId,
  type FamilyConfig,
  type FamilyOption,
  type GrowthId,
  type RelationsId
} from './characterTypes'
import { cx, errorOf } from './characterUiHelpers'

export interface FamilyPanelProps {
  readonly value: FamilyConfig
  readonly onChange: (next: FamilyConfig) => void
  readonly errors: Readonly<Record<string, string>>
  readonly readOnly?: boolean
}

function OptionGroup<T extends string>({
  title,
  hint,
  options,
  value,
  disabled,
  onSelect
}: {
  readonly title: string
  readonly hint: string
  readonly options: readonly FamilyOption<T>[]
  readonly value: T
  readonly disabled: boolean
  readonly onSelect: (next: T) => void
}) {
  const selected = options.find((option) => option.id === value) ?? options[0]
  return (
    <section className="family-group">
      <div className="family-group__head">
        <h3 className="family-group__title">{title}</h3>
        <span className="family-group__hint">{hint}</span>
      </div>
      <div className="family-pills" role="group" aria-label={title}>
        {options.map((option) => {
          const active = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              className={cx('family-pill', active && 'family-pill--active')}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => {
                onSelect(option.id)
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {selected !== undefined && (
        <div className="family-detail">
          <p className="family-detail__desc">{selected.description}</p>
          <p className="family-detail__influence">对她的影响：{selected.influence}</p>
        </div>
      )}
    </section>
  )
}

/** 家庭背景：三个维度 + “这样的她”摘要 + 可选补充设定。 */
export default function FamilyPanel({
  value,
  onChange,
  errors,
  readOnly = false
}: FamilyPanelProps) {
  const extraError = errorOf(errors, 'extraNote')

  const patch = (next: Partial<FamilyConfig>): void => {
    onChange({ ...value, ...next })
  }

  return (
    <section className="character-panel family" aria-labelledby="family-title">
      <header className="character-panel__head">
        <div>
          <h2 className="character-panel__title" id="family-title">
            家庭
          </h2>
          <p className="character-panel__hint">
            这些设定给角色“生活质感”，不是给现实做评判；每个选项都写成表达倾向。
          </p>
        </div>
      </header>

      {readOnly && (
        <p className="character-panel__readonly" role="note">
          官方人设只读：成长环境、家庭关系与经济状况来自官方设定。
        </p>
      )}

      <div className="family__groups">
        <OptionGroup<GrowthId>
          title="成长环境"
          hint="她的来处"
          options={GROWTH_OPTIONS}
          value={value.growth}
          disabled={readOnly}
          onSelect={(growth) => {
            patch({ growth })
          }}
        />
        <OptionGroup<RelationsId>
          title="家庭关系"
          hint="她的家庭"
          options={RELATIONS_OPTIONS}
          value={value.relations}
          disabled={readOnly}
          onSelect={(relations) => {
            patch({ relations })
          }}
        />
        <OptionGroup<EconomyId>
          title="经济状况"
          hint="她的日常"
          options={ECONOMY_OPTIONS}
          value={value.economy}
          disabled={readOnly}
          onSelect={(economy) => {
            patch({ economy })
          }}
        />
      </div>

      <div className="family-summary">
        <span className="family-summary__label">这样的她</span>
        <p className="family-summary__title">{familySummary(value)}</p>
        <p className="family-summary__text">{familyInfluence(value)}</p>
      </div>

      <label className="character-field family__note">
        <span className="character-field__label">
          补充设定
          <span className="character-field__support-inline">选填</span>
        </span>
        <input
          className={cx(
            'character-input',
            extraError !== undefined && 'character-input--error'
          )}
          type="text"
          value={value.extraNote}
          maxLength={MAX_EXTRA_NOTE_LENGTH}
          placeholder="例如：怕打雷；每年冬天回外婆家。"
          autoComplete="off"
          readOnly={readOnly}
          disabled={readOnly}
          aria-invalid={extraError !== undefined}
          onChange={(event) => {
            patch({ extraNote: event.target.value })
          }}
        />
        <span className="character-field__support">
          <span>只补充生活细节，不覆盖行为边界。</span>
          <span className="character-field__count">
            {value.extraNote.length}/{MAX_EXTRA_NOTE_LENGTH}
          </span>
        </span>
        {extraError !== undefined && (
          <span className="character-error" role="alert">
            {extraError}
          </span>
        )}
      </label>

      <p className="family__fixed-note" role="note">
        这些设定只影响她的表达与生活细节，不代表对任何群体的判断。
      </p>
    </section>
  )
}
