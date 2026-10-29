import { activateCharacter as putActiveCharacter, request } from '../api/client'
import {
  normalizeCharacter,
  type CharacterInput,
  type CharacterUpdateInput,
  type CharacterView,
  type ExpressionConfig
} from './characterTypes'

/**
 * 角色接口封装。后端契约见 docs/07-character-customization.md 5.4。
 * 所有响应都经过 normalizeCharacter，避免脏 JSON 把界面卡死。
 */

export interface CharacterMutationResult {
  readonly character: CharacterView | null
  readonly activeCharacterId: string | null
}

/** 切换角色的结果：当前角色 + 其唯一会话（后端 ensure 后回传）。 */
export interface CharacterActivationResult {
  readonly activeCharacterId: string | null
  readonly conversationId: string | null
}

export interface CharacterPurgeResult {
  readonly activeCharacterId: string | null
  readonly conversations: number
  readonly messages: number
  readonly memories: number
  readonly states: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function readString(source: Record<string, unknown> | null, key: string): string | null {
  if (source === null) {
    return null
  }
  return typeof source[key] === 'string' ? source[key] : null
}

function normalizeMutation(value: unknown): CharacterMutationResult {
  const record = asRecord(value)
  return {
    character: normalizeCharacter(record?.character),
    activeCharacterId: readString(record, 'activeCharacterId')
  }
}

export async function listCharacters(includeArchived = false): Promise<CharacterView[]> {
  const raw = await request<unknown>(`/characters?includeArchived=${includeArchived ? 'true' : 'false'}`)
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item) => normalizeCharacter(item))
    .filter((item): item is CharacterView => item !== null)
}

export async function getCharacter(id: string): Promise<CharacterView | null> {
  const raw = await request<unknown>(`/characters/${encodeURIComponent(id)}`)
  return normalizeCharacter(raw)
}

export async function createCharacter(input: CharacterInput): Promise<CharacterView | null> {
  const raw = await request<unknown>('/characters', { method: 'POST', body: input })
  return normalizeCharacter(raw)
}

export async function updateCharacter(
  id: string,
  input: CharacterUpdateInput
): Promise<CharacterView | null> {
  const raw = await request<unknown>(`/characters/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input
  })
  return normalizeCharacter(raw)
}

export async function duplicateCharacter(
  id: string,
  input: {
    displayName?: string
    avatarConfig?: unknown
    /** 省略时由后端复制原角色的 expression 配置。 */
    expression?: ExpressionConfig
  } = {}
): Promise<CharacterView | null> {
  const raw = await request<unknown>(`/characters/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    body: input
  })
  return normalizeCharacter(raw)
}

export async function archiveCharacter(id: string): Promise<CharacterMutationResult> {
  return normalizeMutation(
    await request<unknown>(`/characters/${encodeURIComponent(id)}/archive`, { method: 'POST' })
  )
}

export async function restoreCharacter(id: string): Promise<CharacterMutationResult> {
  return normalizeMutation(
    await request<unknown>(`/characters/${encodeURIComponent(id)}/restore`, { method: 'POST' })
  )
}

export async function purgeCharacter(id: string, confirmName: string): Promise<CharacterPurgeResult> {
  const raw = asRecord(
    await request<unknown>(`/characters/${encodeURIComponent(id)}/purge`, {
      method: 'POST',
      body: { confirmName }
    })
  )
  const number = (key: string): number => {
    const value = raw?.[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return {
    activeCharacterId: readString(raw, 'activeCharacterId'),
    conversations: number('conversations'),
    messages: number('messages'),
    memories: number('memories'),
    states: number('states')
  }
}

export async function activateCharacter(id: string): Promise<CharacterActivationResult> {
  const raw = asRecord(await putActiveCharacter(id))
  return {
    activeCharacterId: readString(raw, 'activeCharacterId'),
    conversationId: readString(raw, 'conversationId')
  }
}
