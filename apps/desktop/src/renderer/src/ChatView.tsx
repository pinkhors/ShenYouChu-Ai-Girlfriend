import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ApiError,
  cancelTurn,
  listMessages,
  streamTurn,
  textToBase64,
  voiceTurn,
  type CharacterState,
  type Conversation,
  type Message
} from './api/client'
import type { AvatarConfig } from './avatar/avatarConfig'
import AvatarPortrait from './portrait/AvatarPortrait'
import type { PortraitSet } from './portrait/expression'
import Icon from './ui/Icon'
import { formatClock, formatTime } from './ui/time'

interface ChatViewProps {
  readonly conversation: Conversation
  readonly avatar: AvatarConfig
  readonly portraits: PortraitSet | null
  readonly characterState: CharacterState | null
  readonly userName: string
  readonly onCall: () => void
}

const SUGGESTIONS = ['今天有点累，想和你说说话', '你还记得我喜欢什么吗？', '给我讲个睡前故事吧']

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return '请求失败，请稍后重试'
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** 会话详情：历史消息分页、SSE 流式回复、停止生成与语音占位入口。 */
export default function ChatView({
  conversation,
  avatar,
  portraits,
  characterState,
  userName,
  onCall
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const activeTurnIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const page = await listMessages(conversation.id)
      setMessages(page.items)
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [conversation.id])

  useEffect(() => {
    void load()
    return () => {
      abortRef.current?.abort()
    }
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streamingText])

  const handleLoadMore = async (): Promise<void> => {
    if (nextCursor === null || isLoadingMore) {
      return
    }
    setIsLoadingMore(true)
    try {
      const page = await listMessages(conversation.id, 20, nextCursor)
      setMessages((previous) => {
        const seen = new Set(previous.map((item) => item.id))
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))]
      })
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const sendMessage = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || isSending) {
      return
    }

    setDraft('')
    setError(null)
    setVoiceNotice(null)
    setStreamingText('')
    setIsSending(true)

    const controller = new AbortController()
    abortRef.current = controller
    let started = false

    try {
      await streamTurn(
        conversation.id,
        text,
        {
          onStarted: (turnId) => {
            started = true
            activeTurnIdRef.current = turnId
          },
          onDelta: (delta) => {
            setStreamingText((previous) => previous + delta)
          },
          onCompleted: () => {
            activeTurnIdRef.current = null
            void load()
          }
        },
        controller.signal
      )
    } catch (sendError) {
      if (!(sendError instanceof DOMException && sendError.name === 'AbortError')) {
        setError(toMessage(sendError))
        /* 失败时回源一次，避免用户消息只存在于本地 */
        if (!started) {
          void load()
        }
      }
    } finally {
      setIsSending(false)
      setStreamingText('')
      activeTurnIdRef.current = null
      abortRef.current = null
    }
  }

  const handleStop = (): void => {
    const turnId = activeTurnIdRef.current
    abortRef.current?.abort()
    if (turnId !== null) {
      void cancelTurn(conversation.id, turnId).catch(() => {
        /* 轮次可能已自然结束，取消失败不影响界面 */
      })
    }
    setVoiceNotice('已停止本轮生成。')
  }

  const handleVoicePlaceholder = async (): Promise<void> => {
    const text = draft.trim()
    if (text === '' || isSending) {
      return
    }
    setDraft('')
    setError(null)
    setVoiceNotice(null)
    setIsSending(true)
    try {
      const result = await voiceTurn(conversation.id, textToBase64(text))
      setVoiceNotice(
        `识别为「${result.recognizedText}」（置信度 ${result.confidence}）。` +
          (result.ttsFormat === 'none' ? '当前为占位语音，未合成音频。' : `语音格式：${result.ttsFormat}`)
      )
      await load()
    } catch (voiceError) {
      setError(toMessage(voiceError))
    } finally {
      setIsSending(false)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void sendMessage()
  }

  const isEmpty = messages.length === 0 && streamingText === ''
  const hasMessages = messages.length > 0 || streamingText !== ''

  return (
    <section className="chat" aria-label={`与沈幼楚的会话：${conversation.title ?? '未命名会话'}`}>
      <header className="chat__header">
        <span className="chat__avatar">
          <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
        </span>
        <div className="chat__identity">
          <h1 className="chat__name">沈幼楚</h1>
          <p className="chat__meta">
            在线 · {conversation.title ?? '未命名会话'}
            {conversation.status !== 'active' && ` · ${conversation.status}`}
          </p>
        </div>
        <div className="chat__actions">
          <button className="chat__call" type="button" onClick={onCall}>
            <Icon name="phone" size={17} />
            通话
          </button>
        </div>
        <div className="chat__chips">
          {characterState !== null && (
            <>
              <span className="chip" title={`心情 ${characterState.mood}`}>
                心情
                <span className="chip__bar">
                  <span className="chip__fill chip__fill--mood" style={{ width: `${clampPercent(characterState.mood)}%` }} />
                </span>
                {characterState.mood}
              </span>
              <span className="chip" title={`亲密度 ${characterState.intimacy}`}>
                亲密
                <span className="chip__bar">
                  <span className="chip__fill chip__fill--intimacy" style={{ width: `${clampPercent(characterState.intimacy)}%` }} />
                </span>
                {characterState.intimacy}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="chat__messages">
        {error !== null && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {nextCursor !== null && (
          <button
            className="load-more"
            type="button"
            disabled={isLoadingMore}
            onClick={() => {
              void handleLoadMore()
            }}
          >
            {isLoadingMore ? '加载中…' : '查看更早的消息'}
          </button>
        )}

        {isLoading && messages.length === 0 ? (
          <p className="muted chat__placeholder">正在加载消息…</p>
        ) : isEmpty ? (
          <div className="chat__empty">
            <span className="chat__empty-avatar">
              <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
            </span>
            <p className="chat__empty-title">还没有消息</p>
            <p className="muted">说点什么开始吧，她会记住你在意的事。</p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggestion"
                  onClick={() => {
                    setDraft(suggestion)
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : hasMessages ? (
          <ul className="messages">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              return (
                <li className={isUser ? 'message message--user' : 'message message--assistant'} key={message.id}>
                  {isUser ? (
                    <span className="bubble-avatar bubble-avatar--user" aria-hidden="true">
                      {userName.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <span className="bubble-avatar">
                      <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
                    </span>
                  )}
                  <div className={isUser ? 'bubble bubble--user' : 'bubble bubble--assistant'}>
                    <p className="bubble__text">{message.content}</p>
                    <span className="bubble__time" title={formatTime(message.createdAt)}>
                      {formatClock(message.createdAt)}
                    </span>
                  </div>
                </li>
              )
            })}
            {streamingText !== '' && (
              <li className="message message--assistant">
                <span className="bubble-avatar">
                  <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
                </span>
                <div className="bubble bubble--assistant">
                  <p className="bubble__text">
                    {streamingText}
                    <span className="caret" aria-hidden="true" />
                  </p>
                </div>
              </li>
            )}
          </ul>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {voiceNotice !== null && <p className="chat__notice">{voiceNotice}</p>}

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          className="composer__input"
          rows={1}
          placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
          maxLength={2000}
          value={draft}
          disabled={isSending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <button
          className="composer__icon"
          type="button"
          title="语音（M2 占位：把输入文本按语音轮次提交）"
          aria-label="语音（占位）"
          disabled={isSending || draft.trim() === ''}
          onClick={() => {
            void handleVoicePlaceholder()
          }}
        >
          <Icon name="mic" size={20} />
        </button>
        {isSending ? (
          <button className="btn btn--danger" type="button" onClick={handleStop}>
            <Icon name="stop" size={16} />
            停止
          </button>
        ) : (
          <button className="btn btn--primary" type="submit" disabled={draft.trim() === ''}>
            发送
          </button>
        )}
      </form>
    </section>
  )
}
