import { PORTRAIT_SLOTS, type PortraitExpression, type PortraitSet } from './expression'

/**
 * 立绘的本地存储：IndexedDB（key = userId），每个用户一套表情图。
 *
 * - 不新增后端接口，立绘只在本机生效；
 * - 存 data URL（导入时已压到长边 1400px 的 WebP），避免 object URL 生命周期管理；
 * - 存储不可用时读取降级为“没有立绘”，写入失败由调用方提示。
 */

const DB_NAME = 'shenyouchu-portraits'
const DB_VERSION = 1
const STORE_NAME = 'portraits'

interface StoredPortrait {
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

function isStoredPortrait(value: unknown): value is StoredPortrait {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as { userId?: unknown; images?: unknown }
  if (typeof record.userId !== 'string' || typeof record.images !== 'object' || record.images === null) {
    return false
  }
  return Object.values(record.images as Record<string, unknown>).every((image) => typeof image === 'string')
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

async function readRecord(userId: string): Promise<StoredPortrait | null> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const value: unknown = await requestToPromise(transaction.objectStore(STORE_NAME).get(userId))
  return isStoredPortrait(value) ? value : null
}

function writeRecord(record: StoredPortrait): Promise<void> {
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
        transaction.objectStore(STORE_NAME).put(record)
      })
  )
}

function deleteRecord(userId: string): Promise<void> {
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
        transaction.objectStore(STORE_NAME).delete(userId)
      })
  )
}

/** 读取该用户的立绘；缺失或存储不可用时返回 null（界面回退矢量形象）。 */
export async function loadPortraits(userId: string): Promise<PortraitSet | null> {
  try {
    const record = await readRecord(userId)
    if (record === null) {
      return null
    }
    const images = toPortraitSet(record.images)
    return Object.keys(images).length === 0 ? null : images
  } catch {
    return null
  }
}

export async function savePortrait(
  userId: string,
  slot: PortraitExpression,
  dataUrl: string
): Promise<void> {
  const record = await readRecord(userId)
  const images: Record<string, string> = { ...(record?.images ?? {}) }
  images[slot] = dataUrl
  await writeRecord({ userId, images })
}

export async function removePortrait(userId: string, slot: PortraitExpression): Promise<void> {
  const record = await readRecord(userId)
  if (record === null) {
    return
  }
  const images: Record<string, string> = { ...record.images }
  delete images[slot]
  if (Object.keys(images).length === 0) {
    await deleteRecord(userId)
    return
  }
  await writeRecord({ userId, images })
}

export async function clearPortraits(userId: string): Promise<void> {
  await deleteRecord(userId)
}
