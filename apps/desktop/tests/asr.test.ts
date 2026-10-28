import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { parseAsrRequest, transcribe } from '../src/main/asr'

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

const AUDIO_BASE64 = Buffer.from('fake-audio').toString('base64')

test('parseAsrRequest defaults model and mime type', () => {
  const request = parseAsrRequest({
    baseUrl: 'https://api.example.com/v1/',
    audioBase64: AUDIO_BASE64
  })
  assert.equal(request.baseUrl, 'https://api.example.com/v1')
  assert.equal(request.model, 'whisper-1')
  assert.equal(request.mimeType, 'audio/webm')
  assert.equal(request.audioBase64, AUDIO_BASE64)
})

test('parseAsrRequest rejects empty audio and non-http urls', () => {
  assert.throws(() => parseAsrRequest({ baseUrl: 'http://localhost', audioBase64: '' }))
  assert.throws(() =>
    parseAsrRequest({ baseUrl: 'file:///tmp/a', audioBase64: AUDIO_BASE64 })
  )
})

test('transcribe posts multipart to /audio/transcriptions and returns text', async () => {
  let receivedPath = ''
  let receivedMethod = ''
  let receivedContentType = ''
  const server = createServer((request, response) => {
    receivedPath = request.url ?? ''
    receivedMethod = request.method ?? ''
    receivedContentType = String(request.headers['content-type'] ?? '')
    request.resume()
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ text: '你好呀' }))
    })
  })
  const port = await listen(server)
  try {
    const request = parseAsrRequest({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      audioBase64: AUDIO_BASE64
    })
    const text = await transcribe(request)
    assert.equal(text, '你好呀')
    assert.equal(receivedPath, '/v1/audio/transcriptions')
    assert.equal(receivedMethod, 'POST')
    assert.ok(receivedContentType.startsWith('multipart/form-data'))
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
})
