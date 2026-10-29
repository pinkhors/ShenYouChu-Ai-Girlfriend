import { useMemo, useState } from 'react'
import type { Conversation } from './api/client'
import { DEFAULT_AVATAR } from './avatar/avatarConfig'
import type { CharacterView } from './character/characterTypes'
import CharacterSwitcher from './character/CharacterSwitcher'
import type { CharacterPreviewMap } from './character/useCharacterPreviews'
import AvatarPortrait from './portrait/AvatarPortrait'
import Icon from './ui/Icon'
import { formatListTime } from './ui/time'

interface ConversationSidebarProps {
  readonly conversations: readonly Conversation[]
  readonly activeId: string | null
  readonly isLoading: boolean
  readonly error: string | null
  /** 正在清空聊天记录的会话 id */
  readonly clearingId: string | null
  readonly characters: readonly CharacterView[]
  readonly previews?: CharacterPreviewMap
  readonly activeCharacterId: string | null
  readonly onSwitchCharacter: (id: string) => void
  readonly onManageCharacters: () => void
  readonly onSelect: (conversation: Conversation) => void
  readonly onClear: (conversation: Conversation) => void
  readonly onRefresh: () => void
}

type Scope = 'active' | 'all'

/**
 * 会话列表栏：搜索、切换、清空，对应微信的“聊天”列表。
 * 每个角色只有后端 ensure 的唯一会话，因此这里没有“新建会话”入口。
 */
export default function ConversationSidebar({
  conversations,
  activeId,
  isLoading,
  error,
  clearingId,
  characters,
  previews,
  activeCharacterId,
  onSwitchCharacter,
  onManageCharacters,
  onSelect,
  onClear,
  onRefresh
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<Scope>('active')

  const characterOf = (characterId: string): CharacterView | undefined =>
    characters.find((character) => character.id === characterId)

  const characterNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const character of characters) {
      names.set(character.id, character.displayName)
    }
    return names
  }, [characters])

  /** 会话标题回退到角色名：一个角色只有一个会话，标题因此可推导 */
  const titleOf = (conversation: Conversation): string =>
    conversation.title ?? `和${characterNames.get(conversation.characterId) ?? '她'}的会话`

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
      (conversation.title ?? `和${characterNames.get(conversation.characterId) ?? '她'}的会话`)
        .toLowerCase()
        .includes(keyword)
    )
  }, [conversations, search, scope, activeCharacterId, characterNames])

  return (
    <aside className="sidebar" aria-label="会话列表">
      <header className="sidebar__header">
        <div className="sidebar__heading">
          <h2 className="sidebar__title">聊天</h2>
          <CharacterSwitcher
            characters={characters}
            previews={previews}
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
          const isClearing = clearingId === conversation.id
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
                      portraits={previews?.[conversation.characterId] ?? null}
                      variant="avatar"
                      name={characterName}
                    />
                  </span>
                  <span className="conversation__text">
                    <span className="conversation__title">{titleOf(conversation)}</span>
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
                  className="conversation__clear"
                  type="button"
                  title={isClearing ? '正在清空…' : '清空聊天记录'}
                  aria-label={`清空与 ${characterName} 的聊天记录`}
                  disabled={isClearing}
                  onClick={() => onClear(conversation)}
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
            ? '正在准备你和她的会话…'
            : scope === 'active'
              ? '当前角色还没有会话，切换角色会自动准备会话。'
              : `没有匹配「${search.trim()}」的会话。`}
        </p>
      )}
    </aside>
  )
}
