import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, deleteMemory, listMemories, type MemoryView } from './api/client'
import type { CharacterView } from './character/characterTypes'
import Icon from './ui/Icon'
import { formatTime } from './ui/time'

interface MemoryPanelProps {
  readonly characters: readonly CharacterView[]
  readonly activeCharacterId: string | null
}

type Scope = 'active' | 'all'

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/** 记忆页：展示“她记住了什么”，并允许逐条删除；默认只看当前角色。 */
export default function MemoryPanel({ characters, activeCharacterId }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryView[]>([])
  const [scope, setScope] = useState<Scope>('active')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeCharacterId) ?? null,
    [characters, activeCharacterId]
  )

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const characterId = scope === 'active' ? activeCharacterId ?? undefined : undefined
      setMemories(await listMemories(characterId))
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [scope, activeCharacterId])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async (memory: MemoryView): Promise<void> => {
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

  const characterName = (characterId: string | null): string => {
    if (characterId === null) {
      return '未知角色'
    }
    return characters.find((character) => character.id === characterId)?.displayName ?? '未知角色'
  }

  return (
    <section className="page" aria-label="记忆">
      <header className="page__header">
        <div>
          <h1 className="page__title">她的记忆</h1>
          <p className="page__subtitle">
            聊过之后，她会把重要的事留在这里；默认只看当前角色，避免把别人说过的话记混。
          </p>
        </div>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={isLoading}
          onClick={() => {
            void load()
          }}
        >
          <Icon name="refresh" size={16} />
          {isLoading ? '刷新中…' : '刷新'}
        </button>
      </header>

      <div className="memory-scope" role="tablist" aria-label="记忆范围">
        <button
          className={scope === 'active' ? 'memory-scope__item memory-scope__item--active' : 'memory-scope__item'}
          type="button"
          role="tab"
          aria-selected={scope === 'active'}
          onClick={() => {
            setScope('active')
          }}
        >
          {activeCharacter === null ? '当前角色' : `当前：${activeCharacter.displayName}`}
        </button>
        <button
          className={scope === 'all' ? 'memory-scope__item memory-scope__item--active' : 'memory-scope__item'}
          type="button"
          role="tab"
          aria-selected={scope === 'all'}
          onClick={() => {
            setScope('all')
          }}
        >
          全部角色
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
        <div className="empty-card">
          <Icon name="book" size={28} />
          <p className="empty-card__title">还没有记忆</p>
          <p className="muted">和她多聊几次，她就会记住你在意的事。</p>
        </div>
      ) : (
        <ul className="card-list">
          {memories.map((memory) => (
            <li className="card-row" key={memory.id}>
              <div className="card-row__main">
                <p className="card-row__content">{memory.content}</p>
                <p className="card-row__meta">
                  <span className="memory-character">{characterName(memory.characterId)}</span>
                  {' · '}
                  {memory.memoryType} · {formatTime(memory.createdAt)} · {memory.status}
                </p>
              </div>
              <button
                className="icon-btn icon-btn--danger"
                type="button"
                title="删除这条记忆"
                aria-label="删除这条记忆"
                disabled={deletingId === memory.id}
                onClick={() => {
                  void handleDelete(memory)
                }}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
