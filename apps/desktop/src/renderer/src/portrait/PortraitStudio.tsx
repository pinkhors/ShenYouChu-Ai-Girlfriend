import { useRef, useState, type ChangeEvent } from 'react'
import Icon from '../ui/Icon'
import { cutoutPortrait } from './cutout'
import {
  PORTRAIT_SLOTS,
  resolvePortrait,
  type PortraitExpression,
  type PortraitSet
} from './expression'
import GenerationPanel from './GenerationPanel'
import { fileToDataUrl } from './image'

interface PortraitStudioProps {
  readonly portraits: PortraitSet | null
  readonly heroImage: string | null
  readonly onSetHero: (dataUrl: string) => Promise<boolean>
  readonly onClearHero: () => Promise<boolean>
  /** 导入一张表情图；返回 false 表示持久化失败。 */
  readonly onImport: (slot: PortraitExpression, dataUrl: string) => Promise<boolean>
  readonly onRemove: (slot: PortraitExpression) => Promise<boolean>
  readonly onClear: () => Promise<boolean>
}

/** 形象页的“立绘”tab：导入 AI 立绘与表情差分，通话页直接复用这套图。 */
export default function PortraitStudio({
  portraits,
  heroImage,
  onSetHero,
  onClearHero,
  onImport,
  onRemove,
  onClear
}: PortraitStudioProps) {
  const [selected, setSelected] = useState<PortraitExpression>('neutral')
  const [busy, setBusy] = useState<PortraitExpression | 'clear' | null>(null)
  const [cuttingOut, setCuttingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingSlot = useRef<PortraitExpression | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const preview = resolvePortrait(portraits, selected)
  const selectedLabel = PORTRAIT_SLOTS.find((slot) => slot.id === selected)?.label ?? '基础'
  const count = PORTRAIT_SLOTS.filter((slot) => portraits?.[slot.id] !== undefined).length

  const pick = (slot: PortraitExpression): void => {
    if (busy !== null) {
      return
    }
    pendingSlot.current = slot
    inputRef.current?.click()
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    const slot = pendingSlot.current
    pendingSlot.current = null
    if (file === undefined || slot === null) {
      return
    }

    setError(null)
    setBusy(slot)
    try {
      const dataUrl = await fileToDataUrl(file)
      const saved = await onImport(slot, dataUrl)
      if (!saved) {
        setError('保存失败，可能是本地存储不可用；请重试。')
        return
      }
      setSelected(slot)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败')
    } finally {
      setBusy(null)
    }
  }

  const handleRemove = async (slot: PortraitExpression): Promise<void> => {
    if (!window.confirm('删除这张表情图？通话时将回退到基础表情。')) {
      return
    }
    setError(null)
    setBusy(slot)
    try {
      const removed = await onRemove(slot)
      if (!removed) {
        setError('删除失败，请重试。')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!window.confirm('清空所有已导入的立绘？头像和通话会回退到矢量形象。')) {
      return
    }
    setError(null)
    setBusy('clear')
    try {
      const cleared = await onClear()
      if (!cleared) {
        setError('清空失败，请重试。')
      }
    } finally {
      setBusy(null)
    }
  }

  const handleCutout = async (): Promise<void> => {
    const base = resolvePortrait(portraits, 'neutral')
    if (base === null) {
      setError('请先导入基础立绘，再抠出人物。')
      return
    }
    setError(null)
    setCuttingOut(true)
    try {
      const cutout = await cutoutPortrait(base)
      const saved = await onSetHero(cutout)
      if (!saved) {
        setError('抠图成功，但保存聊天形象失败，请重试。')
      }
    } catch (cutoutError) {
      setError(cutoutError instanceof Error ? cutoutError.message : '抠图失败')
    } finally {
      setCuttingOut(false)
    }
  }

  const handleClearHero = async (): Promise<void> => {
    setError(null)
    setCuttingOut(true)
    try {
      const cleared = await onClearHero()
      if (!cleared) {
        setError('清除聊天形象失败，请重试。')
      }
    } finally {
      setCuttingOut(false)
    }
  }

  return (
    <section className="studio" aria-label="立绘导入">
      <input
        ref={inputRef}
        className="studio__file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void handleFile(event)
        }}
      />

      <div className="studio__stage">
        <div className="studio__frame">
          {preview === null ? (
            <div className="studio__empty">
              <Icon name="sparkles" size={30} />
              <p className="studio__empty-title">还没有导入立绘</p>
              <p className="muted">先用 AI 生成一张半身像，再从这里导入。</p>
              <button className="btn btn--primary" type="button" onClick={() => pick('neutral')}>
                <Icon name="plus" size={16} />
                导入基础立绘
              </button>
            </div>
          ) : (
            <img className="studio__image" src={preview} alt={`沈幼楚 · ${selectedLabel}`} />
          )}
        </div>
        <div className="studio__caption">
          <span>{preview === null ? '未导入' : `预览：${selectedLabel}`}</span>
          <span className="muted">已导入 {count} / {PORTRAIT_SLOTS.length} 张</span>
        </div>
      </div>

      <aside className="studio__side">
        <div className="studio__intro">
          <h2 className="studio__title">她的立绘</h2>
          <p className="muted">
            导入 AI 生成的同一角色、不同表情；通话时按心情和操作切换。缺失的表情会自动回退到基础图。
          </p>
          <p className="studio__tip">
            建议：正面/半身、同构图、透明或纯色背景；导入后自动压到长边 1400px，原始文件不会外传。
          </p>
        </div>

        {error !== null && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="hero-cutout">
          <div className="hero-cutout__head">
            <span className="hero-cutout__title">聊天页人物</span>
            {heroImage !== null && (
              <button
                className="hero-cutout__clear"
                type="button"
                disabled={cuttingOut}
                onClick={() => {
                  void handleClearHero()
                }}
              >
                清除
              </button>
            )}
          </div>
          {heroImage !== null ? (
            <div className="hero-cutout__preview">
              <img src={heroImage} alt="聊天页人物预览" />
            </div>
          ) : (
            <p className="hero-cutout__empty">从基础立绘里抠出人物，聊天页顶部会用它展示。</p>
          )}
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={resolvePortrait(portraits, 'neutral') === null || cuttingOut}
            onClick={() => {
              void handleCutout()
            }}
          >
            <Icon name="sparkles" size={15} />
            {cuttingOut ? '处理中…' : heroImage === null ? '抠出人物' : '重新抠图'}
          </button>
          <p className="hero-cutout__hint">纯色/简单背景效果最好；复杂背景会残留。</p>
        </div>

        <GenerationPanel onSave={onImport} />

        <div className="slot-grid">
          {PORTRAIT_SLOTS.map((slot) => {
            const image = portraits?.[slot.id]
            const isActive = selected === slot.id
            const isBusy = busy === slot.id
            return (
              <div className={isActive ? 'slot slot--active' : 'slot'} key={slot.id}>
                <button
                  className="slot__thumb"
                  type="button"
                  title={image === undefined ? `导入${slot.label}` : `查看${slot.label}`}
                  disabled={isBusy}
                  onClick={() => {
                    if (image === undefined) {
                      pick(slot.id)
                    } else {
                      setSelected(slot.id)
                    }
                  }}
                >
                  {image === undefined ? (
                    <span className="slot__placeholder">
                      <Icon name="plus" size={18} />
                    </span>
                  ) : (
                    <img src={image} alt={`${slot.label}表情`} />
                  )}
                </button>
                <div className="slot__meta">
                  <span className="slot__label">{slot.label}</span>
                  <span className="slot__hint">{isBusy ? '处理中…' : slot.hint}</span>
                </div>
                <div className="slot__actions">
                  <button
                    className="slot__action"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => pick(slot.id)}
                  >
                    {image === undefined ? '导入' : '替换'}
                  </button>
                  {image !== undefined && (
                    <button
                      className="slot__action slot__action--danger"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void handleRemove(slot.id)
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="studio__footer">
          <button
            className="btn btn--ghost"
            type="button"
            disabled={busy !== null || count === 0}
            onClick={() => {
              void handleClear()
            }}
          >
            <Icon name="trash" size={16} />
            {busy === 'clear' ? '清空中…' : '清空全部立绘'}
          </button>
          <span className="muted">立绘只保存在本机，按用户隔离。</span>
        </div>
      </aside>
    </section>
  )
}
