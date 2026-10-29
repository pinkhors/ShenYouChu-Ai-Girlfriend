import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  activateCharacter,
  archiveCharacter,
  createCharacter,
  duplicateCharacter,
  listCharacters,
  purgeCharacter,
  restoreCharacter,
  updateCharacter
} from './characterApi'
import {
  draftToInput,
  draftToUpdateInput,
  type CharacterDraft,
  type CharacterView
} from './characterTypes'

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof TypeError) {
    return '无法连接后端，请确认服务已启动'
  }
  return error instanceof Error ? error.message : '角色请求失败，请稍后重试'
}

export interface CharacterManager {
  readonly characters: readonly CharacterView[]
  readonly activeCharacters: readonly CharacterView[]
  readonly customCharacters: readonly CharacterView[]
  readonly official: CharacterView | null
  readonly activeCharacter: CharacterView | null
  readonly activeId: string | null
  readonly isLoading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
  readonly create: (draft: CharacterDraft) => Promise<CharacterView | null>
  readonly update: (id: string, draft: CharacterDraft, version: number) => Promise<CharacterView | null>
  readonly activate: (id: string) => Promise<void>
  readonly duplicate: (
    id: string,
    displayName?: string,
    avatarConfig?: CharacterDraft['avatarConfig']
  ) => Promise<CharacterView | null>
  readonly archive: (id: string) => Promise<void>
  readonly restore: (id: string) => Promise<void>
  readonly purge: (id: string, confirmName: string) => Promise<void>
  readonly getById: (id: string | null | undefined) => CharacterView | undefined
}

/**
 * 角色列表与当前角色的状态管理。
 * 只负责数据与 API；编辑草稿、弹窗和页面跳转由组件层负责。
 */
export function useCharacters(userId: string | null): CharacterManager {
  const [characters, setCharacters] = useState<CharacterView[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    if (userId === null) {
      setCharacters([])
      setError(null)
      setIsLoading(false)
      return
    }
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setIsLoading(true)
    try {
      const items = await listCharacters(true)
      if (requestRef.current !== requestId) {
        return
      }
      setCharacters([...items])
      setError(null)
    } catch (loadError) {
      if (requestRef.current === requestId) {
        setError(toMessage(loadError))
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [userId])

  useEffect(() => {
    void refresh()
    return () => {
      requestRef.current += 1
    }
  }, [refresh])

  const official = useMemo(
    () => characters.find((character) => character.isOfficial) ?? null,
    [characters]
  )
  const activeCharacter = useMemo(() => {
    return (
      characters.find((character) => character.isActive && character.status === 'active') ??
      characters.find((character) => character.isOfficial) ??
      null
    )
  }, [characters])
  const activeCharacters = useMemo(
    () => characters.filter((character) => character.status === 'active'),
    [characters]
  )
  const customCharacters = useMemo(
    () => characters.filter((character) => !character.isOfficial),
    [characters]
  )

  const getById = useCallback(
    (id: string | null | undefined): CharacterView | undefined =>
      id == null ? undefined : characters.find((character) => character.id === id),
    [characters]
  )

  const create = useCallback(
    async (draft: CharacterDraft): Promise<CharacterView | null> => {
      const created = await createCharacter(draftToInput(draft))
      await refresh()
      return created
    },
    [refresh]
  )

  const update = useCallback(
    async (id: string, draft: CharacterDraft, version: number): Promise<CharacterView | null> => {
      const updated = await updateCharacter(id, draftToUpdateInput(draft, version))
      await refresh()
      return updated
    },
    [refresh]
  )

  const activate = useCallback(
    async (id: string): Promise<void> => {
      const activeId = await activateCharacter(id)
      if (activeId === null) {
        await refresh()
        return
      }
      setCharacters((previous) =>
        previous.map((character) => ({ ...character, isActive: character.id === activeId }))
      )
    },
    [refresh]
  )

  const duplicate = useCallback(
    async (
      id: string,
      displayName?: string,
      avatarConfig?: CharacterDraft['avatarConfig']
    ): Promise<CharacterView | null> => {
      const copied = await duplicateCharacter(id, {
        ...(displayName === undefined ? {} : { displayName }),
        ...(avatarConfig === undefined ? {} : { avatarConfig })
      })
      await refresh()
      return copied
    },
    [refresh]
  )

  const archive = useCallback(
    async (id: string): Promise<void> => {
      const result = await archiveCharacter(id)
      await refresh()
      if (result.activeCharacterId !== null) {
        setCharacters((previous) =>
          previous.map((character) => ({
            ...character,
            isActive: character.id === result.activeCharacterId
          }))
        )
      }
    },
    [refresh]
  )

  const restore = useCallback(
    async (id: string): Promise<void> => {
      await restoreCharacter(id)
      await refresh()
    },
    [refresh]
  )

  const purge = useCallback(
    async (id: string, confirmName: string): Promise<void> => {
      await purgeCharacter(id, confirmName)
      await refresh()
    },
    [refresh]
  )

  return {
    characters,
    activeCharacters,
    customCharacters,
    official,
    activeCharacter,
    activeId: activeCharacter?.id ?? null,
    isLoading,
    error,
    refresh,
    create,
    update,
    activate,
    duplicate,
    archive,
    restore,
    purge,
    getById
  }
}
