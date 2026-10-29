import {
  DEFAULT_AVATAR,
  deserializeAvatar,
  normalizeAvatar,
  serializeAvatar,
  type AvatarConfig
} from './avatarConfig'

/**
 * 形象配置的本地持久化（key：shenyouchu.avatar.v1.<userId>）。
 *
 * 这一版不新增后端接口：形象只是本机偏好，不参与账号数据与多端同步；
 * 后续迁移到后端时保持 get/set/clear 签名不变，调用方无需改动。
 * 实现拆成 createAvatarStore(storage)，便于在 Node 测试中注入内存存储。
 */

const KEY_PREFIX = 'shenyouchu.avatar.v1.'

export interface AvatarStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface AvatarStore {
  get(userId: string): AvatarConfig
  set(userId: string, config: AvatarConfig): void
  clear(userId: string): void
}

export function createAvatarStore(storage: AvatarStorage): AvatarStore {
  return {
    /** 读取该用户的形象；缺失、损坏、存储被禁用时都退回默认形象。 */
    get(userId: string): AvatarConfig {
      try {
        return normalizeAvatar(deserializeAvatar(storage.getItem(KEY_PREFIX + userId)))
      } catch {
        return DEFAULT_AVATAR
      }
    },

    set(userId: string, config: AvatarConfig): void {
      try {
        storage.setItem(KEY_PREFIX + userId, serializeAvatar(config))
      } catch {
        /* 写失败不阻塞使用：当前会话内形象仍生效，刷新后回到默认 */
      }
    },

    clear(userId: string): void {
      try {
        storage.removeItem(KEY_PREFIX + userId)
      } catch {
        /* 存储不可用时无需额外处理 */
      }
    }
  }
}

let defaultStore: AvatarStore | null = null

function store(): AvatarStore {
  if (defaultStore === null) {
    defaultStore = createAvatarStore(window.localStorage)
  }
  return defaultStore
}

export function getAvatar(userId: string): AvatarConfig {
  return store().get(userId)
}

export function saveAvatar(userId: string, config: AvatarConfig): void {
  store().set(userId, config)
}

export function clearAvatar(userId: string): void {
  store().clear(userId)
}

/* ---------------- 官方角色的本机形象覆盖 ---------------- */

/**
 * 官方角色的人设只读，但矢量形象保留旧版本的“本机覆盖”：
 * 这样升级后老用户已经调好的沈幼楚不会在旧会话里换脸。
 * 自定义角色的形象走服务端 avatarConfig，不使用这里。
 */
export function getOfficialAvatar(userId: string): AvatarConfig | null {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId)
    if (raw === null || raw === '') {
      return null
    }
    return normalizeAvatar(deserializeAvatar(raw))
  } catch {
    return null
  }
}

export function saveOfficialAvatar(userId: string, config: AvatarConfig): void {
  store().set(userId, config)
}

export function clearOfficialAvatar(userId: string): void {
  store().clear(userId)
}
