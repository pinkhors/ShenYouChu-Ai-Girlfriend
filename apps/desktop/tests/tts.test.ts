import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { parseTtsRequest, synthesize } from '../src/main/tts'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('无法获取测试端口'))
        return
      }
      resolve(address.port)
    })
  })
}

test('parseTtsRequest defaults model/voice and truncates text', () => {
  const request = parseTtsRequest({
    baseUrl: 'https://api.example.com/v1/',
    text: 'x'.repeat(3000)
  })
  assert.equal(request.baseUrl, 'https://api.example.com/v1')
  assert.equal(request.model, 'tts-1')
  assert.equal(request.voice, 'alloy')
  assert.equal(request.text.length, 2000)
})

test('parseTtsRequest rejects missing text and non-http urls', () => {
  assert.throws(() => parseTtsRequest({ baseUrl: 'http://localhost', text: '  ' }))
  assert.throws(() => parseTtsRequest({ baseUrl: 'file:///tmp/a', text: '你好' }))
})

test('synthesize posts to /audio/speech and returns a data url', async () => {
  let receivedPath = ''
  const server = createServer((request, response) => {
    receivedPath = request.url ?? ''
    response.writeHead(200, { 'Content-Type': 'audio/mpeg' })
    response.end(Buffer.from('mp3-bytes'))
  })
  const port = await listen(server)
  try {
    const request = parseTtsRequest({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      text: '你好呀'
    })
    const dataUrl = await synthesize(request)
    assert.equal(receivedPath, '/v1/audio/speech')
    assert.ok(dataUrl.startsWith('data:audio/mpeg;base64,'))
    assert.equal(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString(), 'mp3-bytes')
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
})
