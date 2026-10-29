import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import {
  ApiError,
  listActivityEvents,
  type ActivityEventView,
  type Conversation
} from './api/client'
import type { CharacterView } from './character/characterTypes'
import Icon from './ui/Icon'
import { formatTime } from './ui/time'

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'message.sent', label: '发送消息' },
  { value: 'turn.completed', label: 'AI 回复完成' },
  { value: 'memory.created', label: '生成记忆' },
  { value: 'auth.login', label: '登录' },
  { value: 'conversation.created', label: '创建会话' }
]

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/** 活动记录页：只读时间线，支持按类型筛选；事件尽量标出所属角色。 */
interface ActivityPanelProps {
  readonly characters: readonly CharacterView[]
  readonly conversations: readonly Conversation[]
}

function payloadCharacterId(event: ActivityEventView): string | null {
  if (event.payload === null) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(event.payload)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const record = parsed as Record<string, unknown>
    const value = record.characterId ?? record.character_id
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export default function ActivityPanel({ characters, conversations }: ActivityPanelProps) {
  const [events, setEvents] = useState<ActivityEventView[]>([])
  const [type, setType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async (selectedType: string) => {
    setIsLoading(true)
    try {
      setEvents(await listActivityEvents(selectedType, 50))
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(type)
  }, [load, type])

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setType(event.target.value)
  }

  const characterNameOf = (event: ActivityEventView): string | null => {
    const fromPayload = payloadCharacterId(event)
    const fromConversation =
      event.conversationId === null
        ? null
        : conversations.find((conversation) => conversation.id === event.conversationId)?.characterId ??
          null
    const characterId = fromPayload ?? fromConversation
    if (characterId === null) {
      return null
    }
    return characters.find((character) => character.id === characterId)?.displayName ?? null
  }

  return (
    <section className="page" aria-label="活动记录">
      <header className="page__header">
        <div>
          <h1 className="page__title">活动记录</h1>
          <p className="page__subtitle">只读时间线：你、她与系统发生过的事。</p>
        </div>
        <select className="select" value={type} onChange={handleTypeChange} disabled={isLoading}>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </header>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {isLoading && events.length === 0 ? (
        <p className="muted">正在加载活动记录…</p>
      ) : events.length === 0 ? (
        <div className="empty-card">
          <Icon name="pulse" size={28} />
          <p className="empty-card__title">暂无活动记录</p>
          <p className="muted">登录、发消息、生成记忆等操作会记录在这里。</p>
        </div>
      ) : (
        <ol className="timeline">
          {events.map((event) => (
            <li className="timeline__item" key={event.id}>
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__body">
                <p className="timeline__title">
                  {characterNameOf(event) !== null && (
                    <span className="memory-character">{characterNameOf(event)} · </span>
                  )}
                  {event.eventType}
                </p>
                <p className="timeline__meta">
                  {event.actor} · {event.source} · {formatTime(event.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
