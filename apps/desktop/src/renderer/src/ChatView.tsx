import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ApiError,
  cancelTurn,
  listMessages,
  streamTurn,
  type CharacterState,
  type Conversation,
  type Message
} from './api/client'
import type { AvatarConfig } from './avatar/avatarConfig'
import { prependOlderMessages } from './chat/messagePages'
import { dropHandoffMessage, handoffPendingMessages, takePendingMessages } from './chat/pendingHandoff'
import {
  createPendingUserMessage,
  newestMessageId,
  reconcilePending,
  toDisplayMessage,
  type PendingUserMessage
} from './chat/pendingMessages'
import AvatarPortrait from './portrait/AvatarPortrait'
import { resolvePortrait, type PortraitSet } from './portrait/expression'
import Icon from './ui/Icon'
import { formatClock, formatTime } from './ui/time'

interface ChatViewProps {
  readonly conversation: Conversation
  readonly avatar: AvatarConfig
  readonly portraits: PortraitSet | null
  readonly heroImage: string | null
  readonly characterState: CharacterState | null
  readonly userName: string
  readonly onCall: () => void
  /** 后台轮次落库后的通知：让应用层刷新会话列表，并按需重新加载当前会话 */
  readonly onTurnSettled: (conversationId: string) => void
  /** 外部要求重新拉取消息的版本号；变化即回源，不重建组件（保留输入框内容） */
  readonly reloadToken: number
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
  heroImage,
  characterState,
  userName,
  onCall,
  onTurnSettled,
  reloadToken
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingUserMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [heroFailed, setHeroFailed] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const activeTurnIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef(true)
  const isSendingRef = useRef(false)
  const pendingRef = useRef<PendingUserMessage[]>(pending)
  const onTurnSettledRef = useRef(onTurnSettled)
  const stickToBottomRef = useRef(true)

