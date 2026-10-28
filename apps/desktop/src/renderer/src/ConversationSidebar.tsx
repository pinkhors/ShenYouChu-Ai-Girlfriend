import { useMemo, useState, type FormEvent } from 'react'
import type { Conversation } from './api/client'
import type { AvatarConfig } from './avatar/avatarConfig'
import GirlfriendAvatar from './avatar/GirlfriendAvatar'
import Icon from './ui/Icon'
import { formatListTime } from './ui/time'

interface ConversationSidebarProps {
  readonly conversations: readonly Conversation[]
  readonly activeId: string | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly deletingId: string | null
  readonly avatar: AvatarConfig
  readonly onSelect: (conversation: Conversation) => void
  readonly onCreate: (title: string) => Promise<boolean>
  readonly onDelete: (conversation: Conversation) => void
  readonly onRefresh: () => void
}

/** 会话列表栏：搜索、新建、切换与删除，对应微信的“聊天”列表。 */
export default function ConversationSidebar({
  conversations,
  activeId,
  isLoading,
  error,
  deletingId,
  avatar,
  onSelect,
  onCreate,
  onDelete,
  onRefresh
}: ConversationSidebarProps) {
  const [search, setSearch] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (keyword === '') {
      return conversations
    }
    return conversations.filter((conversation) =>
      (conversation.title ?? '未命名会话').toLowerCase().includes(keyword)
    )
  }, [conversations, search])

  const handleCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }
    setIsSubmitting(true)
    try {
      const created = await onCreate(title.trim())
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
        <h2 className="sidebar__title">聊天</h2>
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
          return (
            <li key={conversation.id}>
              <div className={isActive ? 'conversation conversation--active' : 'conversation'}>
                <button
                  className="conversation__main"
                  type="button"
                  onClick={() => onSelect(conversation)}
                >
                  <span className="conversation__avatar">
                    <GirlfriendAvatar config={avatar} variant="avatar" />
                  </span>
                  <span className="conversation__text">
                    <span className="conversation__title">{conversation.title ?? '未命名会话'}</span>
                    <span className="conversation__preview">
                      沈幼楚 · {conversation.lastMessageAt === null ? '还没有消息' : '最近有回复'}
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
      {!isLoading && conversations.length === 0 && <p className="sidebar__empty">还没有会话，点右上角 + 新建一个。</p>}
      {!isLoading && conversations.length > 0 && filtered.length === 0 && (
        <p className="sidebar__empty">没有匹配「{search.trim()}」的会话。</p>
      )}
    </aside>
  )
}
