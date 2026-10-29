import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import {
  ApiError,
  listMessages,
  triggerProactive,
  type CharacterState,
  type Conversation,
  type Message
} from './api/client'
import type { CharacterView } from './character/characterTypes'
import { bubbleDelayMs, splitIntoBubbles } from './chat/bubbles'
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

/** 本次会话新增助手消息的揭示进度；shown=0 时只显示“正在输入…”。 */
interface BubbleReveal {
  readonly bubbles: string[]
  readonly shown: number
}

/*
 * 同一 <li> 内的 1–3 个气泡纵向排列。styles.css 不在本次改动范围内，
 * 这里用最小内联样式保证多气泡是竖排而不是横排。
 */
const BUBBLE_STACK_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '6px',
  maxWidth: 'min(62%, 560px)'
}

/** 单个气泡在气泡栈内占满可用宽度（覆盖 styles.css 的百分比上限）。 */
const BUBBLE_IN_STACK_STYLE: CSSProperties = {
  maxWidth: '100%'
}

const SUGGESTIONS = ['今天有点累，想和你说说话', '你还记得我喜欢什么吗？', '给我讲个睡前故事吧']

/** 窄屏（与 styles.css 的 960px 断点保持同一意图）只留图标，文案进 title。 */
const COMPACT_HEADER_QUERY = '(max-width: 760px)'

/** 主动开口阻塞文案（PRD 09 §11）；未知错误退回后端的 message。 */
const PROACTIVE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  PROACTIVE_PRIVACY_DISABLED: '她尊重你的隐私设置，暂时不会主动打扰',
  PROACTIVE_USER_BUSY: '你现在不方便，她先不打扰',
  PROACTIVE_NO_HISTORY: '先和她说句话吧',
  PROACTIVE_QUIET_HOURS: '她现在在休息，明天早上再来找你',
  PROACTIVE_UNANSWERED_LIMIT: '你已经有一阵没回她了，先陪她说句话吧',
  PROACTIVE_DAILY_LIMIT: '她今天已经主动找过你了，留点话明天说',
  PROACTIVE_USER_JUST_REPLIED: '她还在听你说，不用急着让她开口',
  PROACTIVE_COOLDOWN: '她刚说过话，等一会儿再让她开口',
  PROACTIVE_SUPPRESSED: '她想了想，还是决定不打扰你',
  PROACTIVE_GENERATION_FAILED: '她这会儿有点走神，稍后再试'
}

