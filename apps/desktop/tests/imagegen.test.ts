import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseImageRequest } from '../src/main/imagegen'

test('parseImageRequest normalizes addresses and clamps values', () => {
  const request = parseImageRequest({
    provider: 'comfyui',
    baseUrl: 'http://127.0.0.1:8188/',
    model: 'sd_xl_base_1.0.safetensors',
    prompt: '一个女孩',
    width: 5000,
    height: 100,
    steps: 999,
    cfgScale: 99,
    seed: -5
  })

  assert.equal(request.baseUrl, 'http://127.0.0.1:8188')
  assert.equal(request.width, 2048)
  assert.equal(request.height, 256)
  assert.equal(request.steps, 80)
  assert.equal(request.cfgScale, 20)
  assert.equal(request.seed, 0)
})

test('parseImageRequest keeps openai provider and optional key', () => {
  const request = parseImageRequest({
    provider: 'openai',
    baseUrl: 'https://api.example.com/v1',
    model: 'flux-schnell',
    apiKey: ' sk-test ',
    prompt: '一个女孩'
  })

  assert.equal(request.provider, 'openai')
  assert.equal(request.apiKey, 'sk-test')
  assert.equal(request.width, 832)
  assert.equal(request.height, 1216)
})

test('parseImageRequest rejects unknown providers, missing prompt and non-http urls', () => {
  assert.throws(() =>
    parseImageRequest({ provider: 'magic', baseUrl: 'http://localhost', prompt: 'x' })
  )
  assert.throws(() =>
    parseImageRequest({ provider: 'comfyui', baseUrl: 'http://localhost', prompt: '   ' })
  )
  assert.throws(() =>
    parseImageRequest({ provider: 'comfyui', baseUrl: 'file:///tmp/model', prompt: 'x' })
  )
})
