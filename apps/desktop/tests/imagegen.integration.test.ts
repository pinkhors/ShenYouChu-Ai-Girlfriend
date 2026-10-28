import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { generateImage, parseImageRequest } from '../src/main/imagegen'

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

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

test('openai provider decodes b64_json into a data url', async () => {
  const payload = Buffer.from('fake-image').toString('base64')
  const server = createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/v1/images/generations') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [{ b64_json: payload }] }))
      return
    }
    response.writeHead(404)
    response.end()
  })

  const port = await listen(server)
  try {
    const request = parseImageRequest({
      provider: 'openai',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'test-model',
      prompt: '一个女孩'
    })
    const dataUrl = await generateImage(request)
    assert.ok(dataUrl.startsWith('data:image/png;base64,'))
    assert.equal(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString(), 'fake-image')
  } finally {
    await close(server)
  }
})

test('comfyui provider submits, polls history and downloads the image', async () => {
  const server = createServer((request, response) => {
    const url = request.url ?? ''
    if (request.method === 'POST' && url === '/prompt') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ prompt_id: 'p1' }))
      return
    }
    if (url.startsWith('/history/p1')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          p1: { outputs: { '7': { images: [{ filename: 'a.png', type: 'output' }] } } }
        })
      )
      return
    }
    if (url.startsWith('/view')) {
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end(Buffer.from('png-bytes'))
      return
    }
    response.writeHead(404)
    response.end()
  })

  const port = await listen(server)
  try {
    const request = parseImageRequest({
      provider: 'comfyui',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'sd_xl_base_1.0.safetensors',
      prompt: '一个女孩'
    })
    const dataUrl = await generateImage(request)
    assert.ok(dataUrl.startsWith('data:image/png;base64,'))
    assert.equal(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString(), 'png-bytes')
  } finally {
    await close(server)
  }
})
