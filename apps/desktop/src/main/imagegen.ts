import { Buffer } from 'node:buffer'

/**
 * 主进程侧的出图适配：ComfyUI（本地）与 OpenAI 兼容 images/generations（云）。
 *
 * 放在主进程的原因：
 * - 绕过渲染进程的 CORS（本地服务通常不开跨域）；
 * - API Key 只经过一次 IPC，不落到页面代码/日志里；
 * - 可以统一做 URL 校验、超时与响应体积限制。
 */

export type ImageProvider = 'comfyui' | 'openai'

export interface ImageGenerationRequest {
  readonly provider: ImageProvider
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string
  readonly prompt: string
  readonly negativePrompt: string
  readonly width: number
  readonly height: number
  readonly steps: number
  readonly cfgScale: number
  readonly seed: number
}

const DEFAULT_TIMEOUT_MS = 45_000
const COMFY_TIMEOUT_MS = 5 * 60_000
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`出图参数缺少 ${field}`)
  }
  return value.trim()
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, parsed))
}

function parseBaseUrl(value: unknown): string {
  const raw = requireString(value, 'baseUrl')
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('出图服务地址格式不正确')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('出图服务地址只支持 http/https')
  }
  return parsed.toString().replace(/\/+$/, '')
}

/** IPC 入参是 unknown，这里统一收敛并夹取范围，避免把脏参数直接发给外部服务。 */
export function parseImageRequest(payload: unknown): ImageGenerationRequest {
  if (!isRecord(payload)) {
    throw new Error('出图参数格式不正确')
  }
  const provider = payload.provider
  if (provider !== 'comfyui' && provider !== 'openai') {
    throw new Error('不支持的出图服务')
  }
  const prompt = requireString(payload.prompt, 'prompt')
  const width = clampInt(payload.width, 832, 256, 2048)
  const height = clampInt(payload.height, 1216, 256, 2048)
  return {
    provider,
    baseUrl: parseBaseUrl(payload.baseUrl),
    model: typeof payload.model === 'string' ? payload.model.trim() : '',
    apiKey: typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '',
    prompt,
    negativePrompt:
      typeof payload.negativePrompt === 'string' ? payload.negativePrompt.trim() : '',
    width: width - (width % 8),
    height: height - (height % 8),
    steps: clampInt(payload.steps, 28, 1, 80),
    cfgScale: Math.min(20, Math.max(1, typeof payload.cfgScale === 'number' ? payload.cfgScale : 6.5)),
    seed: clampInt(payload.seed, 123456, 0, 2_147_483_647)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text === '') {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`出图服务返回了非 JSON 内容（HTTP ${response.status}）`)
  }
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) {
    return
  }
  const detail = (await response.text()).slice(0, 300)
  throw new Error(`${label} 失败（HTTP ${response.status}）：${detail}`)
}

async function toDataUrl(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? 'image/png'
  if (!contentType.startsWith('image/')) {
    throw new Error('出图服务返回的不是图片')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0) {
    throw new Error('出图服务返回了空图片')
  }
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('生成的图片过大（超过 12MB）')
  }
  return `data:${contentType.split(';')[0] ?? 'image/png'};base64,${buffer.toString('base64')}`
}

/* ---------------- ComfyUI ---------------- */

interface ComfyHistoryEntry {
  readonly outputs?: Record<
    string,
    { readonly images?: readonly { readonly filename?: string; readonly subfolder?: string; readonly type?: string }[] }
  >
  readonly status?: { readonly status_str?: string }
}

function comfyWorkflow(request: ImageGenerationRequest): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: request.model }
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: request.prompt, clip: ['1', 1] }
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: request.negativePrompt, clip: ['1', 1] }
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: request.width, height: request.height, batch_size: 1 }
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: request.seed,
        steps: request.steps,
        cfg: request.cfgScale,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0]
      }
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] }
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'shenyouchu', images: ['6', 0] }
    }
  }
}

async function generateWithComfyUi(request: ImageGenerationRequest): Promise<string> {
  if (request.model === '') {
    throw new Error('ComfyUI 需要填写 checkpoint 名称（例如 sd_xl_base_1.0.safetensors）')
  }

  const response = await fetch(`${request.baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: comfyWorkflow(request), client_id: `shenyouchu-${Date.now()}` }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  })
  await assertOk(response, 'ComfyUI 提交任务')
  const queued = await readJson(response)
  const promptId = isRecord(queued) && typeof queued.prompt_id === 'string' ? queued.prompt_id : ''
  if (promptId === '') {
    throw new Error('ComfyUI 没有返回 prompt_id')
  }

  const deadline = Date.now() + COMFY_TIMEOUT_MS
  while (Date.now() < deadline) {
    await delay(900)
    const historyResponse = await fetch(`${request.baseUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    })
    if (!historyResponse.ok) {
      continue
    }
    const history = await readJson(historyResponse)
    if (!isRecord(history)) {
      continue
    }
    const entry = history[promptId]
    if (!isRecord(entry)) {
      continue
    }
    const typed = entry as ComfyHistoryEntry
    if (typed.status?.status_str === 'error') {
      throw new Error('ComfyUI 执行失败，请检查 checkpoint 与控制台')
    }
    const images = typed.outputs?.['7']?.images
    const image = images?.[0]
    if (image?.filename === undefined) {
      continue
    }
    const query = new URLSearchParams({ filename: image.filename, type: image.type ?? 'output' })
    if (image.subfolder !== undefined && image.subfolder !== '') {
      query.set('subfolder', image.subfolder)
    }
    const imageResponse = await fetch(`${request.baseUrl}/view?${query.toString()}`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    })
    await assertOk(imageResponse, 'ComfyUI 取图')
    return toDataUrl(imageResponse)
  }
  throw new Error('ComfyUI 生成超时（5 分钟），请检查队列')
}

/* ---------------- OpenAI 兼容 ---------------- */

function imagesEndpoint(baseUrl: string): string {
  if (baseUrl.endsWith('/images/generations')) {
    return baseUrl
  }
  return `${baseUrl}/images/generations`
}

async function generateWithOpenAi(request: ImageGenerationRequest): Promise<string> {
  if (request.model === '') {
    throw new Error('云 API 需要填写模型名（例如 gpt-image-1 / flux-schnell）')
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (request.apiKey !== '') {
    headers.Authorization = `Bearer ${request.apiKey}`
  }
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    n: 1,
    size: `${request.width}x${request.height}`
  }
  if (request.negativePrompt !== '') {
    body.negative_prompt = request.negativePrompt
  }

  const response = await fetch(imagesEndpoint(request.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  })
  await assertOk(response, '云 API 出图')
  const payload = await readJson(response)
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error('云 API 没有返回图片')
  }
  const first: unknown = payload.data[0]
  if (!isRecord(first)) {
    throw new Error('云 API 返回结构不正确')
  }
  if (typeof first.b64_json === 'string' && first.b64_json !== '') {
    return `data:image/png;base64,${first.b64_json}`
  }
  if (typeof first.url === 'string' && first.url !== '') {
    const imageResponse = await fetch(first.url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) })
    await assertOk(imageResponse, '下载生成的图片')
    return toDataUrl(imageResponse)
  }
  throw new Error('云 API 返回里没有 b64_json 或 url')
}

export async function generateImage(request: ImageGenerationRequest): Promise<string> {
  if (request.provider === 'comfyui') {
    return generateWithComfyUi(request)
  }
  return generateWithOpenAi(request)
}
