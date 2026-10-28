/**
 * 登录凭证与用户信息的本地存储（key：shenyouchu.token / shenyouchu.user）。
 *
 * M0（当前骨架）使用 localStorage：
 * - 刷新渲染进程即可恢复登录态，不需要主进程 IPC；
 * - 代价是明文 token 落在渲染进程可访问的存储里，注入类漏洞可直接读取。
 *
 * 后续里程碑（安全存储）改为主进程 safeStorage（系统密钥链）加密保存，
 * 渲染进程只持有短时内存态凭证，经受限 IPC 读写；localStorage 仅作迁移来源。
 * 迁移时保持 getToken / setToken / getUser / setUser / clear 这组签名不变，调用方无需改动。
 *
 * 这里刻意不 import api/client 的类型，而是声明结构相同的 TokenUser：结构类型兼容，
 * 调用方传 UserView 或接收 TokenUser 都无需改动，同时让本模块可以在 Node 测试中独立编译。
 * 实现拆成 createTokenStore(storage)，便于用内存存储测试，不依赖浏览器环境。
 */

const TOKEN_KEY = 'shenyouchu.token'
const USER_KEY = 'shenyouchu.user'

export interface TokenUser {
  readonly id: string
  readonly username: string
  readonly role: string
}

export interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface TokenStore {
  getToken(): string | null
  setToken(token: string): void
  getUser(): TokenUser | null
  setUser(user: TokenUser): void
  clear(): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUserView(value: unknown): value is TokenUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    typeof value.role === 'string'
  )
}

export function createTokenStore(storage: TokenStorage): TokenStore {
  return {
    /** 读取访问令牌；未登录、或被禁用存储时返回 null。 */
    getToken(): string | null {
      try {
        const token = storage.getItem(TOKEN_KEY)
        return token === null || token === '' ? null : token
      } catch {
        /* 存储不可用（隐私模式/策略限制）时按未登录处理，不阻塞界面 */
        return null
      }
    },

    setToken(token: string): void {
      try {
        storage.setItem(TOKEN_KEY, token)
      } catch {
        /* 写失败不致命：内存态仍可继续使用，仅刷新后需重新登录 */
      }
    },

    /** 读取缓存的用户信息；内容损坏或结构不符时返回 null（由调用方回源 /auth/me 校正）。 */
    getUser(): TokenUser | null {
      try {
        const raw = storage.getItem(USER_KEY)
        if (raw === null) {
          return null
        }
        const parsed: unknown = JSON.parse(raw)
        return isUserView(parsed) ? parsed : null
      } catch {
        return null
      }
    },

    setUser(user: TokenUser): void {
      try {
        storage.setItem(USER_KEY, JSON.stringify(user))
      } catch {
        /* 同 setToken：写失败不影响当前会话 */
      }
    },

    /** 清除本地登录态：退出登录、401 失效、切换账号时调用。 */
    clear(): void {
      try {
        storage.removeItem(TOKEN_KEY)
        storage.removeItem(USER_KEY)
      } catch {
        /* 存储不可用时无需额外处理 */
      }
    }
  }
}

/** 惰性解析浏览器存储：模块导入本身不触碰 window，便于在 Node 中测试。 */
function browserStorage(): TokenStorage {
  return window.localStorage
}

let defaultStore: TokenStore | null = null

function store(): TokenStore {
  if (defaultStore === null) {
    defaultStore = createTokenStore(browserStorage())
  }
  return defaultStore
}

export function getToken(): string | null {
  return store().getToken()
}

export function setToken(token: string): void {
  store().setToken(token)
}

export function getUser(): TokenUser | null {
  return store().getUser()
}

export function setUser(user: TokenUser): void {
  store().setUser(user)
}

export function clear(): void {
  store().clear()
}