import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CHARACTER_PROMPT,
  DEFAULT_GENERATION_CONFIG,
  buildExpressionPack,
  buildPrompt,
  normalizeGenerationConfig
} from '../src/renderer/src/portrait/generationConfig'

test('normalizeGenerationConfig falls back for invalid input', () => {
  assert.deepEqual(normalizeGenerationConfig(null), DEFAULT_GENERATION_CONFIG)
  assert.deepEqual(normalizeGenerationConfig('nope'), DEFAULT_GENERATION_CONFIG)
})

test('normalizeGenerationConfig clamps numbers and validates provider', () => {
  const normalized = normalizeGenerationConfig({
    provider: 'magic',
    width: 5000,
    height: 10,
    steps: 999,
    cfgScale: -5,
    seed: -1
  })
  assert.equal(normalized.provider, 'comfyui')
  assert.equal(normalized.width, 2048)
  assert.equal(normalized.height, 256)
  assert.equal(normalized.steps, 80)
  assert.equal(normalized.cfgScale, 1)
  assert.equal(normalized.seed, 0)
})

test('normalizeGenerationConfig accepts openai and string fields', () => {
  const normalized = normalizeGenerationConfig({
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
    model: 'flux-schnell',
    apiKey: 'sk-test'
  })
  assert.equal(normalized.provider, 'openai')
  assert.equal(normalized.baseUrl, 'https://api.example.com/v1')
  assert.equal(normalized.model, 'flux-schnell')
  assert.equal(normalized.apiKey, 'sk-test')
})

test('buildPrompt keeps the character description and appends the expression', () => {
  const prompt = buildPrompt('一个温柔的女孩', 'happy')
  assert.ok(prompt.startsWith('一个温柔的女孩'))
  assert.ok(prompt.includes('微笑'))
})

test('buildPrompt falls back to the default character prompt', () => {
  assert.ok(buildPrompt('   ', 'neutral').startsWith(DEFAULT_CHARACTER_PROMPT))
})

test('buildExpressionPack covers every slot with neutral first', () => {
  const pack = buildExpressionPack('一个温柔的女孩')
  assert.equal(pack.length, 7)
  assert.equal(pack[0]?.expression, 'neutral')
  assert.equal(new Set(pack.map((item) => item.expression)).size, 7)
  assert.ok(pack.every((item) => item.prompt.includes('一个温柔的女孩')))
})
