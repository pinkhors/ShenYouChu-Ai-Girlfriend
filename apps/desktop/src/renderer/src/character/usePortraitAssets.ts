import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PortraitExpression, PortraitSet } from '../portrait/expression'
import {
  clearHeroImage,
  clearPortraits,
  loadHeroImage,
  loadPortraits,
  removePortrait as removePortraitRecord,
  saveHeroImage,
  savePortrait as savePortraitRecord
} from '../portrait/portraitStorage'
import {
  getCharacterAvatarSource,
  type CharacterAvatarSource
} from './avatarSourcePreferences'

export interface PortraitAssets {
  /** 本机实际导入/生成的完整立绘，供立绘管理面板使用。 */
  readonly portraits: PortraitSet | null
  /** 按角色“形象来源”偏好过滤后的立绘，供聊天/通话/预览显示。 */
  readonly displayPortraits: PortraitSet | null
  readonly heroImage: string | null
  readonly displayHeroImage: string | null
  readonly source: CharacterAvatarSource
  readonly loading: boolean
  readonly setHero: (dataUrl: string) => Promise<boolean>
  readonly clearHero: () => Promise<boolean>
  readonly importPortrait: (slot: PortraitExpression, dataUrl: string) => Promise<boolean>
  readonly removePortrait: (slot: PortraitExpression) => Promise<boolean>
  readonly clearAll: () => Promise<boolean>
}

/**
 * 某个角色的本机立绘与聊天主视觉。
 * 角色切换时重新加载；官方角色会尝试迁移旧版本按 userId 存的数据。
 * sourceVersion 变化时重新读取该角色的形象来源偏好。
 */
export function usePortraitAssets(
  userId: string | null,
  characterId: string | null,
  officialCharacterId?: string,
  sourceVersion = 0
): PortraitAssets {
  const [portraits, setPortraits] = useState<PortraitSet | null>(null)
  const [heroImage, setHeroImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const source = useMemo<CharacterAvatarSource>(() => {
    if (userId === null || characterId === null) {
      return 'auto'
    }
    return getCharacterAvatarSource(userId, characterId)
  }, [userId, characterId, sourceVersion])

  const displayPortraits =
    source === 'vector'
      ? null
      : portraits ?? (heroImage !== null ? { neutral: heroImage } : null)
  const displayHeroImage = source === 'vector' ? null : heroImage

  useEffect(() => {
    if (userId === null || characterId === null) {
      setPortraits(null)
      setHeroImage(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setPortraits(null)
    setHeroImage(null)
    setLoading(true)
    void Promise.all([
      loadPortraits(userId, characterId, officialCharacterId),
      loadHeroImage(userId, characterId, officialCharacterId)
    ])
      .then(([loadedPortraits, hero]) => {
        if (!cancelled) {
          setPortraits(loadedPortraits)
          setHeroImage(hero)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPortraits(null)
          setHeroImage(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [userId, characterId, officialCharacterId])

  const setHero = useCallback(
    async (dataUrl: string): Promise<boolean> => {
      if (userId === null || characterId === null) {
        return false
      }
      const previous = heroImage
      setHeroImage(dataUrl)
      try {
        await saveHeroImage(userId, characterId, dataUrl)
        return true
      } catch {
        setHeroImage(previous)
        return false
      }
    },
    [userId, characterId, heroImage]
  )

  const clearHero = useCallback(async (): Promise<boolean> => {
    if (userId === null || characterId === null) {
      return false
    }
    const previous = heroImage
    setHeroImage(null)
    try {
      await clearHeroImage(userId, characterId, officialCharacterId)
      return true
    } catch {
      setHeroImage(previous)
      return false
    }
  }, [userId, characterId, heroImage, officialCharacterId])

  const importPortrait = useCallback(
    async (slot: PortraitExpression, dataUrl: string): Promise<boolean> => {
      if (userId === null || characterId === null) {
        return false
      }
      setPortraits((previous) => ({ ...(previous ?? {}), [slot]: dataUrl }))
      try {
        await savePortraitRecord(userId, characterId, slot, dataUrl)
        return true
      } catch {
        const restored = await loadPortraits(userId, characterId, officialCharacterId).catch(() => null)
        setPortraits(restored)
        return false
      }
    },
    [userId, characterId, officialCharacterId]
  )

  const removePortrait = useCallback(
    async (slot: PortraitExpression): Promise<boolean> => {
      if (userId === null || characterId === null) {
        return false
      }
      setPortraits((previous) => {
        if (previous === null) {
          return null
        }
        const next: PortraitSet = { ...previous }
        delete next[slot]
        return Object.keys(next).length === 0 ? null : next
      })
      try {
        await removePortraitRecord(userId, characterId, slot)
        return true
      } catch {
        const restored = await loadPortraits(userId, characterId, officialCharacterId).catch(() => null)
        setPortraits(restored)
        return false
      }
    },
    [userId, characterId, officialCharacterId]
  )

  const clearAll = useCallback(async (): Promise<boolean> => {
    if (userId === null || characterId === null) {
      return false
    }
    setPortraits(null)
    setHeroImage(null)
    try {
      await clearPortraits(userId, characterId, officialCharacterId)
      return true
    } catch {
      const restored = await loadPortraits(userId, characterId, officialCharacterId).catch(() => null)
      setPortraits(restored)
      return false
    }
  }, [userId, characterId, officialCharacterId])

  return {
    portraits,
    displayPortraits,
    heroImage,
    displayHeroImage,
    source,
    loading,
    setHero,
    clearHero,
    importPortrait,
    removePortrait,
    clearAll
  }
}
