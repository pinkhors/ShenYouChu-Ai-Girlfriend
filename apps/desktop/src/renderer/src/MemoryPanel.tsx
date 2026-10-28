import { useCallback, useEffect, useState } from 'react'
import { ApiError, deleteMemory, listMemories, type MemoryView } from './api/client'

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

/** 记忆页：展示 AI 记住了什么，并允许逐条删除。 */
export default function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setMemories(await listMemories())
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (memory: MemoryView) => {
    if (!window.confirm('删除后她将不再记得这条内容，确定删除吗？')) {
      return
    }
    setDeletingId(memory.id)
    try {
      await deleteMemory(memory.id)
      setMemories((previous) => previous.filter((item) => item.id !== memory.id))
    } catch (deleteError) {
      setError(toMessage(deleteError))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel__header">
        <h2 className="panel__title">她记住的事</h2>
        <button
          className="button button--ghost"
          type="button"
          disabled={isLoading}
          onClick={() => {
            void load()
          }}
        >
          {isLoading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {isLoading && memories.length === 0 ? (
        <p className="muted">正在加载记忆…</p>
      ) : memories.length === 0 ? (
        <p className="muted">还没有记忆，聊过之后她会记住重要的事。</p>
      ) : (
        <ul className="memory-list">
          {memories.map((memory) => (
            <li className="memory-item" key={memory.id}>
              <div className="memory-item__content">
                <span>{memory.content}</span>
                <span className="memory-item__meta">
                  {memory.memoryType} · {formatTime(memory.createdAt)} · {memory.status}
                </span>
              </div>
              <button
                className="button button--danger"
                type="button"
                disabled={deletingId === memory.id}
                onClick={() => {
                  void handleDelete(memory)
                }}
              >
                {deletingId === memory.id ? '删除中…' : '删除'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
