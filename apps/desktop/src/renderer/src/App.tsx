import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  API_BASE,
  ApiError,
  createConversation,
  deleteAccount,
  deleteConversation,
  getCharacterState,
  listConversations,
  login,
  logout,
  me,
  register,
  setOnUnauthorized,
  type CharacterState,
  type Conversation,
  type UserView
} from './api/client'
import * as tokenStore from './auth/tokenStore'
import ConversationPanel from './ConversationPanel'
import MemoryPanel from './MemoryPanel'
import ActivityPanel from './ActivityPanel'

/**
 * 应用根组件：未登录显示登录/注册卡片，已登录显示会话管理界面。
 *
 * 范围（M0）：认证 + 会话增删查。
 * 未实现（仅留 TODO，见文件末尾）：语音、视觉、Live2D。
 */

type AuthMode = 'login' | 'register'

interface AuthFormState {
  readonly mode: AuthMode
  readonly username: string
  readonly password: string
  readonly isSubmitting: boolean
  readonly errorMessage: string | null
}

const INITIAL_AUTH_STATE: AuthFormState = {
  mode: 'login',
  username: '',
  password: '',
  isSubmitting: false,
  errorMessage: null
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })

/** 后端时间为 ISO-8601 字符串；无法解析时给出占位文案而不是 Invalid Date。 */
function formatTime(value: string | null): string {
  if (value === null) {
    return '时间未知'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '时间未知' : timeFormatter.format(parsed)
}

/** 把 unknown 异常转成可展示的中文文案（网络层失败与业务错误分开表述）。 */
function describeError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiError) {
    return error.requestId === undefined
      ? error.message
      : `${error.message}（请求 ID：${error.requestId}）`
  }
  if (error instanceof TypeError) {
    /* fetch 在连接失败时抛 TypeError */
    return `无法连接后端 ${API_BASE}，请确认服务已启动`
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallbackMessage
}

