import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Conversation } from './api/client'
import { DEFAULT_AVATAR } from './avatar/avatarConfig'
import type { CharacterView } from './character/characterTypes'
import CharacterSwitcher from './character/CharacterSwitcher'
import AvatarPortrait from './portrait/AvatarPortrait'
import Icon from './ui/Icon'
import { formatListTime } from './ui/time'

interface ConversationSidebarProps {
  readonly conversations: readonly Conversation[]
  readonly activeId: string | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly deletingId: string | null
  readonly characters: readonly CharacterView[]
  readonly activeCharacterId: string | null
  readonly onSwitchCharacter: (id: string) => void
  readonly onManageCharacters: () => void
  readonly onSelect: (conversation: Conversation) => void
  readonly onCreate: (title: string, characterId: string) => Promise<boolean>
  readonly onDelete: (conversation: Conversation) => void
  readonly onRefresh: () => void
}

type Scope = 'active' | 'all'

/** 会话列表栏：搜索、新建、切换与删除，对应微信的“聊天”列表。 */
export default function ConversationSidebar({
  conversations,
  activeId,
  isLoading,
  error,
  deletingId,
  characters,
  activeCharacterId,
  onSwitchCharacter,
  onManageCharacters,
  onSelect,
  onCreate,
  onDelete,
  onRefresh
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('active')
  const [isCreating, setIsCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [createCharacterId, setCreateCharacterId] = useState(activeCharacterId ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const activeCharacters = useMemo(
    () => characters.filter((character) => character.status === 'active'),
    [characters]
  )

  useEffect(() => {
    setCreateCharacterId(activeCharacterId ?? '')
  }, [activeCharacterId])

  const filtered = useMemo(() => {
    const byScope =
      scope === 'active' && activeCharacterId !== null
        ? conversations.filter((conversation) => conversation.characterId === activeCharacterId)
        : conversations
    const keyword = search.trim().toLowerCase()
    if (keyword === '') {
      return byScope
    }
    return byScope.filter((conversation) =>
      (conversation.title ?? '未命名会话').toLowerCase().includes(keyword)
    )
  }, [conversations, search, scope, activeCharacterId])

  const characterOf = (characterId: string): CharacterView | undefined =>
    characters.find((character) => character.id === characterId)

  const selectedCreateCharacterId =
    createCharacterId !== '' ? createCharacterId : activeCharacters[0]?.id ?? ''

  const handleCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }
    setIsSubmitting(true)
    try {
      const created = await onCreate(title.trim(), selectedCreateCharacterId)
      if (created) {
        setTitle('')
        setIsCreating(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <aside className="sidebar" aria-label="会话列表">
      <header className="sidebar__header">
        <div className="sidebar__heading">
          <h2 className="sidebar__title">聊天</h2>
          <CharacterSwitcher
            characters={characters}
            activeId={activeCharacterId}
            onSelect={onSwitchCharacter}
            onManage={onManageCharacters}
            variant="sidebar"
          />
        </div>
        <div className="sidebar__actions">
          <button
            className="icon-btn"
            type="button"
            title={isCreating ? '取消新建' : '新建会话'}
            aria-label={isCreating ? '取消新建' : '新建会话'}
            onClick={() => {
              setIsCreating((previous) => !previous)
            }}
          >
            <Icon name={isCreating ? 'close' : 'plus'} size={18} />
          </button>
          <button
            className="icon-btn"
            type="button"
            title="刷新会话"
            aria-label="刷新会话"
            disabled={isLoading}
            onClick={onRefresh}
          >
            <Icon name="refresh" size={18} />
          </button>
        </div>
      </header>

      <div className="sidebar__scope" role="tablist" aria-label="会话范围">
        <button
          className={scope === 'active' ? 'sidebar__scope-item sidebar__scope-item--active' : 'sidebar__scope-item'}
          type="button"
          role="tab"
          aria-selected={scope === 'active'}
          onClick={() => {
            setScope('active')
          }}
        >
          当前角色
        </button>
        <button
          className={scope === 'all' ? 'sidebar__scope-item sidebar__scope-item--active' : 'sidebar__scope-item'}
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          onClick={() => {
            setScope('all')
          }}
        >
          全部
        </button>
      </div>

      <div className="sidebar__search">
        <Icon name="search" size={16} className="sidebar__search-icon" />
        <input
          className="sidebar__search-input"
          type="search"
          placeholder="搜索会话"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isCreating && (
        <form className="creator" onSubmit={(event) => void handleCreate(event)}>
          {activeCharacters.length > 0 && (
            <label className="creator__character">
              <span>和谁聊</span>
              <select
                value={selectedCreateCharacterId}
                disabled={isSubmitting}
                onChange={(event) => setCreateCharacterId(event.target.value)}
              >
                {activeCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            className="creator__input"
            type="text"
            placeholder="会话标题（可留空）"
            maxLength={200}
            autoFocus
            value={title}
            disabled={isSubmitting}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '创建中…' : '创建'}
          </button>
        </form>
      )}

      {error !== null && (
        <p className="sidebar__error" role="alert">
          {error}
        </p>
      )}

      <ul className="conversation-list">
        {filtered.map((conversation) => {
          const isActive = conversation.id === activeId
          const character = characterOf(conversation.characterId)
          const characterName = character?.displayName ?? '未知角色'
          const avatarConfig = character?.avatarConfig ?? DEFAULT_AVATAR
          return (
            <li key={conversation.id}>
              <div className={isActive ? 'conversation conversation--active' : 'conversation'}>
                <button
                  className="conversation__main"
                  type="button"
                  onClick={() => onSelect(conversation)}
                >
                  <span className="conversation__avatar">
                    <AvatarPortrait
                      config={avatarConfig}
                      portraits={null}
                      variant="avatar"
                      name={characterName}
                    />
                  </span>
                  <span className="conversation__text">
                    <span className="conversation__title">{conversation.title ?? '未命名会话'}</span>
                    <span className="conversation__preview">
                      {characterName} · {conversation.lastMessageAt === null ? '还没有消息' : '最近有回复'}
                    </span>
                  </span>
                  <span className="conversation__meta">
                    <span className="conversation__time">
                      {formatListTime(conversation.lastMessageAt ?? conversation.createdAt)}
                    </span>
                    <span className="conversation__status">{conversation.status}</span>
                  </span>
                </button>
                <button
                  className="conversation__delete"
                  type="button"
                  title="删除会话"
                  aria-label={`删除会话 ${conversation.title ?? '未命名会话'}`}
                  disabled={deletingId === conversation.id}
                  onClick={() => onDelete(conversation)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {isLoading && conversations.length === 0 && <p className="sidebar__empty">正在加载会话…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="sidebar__empty">
          {conversations.length === 0
            ? '还没有会话，点右上角 + 新建一个。'
            : scope === 'active'
              ? '当前角色还没有会话，点右上角 + 新建一个。'
              : `没有匹配「${search.trim()}」的会话。`}
        </p>
      )}
    </aside>
  )
}
