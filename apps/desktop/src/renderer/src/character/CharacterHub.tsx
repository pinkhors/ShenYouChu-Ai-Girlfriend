import { useEffect, useState, type ReactElement } from 'react'
import AvatarPortrait from '../portrait/AvatarPortrait'
import Icon from '../ui/Icon'
import {
  CHARACTER_TEMPLATES,
  MAX_CUSTOM_CHARACTERS,
  characterToDraft,
  tagsForDraft,
  type CharacterTemplate,
  type CharacterView
} from './characterTypes'
import { characterTags, cx, displayNameOf } from './characterUiHelpers'

export interface CharacterHubProps {
  readonly characters: readonly CharacterView[]
  readonly activeId: string | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly onNew: (template: CharacterTemplate) => void
  readonly onUse: (id: string) => void
  readonly onEdit: (id: string) => void
  readonly onDuplicate: (id: string) => void
  readonly onArchive: (id: string) => void
  readonly onRestore: (id: string) => void
  readonly onPurge: (id: string, confirmName: string) => Promise<void>
  readonly onRefresh: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}

function tagsOf(character: CharacterView): string[] {
  return characterTags(character.tags, tagsForDraft(characterToDraft(character)))
}

/** 角色中心：官方角色、我的角色、归档区与模板选择。所有数据与动作都由 props 注入。 */
export default function CharacterHub({
  characters,
  activeId,
  isLoading,
  error,
  onNew,
  onUse,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onPurge,
  onRefresh
}: CharacterHubProps) {
  const [templateOpen, setTemplateOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const official = characters.find((character) => character.isOfficial) ?? null
  const customActive = characters.filter(
    (character) => !character.isOfficial && character.status === 'active'
  )
  const archived = characters.filter(
    (character) => !character.isOfficial && character.status === 'archived'
  )
  const customCount = characters.filter((character) => !character.isOfficial).length
  const atLimit = customCount >= MAX_CUSTOM_CHARACTERS

  useEffect(() => {
    if (!templateOpen) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setTemplateOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [templateOpen])

  const openTemplates = (): void => {
    if (atLimit) {
      return
    }
    setActionError(null)
    setTemplateOpen(true)
  }

  const handleArchive = (character: CharacterView): void => {
    const name = displayNameOf(character.displayName)
    const confirmed = window.confirm(
      `归档「${name}」？\n\n归档后她从切换器消失，但你们的会话还在，随时可以恢复。`
    )
    if (!confirmed) {
      return
    }
    setActionError(null)
    onArchive(character.id)
  }

  const handlePurge = async (character: CharacterView): Promise<void> => {
    const name = displayNameOf(character.displayName)
    const typed = window.prompt(
      `彻底删除「${name}」会一并清理她的会话、消息和记忆，无法恢复。\n请输入角色名确认：`,
      ''
    )
    if (typed === null) {
      return
    }
    if (typed.trim() !== name) {
      setActionError(`输入的角色名不一致，未删除「${name}」。`)
      return
    }
    setActionError(null)
    setBusyId(character.id)
    try {
      await onPurge(character.id, typed.trim())
    } catch (purgeError) {
      setActionError(messageOf(purgeError))
    } finally {
      setBusyId(null)
    }
  }

  const renderSkeletons = (): ReactElement => (
    <div className="hub-skeleton" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div className="hub-skeleton__card" key={item}>
          <div className="hub-skeleton__portrait" />
          <div className="hub-skeleton__line" />
          <div className="hub-skeleton__line hub-skeleton__line--short" />
        </div>
      ))}
    </div>
  )

  return (
    <section className="hub" aria-labelledby="hub-title">
      <header className="hub__header">
        <div className="hub__heading">
          <h1 className="hub__title" id="hub-title">
            她是谁
          </h1>
          <p className="hub__subtitle">
            设定她的样子、性格和来处。每个角色都有独立的对话与记忆。
          </p>
        </div>
        <div className="hub__header-actions">
          <button
            className="btn btn--primary"
            type="button"
            disabled={atLimit}
            title={atLimit ? `最多保存 ${MAX_CUSTOM_CHARACTERS} 个自定义角色` : undefined}
            onClick={openTemplates}
          >
            <Icon name="plus" size={16} />
            新建女友
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            disabled={isLoading}
            onClick={onRefresh}
          >
            <Icon name="refresh" size={16} />
            刷新
          </button>
        </div>
      </header>

      {atLimit && (
        <p className="hub__limit" role="note">
          <Icon name="user" size={15} />
          最多保存 {MAX_CUSTOM_CHARACTERS} 个自定义角色（归档也计入），请先彻底删除一个。
        </p>
      )}

      {error !== null && (
        <div className="hub__error" role="alert">
          <div>
            <strong>角色加载失败</strong>
            <p>{error}</p>
          </div>
          <button className="btn btn--ghost btn--sm" type="button" onClick={onRefresh}>
            <Icon name="refresh" size={14} />
            重试
          </button>
        </div>
      )}

      {actionError !== null && (
        <p className="alert" role="alert">
          {actionError}
        </p>
      )}

      <section className="hub__section" aria-labelledby="hub-official-title">
        <div className="hub__section-head">
          <h2 className="hub__section-title" id="hub-official-title">
            官方角色
          </h2>
          <span className="hub__section-hint">人设只读，形象只在本机生效</span>
        </div>

        {official === null ? (
          <div className="hub__official-empty">
            <p>官方角色暂时不可用。检查网络后重试，或先创建自己的角色。</p>
          </div>
        ) : (
          <article className="hub-official">
            <div className="hub-official__portrait">
              <AvatarPortrait
                config={official.avatarConfig}
                portraits={null}
                name={displayNameOf(official.displayName)}
              />
            </div>
            <div className="hub-official__info">
              <div className="hub-official__name-row">
                <h3 className="hub-official__name">
                  {displayNameOf(official.displayName)}
                </h3>
                <span className="hub__badge hub__badge--official">官方 · 人设只读</span>
                {official.id === activeId && (
                  <span className="hub__badge hub__badge--current">当前使用</span>
                )}
              </div>
              <p className="hub-official__meta">
                {tagsOf(official).join(' · ')}
                {official.age > 0 ? ` · ${official.age} 岁` : ''}
              </p>
              {official.intro !== '' && (
                <p className="hub-official__intro">{official.intro}</p>
              )}
              <p className="hub-official__note">
                名字、性格和家庭来自官方设定。你可以调整她的本机形象，或复制成自己的角色再改。
              </p>
              <div className="hub-official__actions">
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => {
                    onEdit(official.id)
                  }}
                >
                  <Icon name="book" size={15} />
                  查看设定
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  disabled={atLimit}
                  onClick={() => {
                    onDuplicate(official.id)
                  }}
                >
                  <Icon name="plus" size={15} />
                  复制为我的角色
                </button>
                {official.id !== activeId && (
                  <button
                    className="btn btn--primary btn--sm"
                    type="button"
                    onClick={() => {
                      onUse(official.id)
                    }}
                  >
                    使用她
                  </button>
                )}
              </div>
            </div>
          </article>
        )}
      </section>

      <section className="hub__section" aria-labelledby="hub-mine-title">
        <div className="hub__section-head">
          <h2 className="hub__section-title" id="hub-mine-title">
            我的角色
          </h2>
          <span className="hub__section-count">
            {customCount} / {MAX_CUSTOM_CHARACTERS}
          </span>
        </div>

        {isLoading && characters.length === 0 ? (
          renderSkeletons()
        ) : customActive.length === 0 && archived.length === 0 ? (
          <div className="hub__empty">
            <span className="hub__empty-icon">
              <Icon name="user" size={30} />
            </span>
            <h3 className="hub__empty-title">还没有自定义女友</h3>
            <p className="hub__empty-text">
              从一个模板开始，三分钟就能认识她。名字可以之后再改。
            </p>
            <div className="hub__empty-actions">
              <button
                className="btn btn--primary"
                type="button"
                disabled={atLimit}
                onClick={openTemplates}
              >
                <Icon name="plus" size={16} />
                新建女友
              </button>
              {!atLimit && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    onNew(CHARACTER_TEMPLATES[0])
                  }}
                >
                  从空白开始
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {customActive.length > 0 ? (
              <div className="hub__grid">
                {customActive.map((character) => {
                  const isCurrent = character.id === activeId
                  const name = displayNameOf(character.displayName)
                  return (
                    <article
                      className={cx('hub-card', isCurrent && 'hub-card--active')}
                      key={character.id}
                    >
                      <div className="hub-card__portrait">
                        <AvatarPortrait
                          config={character.avatarConfig}
                          portraits={null}
                          name={name}
                        />
                      </div>
                      <div className="hub-card__body">
                        <div className="hub-card__name-row">
                          <h3 className="hub-card__name">{name}</h3>
                          {isCurrent && (
                            <span className="hub__badge hub__badge--current">当前</span>
                          )}
                        </div>
                        <div className="hub-card__tags">
                          {tagsOf(character).map((tag) => (
                            <span className="hub-card__tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        {character.intro !== '' && (
                          <p className="hub-card__intro">{character.intro}</p>
                        )}
                        <div className="hub-card__actions">
                          <button
                            className="hub-card__action hub-card__action--primary"
                            type="button"
                            disabled={isCurrent}
                            onClick={() => {
                              onUse(character.id)
                            }}
                          >
                            {isCurrent ? '使用中' : '使用'}
                          </button>
                          <button
                            className="hub-card__action"
                            type="button"
                            onClick={() => {
                              onEdit(character.id)
                            }}
                          >
                            编辑
                          </button>
                          <button
                            className="hub-card__action"
                            type="button"
                            disabled={atLimit}
                            onClick={() => {
                              onDuplicate(character.id)
                            }}
                          >
                            复制
                          </button>
                          <button
                            className="hub-card__action hub-card__action--danger"
                            type="button"
                            onClick={() => {
                              handleArchive(character)
                            }}
                          >
                            归档
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}

                <button
                  className="hub-card hub-card--new"
                  type="button"
                  disabled={atLimit}
                  onClick={openTemplates}
                >
                  <span className="hub-card__new-icon">
                    <Icon name="plus" size={24} />
                  </span>
                  <span className="hub-card__new-label">新建女友</span>
                  <span className="hub-card__new-hint">
                    {atLimit ? '先彻底删除一个' : '从模板或空白开始'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="hub__empty hub__empty--compact">
                <p className="hub__empty-text">
                  自定义角色都归档了。可以恢复一位，或从模板新建。
                </p>
              </div>
            )}

            {archived.length > 0 && (
              <div className="hub__archive">
                <button
                  className="hub__archive-toggle"
                  type="button"
                  aria-expanded={archiveOpen}
                  onClick={() => {
                    setArchiveOpen((previous) => !previous)
                  }}
                >
                  <span className={archiveOpen ? 'hub__chevron hub__chevron--open' : 'hub__chevron'}>
                    ▸
                  </span>
                  归档区
                  <span className="hub__archive-count">{archived.length}</span>
                </button>
                {archiveOpen && (
                  <div className="hub__archive-body">
                    <p className="hub__archive-note">
                      归档后她从切换器消失，但你们的会话还在，随时可以恢复。
                    </p>
                    {archived.map((character) => {
                      const name = displayNameOf(character.displayName)
                      return (
                        <div className="hub-archived" key={character.id}>
                          <span className="hub-archived__avatar">
                            <AvatarPortrait
                              config={character.avatarConfig}
                              portraits={null}
                              variant="avatar"
                              name={name}
                            />
                          </span>
                          <span className="hub-archived__main">
                            <span className="hub-archived__name">{name}</span>
                            <span className="hub-archived__meta">
                              {character.tags.slice(0, 2).join(' · ') || '已归档'}
                            </span>
                          </span>
                          <button
                            className="btn btn--ghost btn--sm"
                            type="button"
                            onClick={() => {
                              onRestore(character.id)
                            }}
                          >
                            恢复
                          </button>
                          <button
                            className="btn btn--danger btn--sm"
                            type="button"
                            disabled={busyId === character.id}
                            onClick={() => {
                              void handlePurge(character)
                            }}
                          >
                            <Icon name="trash" size={14} />
                            {busyId === character.id ? '删除中…' : '彻底删除'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {templateOpen && (
        <div
          className="hub-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setTemplateOpen(false)
            }
          }}
        >
          <div
            className="hub-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hub-template-title"
          >
            <header className="hub-modal__head">
              <div>
                <h2 className="hub-modal__title" id="hub-template-title">
                  选择起点
                </h2>
                <p className="hub-modal__subtitle">
                  模板只决定初始值，保存前都可以改。选择后进入编辑器。
                </p>
              </div>
              <button
                className="icon-btn"
                type="button"
                aria-label="关闭"
                onClick={() => {
                  setTemplateOpen(false)
                }}
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <div className="hub-template-grid">
              {CHARACTER_TEMPLATES.map((template) => (
                <button
                  className="hub-template"
                  type="button"
                  key={template.id}
                  onClick={() => {
                    setTemplateOpen(false)
                    onNew(template)
                  }}
                >
                  <span className="hub-template__thumb">
                    <AvatarPortrait
                      config={template.draft.avatarConfig}
                      portraits={null}
                      variant="avatar"
                      name={template.name}
                    />
                  </span>
                  <span className="hub-template__text">
                    <span className="hub-template__name">{template.name}</span>
                    <span className="hub-template__hint">{template.hint}</span>
                    <span className="hub-template__tags">
                      {tagsForDraft(template.draft).slice(0, 2).join(' · ')}
                    </span>
                  </span>
                  <span className="hub-template__go">用这个开始 →</span>
                </button>
              ))}
              {official !== null && !atLimit && (
                <button
                  className="hub-template hub-template--copy"
                  type="button"
                  onClick={() => {
                    setTemplateOpen(false)
                    onDuplicate(official.id)
                  }}
                >
                  <span className="hub-template__thumb">
                    <AvatarPortrait
                      config={official.avatarConfig}
                      portraits={null}
                      variant="avatar"
                      name={displayNameOf(official.displayName)}
                    />
                  </span>
                  <span className="hub-template__text">
                    <span className="hub-template__name">复制沈幼楚</span>
                    <span className="hub-template__hint">
                      以官方人设和本机形象为起点，复制后可以改
                    </span>
                    <span className="hub-template__tags">官方人设映射 · 可编辑</span>
                  </span>
                  <span className="hub-template__go">复制并编辑 →</span>
                </button>
              )}
            </div>

            <footer className="hub-modal__footer">
              <p className="muted">所有角色均为成年人；模板名只描述气质，不绑定关系机制。</p>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
