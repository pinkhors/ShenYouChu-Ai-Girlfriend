import { Buffer } from 'node:buffer'

/**
 * 主进程侧的语音识别适配（OpenAI 兼容 /audio/transcriptions）。
 *
 * 通话页录音后把 webm/opus 的 Base64 交给主进程，主进程用 multipart 上传，
 * 返回识别文本；Key 不进入渲染进程的网络层。
 */

export interface AsrRequest {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly audioBase64: string
  readonly mimeType: string
}

const MAX_AUDIO_BYTES = 20 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`语音识别参数缺少 ${field}`)
  }
  return value.trim()
}

function parseBaseUrl(value: unknown): string {
  const raw = requireString(value, 'baseUrl')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('语音识别服务地址格式不正确')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('语音识别服务地址只支持 http/https')
  }
  return parsed.toString().replace(/\/+$/, '')
}

export function parseAsrRequest(payload: unknown): AsrRequest {
  if (!isRecord(payload)) {
    throw new Error('语音识别参数格式不正确')
  }
  const audioBase64 = requireString(payload.audioBase64, 'audioBase64')
  let bytes: Buffer
  try {
    bytes = Buffer.from(audioBase64, 'base64')
  } catch {
    throw new Error('音频编码不正确')
  }
  if (bytes.byteLength === 0) {
    throw new Error('录音为空')
  }
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new Error('录音过大（超过 20MB）')
  }
  const mimeType =
    typeof payload.mimeType === 'string' && payload.mimeType.startsWith('audio/')
      ? payload.mimeType
      : 'audio/webm'
  return {
    baseUrl: parseBaseUrl(payload.baseUrl),
    apiKey: typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '',
    model:
      typeof payload.model === 'string' && payload.model.trim() !== ''
        ? payload.model.trim()
        : 'whisper-1',
    audioBase64,
    mimeType
  }
}

function endpoint(baseUrl: string): string {
  return baseUrl.endsWith('/audio/transcriptions')
    ? baseUrl
    : `${baseUrl}/audio/transcriptions`
}

function extensionOf(mimeType: string): string {
  if (mimeType.includes('wav')) {
    return 'wav'
  }
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    return 'm4a'
  }
  if (mimeType.includes('ogg')) {
    return 'ogg'
  }
  return 'webm'
}

export async function transcribe(request: AsrRequest): Promise<string> {
  const bytes = Buffer.from(request.audioBase64, 'base64')
  const file = new Blob([new Uint8Array(bytes)], { type: request.mimeType })
  const form = new FormData()
  form.append('file', file, `speech.${extensionOf(request.mimeType)}`)
  form.append('model', request.model)

  const headers: Record<string, string> = {}
  if (request.apiKey !== '') {
    headers.Authorization = `Bearer ${request.apiKey}`
  }

  const response = await fetch(endpoint(request.baseUrl), {
    method: 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(120_000)
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    throw new Error(`语音识别失败（HTTP ${response.status}）：${detail}`)
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('语音识别服务返回了非 JSON 内容')
  }
  if (!isRecord(parsed) || typeof parsed.text !== 'string' || parsed.text.trim() === '') {
    throw new Error('语音识别没有返回文本')
  }
  return parsed.text.trim()
}
