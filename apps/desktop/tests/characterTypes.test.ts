import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FAMILY,
  DEFAULT_PERSONALITY,
  EMPTY_DRAFT,
  MAX_CUSTOM_CHARACTERS,
  characterToDraft,
  draftToInput,
  familySummary,
  isSameDraft,
  normalizeCharacter,
  personalitySummary,
  validateCharacterDraft,
  type CharacterDraft
} from '../src/renderer/src/character/characterTypes'
import { buildPersonalityPreview } from '../src/renderer/src/character/personaPreview'

test('normalizeCharacter keeps custom personality/family and clamps avatar', () => {
  const view = normalizeCharacter({
    id: '100',
    code: 'custom-100',
    displayName: '林晚',
    isOfficial: false,
    isActive: true,
    status: 'active',
    age: 24,
    intro: '路痴但嘴硬。',
    tags: ['傲娇', '都市'],
    avatarConfig: { skinTone: 'porcelain', outfitStyle: 'knit' },
    personality: {
      archetype: 'tsundere',
      modifiers: ['soft-tsundere', 'attentive', 'not-real'],
      intensity: 'medium',
      initiative: 'medium',
      addressUser: '笨蛋',
      selfRef: '我',
      jealousy: 'low'
    },
    family: { growth: 'city', relations: 'polite', economy: 'ordinary', extraNote: '怕打雷' },
    version: 2,
    createdAt: '2026-10-28T09:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z'
  })

  assert.ok(view !== null)
  assert.equal(view.avatarConfig.skinTone, 'porcelain')
  assert.equal(view.avatarConfig.outfitStyle, 'knit')
  assert.deepEqual(view.personality?.modifiers, ['soft-tsundere', 'attentive'])
  assert.equal(view.family?.extraNote, '怕打雷')
  assert.equal(view.age, 24)
})

test('normalizeCharacter rejects records without id or displayName', () => {
  assert.equal(normalizeCharacter(null), null)
  assert.equal(normalizeCharacter({ id: '', displayName: 'x' }), null)
  assert.equal(normalizeCharacter({ id: '1' }), null)
})

test('official character maps to a copyable draft with gentle + soft-tsundere', () => {
  const official = normalizeCharacter({
    id: '1',
    code: 'shenyouchu',
    displayName: '沈幼楚',
    isOfficial: true,
    isActive: true,
    status: 'active',
    age: 23,
    intro: '独居插画师',
    tags: ['温柔', '小傲娇'],
    avatarConfig: {},
    personality: null,
    family: null,
    version: 0,
    createdAt: '',
    updatedAt: ''
  })
  assert.ok(official !== null)
  const draft = characterToDraft(official)
  assert.equal(draft.personality.archetype, 'gentle')
  assert.deepEqual(draft.personality.modifiers, ['soft-tsundere'])
  assert.deepEqual(draft.family, DEFAULT_FAMILY)
})

test('validateCharacterDraft enforces name, age, address and modifier rules', () => {
  assert.equal(validateCharacterDraft(EMPTY_DRAFT).ok, false)

  const valid = {
    ...EMPTY_DRAFT,
    displayName: '林晚',
    age: 24,
    intro: '刚搬来这座城市。',
    personality: { ...DEFAULT_PERSONALITY, addressUser: '笨蛋' }
  }
  assert.equal(validateCharacterDraft(valid).ok, true)

  assert.equal(
    validateCharacterDraft({ ...valid, displayName: '沈幼楚' }).errors.displayName !== undefined,
    true
  )
  assert.equal(validateCharacterDraft({ ...valid, age: 17 }).errors.age !== undefined, true)
  assert.equal(
    validateCharacterDraft({ ...valid, personality: { ...valid.personality, addressUser: '1234567' } })
      .errors.addressUser !== undefined,
    true
  )
  assert.equal(
    validateCharacterDraft({
      ...valid,
      personality: { ...valid.personality, modifiers: ['independent', 'clingy'] }
    }).errors.modifiers !== undefined,
    true
  )
})

test('draftToInput trims text and leaves avatar untouched', () => {
  const draft = {
    ...EMPTY_DRAFT,
    displayName: '  林晚  ',
    intro: '  路痴  ',
    family: { ...DEFAULT_FAMILY, extraNote: '  怕打雷  ' }
  }
  const input = draftToInput(draft)
  assert.equal(input.displayName, '林晚')
  assert.equal(input.intro, '路痴')
  assert.equal(input.family.extraNote, '怕打雷')
  assert.equal(input.avatarConfig, draft.avatarConfig)
})

test('isSameDraft ignores modifier order but catches changes', () => {
  const left: CharacterDraft = { ...EMPTY_DRAFT, displayName: '林晚' }
  const right: CharacterDraft = {
    ...left,
    personality: { ...left.personality, modifiers: ['attentive', 'soft-tsundere'] }
  }
  const leftWithModifiers: CharacterDraft = {
    ...left,
    personality: { ...left.personality, modifiers: ['soft-tsundere', 'attentive'] }
  }
  assert.equal(isSameDraft(leftWithModifiers, right), true)
  assert.equal(isSameDraft(left, right), false)
})

test('summaries are human-readable', () => {
  assert.ok(personalitySummary(DEFAULT_PERSONALITY).includes('温柔'))
  assert.ok(familySummary(DEFAULT_FAMILY).includes('都市'))
  assert.ok(MAX_CUSTOM_CHARACTERS >= 1)
})

test('personality preview substitutes the address in opening lines', () => {
  const preview = buildPersonalityPreview({
    ...DEFAULT_PERSONALITY,
    addressUser: '笨蛋'
  })
  assert.equal(preview.lines.length, 4)
  assert.ok(preview.lines[3]?.startsWith('笨蛋'))
  assert.ok(preview.tone.includes('称呼：笨蛋'))
})
