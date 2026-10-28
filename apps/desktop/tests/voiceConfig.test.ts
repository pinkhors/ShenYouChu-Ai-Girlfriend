import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ASR_CONFIG,
  DEFAULT_TTS_CONFIG,
  isAsrEnabled,
  isCloudTts,
  normalizeAsrConfig,
  normalizeTtsConfig
} from '../src/renderer/src/voice/voiceConfig'

test('normalizeTtsConfig falls back for invalid input and trims fields', () => {
  assert.deepEqual(normalizeTtsConfig(null), DEFAULT_TTS_CONFIG)
  const normalized = normalizeTtsConfig({
    provider: 'magic',
    baseUrl: '  https://api.example.com/v1  ',
    apiKey: '  sk-1  ',
    model: '',
    voice: '  '
  })
  assert.equal(normalized.provider, 'browser')
  assert.equal(normalized.baseUrl, 'https://api.example.com/v1')
  assert.equal(normalized.apiKey, 'sk-1')
  assert.equal(normalized.model, DEFAULT_TTS_CONFIG.model)
  assert.equal(normalized.voice, DEFAULT_TTS_CONFIG.voice)
})

test('normalizeAsrConfig trims and defaults', () => {
  assert.deepEqual(normalizeAsrConfig(undefined), DEFAULT_ASR_CONFIG)
  const normalized = normalizeAsrConfig({ baseUrl: ' http://127.0.0.1:8000/v1 ', model: ' whisper-1 ' })
  assert.equal(normalized.baseUrl, 'http://127.0.0.1:8000/v1')
  assert.equal(normalized.model, 'whisper-1')
})

test('cloud TTS requires openai provider and a base url', () => {
  assert.equal(isCloudTts(DEFAULT_TTS_CONFIG), false)
  assert.equal(isCloudTts({ ...DEFAULT_TTS_CONFIG, provider: 'openai' }), false)
  assert.equal(
    isCloudTts({ ...DEFAULT_TTS_CONFIG, provider: 'openai', baseUrl: 'https://api.example.com/v1' }),
    true
  )
  assert.equal(isCloudTts({ ...DEFAULT_TTS_CONFIG, baseUrl: 'https://api.example.com/v1' }), false)
})

test('ASR is enabled only when a base url is present', () => {
  assert.equal(isAsrEnabled(DEFAULT_ASR_CONFIG), false)
  assert.equal(isAsrEnabled({ ...DEFAULT_ASR_CONFIG, baseUrl: 'http://127.0.0.1:8000/v1' }), true)
})
