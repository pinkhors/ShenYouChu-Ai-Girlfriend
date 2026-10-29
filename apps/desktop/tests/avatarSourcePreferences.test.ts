import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_SOURCE_OPTIONS,
  getCharacterAvatarSource,
  setCharacterAvatarSource,
  clearCharacterAvatarSource,
  shouldUsePortrait
} from '../src/renderer/src/character/avatarSourcePreferences'

function installStorage(): Map<string, string> {
  const values = new Map<string, string>()
  const storage = {
    getItem(key: string): string | null {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      values.set(key, value)
    },
    removeItem(key: string): void {
      values.delete(key)
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage }
  })
  return values
}

test('avatar source defaults to auto and persists per user+character', () => {
  installStorage()
  assert.equal(getCharacterAvatarSource('u1', 'c1'), 'auto')
  setCharacterAvatarSource('u1', 'c1', 'portrait')
  assert.equal(getCharacterAvatarSource('u1', 'c1'), 'portrait')
  assert.equal(getCharacterAvatarSource('u1', 'c2'), 'auto')
  assert.equal(getCharacterAvatarSource('u2', 'c1'), 'auto')
  setCharacterAvatarSource('u1', 'c1', 'vector')
  assert.equal(getCharacterAvatarSource('u1', 'c1'), 'vector')
  clearCharacterAvatarSource('u1', 'c1')
  assert.equal(getCharacterAvatarSource('u1', 'c1'), 'auto')
})

test('unknown stored values fall back to auto', () => {
  const values = installStorage()
  values.set('shenyouchu.character-avatar-source.v1.u1.c1', 'photo')
  assert.equal(getCharacterAvatarSource('u1', 'c1'), 'auto')
})

test('source options are complete and shouldUsePortrait respects vector', () => {
  assert.deepEqual(
    AVATAR_SOURCE_OPTIONS.map((option) => option.id),
    ['auto', 'portrait', 'vector']
  )
  assert.equal(shouldUsePortrait('auto', true), true)
  assert.equal(shouldUsePortrait('portrait', true), true)
  assert.equal(shouldUsePortrait('vector', true), false)
  assert.equal(shouldUsePortrait('auto', false), false)
})
