import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
import ActivityPanel from './ActivityPanel'
import GirlfriendAvatar from './avatar/GirlfriendAvatar'
import { DEFAULT_AVATAR, type AvatarConfig } from './avatar/avatarConfig'
import { clearAvatar, getAvatar, saveAvatar } from './avatar/avatarStorage'
import ChatView from './ChatView'
import ConversationSidebar from './ConversationSidebar'
import LookPage from './LookPage'
import MemoryPanel from './MemoryPanel'
import AvatarPortrait from './portrait/AvatarPortrait'
import CallView from './portrait/CallView'
import type { PortraitExpression, PortraitSet } from './portrait/expression'
import { clearHeroImage, clearPortraits, loadHeroImage, loadPortraits, removePortrait, saveHeroImage, savePortrait } from './portrait/portraitStorage'
import SettingsPanel from './SettingsPanel'
import Icon, { type IconName } from './ui/Icon'

/**
 * 应用根组件：未登录显示登录/注册页，已登录显示微信式三栏工作区。
 *
 * 布局：左侧导航栏（聊天 / 形象 / 记忆 / 活动 / 设置）→ 会话列表 → 主内容区。
 * 形象（捏脸）参数保存在本机，不参与后端契约；其余数据仍走 /api/v1。
 */

type AuthMode = 'login' | 'register'
type Section = 'chats' | 'look' | 'memories' | 'activity' | 'settings'

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

const NAV_ITEMS: readonly { readonly id: Section; readonly label: string; readonly icon: IconName }[] = [
  { id: 'chats', label: '聊天', icon: 'chat' },
  { id: 'look', label: '形象', icon: 'sparkles' },
  { id: 'memories', label: '记忆', icon: 'book' },
  { id: 'activity', label: '活动', icon: 'pulse' }
]

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

function EmptyChat({
  avatar,
  portraits,
  onCreate
}: {
  readonly avatar: AvatarConfig
  readonly portraits: PortraitSet | null
  readonly onCreate: () => void
}) {
  return (
    <section className="empty-chat">
      <div className="empty-chat__portrait">
        <AvatarPortrait config={avatar} portraits={portraits} />
      </div>
      <h1 className="empty-chat__title">沈幼楚在这里</h1>
      <p className="muted">从左侧选择一个会话，或者开始一次新的聊天。</p>
      <button className="btn btn--primary" type="button" onClick={onCreate}>
        <Icon name="plus" size={16} />
        新建会话
      </button>
    </section>
  )
}

