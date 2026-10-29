import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import {
  ApiError,
  listMessages,
  type CharacterState,
  type Conversation,
  type Message
} from './api/client'
import type { CharacterView } from './character/characterTypes'
import { prependOlderMessages } from './chat/messagePages'
import {
  getPendingMessages,
  reconcilePendingMessages,
  subscribePendingMessages
} from './chat/pendingStore'
import { newestMessageId, toDisplayMessage } from './chat/pendingMessages'
import {
  clearSettledTurn,
  consumeFailedText,
  getTurnSession,
  startTurn,
  stopTurn,
  subscribeTurnSessions
} from './chat/turnSessions'
import AvatarPortrait from './portrait/AvatarPortrait'
import { resolvePortrait, type PortraitSet } from './portrait/expression'
import Icon from './ui/Icon'
import { formatClock, formatTime } from './ui/time'

interface ChatViewProps {
  readonly conversation: Conversation
  readonly character: CharacterView
  readonly portraits: PortraitSet | null
  readonly heroImage: string | null
  readonly characterState: CharacterState | null
  readonly userName: string
  readonly characterSwitcher?: ReactNode
  readonly onCall: () => void
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
  character,
  portraits,
  heroImage,
  characterState,
  userName,
  characterSwitcher,
  onCall,
  reloadToken
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [heroFailed, setHeroFailed] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  /* 回源请求序号：并发回源时只接受最后一次响应 */
  const loadSeqRef = useRef(0)

  /*
   * 占位消息存放在模块级 store 里（按会话 id），不随 ChatView 卸载丢失：
   * 切到角色/记忆页再回来、反复切换，刚发出的消息都还在，直到服务端落库后对齐移除。
   */
  const pendingSnapshot = useCallback(() => getPendingMessages(conversation.id), [conversation.id])
  const pending = useSyncExternalStore(subscribePendingMessages, pendingSnapshot)

  /*
   * 回合（SSE 流）同样按会话存放在模块级 store 里：切换到角色/记忆/设置页或切换会话
   * 都不会中断本轮；切回来仍能看到流式文本与“停止”按钮，结束后由应用层触发回源。
   */
  const turnSnapshot = useCallback(() => getTurnSession(conversation.id), [conversation.id])
  const turn = useSyncExternalStore(subscribeTurnSessions, turnSnapshot)
  const streamingText = turn.streamingText
  const isSending = turn.isSending

  const load = useCallback(async () => {
    /* 请求序号：挂载、reloadToken、回合结束可能并发触发回源，只认最后一次响应 */
    const requestId = loadSeqRef.current + 1
    loadSeqRef.current = requestId
    setIsLoading(true)
    try {
      const page = await listMessages(conversation.id)
      if (loadSeqRef.current !== requestId) {
        return
      }
      setMessages(page.items)
      /* 服务端已落库的消息会顶替本地占位，避免重复展示 */
      reconcilePendingMessages(conversation.id, page.items)
      setNextCursor(page.nextCursor)
      setError(null)
      /* 已结束回合的流式文本已由服务端消息接替，清空残留（错误提示保留） */
      clearSettledTurn(conversation.id)
    } catch (loadError) {
      if (loadSeqRef.current !== requestId) {
        return
      }
      setError(toMessage(loadError))
    } finally {
      if (loadSeqRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [conversation.id])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  /*
   * 服务端未落库就失败的发送：把正文回填输入框，避免“消息消失还得重新打字”。
   * 取走即清除标记，回到会话时也只回填一次。
   */
  const failedText = turn.failedText
  useEffect(() => {
    if (failedText === null) {
      return
    }
    setDraft((current) => (current === '' ? failedText : current))
    consumeFailedText(conversation.id)
  }, [failedText, conversation.id])

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
      const requestId = loadSeqRef.current
      const page = await listMessages(conversation.id, 20, nextCursor)
      if (loadSeqRef.current !== requestId) {
        /* 期间发生了整页回源，这次翻页结果已过期 */
        return
      }
      /* 更早的消息接在顶部，保持时间顺序；此时不要把视图拉回底部 */
      stickToBottomRef.current = false
      setMessages((previous) => prependOlderMessages(previous, page.items))
      reconcilePendingMessages(conversation.id, page.items)
      setNextCursor(page.nextCursor)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const sendMessage = (): void => {
    const text = draft.trim()
    if (text === '' || isSending) {
      return
    }
    /*
     * 整轮交给模块级 store：占位消息在 store 内部登记，SSE 与停止按钮都不再依赖
     * 组件是否挂载；结束后的回源由应用层订阅 store 触发。
     * 只有被受理才清空草稿，被拒绝（已有一轮在跑）时保留输入。
     */
    if (!startTurn(conversation.id, text, newestMessageId(messages))) {
      return
    }
    setDraft('')
    setError(null)
  }

  const handleStop = (): void => {
    stopTurn(conversation.id)
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      sendMessage()
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    sendMessage()
  }

  const pendingItems = pending.map(toDisplayMessage)
  const timeline: Message[] = [...messages, ...pendingItems]
  const pendingIds = new Set(pendingItems.map((item) => item.id))
  const isEmpty = timeline.length === 0 && streamingText === ''
  const hasMessages = timeline.length > 0 || streamingText !== '' || isSending
  /* 回合失败优先展示（用户最需要看到发送失败原因）；本地 error 只用于列表加载失败 */
  const displayError = turn.error ?? error
  const heroSource = heroImage ?? resolvePortrait(portraits, 'neutral')

  return (
    <section className="chat chat--rose" aria-label={`和${character.displayName}的会话`}>
      <header className="chat__topbar">
        <div className="chat__brand">
          <span className="chat__heart" aria-hidden="true">
            ♥
          </span>
          {characterSwitcher ?? <span className="chat__name">{character.displayName}</span>}
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
            alt={character.displayName}
            draggable={false}
            onError={() => {
              setHeroFailed(heroSource)
            }}
          />
        ) : (
          <div className="chat__hero-fallback">
            <AvatarPortrait
              config={character.avatarConfig}
              portraits={portraits}
              variant="portrait"
              name={character.displayName}
            />
          </div>
        )}
        <div className="chat__hero-caption">
          <strong>{character.displayName}</strong>
          <span>{conversation.title ?? `和${character.displayName}的会话`}</span>
        </div>
        <button className="chat__hero-call" type="button" onClick={onCall}>
          <Icon name="mic" size={18} />
          语音通话
        </button>
      </section>

      <div className="chat__messages">
        {displayError !== null && (
          <p className="alert" role="alert">
            {displayError}
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

        {isLoading && messages.length === 0 && pending.length === 0 ? (
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
                      <AvatarPortrait
                        config={character.avatarConfig}
                        portraits={portraits}
                        variant="avatar"
                        name={character.displayName}
                      />
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
                  <AvatarPortrait
                    config={character.avatarConfig}
                    portraits={portraits}
                    variant="avatar"
                    name={character.displayName}
                  />
                </span>
                <div className="bubble bubble--assistant bubble--typing" role="status" aria-label={`${character.displayName}正在输入…`}>
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
                  <AvatarPortrait
                    config={character.avatarConfig}
                    portraits={portraits}
                    variant="avatar"
                    name={character.displayName}
                  />
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
          placeholder={`给${character.displayName}发送消息…（Enter 发送，Shift+Enter 换行）`}
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