export default function App() {
  const [auth, setAuth] = useState<AuthFormState>(INITIAL_AUTH_STATE)
  /* 先读本地缓存让界面立刻可用，随后用 /auth/me 校正 */
  const [user, setUser] = useState<UserView | null>(() =>
    tokenStore.getToken() === null ? null : tokenStore.getUser()
  )
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => tokenStore.getToken() !== null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [newConversationTitle, setNewConversationTitle] = useState('')
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [view, setView] = useState<'conversations' | 'memories' | 'activity'>('conversations')
  const [characterState, setCharacterState] = useState<CharacterState | null>(null)

  /* 401 统一处置：清空本地登录态并回到登录界面，避免每个调用点各写一遍 */
  useEffect(() => {
    setOnUnauthorized(() => {
      tokenStore.clear()
      setUser(null)
      setConversations([])
      setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '登录状态已失效，请重新登录' })
    })

    return () => {
      setOnUnauthorized(null)
    }
  }, [])

  /* 关系状态：登录后加载；从会话详情返回时刷新（一轮对话会改变心情/亲密度） */
  useEffect(() => {
    if (user === null) {
      setCharacterState(null)
      return
    }
    let cancelled = false
    void getCharacterState()
      .then((state) => {
        if (!cancelled) {
          setCharacterState(state)
        }
      })
      .catch(() => {
        /* 状态展示失败不影响主流程 */
      })
    return () => {
      cancelled = true
    }
  }, [user, activeConversation])

  /* 启动时校验本地令牌：失败即视为未登录，不做静默降级 */
  useEffect(() => {
    if (tokenStore.getToken() === null) {
      setIsBootstrapping(false)
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        const currentUser = await me()
        if (isCancelled) {
          return
        }
        tokenStore.setUser(currentUser)
        setUser(currentUser)
      } catch (error) {
        if (isCancelled) {
          return
        }
        tokenStore.clear()
        setUser(null)
        setAuth({
          ...INITIAL_AUTH_STATE,
          errorMessage: describeError(error, '登录状态校验失败，请重新登录')
        })
      } finally {
        if (!isCancelled) {
          setIsBootstrapping(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [])

  const refreshConversations = useCallback(async (): Promise<void> => {
    setIsLoadingConversations(true)
    setConversationError(null)
    try {
      setConversations(await listConversations())
    } catch (error) {
      setConversationError(describeError(error, '会话列表加载失败'))
    } finally {
      setIsLoadingConversations(false)
    }
  }, [])

  /* 登录态变化时同步会话列表；退出登录时清空，避免残留上一位用户的数据 */
  useEffect(() => {
    if (user === null) {
      setConversations([])
      return
    }
    void refreshConversations()
  }, [user, refreshConversations])

  const handleModeChange = (mode: AuthMode): void => {
    setAuth((previous) => ({ ...previous, mode, errorMessage: null }))
  }

  const handleAuthUsernameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { value } = event.target
    setAuth((previous) => ({ ...previous, username: value }))
  }

  const handleAuthPasswordChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const { value } = event.target
    setAuth((previous) => ({ ...previous, password: value }))
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    const username = auth.username.trim()
    const password = auth.password
    if (username === '' || password === '') {
      setAuth((previous) => ({ ...previous, errorMessage: '请输入用户名和密码' }))
      return
    }

    setAuth((previous) => ({ ...previous, isSubmitting: true, errorMessage: null }))

    try {
      const response =
        auth.mode === 'login' ? await login(username, password) : await register(username, password)
      tokenStore.setToken(response.token)
      tokenStore.setUser(response.user)
      setUser(response.user)
      setAuth({ ...INITIAL_AUTH_STATE, mode: auth.mode })
    } catch (error) {
      setAuth((previous) => ({
        ...previous,
        isSubmitting: false,
        errorMessage: describeError(error, auth.mode === 'login' ? '登录失败' : '注册失败')
      }))
    }
  }

  const handleLogout = async (): Promise<void> => {
    try {
      await logout()
    } catch (error) {
      /* 服务端令牌失效失败不阻塞用户离开；本地清理为准，仅记录原因 */
      console.warn('[desktop] 退出登录请求失败：', describeError(error, '未知错误'))
    } finally {
      tokenStore.clear()
      setUser(null)
      setConversations([])
      setAuth(INITIAL_AUTH_STATE)
    }
  }

  const handleDeleteAccount = async (): Promise<void> => {
    const confirmed = window.confirm(
      '删除账号会清除你的会话、消息、记忆与关系状态，且无法恢复。确定继续吗？'
    )
    if (!confirmed) {
      return
    }
    try {
      await deleteAccount()
    } catch (error) {
      setConversationError(describeError(error, '删除账号失败，请稍后重试'))
      return
    }
    tokenStore.clear()
    setUser(null)
    setConversations([])
    setCharacterState(null)
    setActiveConversation(null)
    setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '账号已删除，感谢你的陪伴' })
  }

  const handleNewConversationTitleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setNewConversationTitle(event.target.value)
  }

  const handleCreateConversation = async (): Promise<void> => {
    const title = newConversationTitle.trim()

    setIsCreatingConversation(true)
    setConversationError(null)
    try {
      const created = await createConversation(title === '' ? {} : { title })
      setNewConversationTitle('')
      /* 新会话置顶，避免用户创建后还要滚动查找 */
      setConversations((previous) => [created, ...previous])
    } catch (error) {
      setConversationError(describeError(error, '创建会话失败'))
    } finally {
      setIsCreatingConversation(false)
    }
  }

  const handleDeleteConversation = async (conversation: Conversation): Promise<void> => {
    const displayName = conversation.title ?? '未命名会话'
    if (!window.confirm(`确认删除会话「${displayName}」？该操作不可撤销。`)) {
      return
    }

    setDeletingConversationId(conversation.id)
    setConversationError(null)
    try {
      await deleteConversation(conversation.id)
      setConversations((previous) => previous.filter((item) => item.id !== conversation.id))
    } catch (error) {
      setConversationError(describeError(error, '删除会话失败'))
    } finally {
      setDeletingConversationId(null)
    }
  }

  if (isBootstrapping) {
    return (
      <div className="app app--centered">
        <p className="muted">正在校验登录状态…</p>
      </div>
    )
  }

  if (user === null) {
    const isRegisterMode = auth.mode === 'register'

    return (
      <main className="app app--centered">
        <section className="card">
          <h1 className="card__title">沈幼楚 · 桌面客户端</h1>
          <p className="card__subtitle">后端地址：{API_BASE}</p>

          <div className="tabs" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegisterMode}
              className={isRegisterMode ? 'tab' : 'tab tab--active'}
              onClick={() => {
                handleModeChange('login')
              }}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegisterMode}
              className={isRegisterMode ? 'tab tab--active' : 'tab'}
              onClick={() => {
                handleModeChange('register')
              }}
            >
              注册
            </button>
          </div>

          <form className="form" onSubmit={handleAuthSubmit} noValidate>
            <label className="field">
              <span className="field__label">用户名</span>
              <input
                className="field__input"
                type="text"
                name="username"
                autoComplete="username"
                placeholder="3-64 个字符"
                minLength={isRegisterMode ? 3 : undefined}
                maxLength={64}
                value={auth.username}
                onChange={handleAuthUsernameChange}
                disabled={auth.isSubmitting}
              />
            </label>

            <label className="field">
              <span className="field__label">密码</span>
              <input
                className="field__input"
                type="password"
                name="password"
                autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                placeholder={isRegisterMode ? '至少 8 个字符' : '请输入密码'}
                minLength={isRegisterMode ? 8 : undefined}
                maxLength={128}
                value={auth.password}
                onChange={handleAuthPasswordChange}
                disabled={auth.isSubmitting}
              />
            </label>

            {auth.errorMessage !== null && (
              <p className="alert" role="alert">
                {auth.errorMessage}
              </p>
            )}

            <button className="button button--primary" type="submit" disabled={auth.isSubmitting}>
              {auth.isSubmitting ? '处理中…' : isRegisterMode ? '注册并进入' : '登录'}
            </button>
          </form>

          <p className="card__hint">
            {isRegisterMode
              ? '注册成功后会直接进入，并可创建与沈幼楚的会话。'
              : '还没有账号？切到「注册」创建一个。'}
          </p>
        </section>
      </main>
    )
  }

  if (activeConversation !== null) {
    return (
      <ConversationPanel
        conversation={activeConversation}
        onBack={() => {
          setActiveConversation(null)
        }}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__identity">
          <span className="topbar__name">{user.username}</span>
          <span className="badge">{user.role}</span>
          {characterState !== null && (
            <span className="badge">
              心情 {characterState.mood} · 亲密 {characterState.intimacy}
            </span>
          )}
        </div>
        <div className="topbar__actions">
          <div className="identity-nav">
            <button
              className={view === 'conversations' ? 'button button--primary' : 'button button--ghost'}
              type="button"
              onClick={() => {
                setView('conversations')
              }}
            >
              会话
            </button>
            <button
              className={view === 'memories' ? 'button button--primary' : 'button button--ghost'}
              type="button"
              onClick={() => {
                setView('memories')
              }}
            >
              记忆
            </button>
            <button
              className={view === 'activity' ? 'button button--primary' : 'button button--ghost'}
              type="button"
              onClick={() => {
                setView('activity')
              }}
            >
              活动
            </button>
          </div>
          <span className="topbar__endpoint" title={API_BASE}>
            后端：{API_BASE}
          </span>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              void handleLogout()
            }}
          >
            退出登录
          </button>
          <button
            className="button button--danger"
            type="button"
            onClick={() => {
              void handleDeleteAccount()
            }}
          >
            删除账号
          </button>
        </div>
      </header>

      <main className="workspace">
        {view === 'memories' ? (
          <MemoryPanel />
        ) : view === 'activity' ? (
          <ActivityPanel />
        ) : (
        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">我的会话</h2>
            <button
              className="button button--ghost"
              type="button"
              disabled={isLoadingConversations}
              onClick={() => {
                void refreshConversations()
              }}
            >
              {isLoadingConversations ? '刷新中…' : '刷新'}
            </button>
          </div>

          <div className="creator">
            <input
              className="field__input"
              type="text"
              placeholder="新会话标题（可留空）"
              maxLength={200}
              value={newConversationTitle}
              onChange={handleNewConversationTitleChange}
              disabled={isCreatingConversation}
            />
            <button
              className="button button--primary"
              type="button"
              disabled={isCreatingConversation}
              onClick={() => {
                void handleCreateConversation()
              }}
            >
              {isCreatingConversation ? '创建中…' : '创建会话'}
            </button>
          </div>

          {conversationError !== null && (
            <p className="alert" role="alert">
              {conversationError}
            </p>
          )}

          {isLoadingConversations && conversations.length === 0 ? (
            <p className="muted">正在加载会话…</p>
          ) : conversations.length === 0 ? (
            <p className="muted">还没有会话，先创建一个开始对话。</p>
          ) : (
            <ul className="conversations">
              {conversations.map((conversation) => (
                <li className="conversation" key={conversation.id}>
                  <div className="conversation__main">
                    <span className="conversation__title">{conversation.title ?? '未命名会话'}</span>
                    <span className="conversation__meta">
                      {conversation.lastMessageAt === null
                        ? `创建于 ${formatTime(conversation.createdAt)}`
                        : `最近消息 ${formatTime(conversation.lastMessageAt)}`}
                      {' · '}
                      {conversation.status}
                    </span>
                  </div>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => {
                      setActiveConversation(conversation)
                    }}
                  >
                    进入
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    disabled={deletingConversationId === conversation.id}
                    onClick={() => {
                      void handleDeleteConversation(conversation)
                    }}
                  >
                    {deletingConversationId === conversation.id ? '删除中…' : '删除'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/*
            后续里程碑的挂载点（当前仅占位，不实现）：
            - TODO(M1 语音)：会话内 ASR/TTS 控制条与「可听首音」耗时埋点；
            - TODO(M2 视觉)：摄像头授权入口、视觉信号开关与本地预览（低置信度信号不入提示词）；
            - TODO(M3 Live2D)：沈幼楚立绘渲染层，命令式挂载以避免整树重渲染。
          */}
        </section>
        )}
      </main>
    </div>
  )
}
