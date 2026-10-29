import { PORTRAIT_SLOTS, type PortraitExpression, type PortraitSet } from './expression'

/**
 * 立绘的本地存储：IndexedDB（key = userId:characterId），每个角色一套表情图。
 *
 * - 不新增后端接口，立绘只在本机生效；
 * - 存 data URL（导入时已压到长边 1400px 的 WebP），避免 object URL 生命周期管理；
 * - 旧版本按 userId 存一套，首次读取官方角色时自动迁移到 userId:characterId；
 * - 存储不可用时读取降级为“没有立绘”，写入失败由调用方提示。
 */

const DB_NAME = 'shenyouchu-portraits'
const DB_VERSION = 1
const STORE_NAME = 'portraits'

interface StoredPortrait {
  /** 兼容旧 object store 的 keyPath：userId；新数据里存的是 userId:characterId。 */
  readonly userId: string
  readonly images: Record<string, string>
}

let databasePromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB 请求失败'))
    }
  })
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise === null) {
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持 IndexedDB'))
        return
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'userId' })
        }
      }
      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        reject(request.error ?? new Error('IndexedDB 打开失败'))
      }
    })
  }
  return databasePromise
}

function recordKey(userId: string, characterId: string): string {
  return `${userId}:${characterId}`
}

function parseImages(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const record = value as { images?: unknown }
  if (typeof record.images !== 'object' || record.images === null) {
    return null
  }
  const images: Record<string, string> = {}
  for (const [key, image] of Object.entries(record.images as Record<string, unknown>)) {
    if (typeof image === 'string') {
      images[key] = image
    }
  }
  return images
}

function toPortraitSet(images: Record<string, string>): PortraitSet {
  const result: PortraitSet = {}
  for (const slot of PORTRAIT_SLOTS) {
    const value = images[slot.id]
    if (typeof value === 'string' && value !== '') {
      result[slot.id] = value
    }
  }
  return result
}

async function readImages(storageKey: string): Promise<Record<string, string> | null> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const value: unknown = await requestToPromise(transaction.objectStore(STORE_NAME).get(storageKey))
  return parseImages(value)
}

function writeImages(storageKey: string, images: Record<string, string>): Promise<void> {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.oncomplete = () => {
          resolve()
        }
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('写入立绘失败'))
        }
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('写入立绘被中止'))
        }
        const record: StoredPortrait = { userId: storageKey, images }
        transaction.objectStore(STORE_NAME).put(record)
      })
  )
}

function deleteRecord(storageKey: string): Promise<void> {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.oncomplete = () => {
          resolve()
        }
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('删除立绘失败'))
        }
        transaction.objectStore(STORE_NAME).delete(storageKey)
      })
  )
}

/**
 * 读取该角色的立绘。
 * officialCharacterId 传入时，若这是官方角色且新 key 没有数据，会尝试把旧版 userId 数据迁移过来。
 */
export async function loadPortraits(
  userId: string,
  characterId: string,
  officialCharacterId?: string
): Promise<PortraitSet | null> {
  try {
    const key = recordKey(userId, characterId)
    let images = await readImages(key)
    if (officialCharacterId === characterId) {
      /* 旧版按 userId 存的一套可能包含立绘与 hero；新记录可能只写了其中一部分。 */
      const legacy = await readImages(userId)
      if (legacy !== null) {
        const merged: Record<string, string> = { ...legacy, ...(images ?? {}) }
        images = merged
        try {
          await writeImages(key, merged)
          await deleteRecord(userId)
        } catch {
          /* 迁移写入失败时保留旧记录，下次再试；本次仍返回合并结果 */
        }
      }
    }
    if (images === null) {
      return null
    }
    const portraits = toPortraitSet(images)
    return Object.keys(portraits).length === 0 ? null : portraits
  } catch {
    return null
  }
}

/**
 * 只读取一张预览图（基础表情优先），供角色卡/切换器/会话列表使用。
 * 避免把每个角色的整组立绘都常驻在列表组件里。
 */
export async function loadPortraitPreview(
  userId: string,
  characterId: string,
  officialCharacterId?: string
): Promise<string | null> {
  const portraits = await loadPortraits(userId, characterId, officialCharacterId)
  const portrait = portraits?.neutral ?? (portraits === null ? null : Object.values(portraits)[0] ?? null)
  if (portrait !== null) {
    return portrait
  }
  /* 只导入了聊天主视觉时也用它做列表头像，避免角色卡仍显示矢量形象。 */
  return loadHeroImage(userId, characterId, officialCharacterId)
}

export async function savePortrait(
  userId: string,
  characterId: string,
  slot: PortraitExpression,
  dataUrl: string
): Promise<void> {
  const key = recordKey(userId, characterId)
  const images: Record<string, string> = { ...(await readImages(key) ?? {}) }
  images[slot] = dataUrl
  await writeImages(key, images)
}

export async function removePortrait(
  userId: string,
  characterId: string,
  slot: PortraitExpression
): Promise<void> {
  const key = recordKey(userId, characterId)
  const images = await readImages(key)
  if (images === null) {
    return
  }
  const next = { ...images }
  delete next[slot]
  if (Object.keys(next).length === 0) {
    await deleteRecord(key)
    return
  }
  await writeImages(key, next)
}

export async function clearPortraits(
  userId: string,
  characterId: string,
  officialCharacterId?: string
): Promise<void> {
  await deleteRecord(recordKey(userId, characterId))
  if (officialCharacterId === characterId) {
    await deleteRecord(userId).catch(() => undefined)
  }
}

/* ---------------- 聊天页主视觉（抠图） ---------------- */

const HERO_KEY = 'hero'

export async function loadHeroImage(
  userId: string,
  characterId: string,
  officialCharacterId?: string
): Promise<string | null> {
  try {
    const images = await readImages(recordKey(userId, characterId))
    const direct = images?.[HERO_KEY]
    if (typeof direct === 'string' && direct !== '') {
      return direct
    }
    if (officialCharacterId === characterId) {
      const legacy = await readImages(userId)
      const hero = legacy?.[HERO_KEY]
      return typeof hero === 'string' && hero !== '' ? hero : null
    }
    return null
  } catch {
    return null
  }
}

export async function saveHeroImage(
  userId: string,
  characterId: string,
  dataUrl: string
): Promise<void> {
  const key = recordKey(userId, characterId)
  const images: Record<string, string> = { ...(await readImages(key) ?? {}) }
  images[HERO_KEY] = dataUrl
  await writeImages(key, images)
}

export async function clearHeroImage(
  userId: string,
  characterId: string,
  officialCharacterId?: string
): Promise<void> {
  const key = recordKey(userId, characterId)
  const images = await readImages(key)
  if (images !== null) {
    const next = { ...images }
    delete next[HERO_KEY]
    if (Object.keys(next).length === 0) {
      await deleteRecord(key)
    } else {
      await writeImages(key, next)
    }
  }
  /* 官方角色的旧版 userId 记录里可能还留着 hero，清除时一并移除。 */
  if (officialCharacterId === characterId) {
    const legacy = await readImages(userId)
    if (legacy !== null && HERO_KEY in legacy) {
      const next = { ...legacy }
      delete next[HERO_KEY]
      if (Object.keys(next).length === 0) {
        await deleteRecord(userId)
      } else {
        await writeImages(userId, next)
      }
    }
  }
}
