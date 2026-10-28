import { Buffer } from 'node:buffer'

/**
 * 主进程侧的语音合成适配（OpenAI 兼容 /audio/speech）。
 *
 * 与出图一致：网络请求和 Key 都在主进程完成，渲染进程只拿 data URL。
 * 默认不启用，设置页里填了服务地址才会走这里；否则回退系统语音。
 */

export interface TtsRequest {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly voice: string
  readonly text: string
}

const MAX_TEXT_LENGTH = 2000
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`语音参数缺少 ${field}`)
  }
  return value.trim()
}

function parseBaseUrl(value: unknown): string {
  const raw = requireString(value, 'baseUrl')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('语音服务地址格式不正确')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('语音服务地址只支持 http/https')
  }
  return parsed.toString().replace(/\/+$/, '')
}

export function parseTtsRequest(payload: unknown): TtsRequest {
  if (!isRecord(payload)) {
    throw new Error('语音参数格式不正确')
  }
  const text = requireString(payload.text, 'text').slice(0, MAX_TEXT_LENGTH)
  return {
    baseUrl: parseBaseUrl(payload.baseUrl),
    apiKey: typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '',
    model: typeof payload.model === 'string' && payload.model.trim() !== '' ? payload.model.trim() : 'tts-1',
    voice: typeof payload.voice === 'string' && payload.voice.trim() !== '' ? payload.voice.trim() : 'alloy',
    text
  }
}

function endpoint(baseUrl: string): string {
  return baseUrl.endsWith('/audio/speech') ? baseUrl : `${baseUrl}/audio/speech`
}

export async function synthesize(request: TtsRequest): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (request.apiKey !== '') {
    headers.Authorization = `Bearer ${request.apiKey}`
  }

  const response = await fetch(endpoint(request.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model,
      voice: request.voice,
      input: request.text,
      response_format: 'mp3'
    }),
    signal: AbortSignal.timeout(60_000)
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`语音合成失败（HTTP ${response.status}）：${detail}`)
  }

  const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
  if (!contentType.startsWith('audio/')) {
    throw new Error('语音服务返回的不是音频')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0) {
    throw new Error('语音服务返回了空音频')
  }
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('语音音频过大（超过 15MB）')
  }
  return `data:${contentType.split(';')[0] ?? 'audio/mpeg'};base64,${buffer.toString('base64')}`
}
