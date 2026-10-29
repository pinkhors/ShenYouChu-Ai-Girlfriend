import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  API_BASE,
  ApiError,
  clearConversation,
  deleteAccount,
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
import { clearOfficialAvatar, getOfficialAvatar, saveOfficialAvatar } from './avatar/avatarStorage'
import CharacterEditor from './character/CharacterEditor'
import CharacterHub from './character/CharacterHub'
import CharacterSwitcher from './character/CharacterSwitcher'
import {
  characterToDraft,
  type CharacterDraft,
  type CharacterTemplate,
  type CharacterView
} from './character/characterTypes'
import { useCharacters } from './character/useCharacters'
import { useCharacterPreviews } from './character/useCharacterPreviews'
import { usePortraitAssets } from './character/usePortraitAssets'
import { resetTurnSessions, subscribeSettledTurns } from './chat/turnSessions'
import ChatView from './ChatView'
import ConversationSidebar from './ConversationSidebar'
import MemoryPanel from './MemoryPanel'
import AvatarPortrait from './portrait/AvatarPortrait'
import CallView from './portrait/CallView'
import type { PortraitSet } from './portrait/expression'
import { clearPortraits } from './portrait/portraitStorage'
import SettingsPanel from './SettingsPanel'
import Icon, { type IconName } from './ui/Icon'

/**
 * 应用根组件：未登录显示登录/注册页，已登录显示微信式三栏工作区。
 *
 * 布局：左侧导航栏（聊天 / 角色 / 记忆 / 活动 / 设置）→ 会话列表 → 主内容区。
 * 角色定义走服务端；官方角色沈幼楚的人设只读，矢量形象保留本机覆盖；立绘按用户+角色存本机。
 */

type AuthMode = 'login' | 'register'
type Section = 'chats' | 'characters' | 'memories' | 'activity' | 'settings'

interface AuthFormState {
  readonly mode: AuthMode
  readonly username: string
  readonly password: string
  readonly isSubmitting: boolean
  readonly errorMessage: string | null
}

interface EditorState {
  readonly mode: 'create' | 'edit' | 'official'
  readonly initialDraft: CharacterDraft
  readonly characterId?: string
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
  { id: 'characters', label: '角色', icon: 'sparkles' },
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
    return `无法连接后端 ${API_BASE}，请确认服务已启动`
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallbackMessage
}

function avatarOf(character: CharacterView | null, officialOverride: AvatarConfig | null): AvatarConfig {
  if (character === null) {
    return DEFAULT_AVATAR
  }
  if (character.isOfficial) {
    return officialOverride ?? character.avatarConfig ?? DEFAULT_AVATAR
  }
  return character.avatarConfig
}

