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
