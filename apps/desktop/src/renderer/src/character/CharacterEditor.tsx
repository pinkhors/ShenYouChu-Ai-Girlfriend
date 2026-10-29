import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { isSameAvatar } from '../avatar/avatarConfig'
import { buildCharacterBasePrompt } from '../portrait/generationConfig'
import type { PortraitExpression } from '../portrait/expression'
import PortraitStudio from '../portrait/PortraitStudio'
import Icon from '../ui/Icon'
import AppearancePanel from './AppearancePanel'
import AvatarSourcePicker from './AvatarSourcePicker'
import {
  getCharacterAvatarSource,
  setCharacterAvatarSource,
  type CharacterAvatarSource
} from './avatarSourcePreferences'
import CharacterPreviewCard from './CharacterPreviewCard'
import FamilyPanel from './FamilyPanel'
import IdentityPanel from './IdentityPanel'
import PersonalityPanel from './PersonalityPanel'
import {
  characterToDraft,
  isSameDraft,
  validateCharacterDraft,
  type CharacterDraft,
  type CharacterValidation,
  type CharacterView
} from './characterTypes'
import { usePortraitAssets } from './usePortraitAssets'
import { cx, displayNameOf } from './characterUiHelpers'

export type CharacterEditorMode = 'create' | 'edit' | 'official'

export interface CharacterEditorProps {
  readonly userId: string
  readonly mode: CharacterEditorMode
  readonly character: CharacterView | null
  readonly initialDraft: CharacterDraft
  readonly allCharacters: readonly CharacterView[]
  readonly onClose: () => void
  readonly onCreate: (draft: CharacterDraft) => Promise<CharacterView | null>
  readonly onUpdate: (
    id: string,
    draft: CharacterDraft,
    version: number
  ) => Promise<CharacterView | null>
  readonly onSaveOfficialAvatar: (config: CharacterDraft['avatarConfig']) => void
  readonly onCopyOfficial: (avatarConfig: CharacterDraft['avatarConfig']) => void
  readonly onVisualChange?: () => void
  readonly onUse: (id: string) => void
}

type EditorTab = 'basic' | 'appearance' | 'personality' | 'family'
type AppearanceTab = 'face' | 'portrait'

const TABS: readonly {
  readonly id: EditorTab
  readonly label: string
  readonly stepLabel: string
}[] = [
  { id: 'basic', label: '基础', stepLabel: '认识她' },
  { id: 'appearance', label: '形象', stepLabel: '她的样子' },
  { id: 'personality', label: '性格', stepLabel: '她的性格' },
  { id: 'family', label: '家庭', stepLabel: '她的来处' }
]

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : '保存失败，请稍后重试。'
}

/**
 * 角色编辑器：左侧固定预览，右侧表单。
 * create 走四步，edit/official 可自由跳标签；所有保存动作只通过 props。
 */
