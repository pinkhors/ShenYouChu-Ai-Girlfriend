/**
 * 语音配置（TTS / ASR），纯逻辑 + 本地存储。
 *
 * 默认都走“系统语音 / 不启用识别”，只有用户填了 OpenAI 兼容服务地址才启用云端；
 * 密钥与出图一样明文存本机 localStorage，仅适合自用/小圈子。
 */

export type TtsProvider = 'browser' | 'openai'

export interface TtsConfig {
  readonly provider: TtsProvider
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
  readonly voice: string
}

export interface AsrConfig {
  readonly baseUrl: string
  readonly apiKey: string
  readonly model: string
}

export const DEFAULT_TTS_CONFIG: TtsConfig = {
  provider: 'browser',
  baseUrl: '',
  apiKey: '',
  model: 'tts-1',
  voice: 'nova'
}

export const DEFAULT_ASR_CONFIG: AsrConfig = {
  baseUrl: '',
  apiKey: '',
  model: 'whisper-1'
}

const TTS_KEY = 'shenyouchu.tts.v1'
const ASR_KEY = 'shenyouchu.asr.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

export function normalizeTtsConfig(value: unknown): TtsConfig {
  if (!isRecord(value)) {
    return DEFAULT_TTS_CONFIG
  }
  return {
    provider: value.provider === 'openai' ? 'openai' : 'browser',
    baseUrl: asString(value.baseUrl, ''),
    apiKey: asString(value.apiKey, ''),
    model: asString(value.model, DEFAULT_TTS_CONFIG.model) || DEFAULT_TTS_CONFIG.model,
    voice: asString(value.voice, DEFAULT_TTS_CONFIG.voice) || DEFAULT_TTS_CONFIG.voice
  }
}

export function normalizeAsrConfig(value: unknown): AsrConfig {
  if (!isRecord(value)) {
    return DEFAULT_ASR_CONFIG
  }
  return {
    baseUrl: asString(value.baseUrl, ''),
    apiKey: asString(value.apiKey, ''),
    model: asString(value.model, DEFAULT_ASR_CONFIG.model) || DEFAULT_ASR_CONFIG.model
  }
}

export function loadTtsConfig(): TtsConfig {
  try {
    const raw = window.localStorage.getItem(TTS_KEY)
    return raw === null ? DEFAULT_TTS_CONFIG : normalizeTtsConfig(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_TTS_CONFIG
  }
}

export function saveTtsConfig(config: TtsConfig): void {
  try {
    window.localStorage.setItem(TTS_KEY, JSON.stringify(config))
  } catch {
    /* 存储不可用时只在本次会话生效 */
  }
}

export function loadAsrConfig(): AsrConfig {
  try {
    const raw = window.localStorage.getItem(ASR_KEY)
    return raw === null ? DEFAULT_ASR_CONFIG : normalizeAsrConfig(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_ASR_CONFIG
  }
}

export function saveAsrConfig(config: AsrConfig): void {
  try {
    window.localStorage.setItem(ASR_KEY, JSON.stringify(config))
  } catch {
    /* 同上 */
  }
}

export function isCloudTts(config: TtsConfig): boolean {
  return config.provider === 'openai' && config.baseUrl !== ''
}

export function isAsrEnabled(config: AsrConfig): boolean {
  return config.baseUrl !== ''
}
