/**
 * 每个角色“展示哪一套形象”的本机偏好。
 *
 * - auto：有立绘用立绘，没有则回退矢量捏脸（默认）
 * - portrait：优先立绘；没有立绘时仍回退矢量
 * - vector：即使有立绘也显示矢量捏脸
 *
 * 立绘本身只在本机，因此这个偏好也按 user + character 存本机。
 */

export type CharacterAvatarSource = 'auto' | 'portrait' | 'vector'

const KEY_PREFIX = 'shenyouchu.character-avatar-source.v1.'

export const AVATAR_SOURCE_OPTIONS: readonly {
  readonly id: CharacterAvatarSource
  readonly label: string
  readonly hint: string
}[] = [
  { id: 'auto', label: '自动', hint: '有立绘用立绘，没有则用捏脸' },
  { id: 'portrait', label: '立绘', hint: '优先使用导入/生成的立绘' },
  { id: 'vector', label: '捏脸', hint: '始终使用矢量形象' }
]

function storageKey(userId: string, characterId: string): string {
  return `${KEY_PREFIX}${userId}.${characterId}`
}

export function getCharacterAvatarSource(
  userId: string,
  characterId: string
): CharacterAvatarSource {
  try {
    const value = window.localStorage.getItem(storageKey(userId, characterId))
    return value === 'portrait' || value === 'vector' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function setCharacterAvatarSource(
  userId: string,
  characterId: string,
  source: CharacterAvatarSource
): void {
  try {
    window.localStorage.setItem(storageKey(userId, characterId), source)
  } catch {
    /* 本机存储不可用时仅在当前会话生效 */
  }
}

export function clearCharacterAvatarSource(userId: string, characterId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId, characterId))
  } catch {
    /* 忽略 */
  }
}

/** 当前配置下是否应该把立绘交给展示组件。 */
export function shouldUsePortrait(
  source: CharacterAvatarSource,
  hasPortrait: boolean
): boolean {
  return hasPortrait && source !== 'vector'
}
