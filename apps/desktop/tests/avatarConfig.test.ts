import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR,
  deserializeAvatar,
  isSameAvatar,
  normalizeAvatar,
  randomizeAvatar,
  serializeAvatar
} from '../src/renderer/src/avatar/avatarConfig'
import { createAvatarStore, type AvatarStorage } from '../src/renderer/src/avatar/avatarStorage'

function memoryStorage(): AvatarStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    }
  }
}

function throwingStorage(): AvatarStorage {
  return {
    getItem() {
      throw new Error('storage disabled')
    },
    setItem() {
      throw new Error('storage disabled')
    },
    removeItem() {
      throw new Error('storage disabled')
    }
  }
}

test('normalizeAvatar falls back to defaults for non-objects', () => {
  assert.deepEqual(normalizeAvatar(null), DEFAULT_AVATAR)
  assert.deepEqual(normalizeAvatar('nope'), DEFAULT_AVATAR)
  assert.deepEqual(normalizeAvatar(42), DEFAULT_AVATAR)
})

test('normalizeAvatar clamps numbers and rejects unknown enum values', () => {
  const normalized = normalizeAvatar({
    skinTone: 'neon',
    hairStyle: 'mohawk',
    hairColor: 'rainbow',
    faceShape: 4,
    eyeColor: 'red',
    eyeSize: -1,
    eyeSpacing: Number.NaN,
    browStyle: 'angry',
    lipColor: 'black',
    lipFullness: 2,
    blush: 'lots',
    outfitColor: 'gold',
    accessory: 'crown'
  })

  assert.equal(normalized.skinTone, DEFAULT_AVATAR.skinTone)
  assert.equal(normalized.hairStyle, DEFAULT_AVATAR.hairStyle)
  assert.equal(normalized.hairColor, DEFAULT_AVATAR.hairColor)
  assert.equal(normalized.faceShape, 1)
  assert.equal(normalized.eyeColor, DEFAULT_AVATAR.eyeColor)
  assert.equal(normalized.eyeSize, 0)
  assert.equal(normalized.eyeSpacing, DEFAULT_AVATAR.eyeSpacing)
  assert.equal(normalized.lipFullness, 1)
  assert.equal(normalized.blush, DEFAULT_AVATAR.blush)
  assert.equal(normalized.outfitColor, DEFAULT_AVATAR.outfitColor)
  assert.equal(normalized.accessory, DEFAULT_AVATAR.accessory)
})

test('deserializeAvatar tolerates corrupted json and empty values', () => {
  assert.deepEqual(deserializeAvatar(null), DEFAULT_AVATAR)
  assert.deepEqual(deserializeAvatar(''), DEFAULT_AVATAR)
  assert.deepEqual(deserializeAvatar('{not json'), DEFAULT_AVATAR)
  assert.deepEqual(deserializeAvatar(JSON.stringify({ skinTone: 'porcelain' })).skinTone, 'porcelain')
})

test('serialize/deserialize roundtrip keeps every parameter', () => {
  const custom = { ...DEFAULT_AVATAR, hairStyle: 'twin-tails' as const, faceShape: 0.25, accessory: 'glasses' as const }
  assert.deepEqual(deserializeAvatar(serializeAvatar(custom)), custom)
})

test('every preset is a valid, in-range config', () => {
  for (const preset of AVATAR_PRESETS) {
    const normalized = normalizeAvatar(preset.config)
    assert.deepEqual(normalized, preset.config, `preset ${preset.id} should already be normalized`)
    assert.ok(preset.config.faceShape >= 0 && preset.config.faceShape <= 1)
    assert.ok(preset.config.blush >= 0 && preset.config.blush <= 1)
  }
})

test('randomizeAvatar is deterministic with an injected random source and stays in range', () => {
  const sequence = [0.1, 0.9, 0.3, 0.5, 0.7]
  let index = 0
  const random = (): number => {
    const value = sequence[index % sequence.length] ?? 0
    index += 1
    return value
  }

  const first = randomizeAvatar(random)
  index = 0
  const second = randomizeAvatar(random)

  assert.deepEqual(first, second)
  assert.ok(first.faceShape >= 0.2 && first.faceShape <= 0.9)
  assert.ok(first.eyeSize >= 0.3 && first.eyeSize <= 0.9)
})

test('isSameAvatar compares by parameter instead of object identity', () => {
  assert.ok(isSameAvatar(DEFAULT_AVATAR, { ...DEFAULT_AVATAR }))
  assert.ok(!isSameAvatar(DEFAULT_AVATAR, { ...DEFAULT_AVATAR, blush: 0.9 }))
})

test('avatar store roundtrip is scoped per user', () => {
  const store = createAvatarStore(memoryStorage())
  const aliceAvatar = { ...DEFAULT_AVATAR, hairColor: 'rose' as const }

  store.set('alice', aliceAvatar)
  assert.deepEqual(store.get('alice'), aliceAvatar)
  assert.deepEqual(store.get('bob'), DEFAULT_AVATAR)

  store.clear('alice')
  assert.deepEqual(store.get('alice'), DEFAULT_AVATAR)
})

test('avatar store tolerates corrupted data and disabled storage', () => {
  const storage = memoryStorage()
  storage.setItem('shenyouchu.avatar.v1.alice', '{broken')
  assert.deepEqual(createAvatarStore(storage).get('alice'), DEFAULT_AVATAR)

  const disabled = createAvatarStore(throwingStorage())
  assert.deepEqual(disabled.get('alice'), DEFAULT_AVATAR)
  disabled.set('alice', DEFAULT_AVATAR)
  disabled.clear('alice')
})
