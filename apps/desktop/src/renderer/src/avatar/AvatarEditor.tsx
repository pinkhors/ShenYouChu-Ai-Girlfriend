import { useEffect, useState } from 'react'
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
  SKIN_TONES,
  describeAvatar,
  isSameAvatar,
  randomizeAvatar,
  type AvatarConfig
} from './avatarConfig'
import GirlfriendAvatar from './GirlfriendAvatar'

interface AvatarEditorProps {
  /** 已保存的形象；作为“未保存修改”的比较基准。 */
  readonly config: AvatarConfig
  readonly onSave: (next: AvatarConfig) => void
}

interface SwatchOption<T extends string> {
  readonly id: T
  readonly label: string
  readonly color: string
}

function Swatches<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  readonly label: string
  readonly options: readonly SwatchOption<T>[]
  readonly value: T
  readonly onChange: (next: T) => void
}) {
  return (
    <div className="control" role="group" aria-label={label}>
      <span className="control__label">{label}</span>
      <div className="swatches">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'swatch swatch--active' : 'swatch'}
            style={{ background: option.color }}
            title={option.label}
            aria-label={option.label}
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
          />
        ))}
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  onChange
}: {
  readonly label: string
  readonly value: number
  readonly onChange: (next: number) => void
}) {
  return (
    <label className="control">
      <span className="control__label">
        {label}
        <span className="control__value">{Math.round(value * 100)}</span>
      </span>
      <input
        className="slider"
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
    </label>
  )
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  readonly label: string
  readonly options: readonly { readonly id: T; readonly label: string }[]
  readonly value: T
  readonly onChange: (next: T) => void
}) {
  return (
    <div className="control" role="group" aria-label={label}>
      <span className="control__label">{label}</span>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? 'segmented__item segmented__item--active' : 'segmented__item'}
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AvatarEditor({ config, onSave }: AvatarEditorProps) {
  const [draft, setDraft] = useState<AvatarConfig>(config)
  const [justSaved, setJustSaved] = useState(false)

  /* 保存成功后父组件会回传新 config，这里同步草稿 */
  useEffect(() => {
    setDraft(config)
  }, [config])

  const isDirty = !isSameAvatar(draft, config)

  const update = (patch: Partial<AvatarConfig>): void => {
    setDraft((previous) => ({ ...previous, ...patch }))
    setJustSaved(false)
  }

  const handleSave = (): void => {
    onSave(draft)
    setJustSaved(true)
  }

  const handleReset = (): void => {
    setDraft(DEFAULT_AVATAR)
    setJustSaved(false)
  }

  const skinOptions = SKIN_TONES.map((tone) => ({ id: tone.id, label: tone.label, color: tone.base }))
  const hairColorOptions = HAIR_COLORS.map((tone) => ({ id: tone.id, label: tone.label, color: tone.base }))
  const eyeOptions = EYE_COLORS.map((tone) => ({ id: tone.id, label: tone.label, color: tone.iris }))
  const lipOptions = LIP_COLORS.map((tone) => ({ id: tone.id, label: tone.label, color: tone.swatch }))
  const outfitOptions = OUTFIT_COLORS.map((tone) => ({ id: tone.id, label: tone.label, color: tone.base }))

  return (
    <section className="editor" aria-label="捏脸编辑器">
      <aside className="editor__preview">
        <div className="editor__portrait">
          <GirlfriendAvatar config={draft} />
        </div>
        <h2 className="editor__name">沈幼楚</h2>
        <p className="editor__desc">{describeAvatar(draft)}</p>
        <p className="editor__state" role="status">
          {justSaved && !isDirty ? '形象已保存' : isDirty ? '有未保存的修改' : '与已保存的形象一致'}
        </p>

        <div className="editor__actions">
          <button className="btn btn--primary" type="button" onClick={handleSave} disabled={!isDirty}>
            保存形象
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              setDraft(randomizeAvatar())
              setJustSaved(false)
            }}
          >
            随机
          </button>
          <button className="btn btn--ghost" type="button" onClick={handleReset}>
            恢复默认
          </button>
        </div>

        <p className="editor__hint">
          当前为分层矢量预览，参数会原样保存；接入写实渲染服务后，用同一份参数生成半写实立绘。
        </p>
      </aside>

      <div className="editor__controls">
        <section className="control-group">
          <h3 className="control-group__title">预设</h3>
          <div className="presets">
            {AVATAR_PRESETS.map((preset) => {
              const active = isSameAvatar(draft, preset.config)
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={active ? 'preset preset--active' : 'preset'}
                  onClick={() => {
                    setDraft(preset.config)
                    setJustSaved(false)
                  }}
                >
                  <span className="preset__avatar">
                    <GirlfriendAvatar config={preset.config} variant="avatar" />
                  </span>
                  <span className="preset__text">
                    <span className="preset__name">{preset.name}</span>
                    <span className="preset__hint">{preset.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="control-group">
          <h3 className="control-group__title">基础</h3>
          <Swatches label="肤色" options={skinOptions} value={draft.skinTone} onChange={(skinTone) => update({ skinTone })} />
          <Slider label="脸型（圆 ↔ 鹅蛋）" value={draft.faceShape} onChange={(faceShape) => update({ faceShape })} />
        </section>

        <section className="control-group">
          <h3 className="control-group__title">头发</h3>
          <Segmented
            label="发型"
            options={HAIR_STYLES}
            value={draft.hairStyle}
            onChange={(hairStyle) => update({ hairStyle })}
          />
          <Swatches
            label="发色"
            options={hairColorOptions}
            value={draft.hairColor}
            onChange={(hairColor) => update({ hairColor })}
          />
        </section>

        <section className="control-group">
          <h3 className="control-group__title">五官</h3>
          <Swatches label="瞳色" options={eyeOptions} value={draft.eyeColor} onChange={(eyeColor) => update({ eyeColor })} />
          <Slider label="眼睛大小" value={draft.eyeSize} onChange={(eyeSize) => update({ eyeSize })} />
          <Slider label="眼距" value={draft.eyeSpacing} onChange={(eyeSpacing) => update({ eyeSpacing })} />
          <Segmented
            label="眉形"
            options={BROW_STYLES}
            value={draft.browStyle}
            onChange={(browStyle) => update({ browStyle })}
          />
        </section>

        <section className="control-group">
          <h3 className="control-group__title">妆容</h3>
          <Swatches label="唇色" options={lipOptions} value={draft.lipColor} onChange={(lipColor) => update({ lipColor })} />
          <Slider label="唇形厚度" value={draft.lipFullness} onChange={(lipFullness) => update({ lipFullness })} />
          <Slider label="腮红" value={draft.blush} onChange={(blush) => update({ blush })} />
        </section>

        <section className="control-group">
          <h3 className="control-group__title">穿搭</h3>
          <Swatches
            label="衣色"
            options={outfitOptions}
            value={draft.outfitColor}
            onChange={(outfitColor) => update({ outfitColor })}
          />
          <Segmented
            label="配饰"
            options={ACCESSORIES}
            value={draft.accessory}
            onChange={(accessory) => update({ accessory })}
          />
        </section>
      </div>
    </section>
  )
}
