import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  availableModes,
  buildDraft,
  deriveStatus,
  dualCapabilities,
  hasAllInOneProvider,
  isProviderUsable,
  pickDefaultMode,
  usableCapabilities,
  validateDraft,
  toGenerateRequest,
  type VoiceFieldSchema,
  type VoiceProviderDescriptor,
  type VoiceProviderView
} from '../src/renderer/src/voice/workbench'

function textField(key: string, required = false): VoiceFieldSchema {
  return {
    key,
    label: key,
    type: 'TEXT',
    required,
    secret: false,
    placeholder: null,
    options: null,
    help: null,
    maxLength: null,
    defaultValue: null
  }
}

function makeView(
  id: string,
  capabilities: ('SPEAK' | 'SING' | 'HUM')[],
  options: { enabled?: boolean; configured?: boolean; status?: string } = {}
): VoiceProviderView {
  const descriptor: VoiceProviderDescriptor = {
    id,
    displayName: id,
    description: '',
    capabilities,
    credentialFields: [textField('apiKey', true)],
    generationFields: {
      SPEAK: [textField('voiceId', true)],
      SING: [textField('voiceId', true)],
      HUM: [textField('voiceId', true)]
    },
    languages: ['zh'],
    maxTextChars: 100,
    enabled: options.enabled ?? true
  }
  return {
    descriptor,
    credential: {
      providerId: id,
      configured: options.configured ?? true,
      status: options.status ?? 'active',
      lastVerifiedAt: null,
      values: {},
      configuredSecrets: []
    }
  }
}

test('isProviderUsable requires enabled + configured + active', () => {
  assert.equal(isProviderUsable(makeView('a', ['SPEAK'])), true)
  assert.equal(isProviderUsable(makeView('a', ['SPEAK'], { enabled: false })), false)
  assert.equal(isProviderUsable(makeView('a', ['SPEAK'], { configured: false })), false)
  assert.equal(isProviderUsable(makeView('a', ['SPEAK'], { status: 'invalid' })), false)
  assert.equal(isProviderUsable(undefined), false)
})

test('usableCapabilities returns [] for unusable providers', () => {
  assert.deepEqual(usableCapabilities(makeView('a', ['SPEAK', 'SING'])), ['SPEAK', 'SING'])
  assert.deepEqual(usableCapabilities(makeView('a', ['SPEAK'], { enabled: false })), [])
})

test('hasAllInOneProvider detects one model doing speak + sing', () => {
  assert.equal(hasAllInOneProvider([makeView('a', ['SPEAK']), makeView('b', ['SING'])]), false)
  assert.equal(hasAllInOneProvider([makeView('a', ['SPEAK', 'SING'])]), true)
})

test('availableModes and default mode follow provider availability', () => {
  assert.deepEqual(availableModes([]), [])
  assert.deepEqual(availableModes([makeView('a', ['SPEAK'])]), ['single', 'single_two'])
  assert.equal(pickDefaultMode([makeView('a', ['SPEAK'])]), 'single')
  const dual = availableModes([makeView('a', ['SPEAK']), makeView('b', ['SING'])])
  assert.ok(dual.includes('dual'))
  assert.equal(pickDefaultMode([makeView('a', ['SPEAK']), makeView('b', ['SING'])]), 'dual')
})

test('dualCapabilities prefers speak-first and sing-second', () => {
  const speak = makeView('cosy', ['SPEAK'])
  const sing = makeView('breeze', ['SING', 'HUM'])
  assert.deepEqual(dualCapabilities(speak, sing), ['SPEAK', 'SING'])
  assert.deepEqual(dualCapabilities(sing, speak), ['SING', 'SPEAK'])
})

test('buildDraft dual mode picks two distinct usable providers', () => {
  const views = [makeView('cosy', ['SPEAK']), makeView('breeze', ['SING'])]
  const draft = buildDraft('dual', views, null)
  assert.equal(draft.segments.length, 2)
  assert.notEqual(draft.segments[0].providerId, draft.segments[1].providerId)
  assert.equal(draft.segments[0].capability, 'SPEAK')
  assert.equal(draft.segments[1].capability, 'SING')
})

test('buildDraft single_two keeps both segments on the same provider', () => {
  const views = [makeView('all', ['SPEAK', 'SING'])]
  const draft = buildDraft('single_two', views, null)
  assert.equal(draft.segments.length, 2)
  assert.equal(draft.segments[0].providerId, 'all')
  assert.equal(draft.segments[1].providerId, 'all')
})

test('validateDraft reports empty text, length overflow and required params', () => {
  const views = [makeView('a', ['SPEAK'])]
  const draft = buildDraft('single', views, null)
  const issues = validateDraft(draft, views)
  assert.ok(issues.some((issue) => issue.field === 'text'))
  const filled = {
    ...draft,
    segments: draft.segments.map((segment) => ({
      ...segment,
      text: '你好',
      params: { ...segment.params, voiceId: 'v' }
    }))
  }
  assert.deepEqual(validateDraft(filled, views), [])
  const tooLong = {
    ...filled,
    segments: filled.segments.map((segment) => ({ ...segment, text: 'x'.repeat(101) }))
  }
  assert.ok(validateDraft(tooLong, views).some((issue) => issue.field === 'text'))
})

test('toGenerateRequest trims text and keeps mode/segments', () => {
  const views = [makeView('a', ['SPEAK'])]
  const draft = buildDraft('single', views, null)
  const filled = {
    ...draft,
    segments: draft.segments.map((segment) => ({
      ...segment,
      text: '  你好  ',
      params: { voiceId: 'v1' }
    }))
  }
  const request = toGenerateRequest(filled)
  assert.equal(request.mode, 'single')
  assert.equal(request.segments[0].text, '你好')
  assert.equal(request.segments[0].params.voiceId, 'v1')
})

test('deriveStatus covers loading/setup/ready/generating/done/partial/failed', () => {
  const views = [makeView('a', ['SPEAK'])]
  assert.equal(deriveStatus(true, [], null, false), 'loading')
  assert.equal(deriveStatus(false, [], null, false), 'setup_required')
  assert.equal(deriveStatus(false, views, null, false), 'ready')
  assert.equal(deriveStatus(false, views, null, true), 'generating')
  const batch = (status: string) => ({
    batchId: 'b',
    status,
    createdAt: '',
    expiresAt: '',
    segments: []
  })
  assert.equal(deriveStatus(false, views, batch('succeeded'), false), 'done')
  assert.equal(deriveStatus(false, views, batch('partial'), false), 'partial')
  assert.equal(deriveStatus(false, views, batch('failed'), false), 'failed')
  assert.equal(deriveStatus(false, views, batch('running'), false), 'generating')
})