export default function CharacterEditor({
  userId,
  mode,
  character,
  initialDraft,
  allCharacters,
  onClose,
  onCreate,
  onUpdate,
  onSaveOfficialAvatar,
  onCopyOfficial,
  onVisualChange,
  onUse
}: CharacterEditorProps) {
  const [draft, setDraft] = useState<CharacterDraft>(initialDraft)
  const [baseline, setBaseline] = useState<CharacterDraft>(initialDraft)
  const [tab, setTab] = useState<EditorTab>('basic')
  const [appearanceTab, setAppearanceTab] = useState<AppearanceTab>('face')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [created, setCreated] = useState<CharacterView | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [avatarSource, setAvatarSource] = useState<CharacterAvatarSource>(() =>
    character === null ? 'auto' : getCharacterAvatarSource(userId, character.id)
  )
  const [avatarSourceVersion, setAvatarSourceVersion] = useState(0)
  const toastTimer = useRef<number | null>(null)
  const titleRef = useRef<HTMLHeadingElement | null>(null)

  const isCreate = mode === 'create'
  const isOfficial = mode === 'official'
  const portraitAssets = usePortraitAssets(
    userId,
    character?.id ?? null,
    isOfficial ? character?.id : undefined,
    avatarSourceVersion
  )

  const changeAvatarSource = (source: CharacterAvatarSource): void => {
    setAvatarSource(source)
    setAvatarSourceVersion((previous) => previous + 1)
    if (character !== null) {
      setCharacterAvatarSource(userId, character.id, source)
    }
    onVisualChange?.()
  }

  const afterVisualChange = async (operation: Promise<boolean>): Promise<boolean> => {
    const ok = await operation
    if (ok) {
      onVisualChange?.()
    }
    return ok
  }

  const importPortrait = (slot: PortraitExpression, dataUrl: string): Promise<boolean> =>
    afterVisualChange(portraitAssets.importPortrait(slot, dataUrl))

  const removePortrait = (slot: PortraitExpression): Promise<boolean> =>
    afterVisualChange(portraitAssets.removePortrait(slot))

  const setHero = (dataUrl: string): Promise<boolean> =>
    afterVisualChange(portraitAssets.setHero(dataUrl))

  const clearHero = (): Promise<boolean> => afterVisualChange(portraitAssets.clearHero())

  const clearPortraits = (): Promise<boolean> => afterVisualChange(portraitAssets.clearAll())

  const otherNames = useMemo(
    () =>
      allCharacters
        .filter((item) => item.id !== character?.id && !item.isOfficial)
        .map((item) => item.displayName),
    [allCharacters, character?.id]
  )
  const officialNames = useMemo(
    () => allCharacters.filter((item) => item.isOfficial).map((item) => item.displayName),
    [allCharacters]
  )
  const validation: CharacterValidation = useMemo(() => {
    /*
     * 官方人设只读，且“沈幼楚”本身就命中官方保留名；若继续跑完整校验，
     * 保存本机形象会被永久禁用。官方模式只需要形象参数（类型层面已合法），
     * 因此返回空错误；编辑/创建仍走完整校验。
     */
    if (isOfficial) {
      return { ok: true, errors: {} }
    }
    return validateCharacterDraft(draft, { otherNames, officialNames })
  }, [isOfficial, draft, otherNames, officialNames])

  const dirty = isOfficial
    ? !isSameAvatar(draft.avatarConfig, baseline.avatarConfig)
    : !isSameDraft(draft, baseline)
  const currentStep = TABS.findIndex((item) => item.id === tab)
  const stepIndex = currentStep < 0 ? 0 : currentStep

  const showToast = useCallback((message: string): void => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current)
    }
    setToast(message)
    toastTimer.current = window.setTimeout(() => {
      setToast(null)
      toastTimer.current = null
    }, 2200)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const patch = (next: Partial<CharacterDraft>): void => {
    setDraft((previous) => ({ ...previous, ...next }))
  }

  const canAdvanceFrom = useCallback(
    (index: number): boolean => {
      if (!isCreate) {
        return true
      }
      if (index === 0) {
        return (
          validation.errors.displayName === undefined &&
          validation.errors.age === undefined
        )
      }
      return true
    },
    [isCreate, validation.errors.displayName, validation.errors.age]
  )

  const goToStep = (nextIndex: number): void => {
    const target = TABS[nextIndex]
    if (target === undefined) {
      return
    }
    if (isCreate && nextIndex > stepIndex && !canAdvanceFrom(stepIndex)) {
      return
    }
    setTab(target.id)
  }

  const goNext = (): void => {
    if (!canAdvanceFrom(stepIndex)) {
      return
    }
    goToStep(stepIndex + 1)
  }

  const save = useCallback(async (): Promise<boolean> => {
    if (saving || !validation.ok) {
      return false
    }
    setSaving(true)
    setSaveError(null)
    try {
      if (isOfficial) {
        onSaveOfficialAvatar(draft.avatarConfig)
        setBaseline((previous) => ({ ...previous, avatarConfig: draft.avatarConfig }))
        showToast('本机形象已保存')
        return true
      }

      if (isCreate) {
        const createdCharacter = await onCreate(draft)
        if (createdCharacter === null) {
          setSaveError('创建失败，请稍后重试。')
          return false
        }
        setCreated(createdCharacter)
        setBaseline(draft)
        showToast('已创建')
        return true
      }

      if (character === null) {
        setSaveError('角色不存在，请返回角色中心重试。')
        return false
      }
      const updated = await onUpdate(character.id, draft, character.version)
      if (updated === null) {
        setSaveError('保存失败，请稍后重试。')
        return false
      }
      const next = characterToDraft(updated)
      setDraft(next)
      setBaseline(next)
      showToast('已保存')
      return true
    } catch (error) {
      setSaveError(messageOf(error))
      return false
    } finally {
      setSaving(false)
    }
  }, [
    saving,
    validation.ok,
    isOfficial,
    isCreate,
    onSaveOfficialAvatar,
    draft,
    onCreate,
    character,
    onUpdate,
    showToast
  ])

  const requestClose = (): void => {
    if (dirty) {
      setSaveError(null)
      setLeaveOpen(true)
      return
    }
    onClose()
  }

  const saveAndLeave = async (): Promise<void> => {
    setLeaveBusy(true)
    const saved = await save()
    setLeaveBusy(false)
    setLeaveOpen(false)
    if (saved) {
      onClose()
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && leaveOpen) {
        setLeaveOpen(false)
        return
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        !leaveOpen &&
        created === null
      ) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [leaveOpen, created, save])

  const saveDisabled =
    saving ||
    !validation.ok ||
    (isOfficial ? !dirty : isCreate ? false : !dirty)

  const breadcrumbName =
    mode === 'create' ? '新建' : `编辑「${displayNameOf(draft.displayName)}」`
  const previewName = displayNameOf(
    character?.isOfficial === true ? character.displayName : draft.displayName
  )

  const renderAppearance = (): ReactElement => {
    return (
      <>
        <div className="editor2-subtabs" role="tablist" aria-label="形象来源">
          <button
            className={cx(
              'editor2-subtab',
              appearanceTab === 'face' && 'editor2-subtab--active'
            )}
            type="button"
            role="tab"
            aria-selected={appearanceTab === 'face'}
            onClick={() => {
              setAppearanceTab('face')
            }}
          >
            捏脸
          </button>
          <button
            className={cx(
              'editor2-subtab',
              appearanceTab === 'portrait' && 'editor2-subtab--active'
            )}
            type="button"
            role="tab"
            aria-selected={appearanceTab === 'portrait'}
            onClick={() => {
              setAppearanceTab('portrait')
            }}
          >
            立绘
          </button>
        </div>

        <p className="editor2-appearance-note">
          {isOfficial
            ? '官方角色的形象只在本机生效，不影响其他用户；人设仍然只读。'
            : isCreate
              ? '保存角色后可导入立绘；捏脸参数会随角色一起保存。'
              : '捏脸参数随角色保存；立绘只保存在本机，按用户与角色隔离。'}
        </p>

        {character !== null && (
          <AvatarSourcePicker
            source={avatarSource}
            hasPortrait={portraitAssets.portraits !== null || portraitAssets.heroImage !== null}
            onChange={changeAvatarSource}
          />
        )}

        {appearanceTab === 'face' ? (
          <AppearancePanel
            value={draft.avatarConfig}
            disabled={false}
            onChange={(avatarConfig) => {
              patch({ avatarConfig })
            }}
          />
        ) : isCreate ? (
          <div className="editor2-portrait-locked">
            <span className="editor2-portrait-locked__icon">
              <Icon name="sparkles" size={24} />
            </span>
            <h3>保存后可导入立绘</h3>
            <p>
              先保存这位角色，再回到「形象 → 立绘」导入 AI 半身像和表情差分。立绘只保存在本机。
            </p>
          </div>
        ) : (
          <div className="editor2-portrait">
            <PortraitStudio
              portraits={portraitAssets.portraits}
              heroImage={portraitAssets.heroImage}
              characterName={character?.displayName ?? draft.displayName}
              basePrompt={buildCharacterBasePrompt(
                character?.displayName ?? draft.displayName,
                draft.age,
                draft.avatarConfig
              )}
              onSetHero={setHero}
              onClearHero={clearHero}
              onImport={importPortrait}
              onRemove={removePortrait}
              onClear={clearPortraits}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <section className="editor2" aria-labelledby="editor2-title">
      <header className="editor2__top">
        <div className="editor2__breadcrumb-row">
          <button
            className="editor2__back"
            type="button"
            aria-label="返回角色中心"
            onClick={requestClose}
          >
            <span aria-hidden="true">←</span>
          </button>
          <nav className="editor2__breadcrumb" aria-label="面包屑">
            <span>角色</span>
            <span className="editor2__breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <span aria-current="page">{breadcrumbName}</span>
          </nav>
          {dirty && (
            <span className="editor2__dirty">
              <span className="editor2__dirty-dot" aria-hidden="true" />
              有未保存的修改
            </span>
          )}
        </div>
        <h1 className="editor2__title" id="editor2-title" ref={titleRef} tabIndex={-1}>
          {isCreate ? '新建女友' : previewName}
        </h1>
      </header>

      <div className="editor2__body">
        <aside className="editor2__preview" aria-label="实时预览">
          <CharacterPreviewCard
            draft={draft}
            portraits={
              portraitAssets.displayPortraits ??
              (portraitAssets.displayHeroImage !== null
                ? { neutral: portraitAssets.displayHeroImage }
                : null)
            }
            size="large"
          />
          <p className="editor2__preview-hint">
            {avatarSource === 'vector' &&
            (portraitAssets.portraits !== null || portraitAssets.heroImage !== null)
              ? '已选择捏脸：聊天和列表都使用矢量形象'
              : portraitAssets.portraits !== null
                ? '预览使用已导入的立绘'
                : portraitAssets.displayHeroImage !== null
                  ? '预览使用聊天主视觉'
                  : isCreate
                    ? '保存后可导入立绘，现在先用矢量形象'
                    : '预览使用矢量形象；导入立绘后可在“形象来源”切换'}
          </p>
        </aside>

        <div className="editor2__main">
          {created !== null ? (
            <div className="editor2-success" role="status">
              <span className="editor2-success__icon">
                <Icon name="check" size={26} />
              </span>
              <h2 className="editor2-success__title">
                已创建「{displayNameOf(created.displayName)}」
              </h2>
              <p className="editor2-success__text">
                她已经在你的角色列表里。要现在切换到她吗？保存不会自动改变当前角色。
              </p>
              <div className="editor2-success__actions">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    onUse(created.id)
                  }}
                >
                  设为当前并聊天
                </button>
                <button className="btn btn--ghost" type="button" onClick={onClose}>
                  稍后再说
                </button>
              </div>
            </div>
          ) : (
            <>
              {isOfficial && (
                <div className="editor2-official-note" role="note">
                  <div className="editor2-official-note__text">
                    <strong>官方人设只读</strong>
                    <p>
                      名字、年龄、性格与家庭来自官方设定，不能在这里修改；形象调整只在本机生效。
                    </p>
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    type="button"
                    onClick={() => onCopyOfficial(draft.avatarConfig)}
                  >
                    <Icon name="plus" size={14} />
                    复制为我的角色
                  </button>
                </div>
              )}

              {isCreate && (
                <ol className="editor2-steps" aria-label="新建步骤">
                  {TABS.map((item, index) => {
                    const active = index === stepIndex
                    const done = index < stepIndex
                    return (
                      <li className="editor2-step" key={item.id}>
                        <button
                          className={cx(
                            'editor2-step__button',
                            active && 'editor2-step__button--active',
                            done && 'editor2-step__button--done'
                          )}
                          type="button"
                          aria-current={active ? 'step' : undefined}
                          onClick={() => {
                            goToStep(index)
                          }}
                        >
                          <span className="editor2-step__num">
                            {done ? <Icon name="check" size={12} /> : index + 1}
                          </span>
                          <span className="editor2-step__label">{item.stepLabel}</span>
                        </button>
                        {index < TABS.length - 1 && (
                          <span className="editor2-step__line" aria-hidden="true" />
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}

              <div
                className="editor2-tabs"
                role="tablist"
                aria-label="角色设定分类"
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                    return
                  }
                  event.preventDefault()
                  const delta = event.key === 'ArrowRight' ? 1 : -1
                  const next = (stepIndex + delta + TABS.length) % TABS.length
                  goToStep(next)
                }}
              >
                {TABS.map((item) => {
                  const active = item.id === tab
                  return (
                    <button
                      key={item.id}
                      id={`editor2-tab-${item.id}`}
                      className={cx('editor2-tab', active && 'editor2-tab--active')}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`editor2-panel-${item.id}`}
                      onClick={() => {
                        const target = TABS.findIndex((option) => option.id === item.id)
                        goToStep(target)
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <div
                className="editor2__panel"
                id={`editor2-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`editor2-tab-${tab}`}
              >
                {tab === 'basic' && (
                  <IdentityPanel
                    draft={draft}
                    errors={validation.errors}
                    readOnly={isOfficial}
                    onChange={patch}
                  />
                )}
                {tab === 'appearance' && renderAppearance()}
                {tab === 'personality' && (
                  <PersonalityPanel
                    value={draft.personality}
                    avatarConfig={draft.avatarConfig}
                    expression={draft.expression}
                    errors={validation.errors}
                    readOnly={isOfficial}
                    onChange={(personality) => {
                      patch({ personality })
                    }}
                    onExpressionChange={(expression) => {
                      patch({ expression })
                    }}
                  />
                )}
                {tab === 'family' && (
                  <FamilyPanel
                    value={draft.family}
                    errors={validation.errors}
                    readOnly={isOfficial}
                    onChange={(family) => {
                      patch({ family })
                    }}
                  />
                )}
              </div>

              <p className="editor2-boundary" role="note">
                所有角色共用同一套安全边界，不可关闭。性格和家庭设定只改变她怎么表达，不改变这些底线。
              </p>
            </>
          )}

          {saveError !== null && (
            <p className="alert editor2__error" role="alert">
              {saveError}
            </p>
          )}
        </div>
      </div>

      {created === null && (
        <footer className="editor2-footer">
          <div className="editor2-footer__status">
            {dirty ? (
              <span className="editor2-footer__dirty">
                <span className="editor2__dirty-dot" aria-hidden="true" />
                有未保存的修改
              </span>
            ) : (
              <span className="editor2-footer__hint">
                {isOfficial
                  ? '形象调整只在本机生效'
                  : isCreate
                    ? '只有名字必填，其余可以之后再改'
                    : '所有修改只在保存后生效'}
              </span>
            )}
            {!validation.ok && (
              <span className="editor2-footer__invalid">先修正表单里的提示</span>
            )}
          </div>
          <div className="editor2-footer__actions">
            <button className="btn btn--ghost" type="button" onClick={requestClose}>
              取消
            </button>
            {isCreate && stepIndex > 0 && (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  goToStep(stepIndex - 1)
                }}
              >
                上一步
              </button>
            )}
            {isCreate && stepIndex < TABS.length - 1 && (
              <button
                className="btn btn--ghost"
                type="button"
                disabled={!canAdvanceFrom(stepIndex)}
                onClick={goNext}
              >
                下一步
              </button>
            )}
            <button
              className="btn btn--primary"
              type="button"
              disabled={saveDisabled}
              onClick={() => {
                void save()
              }}
            >
              {saving
                ? '保存中…'
                : isOfficial
                  ? '保存本机形象'
                  : isCreate
                    ? '保存并创建'
                    : '保存更改'}
            </button>
          </div>
        </footer>
      )}

      {leaveOpen && (
        <div className="editor2-dialog">
          <div
            className="editor2-dialog__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor2-leave-title"
          >
            <h2 className="editor2-dialog__title" id="editor2-leave-title">
              要先保存吗？
            </h2>
            <p className="editor2-dialog__text">
              对「{previewName}」的修改还没有保存。你可以先保存再离开，或者放弃这次修改。
            </p>
            {!validation.ok && (
              <p className="character-error" role="alert">
                表单里还有未修正的提示，保存并离开暂时不可用。
              </p>
            )}
            <div className="editor2-dialog__actions">
              <button
                className="btn btn--primary"
                type="button"
                disabled={leaveBusy || !validation.ok}
                onClick={() => {
                  void saveAndLeave()
                }}
              >
                {leaveBusy ? '保存中…' : '保存并离开'}
              </button>
              <button
                className="btn btn--danger"
                type="button"
                disabled={leaveBusy}
                onClick={() => {
                  setLeaveOpen(false)
                  onClose()
                }}
              >
                放弃修改
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={leaveBusy}
                autoFocus
                onClick={() => {
                  setLeaveOpen(false)
                }}
              >
                继续编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {toast !== null && (
        <div className="editor2-toast" role="status">
          <Icon name="check" size={14} />
          {toast}
        </div>
      )}
    </section>
  )
}
