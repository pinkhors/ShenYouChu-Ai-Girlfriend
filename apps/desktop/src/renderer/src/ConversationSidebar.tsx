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

/**
 * 会话列表栏：搜索、切换、清空，对应微信的“聊天”列表。
 * 每个角色只有后端 ensure 的唯一会话；默认展示全部女友，点击一行即可切换。
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

  const characterOf = (characterId: string): CharacterView | undefined =>
    characters.find((character) => character.id === characterId)

  const characterNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const character of characters) {
      names.set(character.id, character.displayName)
    }
    return names
  }, [characters])

  /** 一个角色只有一个会话，行标题直接使用角色名，增强“在和她聊天”的代入感。 */
  const titleOf = (conversation: Conversation): string =>
    characterNames.get(conversation.characterId) ?? '未知角色'

  const ordered = useMemo(
    () =>
      [...conversations].sort((left, right) => {
        const leftTime = new Date(left.lastMessageAt ?? left.createdAt).getTime()
        const rightTime = new Date(right.lastMessageAt ?? right.createdAt).getTime()
        return rightTime - leftTime
      }),
    [conversations]
  )

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (keyword === '') {
      return ordered
    }
    return ordered.filter((conversation) =>
      titleOf(conversation).toLowerCase().includes(keyword)
    )
  }, [ordered, search, characterNames])

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

      <div className="sidebar__search">
        <Icon name="search" size={16} className="sidebar__search-icon" />
        <input
          className="sidebar__search-input"
          type="search"
          placeholder="搜索女友"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="sidebar__list-heading">
        <span>{search.trim() === '' ? '全部女友' : '搜索结果'}</span>
        <span className="sidebar__list-count">{filtered.length}</span>
      </div>

      {error !== null && (
        <p className="sidebar__error" role="alert">
          {error}
        </p>
      )}

      <ul className="conversation-list">
        {filtered.map((conversation) => {
          const isActive = conversation.id === activeId
          const isCurrentCharacter = conversation.characterId === activeCharacterId
          const character = characterOf(conversation.characterId)
          const characterName = character?.displayName ?? titleOf(conversation)
          const avatarConfig = character?.avatarConfig ?? DEFAULT_AVATAR
          const isClearing = clearingId === conversation.id
          return (
            <li key={conversation.id}>
              <div className={isActive ? 'conversation conversation--active' : 'conversation'}>
                <button
                  className="conversation__main"
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
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
                      {conversation.lastMessageAt === null ? '还没有消息' : '最近有回复'}
                    </span>
                  </span>
                  <span className="conversation__meta">
                    <span className="conversation__time">
                      {formatListTime(conversation.lastMessageAt ?? conversation.createdAt)}
                    </span>
                    {isCurrentCharacter && <span className="conversation__current">当前</span>}
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
            : `没有匹配「${search.trim()}」的女友。`}
        </p>
      )}
    </aside>
  )
}
