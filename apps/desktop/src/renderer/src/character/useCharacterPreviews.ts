import { useEffect, useMemo, useState } from 'react'
import type { PortraitSet } from '../portrait/expression'
import { loadPortraitPreview } from '../portrait/portraitStorage'
import {
  getCharacterAvatarSource,
  shouldUsePortrait
} from './avatarSourcePreferences'
import type { CharacterView } from './characterTypes'

export type CharacterPreviewMap = Readonly<Record<string, PortraitSet | null>>

/**
 * 为角色中心、切换器、会话列表加载每个角色的一张预览图，并按该角色的
 * “形象来源”偏好决定是否交给 AvatarPortrait。
 *
 * 只缓存一张基础图，避免把最多 13 个角色的整组立绘同时放进列表组件。
 */
export function useCharacterPreviews(
  userId: string | null,
  characters: readonly CharacterView[],
  officialCharacterId: string | undefined,
  sourceVersion = 0
): CharacterPreviewMap {
  const [previews, setPreviews] = useState<Record<string, string | null>>({})
  const characterKey = characters.map((character) => character.id).join(',')

  useEffect(() => {
    if (userId === null || characters.length === 0) {
      setPreviews({})
      return
    }
    let cancelled = false
    const ids = characters.map((character) => character.id)
    void Promise.all(
      ids.map(async (id) => {
        const preview = await loadPortraitPreview(userId, id, officialCharacterId)
        return [id, preview] as const
      })
    )
      .then((entries) => {
        if (!cancelled) {
          setPreviews(Object.fromEntries(entries))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviews({})
        }
      })
    return () => {
      cancelled = true
    }
    // characterKey 覆盖 id 列表变化；characters 本身在渲染间可能是新数组。
    // sourceVersion 同时承担“立绘导入/删除后重新加载预览”的刷新信号。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, characterKey, officialCharacterId, sourceVersion])

  return useMemo(() => {
    const result: Record<string, PortraitSet | null> = {}
    for (const character of characters) {
      const preview = previews[character.id] ?? null
      const source = userId === null ? 'auto' : getCharacterAvatarSource(userId, character.id)
      result[character.id] =
        preview !== null && shouldUsePortrait(source, true) ? { neutral: preview } : null
    }
    return result
  }, [characters, previews, userId, sourceVersion])
}
