import { useState } from 'react'
import AvatarEditor from './avatar/AvatarEditor'
import type { AvatarConfig } from './avatar/avatarConfig'
import { resolveAvatarSource } from './portrait/avatarSource'
import { PORTRAIT_SLOTS, type PortraitExpression, type PortraitSet } from './portrait/expression'
import PortraitStudio from './portrait/PortraitStudio'

interface LookPageProps {
  readonly config: AvatarConfig
  readonly onSave: (next: AvatarConfig) => void
  readonly portraits: PortraitSet | null
  readonly portraitsLoading: boolean
  readonly onImportPortrait: (slot: PortraitExpression, dataUrl: string) => Promise<boolean>
  readonly onRemovePortrait: (slot: PortraitExpression) => Promise<boolean>
  readonly onClearPortraits: () => Promise<boolean>
}

type LookTab = 'portrait' | 'vector'

/** 形象页：优先用导入的 AI 立绘，没有立绘时再用矢量捏脸。 */
export default function LookPage({
  config,
  onSave,
  portraits,
  portraitsLoading,
  onImportPortrait,
  onRemovePortrait,
  onClearPortraits
}: LookPageProps) {
  const [tab, setTab] = useState<LookTab>('portrait')
  const avatarSource = resolveAvatarSource(portraits, portraitsLoading)
  const portraitCount = PORTRAIT_SLOTS.filter((slot) => portraits?.[slot.id] !== undefined).length
  const sourceText =
    avatarSource === 'loading'
      ? '正在加载…'
      : avatarSource === 'portrait'
        ? `已导入立绘（${portraitCount} 张）`
        : '默认矢量形象'

  return (
    <section className="look" aria-label="形象">
      <header className="look__header">
        <div>
          <h1 className="look__title">她的样子</h1>
          <p className="look__subtitle">导入 AI 立绘，或继续用捏脸参数；立绘优先展示。</p>
          <p className="look__source">通话将使用：{sourceText}</p>
        </div>
        <div className="segmented" role="tablist" aria-label="形象来源">
          <button
            className={tab === 'portrait' ? 'segmented__item segmented__item--active' : 'segmented__item'}
            type="button"
            role="tab"
            aria-selected={tab === 'portrait'}
            onClick={() => {
              setTab('portrait')
            }}
          >
            立绘
          </button>
          <button
            className={tab === 'vector' ? 'segmented__item segmented__item--active' : 'segmented__item'}
            type="button"
            role="tab"
            aria-selected={tab === 'vector'}
            onClick={() => {
              setTab('vector')
            }}
          >
            捏脸
          </button>
        </div>
      </header>

      <div className="look__body">
        {tab === 'portrait' ? (
          <PortraitStudio
            portraits={portraits}
            onImport={onImportPortrait}
            onRemove={onRemovePortrait}
            onClear={onClearPortraits}
          />
        ) : (
          <AvatarEditor config={config} onSave={onSave} />
        )}
      </div>
    </section>
  )
}
