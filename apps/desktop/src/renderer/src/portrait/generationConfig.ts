import {
  PORTRAIT_SLOTS,
  type PortraitExpression
} from './expression'

/**
 * AI 出图配置与提示词模板（纯逻辑，可在 Node 测试）。
 *
 * 配置只存本机（localStorage），不随账号同步；密钥是明文本地存储，
 * 只适合自用/小圈子，后续可迁到主进程 safeStorage。
 */

export type ImageProvider = 'comfyui' | 'openai'

export interface ImageGenerationConfig {
  readonly provider: ImageProvider
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string
  readonly negativePrompt: string
  readonly width: number
  readonly height: number
  readonly steps: number
  readonly cfgScale: number
  readonly seed: number
}

export const DEFAULT_CHARACTER_PROMPT =
  '半写实风格，25 岁亚洲女性，温柔小傲娇，长直黑发，琥珀色眼睛，米白色针织衫，正面半身像，柔和室内光，浅灰纯色背景，细腻皮肤质感，同一角色，同一构图'

export const DEFAULT_NEGATIVE_PROMPT =
  '低质量，模糊，畸形手指，多余肢体，水印，文字，多人，强对比阴影，过度锐化'

export const DEFAULT_GENERATION_CONFIG: ImageGenerationConfig = {
  provider: 'comfyui',
  baseUrl: 'http://127.0.0.1:8188',
  model: 'sd_xl_base_1.0.safetensors',
  apiKey: '',
  negativePrompt: DEFAULT_NEGATIVE_PROMPT,
  width: 832,
  height: 1216,
  steps: 28,
  cfgScale: 6.5,
  seed: 20261028
}

export const EXPRESSION_PROMPTS: Record<PortraitExpression, string> = {
  neutral: '平静自然，微微看着镜头',
  happy: '微笑，眼睛弯起',
  sad: '低落，眼神下垂',
  angry: '微微生气，轻皱眉',
  surprised: '惊讶，睁大眼睛',
  closed: '闭眼，安静',
  talking: '张嘴说话'
}

const STORAGE_KEY = 'shenyouchu.imagegen.v1'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/** 把本地/手改配置收敛到合法范围；坏数据回退默认值。 */
export function normalizeGenerationConfig(value: unknown): ImageGenerationConfig {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_GENERATION_CONFIG
  }
  const record = value as Record<string, unknown>
  return {
    provider: record.provider === 'openai' ? 'openai' : 'comfyui',
    baseUrl: asString(record.baseUrl, DEFAULT_GENERATION_CONFIG.baseUrl),
    model: asString(record.model, DEFAULT_GENERATION_CONFIG.model),
    apiKey: asString(record.apiKey, ''),
    negativePrompt: asString(record.negativePrompt, DEFAULT_NEGATIVE_PROMPT),
    width: clamp(Math.round(asNumber(record.width, 832)), 256, 2048),
    height: clamp(Math.round(asNumber(record.height, 1216)), 256, 2048),
    steps: clamp(Math.round(asNumber(record.steps, 28)), 1, 80),
    cfgScale: clamp(asNumber(record.cfgScale, 6.5), 1, 20),
    seed: Math.round(clamp(asNumber(record.seed, 20261028), 0, 2_147_483_647))
  }
}

export function loadGenerationConfig(): ImageGenerationConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? DEFAULT_GENERATION_CONFIG : normalizeGenerationConfig(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_GENERATION_CONFIG
  }
}

export function saveGenerationConfig(config: ImageGenerationConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    /* 本地存储不可用时只在本次会话生效 */
  }
}

/** 单张提示词：角色描述保持不变，只追加表情。 */
export function buildPrompt(basePrompt: string, expression: PortraitExpression): string {
  const base = basePrompt.trim() === '' ? DEFAULT_CHARACTER_PROMPT : basePrompt.trim()
  return `${base}，表情：${EXPRESSION_PROMPTS[expression]}`
}

/** 一次生成整组表情：顺序固定，基础图先出。 */
export function buildExpressionPack(basePrompt: string): { expression: PortraitExpression; prompt: string }[] {
  return PORTRAIT_SLOTS.map((slot) => ({
    expression: slot.id,
    prompt: buildPrompt(basePrompt, slot.id)
  }))
}