function EmptyChat({
  character,
  portraits,
  onEnter,
  isEntering
}: {
  readonly character: CharacterView
  readonly portraits: PortraitSet | null
  readonly onEnter: () => void
  readonly isEntering: boolean
}) {
  return (
    <section className="empty-chat">
      <div className="empty-chat__portrait">
        <AvatarPortrait
          config={character.avatarConfig}
          portraits={portraits}
          name={character.displayName}
        />
      </div>
      <h1 className="empty-chat__title">{character.displayName}在这里</h1>
      <p className="muted">
        {character.intro === ''
          ? '每个角色只有一个会话，点下面进入你和她的聊天。'
          : character.intro}
      </p>
      <button
        className="btn btn--primary"
        type="button"
        disabled={isEntering}
        onClick={onEnter}
      >
        <Icon name="chat" size={16} />
        {isEntering ? '正在准备会话…' : '进入会话'}
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
  const [clearingConversationId, setClearingConversationId] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [characterState, setCharacterState] = useState<CharacterState | null>(null)
  const [officialAvatar, setOfficialAvatar] = useState<AvatarConfig | null>(null)
  const [callOpen, setCallOpen] = useState(false)
  const [chatVersion, setChatVersion] = useState(0)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [characterPageError, setCharacterPageError] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  /* 形象来源偏好变化后，驱动列表预览和聊天预览重新解析 */
  const [avatarSourceVersion, setAvatarSourceVersion] = useState(0)
  /* 后台轮次结束时读取“用户当前停在哪个会话”，用 ref 避免闭包里拿到旧值 */
  const activeConversationIdRef = useRef<string | null>(null)

  const characters = useCharacters(user?.id ?? null)

  const displayCharacters = useMemo(
    () =>
      characters.characters.map((character) =>
        character.isOfficial && officialAvatar !== null
          ? { ...character, avatarConfig: officialAvatar }
          : character
      ),
    [characters.characters, officialAvatar]
  )

  const activeCharacter = useMemo(() => {
    const activeId = characters.activeId
    return (
      displayCharacters.find((character) => character.id === activeId) ??
      displayCharacters.find((character) => character.isOfficial) ??
      null
    )
  }, [characters.activeId, displayCharacters])

  const conversationCharacter = useMemo(() => {
    if (activeConversation === null) {
      return null
    }
    return (
      displayCharacters.find((character) => character.id === activeConversation.characterId) ?? null
    )
  }, [activeConversation, displayCharacters])

  const displayCharacter =
    section === 'chats' && activeConversation !== null ? conversationCharacter : activeCharacter

  const characterPreviews = useCharacterPreviews(
    user?.id ?? null,
    displayCharacters,
    characters.official?.id,
    avatarSourceVersion
  )

  const portraitAssets = usePortraitAssets(
    user?.id ?? null,
    displayCharacter?.id ?? null,
    characters.official?.id,
    avatarSourceVersion
  )

  /* 401 统一处置：清空本地登录态并回到登录界面，避免每个调用点各写一遍 */
  useEffect(() => {
    setOnUnauthorized(() => {
      tokenStore.clear()
      resetTurnSessions()
      setUser(null)
      setConversations([])
      setActiveConversation(null)
      setCharacterState(null)
      setOfficialAvatar(null)
      setCallOpen(false)
      setEditor(null)
      setSection('chats')
      setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '登录状态已失效，请重新登录' })
    })

    return () => {
      setOnUnauthorized(null)
    }
  }, [])

  /* 官方角色的本机形象覆盖（旧版捏脸兼容） */
  useEffect(() => {
    if (user === null) {
      setOfficialAvatar(null)
      return
    }
    setOfficialAvatar(getOfficialAvatar(user.id))
  }, [user])

  /* 关系状态：按当前会话角色加载；没有会话时按当前角色 */
  useEffect(() => {
    if (user === null || displayCharacter === null) {
      setCharacterState(null)
      return
    }
    let cancelled = false
    void getCharacterState(displayCharacter.id)
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
  }, [user, displayCharacter?.id, chatVersion])

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
        resetTurnSessions()
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

  /**
   * 刷新会话列表并返回最新结果（失败返回空数组，同时保留错误提示）。
   * 角色切换 / 角色创建后需要立即拿到后端 ensure 的唯一会话，因此返回值是必要的。
   */
  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    setIsLoadingConversations(true)
    setConversationError(null)
    try {
      const page = await listConversations()
      setConversations(page.items)
      return page.items
    } catch (error) {
      setConversationError(describeError(error, '会话列表加载失败'))
      return []
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
   * 回合结束（完成 / 失败 / 用户停止）时：刷新会话列表里的最近消息时间；
   * 如果用户正停在该会话，就 bump chatVersion 强制重新加载消息，让已落库的回复出现。
   * activeConversationIdRef 避免订阅回调拿到过期的会话 id。
   */
  useEffect(() => {
    return subscribeSettledTurns((conversationId) => {
      void refreshConversations()
      if (activeConversationIdRef.current === conversationId) {
        setChatVersion((previous) => previous + 1)
      }
    })
  }, [refreshConversations])

  /* 首次进入自动选中当前角色最近的会话；当前会话被删除时回到空态。切换动作由显式 handler 负责 */
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
    if (section === 'chats' && characters.activeId !== null) {
      const preferred =
        conversations.find((item) => item.characterId === characters.activeId) ?? null
      if (preferred !== null) {
        setActiveConversation(preferred)
      }
    }
  }, [
    conversations,
    activeConversation,
    isLoadingConversations,
    section,
    user,
    characters.activeId
  ])

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
      resetTurnSessions()
      setUser(null)
      setConversations([])
      setActiveConversation(null)
      setCharacterState(null)
      setOfficialAvatar(null)
      setCallOpen(false)
      setEditor(null)
      setSection('chats')
      setAuth(INITIAL_AUTH_STATE)
    }
  }

  const handleDeleteAccount = async (): Promise<void> => {
    const confirmed = window.confirm(
      '删除账号会清除你的会话、消息、记忆、关系状态与自定义角色，且无法恢复。确定继续吗？'
    )
    if (!confirmed) {
      return
    }
    setAccountError(null)
    const currentUserId = user?.id ?? null
    const localCharacters = characters.characters
    const officialId = characters.official?.id
    try {
      await deleteAccount()
    } catch (error) {
      setAccountError(describeError(error, '删除账号失败，请稍后重试'))
      return
    }
    if (currentUserId !== null) {
      clearOfficialAvatar(currentUserId)
      await Promise.all(
        localCharacters.map((character) =>
          clearPortraits(currentUserId, character.id, officialId).catch(() => undefined)
        )
      )
    }
    tokenStore.clear()
    resetTurnSessions()
    setUser(null)
    setConversations([])
    setCharacterState(null)
    setActiveConversation(null)
    setOfficialAvatar(null)
    setCallOpen(false)
    setEditor(null)
    setSection('chats')
    setAuth({ ...INITIAL_AUTH_STATE, errorMessage: '账号已删除，感谢你的陪伴' })
  }

  const handleSelectConversation = useCallback(
    (conversation: Conversation): void => {
      setActiveConversation(conversation)
      if (conversation.characterId !== characters.activeId) {
        void characters.activate(conversation.characterId).catch((error: unknown) => {
          setConversationError(describeError(error, '切换角色失败'))
          setActiveConversation(null)
        })
      }
    },
    [characters]
  )

  /**
   * 会话不再允许删除：改为清空消息与记忆，会话本身保留。
   * 清空后刷新列表；若清空的正是当前会话，bump chatVersion 让消息区立即变为空态。
   */
  const handleClearConversation = async (conversation: Conversation): Promise<void> => {
    const displayName =
      displayCharacters.find((character) => character.id === conversation.characterId)
        ?.displayName ??
      conversation.title ??
      '她'
    if (
      !window.confirm(`清空与 ${displayName} 的聊天记录？会话保留，消息和记忆会删除，无法恢复。`)
    ) {
      return
    }

    setClearingConversationId(conversation.id)
    setConversationError(null)
    try {
      await clearConversation(conversation.id)
      await refreshConversations()
      if (activeConversationIdRef.current === conversation.id) {
        setChatVersion((previous) => previous + 1)
      }
    } catch (error) {
      setConversationError(describeError(error, '清空聊天记录失败'))
    } finally {
      setClearingConversationId(null)
    }
  }

  const handleSwitchCharacter = useCallback(
    async (id: string, force = false): Promise<void> => {
      if (!force && editor !== null) {
        setCharacterPageError('请先保存或取消当前编辑，再切换角色。')
        return
      }
      setCharacterPageError(null)
      try {
        /* 后端在切换角色时 ensure 该角色的唯一会话，并回传其 id */
        const result = await characters.activate(id)
        const items = await refreshConversations()
        const target =
          items.find((conversation) => conversation.id === result.conversationId) ??
          items.find(
            (conversation) =>
              conversation.characterId === (result.activeCharacterId ?? id)
          ) ??
          null
        setActiveConversation(target)
        setSection('chats')
      } catch (error) {
        const message = describeError(error, '切换角色失败')
        setCharacterPageError(message)
        if (section === 'chats') {
          setConversationError(message)
        }
      }
    },
    [characters, editor, section, refreshConversations]
  )

  const handleCloseEditor = (): void => {
    setEditor(null)
  }

  const handleNewCharacter = (template: CharacterTemplate): void => {
    setCharacterPageError(null)
    setEditor({ mode: 'create', initialDraft: template.draft })
  }

  const handleEditCharacter = (id: string): void => {
    const character = displayCharacters.find((item) => item.id === id)
    if (character === undefined) {
      return
    }
    setCharacterPageError(null)
    setEditor({
      mode: character.isOfficial ? 'official' : 'edit',
      initialDraft: characterToDraft(character),
      characterId: character.id
    })
  }

  const handleCreateCharacter = async (draft: CharacterDraft): Promise<CharacterView | null> => {
    setCharacterPageError(null)
    /* 让编辑器捕获 ApiError 并显示后端的具体错误（重名/超限/选项非法等）。 */
    const created = await characters.create(draft)
    /* 后端在创建角色时自动建好唯一会话，这里刷新让它可以立即被选中 */
    if (created !== null) {
      await refreshConversations()
    }
    return created
  }

  const handleUpdateCharacter = async (
    id: string,
    draft: CharacterDraft,
    version: number
  ): Promise<CharacterView | null> => {
    setCharacterPageError(null)
    return characters.update(id, draft, version)
  }

  const handleSaveOfficialAvatar = (config: AvatarConfig): void => {
    if (user === null) {
      return
    }
    saveOfficialAvatar(user.id, config)
    setOfficialAvatar(config)
  }

  const handleDuplicateCharacter = async (
    id: string,
    avatarOverride?: AvatarConfig
  ): Promise<void> => {
    const source = displayCharacters.find((character) => character.id === id)
    if (source === undefined) {
      return
    }
    try {
      const copied = await characters.duplicate(
        id,
        undefined,
        avatarOverride ?? (source.isOfficial ? avatarOf(source, officialAvatar) : undefined)
      )
      if (copied !== null) {
        /* 复制角色同样由后端自动建会话，刷新列表让新会话可见 */
        await refreshConversations()
        setEditor({
          mode: 'edit',
          initialDraft: characterToDraft(copied),
          characterId: copied.id
        })
      }
    } catch (error) {
      setCharacterPageError(describeError(error, '复制角色失败'))
    }
  }

  const handleArchiveCharacter = async (id: string): Promise<void> => {
    try {
      await characters.archive(id)
      if (editor?.characterId === id) {
        setEditor(null)
      }
      if (activeConversation?.characterId === id) {
        setActiveConversation(null)
      }
    } catch (error) {
      setCharacterPageError(describeError(error, '归档角色失败'))
    }
  }

  const handleRestoreCharacter = async (id: string): Promise<void> => {
    try {
      await characters.restore(id)
    } catch (error) {
      setCharacterPageError(describeError(error, '恢复角色失败'))
    }
  }

  const handlePurgeCharacter = async (id: string, confirmName: string): Promise<void> => {
    try {
      await characters.purge(id, confirmName)
      await refreshConversations()
      if (activeConversation?.characterId === id) {
        setActiveConversation(null)
      }
      if (editor?.characterId === id) {
        setEditor(null)
      }
    } catch (error) {
      setCharacterPageError(describeError(error, '删除角色失败'))
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
              className={isRegisterMode ? 'tab' : 'tab tab--active'}
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

  const characterForChat = conversationCharacter ?? activeCharacter
  const editorCharacter =
    editor?.characterId === undefined
      ? null
      : displayCharacters.find((character) => character.id === editor.characterId) ?? null

  return (
    <>
      <div className="workspace">
        <nav className="rail" aria-label="主导航">
          <CharacterSwitcher
            characters={displayCharacters}
            previews={characterPreviews}
            activeId={characters.activeId}
            onSelect={(id) => {
              void handleSwitchCharacter(id)
            }}
            onManage={() => {
              setSection('characters')
            }}
            variant="rail"
          />

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
            clearingId={clearingConversationId}
            characters={displayCharacters}
            previews={characterPreviews}
            activeCharacterId={characters.activeId}
            onSwitchCharacter={(id) => {
              void handleSwitchCharacter(id)
            }}
            onManageCharacters={() => {
              setSection('characters')
            }}
            onSelect={handleSelectConversation}
            onClear={(conversation) => {
              void handleClearConversation(conversation)
            }}
            onRefresh={() => {
              void refreshConversations()
            }}
          />
        )}

        <main className="main">
          {section === 'chats' ? (
            activeConversation !== null && characterForChat !== null ? (
              <ChatView
                key={activeConversation.id}
                conversation={activeConversation}
                character={characterForChat}
                portraits={portraitAssets.displayPortraits}
                heroImage={portraitAssets.displayHeroImage}
                characterState={characterState}
                userName={user.username}
                characterSwitcher={
                  <CharacterSwitcher
                    characters={displayCharacters}
                    previews={characterPreviews}
                    activeId={characters.activeId}
                    onSelect={(id) => {
                      void handleSwitchCharacter(id)
                    }}
                    onManage={() => {
                      setSection('characters')
                    }}
                    variant="header"
                  />
                }
                onCall={() => {
                  setCallOpen(true)
                }}
                reloadToken={chatVersion}
              />
            ) : activeCharacter !== null ? (
              <EmptyChat
                character={activeCharacter}
                portraits={portraitAssets.displayPortraits}
                isEntering={isLoadingConversations}
                onEnter={() => {
                  /* 会话由后端 ensure，这里只切换角色并打开其唯一会话 */
                  void handleSwitchCharacter(activeCharacter.id, true)
                }}
              />
            ) : (
              <section className="page">
                <p className="alert" role="alert">
                  {characters.error ?? '角色还在加载，请稍候…'}
                </p>
              </section>
            )
          ) : section === 'characters' ? (
            editor !== null ? (
              <CharacterEditor
                key={`${editor.mode}:${editor.characterId ?? 'new'}`}
                userId={user.id}
                mode={editor.mode}
                character={editorCharacter}
                initialDraft={editor.initialDraft}
                allCharacters={displayCharacters}
                onClose={handleCloseEditor}
                onCreate={handleCreateCharacter}
                onUpdate={handleUpdateCharacter}
                onSaveOfficialAvatar={handleSaveOfficialAvatar}
                onVisualChange={() => {
                  setAvatarSourceVersion((previous) => previous + 1)
                }}
                onCopyOfficial={(avatarConfig) => {
                  if (characters.official !== null) {
                    void handleDuplicateCharacter(characters.official.id, avatarConfig)
                  }
                }}
                onUse={(id) => {
                  setEditor(null)
                  void handleSwitchCharacter(id, true)
                }}
              />
            ) : (
              <CharacterHub
                characters={displayCharacters}
                previews={characterPreviews}
                activeId={characters.activeId}
                isLoading={characters.isLoading}
                error={characterPageError ?? characters.error}
                onNew={handleNewCharacter}
                onUse={(id) => {
                  void handleSwitchCharacter(id)
                }}
                onEdit={handleEditCharacter}
                onDuplicate={(id) => {
                  void handleDuplicateCharacter(id)
                }}
                onArchive={(id) => {
                  void handleArchiveCharacter(id)
                }}
                onRestore={(id) => {
                  void handleRestoreCharacter(id)
                }}
                onPurge={handlePurgeCharacter}
                onRefresh={() => {
                  void characters.refresh()
                }}
              />
            )
          ) : section === 'memories' ? (
            <MemoryPanel
              characters={displayCharacters}
              activeCharacterId={characters.activeId}
            />
          ) : section === 'activity' ? (
            <ActivityPanel characters={displayCharacters} conversations={conversations} />
          ) : (
            <SettingsPanel
              user={user}
              apiBase={API_BASE}
              error={accountError}
              onLogout={() => {
                void handleLogout()
              }}
              onDeleteAccount={() => {
                void handleDeleteAccount()
              }}
              onManageCharacters={() => {
                setSection('characters')
              }}
            />
          )}
        </main>
      </div>

      {callOpen && activeConversation !== null && characterForChat !== null && (
        <CallView
          conversation={activeConversation}
          portraits={portraitAssets.displayPortraits}
          portraitsLoading={portraitAssets.loading}
          config={characterForChat.avatarConfig}
          characterName={characterForChat.displayName}
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
