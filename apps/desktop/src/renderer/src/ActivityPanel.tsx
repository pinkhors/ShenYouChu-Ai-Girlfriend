import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { ApiError, listActivityEvents, type ActivityEventView } from './api/client'

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'message.sent', label: '发送消息' },
  { value: 'turn.completed', label: 'AI 回复完成' },
  { value: 'memory.created', label: '生成记忆' },
  { value: 'auth.login', label: '登录' },
  { value: 'conversation.created', label: '创建会话' }
]

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/** 活动记录页：只读时间线，支持按类型筛选。 */
export default function ActivityPanel() {
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

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setType(event.target.value)
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <h2 className="panel__title">活动记录</h2>
        <select className="field__input" value={type} onChange={handleTypeChange} disabled={isLoading}>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {isLoading && events.length === 0 ? (
        <p className="muted">正在加载活动记录…</p>
      ) : events.length === 0 ? (
        <p className="muted">暂无活动记录。</p>
      ) : (
        <ul className="activity-list">
          {events.map((event) => (
            <li className="activity-item" key={event.id}>
              <div className="activity-item__main">
                <span>{event.eventType}</span>
                <span className="activity-item__meta">
                  {event.actor} · {event.source} · {formatTime(event.occurredAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