  useEffect(() => {
    onTurnSettledRef.current = onTurnSettled
  }, [onTurnSettled])

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const page = await listMessages(conversation.id)
      setMessages(page.items)
      /* 服务端已落库的消息会顶替本地占位，避免重复展示 */
      setPending((previous) => reconcilePending(previous, page.items))
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
  }, [load, reloadToken])

  /*
   * 切走会话时界面会卸载，但本轮 SSE 不中断：服务端仍在生成并最终落库，
   * 结束时用 onTurnSettled 通知应用层刷新。卸载前把尚未落库的占位消息交接出去，
   * 下次进入该会话时先展示，避免“最近的几条消息看不见”。
   */
  useEffect(() => {
    /* 上一次切走时还没等到回复：先把占位消息补回来（取走后即清空，重复执行是幂等的） */
    const handedOff = takePendingMessages(conversation.id)
    if (handedOff.length > 0) {
      setPending((previous) => [...handedOff, ...previous])
    }
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (isSendingRef.current) {
        handoffPendingMessages(conversation.id, pendingRef.current)
      }
    }
  }, [conversation.id])

  useEffect(() => {
    if (!stickToBottomRef.current) {
      /* 正在向上翻更早的消息，不要被拉回底部 */
      stickToBottomRef.current = true
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending, streamingText, isSending])

  const handleLoadMore = async (): Promise<void> => {
    if (nextCursor === null || isLoadingMore) {
      return
    }
    setIsLoadingMore(true)
    try {
      const page = await listMessages(conversation.id, 20, nextCursor)
      /* 更早的消息接在顶部，保持时间顺序；此时不要把视图拉回底部 */
      stickToBottomRef.current = false
      setMessages((previous) => prependOlderMessages(previous, page.items))
      setPending((previous) => reconcilePending(previous, page.items))
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

    const pendingMessage = createPendingUserMessage(text, newestMessageId(messages))
    setDraft('')
    setError(null)
    setStreamingText('')
    setIsSending(true)
    isSendingRef.current = true
    /* 先本地占位：不等服务端落库，用户消息立刻出现在会话里 */
    setPending((previous) => [...previous, pendingMessage])

    /**
     * 本轮结束后的收尾：仍在本会话就回源对齐；
     * 已经切走（组件卸载）则交给应用层刷新会话列表和当前视图。
     */
    const settle = (): void => {
      if (mountedRef.current) {
        void load()
        return
      }
      onTurnSettledRef.current(conversation.id)
    }

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
            settle()
          }
        },
        controller.signal
      )
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === 'AbortError') {
        /* 用户主动停止：服务端可能已落库，回源对齐 */
        settle()
      } else {
        setError(toMessage(sendError))
        if (!started) {
          /* 尚未落库：撤回占位消息并把文本放回输入框，便于重发 */
          setPending((previous) => previous.filter((item) => item.localId !== pendingMessage.localId))
          dropHandoffMessage(conversation.id, pendingMessage.localId)
          setDraft((current) => (current === '' ? text : current))
        }
        settle()
      }
    } finally {
      isSendingRef.current = false
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

  const pendingItems = pending.map(toDisplayMessage)
  const timeline: Message[] = [...messages, ...pendingItems]
  const pendingIds = new Set(pendingItems.map((item) => item.id))
  const isEmpty = timeline.length === 0 && streamingText === ''
  const hasMessages = timeline.length > 0 || streamingText !== '' || isSending
  const heroSource = heroImage ?? resolvePortrait(portraits, 'neutral')

  return (
    <section className="chat chat--rose" aria-label={`与沈幼楚的会话：${conversation.title ?? '未命名会话'}`}>
      <header className="chat__topbar">
        <div className="chat__brand">
          <span className="chat__heart" aria-hidden="true">
            ♥
          </span>
          <span className="chat__name">沈幼楚</span>
          <span className="chat__online">在线</span>
        </div>
        <div className="chat__top-actions">
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
          <button className="chat__call" type="button" onClick={onCall}>
            <Icon name="phone" size={17} />
            通话
          </button>
        </div>
      </header>

      <section className="chat__hero">
        <div className="chat__hero-glow" aria-hidden="true" />
        {heroSource !== null && heroFailed !== heroSource ? (
          <img
            className={heroImage !== null ? 'chat__hero-image chat__hero-image--cutout' : 'chat__hero-image'}
            src={heroSource}
            alt="沈幼楚"
            draggable={false}
            onError={() => {
              setHeroFailed(heroSource)
            }}
          />
        ) : (
          <div className="chat__hero-fallback">
            <AvatarPortrait config={avatar} portraits={portraits} variant="portrait" />
          </div>
        )}
        <div className="chat__hero-caption">
          <strong>沈幼楚</strong>
          <span>{conversation.title ?? '今天也在陪你'}</span>
        </div>
        <button className="chat__hero-call" type="button" onClick={onCall}>
          <Icon name="mic" size={18} />
          语音通话
        </button>
      </section>

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
            {timeline.map((message) => {
              const isUser = message.role === 'user'
              const isPending = pendingIds.has(message.id)
              return (
                <li
                  className={`${isUser ? 'message message--user' : 'message message--assistant'}${
                    isPending ? ' message--pending' : ''
                  }`}
                  key={message.id}
                >
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
            {isSending && streamingText === '' && (
              <li className="message message--assistant">
                <span className="bubble-avatar">
                  <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
                </span>
                <div className="bubble bubble--assistant bubble--typing" role="status" aria-label="沈幼楚正在输入…">
                  <span className="typing" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </li>
            )}
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

      <form className="composer composer--rose" onSubmit={handleSubmit}>
        <textarea
          className="composer__input"
          rows={1}
          placeholder="给沈幼楚发送消息…（Enter 发送，Shift+Enter 换行）"
          maxLength={2000}
          value={draft}
          disabled={isSending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
        <button
          className="composer__icon"
          type="button"
          title="进入语音通话"
          aria-label="进入语音通话"
          onClick={onCall}
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