export default function App() {
  const [auth, setAuth] = useState<AuthFormState>(INITIAL_AUTH_STATE)
  /* 先读本地缓存让界面立刻可用，随后用 /auth/me 校正 */
  const [user, setUser] = useState<UserView | null>(() =>
    tokenStore.getToken() === null ? null : tokenStore.getUser()
  )
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(() => tokenStore.getToken() !== null)

  const [section, setSection] = useState<Section>('chats')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [isLoadingConversations, setIsLoadingConversations] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [characterState, setCharacterState] = useState<CharacterState | null>(null)
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR)
  const [portraits, setPortraits] = useState<PortraitSet | null>(null)
  const [heroImage, setHeroImage] = useState<string | null>(null)
  const [portraitsLoading, setPortraitsLoading] = useState(false)
  const [callOpen, setCallOpen] = useState(false)
  const [chatVersion, setChatVersion] = useState(0)
  const [accountError, setAccountError] = useState<string | null>(null)
  /* 后台轮次结束时读取“用户当前停在哪个会话”，用 ref 避免闭包里拿到旧值 */
  const activeConversationIdRef = useRef<string | null>(null)

  /* 401 统一处置：清空本地登录态并回到登录界面，避免每个调用点各写一遍 */
  useEffect(() => {
    setOnUnauthorized(() => {
      tokenStore.clear()
      setUser(null)
      setConversations([])
      setActiveConversation(null)
      setCharacterState(null)
      setPortraits(null)
      setHeroImage(null)
      setCallOpen(false)
      setSection('chats')
      setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '登录状态已失效，请重新登录' })
    })

    return () => {
      setOnUnauthorized(null)
    }
  }, [])

  /* 关系状态：登录后加载；切换会话时刷新（一轮对话会改变心情/亲密度） */
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

  /* 形象：登录后从本机读取；退出时回到默认，避免下一位用户看到上一位的形象 */
  useEffect(() => {
    if (user === null) {
      setAvatar(DEFAULT_AVATAR)
      return
    }
    setAvatar(getAvatar(user.id))
  }, [user])

  /* 立绘与聊天主视觉：登录后从 IndexedDB 读取，按用户隔离 */
  useEffect(() => {
    if (user === null) {
      setPortraits(null)
      setHeroImage(null)
      setPortraitsLoading(false)
      return
    }
    let cancelled = false
    /* 切换用户时先清掉上一位的状态，加载完成前由调用方显示加载态 */
    setPortraits(null)
    setHeroImage(null)
    setPortraitsLoading(true)
    void Promise.all([loadPortraits(user.id), loadHeroImage(user.id)])
      .then(([loaded, hero]) => {
        if (!cancelled) {
          setPortraits(loaded)
          setHeroImage(hero)
          setPortraitsLoading(false)
        }
      })
      .catch(() => {
        /* 读取失败按没有立绘处理，界面回退矢量形象 */
        if (!cancelled) {
          setPortraits(null)
          setHeroImage(null)
          setPortraitsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user])

  /* 没有进行中的会话时不保留通话页 */
  useEffect(() => {
    if (activeConversation === null) {
      setCallOpen(false)
    }
  }, [activeConversation])

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id ?? null
  }, [activeConversation])

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
      const page = await listConversations()
      setConversations(page.items)
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

  /**
   * 会话被切走期间完成的轮次：刷新会话列表里的最近消息时间；
   * 如果用户正停在该会话，就强制重新加载消息，让刚落库的回复出现。
   */
  const handleTurnSettled = useCallback(
    (conversationId: string): void => {
      void refreshConversations()
      if (activeConversationIdRef.current === conversationId) {
        setChatVersion((previous) => previous + 1)
      }
    },
    [refreshConversations]
  )

  /* 首次进入自动选中最近的会话；当前会话被删除时回到空态 */
  useEffect(() => {
    if (user === null) {
      return
    }
    if (activeConversation !== null) {
      const stillExists = conversations.some((item) => item.id === activeConversation.id)
      if (!stillExists && !isLoadingConversations) {
        setActiveConversation(null)
      }
      return
    }
    if (section === 'chats' && conversations.length > 0) {
      setActiveConversation(conversations[0] ?? null)
    }
  }, [conversations, activeConversation, isLoadingConversations, section, user])

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
      setSection('chats')
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
      setActiveConversation(null)
      setCharacterState(null)
      setPortraits(null)
      setHeroImage(null)
      setCallOpen(false)
      setSection('chats')
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
    setAccountError(null)
    const currentUserId = user?.id ?? null
    try {
      await deleteAccount()
    } catch (error) {
      setAccountError(describeError(error, '删除账号失败，请稍后重试'))
      return
    }
    if (currentUserId !== null) {
      clearAvatar(currentUserId)
      try {
        await clearPortraits(currentUserId)
      } catch {
        /* 本机立绘清理失败不阻塞账号删除 */
      }
    }
    tokenStore.clear()
    setUser(null)
    setConversations([])
    setCharacterState(null)
    setActiveConversation(null)
    setPortraits(null)
    setHeroImage(null)
    setCallOpen(false)
    setSection('chats')
    setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '账号已删除，感谢你的陪伴' })
  }

  const handleCreateConversation = async (title: string): Promise<boolean> => {
    setConversationError(null)
    try {
      const created = await createConversation(title === '' ? {} : { title })
      /* 新会话置顶，避免用户创建后还要滚动查找 */
      setConversations((previous) => [created, ...previous])
      setActiveConversation(created)
      setSection('chats')
      return true
    } catch (error) {
      setConversationError(describeError(error, '创建会话失败'))
      return false
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
      if (activeConversation?.id === conversation.id) {
        setActiveConversation(null)
      }
    } catch (error) {
      setConversationError(describeError(error, '删除会话失败'))
    } finally {
      setDeletingConversationId(null)
    }
  }

  const handleSaveAvatar = (next: AvatarConfig): void => {
    if (user === null) {
      return
    }
    saveAvatar(user.id, next)
    setAvatar(next)
  }

  const handleResetAvatar = (): void => {
    if (user !== null) {
      clearAvatar(user.id)
      void clearPortraits(user.id).catch(() => {
        /* 清理失败不影响界面回到默认 */
      })
    }
    setAvatar(DEFAULT_AVATAR)
    setPortraits(null)
    setHeroImage(null)
  }

  const handleImportPortrait = async (
    slot: PortraitExpression,
    dataUrl: string
  ): Promise<boolean> => {
    if (user === null) {
      return false
    }
    /* 用函数式更新：整组生成时连续写入多个槽位，不能依赖闭包里的旧 portraits */
    setPortraits((previous) => ({ ...(previous ?? {}), [slot]: dataUrl }))
    try {
      await savePortrait(user.id, slot, dataUrl)
      return true
    } catch {
      const stored = await loadPortraits(user.id).catch(() => null)
      setPortraits(stored)
      return false
    }
  }

  const handleRemovePortrait = async (slot: PortraitExpression): Promise<boolean> => {
    if (user === null) {
      return false
    }
    setPortraits((previous) => {
      const next: PortraitSet = { ...(previous ?? {}) }
      delete next[slot]
      return Object.keys(next).length === 0 ? null : next
    })
    try {
      await removePortrait(user.id, slot)
      return true
    } catch {
      const stored = await loadPortraits(user.id).catch(() => null)
      setPortraits(stored)
      return false
    }
  }

  const handleClearPortraits = async (): Promise<boolean> => {
    if (user === null) {
      return false
    }
    setPortraits(null)
    setHeroImage(null)
    try {
      await clearPortraits(user.id)
      return true
    } catch {
      const stored = await loadPortraits(user.id).catch(() => null)
      setPortraits(stored)
      return false
    }
  }

  const handleSetHero = async (dataUrl: string): Promise<boolean> => {
    if (user === null) {
      return false
    }
    const previous = heroImage
    setHeroImage(dataUrl)
    try {
      await saveHeroImage(user.id, dataUrl)
      return true
    } catch {
      setHeroImage(previous)
      return false
    }
  }

  const handleClearHero = async (): Promise<boolean> => {
    if (user === null) {
      return false
    }
    const previous = heroImage
    setHeroImage(null)
    try {
      await clearHeroImage(user.id)
      return true
    } catch {
      setHeroImage(previous)
      return false
    }
  }

  if (isBootstrapping) {
    return (
      <div className="boot">
        <span className="boot__dot" />
        <p className="muted">正在校验登录状态…</p>
      </div>
    )
  }

  if (user === null) {
    const isRegisterMode = auth.mode === 'register'

    return (
      <main className="auth">
        <section className="auth__visual" aria-hidden="true">
          <div className="auth__portrait">
            <GirlfriendAvatar config={DEFAULT_AVATAR} />
          </div>
          <div className="auth__caption">
            <p className="auth__eyebrow">SHEN YOU CHU</p>
            <h1 className="auth__name">沈幼楚</h1>
            <p className="auth__line">会记得你、也会闹点小脾气的插画师。</p>
          </div>
          <div className="auth__chips">
            <span className="chip chip--light">温柔小傲娇</span>
            <span className="chip chip--light">插画师</span>
            <span className="chip chip--light">在线</span>
          </div>
        </section>

        <section className="auth__panel">
          <div className="auth__brand">
            <span className="auth__mark">幼</span>
            <span>沈幼楚 · 桌面客户端</span>
          </div>

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

            <button className="btn btn--primary btn--block" type="submit" disabled={auth.isSubmitting}>
              {auth.isSubmitting ? '处理中…' : isRegisterMode ? '注册并进入' : '登录'}
            </button>
          </form>

          <p className="auth__hint">
            {isRegisterMode ? '注册成功后会直接进入，并可创建与沈幼楚的会话。' : '还没有账号？切到「注册」创建一个。'}
          </p>
          <p className="auth__endpoint" title={API_BASE}>
            后端：{API_BASE}
          </p>
        </section>
      </main>
    )
  }

  return (
    <>
      <div className="workspace">
        <nav className="rail" aria-label="主导航">
          <button
            className="rail__me"
            type="button"
            title={`${user.username} · 打开设置`}
            aria-label="打开设置"
            onClick={() => {
              setSection('settings')
            }}
          >
            <AvatarPortrait config={avatar} portraits={portraits} variant="avatar" />
          </button>

        <div className="rail__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? 'rail__item rail__item--active' : 'rail__item'}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => {
                setSection(item.id)
              }}
            >
              <Icon name={item.icon} size={22} />
              <span className="rail__label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="rail__spacer" />

        <button
          className={section === 'settings' ? 'rail__item rail__item--active' : 'rail__item'}
          type="button"
          aria-current={section === 'settings' ? 'page' : undefined}
          onClick={() => {
            setSection('settings')
          }}
        >
          <Icon name="settings" size={22} />
          <span className="rail__label">设置</span>
        </button>
      </nav>

      {section === 'chats' && (
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversation?.id ?? null}
          isLoading={isLoadingConversations}
          error={conversationError}
          deletingId={deletingConversationId}
          avatar={avatar}
          portraits={portraits}
          onSelect={setActiveConversation}
          onCreate={handleCreateConversation}
          onDelete={(conversation) => {
            void handleDeleteConversation(conversation)
          }}
          onRefresh={() => {
            void refreshConversations()
          }}
        />
      )}

      <main className="main">
        {section === 'chats' ? (
          activeConversation !== null ? (
            <ChatView
              key={activeConversation.id}
              conversation={activeConversation}
              avatar={avatar}
              portraits={portraits}
              heroImage={heroImage}
              characterState={characterState}
              userName={user.username}
              onCall={() => {
                setCallOpen(true)
              }}
              onTurnSettled={handleTurnSettled}
              reloadToken={chatVersion}
            />
          ) : (
            <EmptyChat
              avatar={avatar}
              portraits={portraits}
              onCreate={() => {
                void handleCreateConversation('')
              }}
            />
          )
        ) : section === 'look' ? (
          <LookPage
            config={avatar}
            onSave={handleSaveAvatar}
            portraits={portraits}
            portraitsLoading={portraitsLoading}
            heroImage={heroImage}
            onSetHero={handleSetHero}
            onClearHero={handleClearHero}
            onImportPortrait={handleImportPortrait}
            onRemovePortrait={handleRemovePortrait}
            onClearPortraits={handleClearPortraits}
          />
        ) : section === 'memories' ? (
          <MemoryPanel />
        ) : section === 'activity' ? (
          <ActivityPanel />
        ) : (
          <SettingsPanel
            user={user}
            apiBase={API_BASE}
            onLogout={() => {
              void handleLogout()
            }}
            onDeleteAccount={() => {
              void handleDeleteAccount()
            }}
            onResetAvatar={handleResetAvatar}
            error={accountError}
          />
        )}
      </main>
    </div>

      {callOpen && activeConversation !== null && (
        <CallView
          conversation={activeConversation}
          portraits={portraits}
          portraitsLoading={portraitsLoading}
          config={avatar}
          characterState={characterState}
          onClose={() => {
            setCallOpen(false)
            setChatVersion((previous) => previous + 1)
          }}
        />
      )}
    </>
  )
}