function proactiveErrorMessageOf(error: unknown): string {
  if (error instanceof ApiError) {
    const mapped = PROACTIVE_ERROR_MESSAGES[error.code]
    if (mapped !== undefined) {
      return mapped
    }
  }
  return toMessage(error)
}

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
  const [isProactiveSending, setIsProactiveSending] = useState(false)
  const [compactHeader, setCompactHeader] = useState(
    () => window.matchMedia(COMPACT_HEADER_QUERY).matches
  )
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  /* 回源请求序号：并发回源时只接受最后一次响应 */
  const loadSeqRef = useRef(0)
  /*
   * 气泡级节奏（PRD 09 §5.4）：只有本次会话新到达的助手消息才逐条揭示。
   * knownMessageIdsRef 记录已经见过的消息 id，hydratedRef 标记本会话是否已完成首次回源；
   * 首次加载/切换会话回源时一次性完整渲染，不重播动画。
   */
  const [reveals, setReveals] = useState<Record<string, BubbleReveal>>({})
  const revealTimersRef = useRef<Map<string, number>>(new Map())
  const knownMessageIdsRef = useRef<Set<string>>(new Set())
  const hydratedRef = useRef(false)
  /* 渲染期同步的发送态，供异步回源回调判断“新一轮是否已在生成” */
  const isSendingRef = useRef(false)

  const clearRevealTimer = useCallback((id: string): void => {
    const timer = revealTimersRef.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      revealTimersRef.current.delete(id)
    }
  }, [])

  /** 按 bubbleDelayMs 依次揭示下一个气泡；每揭示一个都要重新显示“正在输入…”。 */
  const scheduleReveal = useCallback(
    (id: string, bubbles: readonly string[], nextIndex: number): void => {
      if (nextIndex >= bubbles.length) {
        return
      }
      clearRevealTimer(id)
      const delay = bubbleDelayMs(bubbles[nextIndex] ?? '', nextIndex)
      const timer = window.setTimeout(() => {
        revealTimersRef.current.delete(id)
        setReveals((previous) => {
          const current = previous[id]
          if (current === undefined) {
            /* 已被“立即补全”取消 */
            return previous
          }
          return {
            ...previous,
            [id]: {
              bubbles: current.bubbles,
              shown: Math.min(current.bubbles.length, nextIndex + 1)
            }
          }
        })
        scheduleReveal(id, bubbles, nextIndex + 1)
      }, delay)
      revealTimersRef.current.set(id, timer)
    },
    [clearRevealTimer]
  )

  const startReveal = useCallback(
    (id: string, content: string): void => {
      /*
       * 新一轮已经在流式生成（例如回源响应晚于用户的下一次发送）：
       * 直接完整展示，避免和流式气泡同时出现两个“正在输入…”。
       */
      if (isSendingRef.current) {
        return
      }
      const bubbles = splitIntoBubbles(content)
      if (bubbles.length === 0) {
        return
      }
      clearRevealTimer(id)
      setReveals((previous) => ({ ...previous, [id]: { bubbles, shown: 0 } }))
      scheduleReveal(id, bubbles, 0)
    },
    [clearRevealTimer, scheduleReveal]
  )

  /** 立即补全所有未揭示气泡（用户发消息、让她先开口、切换会话、停止生成）。 */
  const completeReveals = useCallback((): void => {
    for (const timer of revealTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    revealTimersRef.current.clear()
    setReveals((previous) => (Object.keys(previous).length === 0 ? previous : {}))
  }, [])

  /* 切换会话：已见集合与揭示进度归零，重新进来的消息按历史一次性渲染 */
  useEffect(() => {
    knownMessageIdsRef.current = new Set()
    hydratedRef.current = false
    completeReveals()
  }, [conversation.id, completeReveals])

  /* 卸载时清掉计时器，避免回调落在已卸载组件上 */
  useEffect(
    () => () => {
      for (const timer of revealTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      revealTimersRef.current.clear()
    },
    []
  )

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
  isSendingRef.current = isSending

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
      const known = knownMessageIdsRef.current
      const isFirstHydration = !hydratedRef.current
      hydratedRef.current = true
      /*
       * 只有本次会话新增的助手消息才逐条揭示；首次回源（含切换会话后）视为历史，
       * 一次性完整渲染，避免每次打开会话都重播动画。
       */
      const freshAssistant = isFirstHydration
        ? []
        : page.items.filter((item) => item.role === 'assistant' && !known.has(item.id))
      for (const item of page.items) {
        known.add(item.id)
      }
      setMessages(page.items)
      /* 服务端已落库的消息会顶替本地占位，避免重复展示 */
      reconcilePendingMessages(conversation.id, page.items)
      setNextCursor(page.nextCursor)
      setError(null)
      /* 已结束回合的流式文本已由服务端消息接替，清空残留（错误提示保留） */
      clearSettledTurn(conversation.id)
      for (const item of freshAssistant) {
        startReveal(item.id, item.content)
      }
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
  }, [conversation.id, startReveal])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  useEffect(() => {
    const query = window.matchMedia(COMPACT_HEADER_QUERY)
    const sync = (): void => {
      setCompactHeader(query.matches)
    }
    sync()
    query.addEventListener('change', sync)
    return () => {
      query.removeEventListener('change', sync)
    }
  }, [])

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

  /* 揭示新气泡时同样沿用好“贴底”逻辑自动滚到底部 */
  useEffect(() => {
    if (!stickToBottomRef.current) {
      /* 正在向上翻更早的消息，不要被拉回底部 */
      stickToBottomRef.current = true
      return
    }
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, pending, streamingText, isSending, reveals])

  /* 新一轮开始（发送/重试）时立即补全旧气泡，不让动画挡住输入 */
  useEffect(() => {
    if (isSending) {
      completeReveals()
    }
  }, [isSending, completeReveals])

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
    /* 用户发新消息：先把未揭示的气泡补全，不把用户卡在上一轮动画里 */
    completeReveals()
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
    /* 停止生成：补全未揭示气泡，避免残留计时器在停止后继续冒气泡 */
    completeReveals()
    stopTurn(conversation.id)
  }

  /**
   * 让她先开口：成功先本地追加（即时可见），再回源对齐服务端消息；
   * 409/502 按 PRD 09 §11 映射成行内提示，不弹模态。
   */
  const handleProactive = async (): Promise<void> => {
    if (isProactiveSending || isSending) {
      return
    }
    setIsProactiveSending(true)
    setError(null)
    /* 点击“让她先开口”：先补全上一轮未揭示的气泡 */
    completeReveals()
    try {
      const proactive = await triggerProactive(conversation.id)
      knownMessageIdsRef.current.add(proactive.id)
      setMessages((previous) => [...previous, proactive])
      startReveal(proactive.id, proactive.content)
      await load()
    } catch (proactiveError) {
      setError(proactiveErrorMessageOf(proactiveError))
    } finally {
      setIsProactiveSending(false)
    }
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
    <section className="chat chat--rose" aria-label={`${character.displayName}的会话`}>
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
          <button
            className="chat__call chat__proactive"
            type="button"
            title="让她先开口"
            aria-label="让她先开口"
            aria-busy={isProactiveSending}
            disabled={isProactiveSending || isSending}
            style={
              isProactiveSending || isSending
                ? { cursor: 'progress', opacity: 0.55 }
                : undefined
            }
            onClick={() => {
              void handleProactive()
            }}
          >
            <Icon name="sparkles" size={17} />
            {!compactHeader && (
              <span>{isProactiveSending ? '她正在想…' : '让她先开口'}</span>
            )}
          </button>
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
          <span>{character.isOfficial ? '官方角色' : '我的角色'}</span>
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
              const reveal = isUser ? undefined : reveals[message.id]
              const bubbles = isUser
                ? [message.content]
                : reveal !== undefined
                  ? reveal.bubbles.slice(0, reveal.shown)
                  : splitIntoBubbles(message.content)
              /* 揭示中（含 shown=0 的“正在输入…”）不显示时间，只在最后一个可见气泡上显示 */
              const isRevealing = reveal !== undefined && reveal.shown < reveal.bubbles.length
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
                  {isUser ? (
                    /* 用户消息保持单气泡 */
                    <div className="bubble bubble--user">
                      <p className="bubble__text">{message.content}</p>
                      <span className="bubble__time" title={formatTime(message.createdAt)}>
                        {formatClock(message.createdAt)}
                      </span>
                    </div>
                  ) : (
                    /* 助手消息：同一 <li> 内纵向排列 1–3 个气泡 */
                    <div className="message__bubbles" style={BUBBLE_STACK_STYLE}>
                      {bubbles.map((text, index) => (
                        <div
                          className="bubble bubble--assistant"
                          style={BUBBLE_IN_STACK_STYLE}
                          key={`${message.id}-${index}`}
                        >
                          <p className="bubble__text">{text}</p>
                          {index === bubbles.length - 1 && !isRevealing && (
                            <span className="bubble__time" title={formatTime(message.createdAt)}>
                              {formatClock(message.createdAt)}
                            </span>
                          )}
                        </div>
                      ))}
                      {isRevealing && (
                        <div
                          className="bubble bubble--assistant bubble--typing"
                          style={BUBBLE_IN_STACK_STYLE}
                          role="status"
                          aria-label={`${character.displayName}正在输入…`}
                        >
                          <span className="typing" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                        </div>
                      )}
                    </div>
                  )}
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
