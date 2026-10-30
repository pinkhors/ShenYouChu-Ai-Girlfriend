import { getToken } from '../auth/tokenStore'
import { TurnStreamParser, type TurnStreamHandlers } from './turnStream'

export type { TurnStreamHandlers } from './turnStream'
export { textToBase64, base64ToText } from './encoding'

/**
 * 后端 REST 客户端（前缀 /api/v1，见 docs/contracts/data-and-interface-contracts.md 第 3 节）。
 *
 * 职责边界：只负责地址解析、请求封装与类型定义，不持有界面状态；
 * 401 的界面处置由应用层通过 setOnUnauthorized 注入。
 */

/** 本地开发默认地址，与 services/core 的 SERVER_PORT 默认值一致。 */
const DEFAULT_API_BASE = 'http://127.0.0.1:48080'

/** 接口前缀集中在此，避免散落到各调用点。 */
const API_PREFIX = '/api/v1'

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.replace(/\/+$/, '') : value
}

/** 解析顺序：Vite 环境变量 → 预加载注入的进程环境变量 → 本地默认值。 */
function resolveApiBase(): string {
  const fromViteEnv: unknown = import.meta.env.VITE_API_BASE_URL
  if (typeof fromViteEnv === 'string' && fromViteEnv.trim() !== '') {
    return trimTrailingSlash(fromViteEnv.trim())
  }

  const fromBridge: unknown = window.desktop?.apiBaseUrl
  if (typeof fromBridge === 'string' && fromBridge.trim() !== '') {
    return trimTrailingSlash(fromBridge.trim())
  }

  /* 仅开发默认值；生产部署应通过环境变量显式指定 */
  return DEFAULT_API_BASE
}

/** 当前生效的后端地址；顶栏展示，便于排障。 */
export const API_BASE = resolveApiBase()

export interface UserView {
  readonly id: string
  readonly username: string
  readonly role: string
}

export interface AuthResponse {
  readonly token: string
  /** ISO-8601 时间字符串（后端 Instant 序列化） */
  readonly expiresAt: string
  readonly user: UserView
}

export interface Conversation {
  readonly id: string
  readonly characterId: string
  readonly title: string | null
  readonly lastMessageAt: string | null
  readonly createdAt: string
  readonly status: string
}

export interface CreateConversationInput {
  readonly title?: string
  readonly characterId?: string
}

/** 后端统一错误响应 { code, message, requestId }（GlobalExceptionHandler）。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined

  constructor(status: number, code: string, message: string, requestId: string | undefined) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

type UnauthorizedHandler = () => void

let onUnauthorized: UnauthorizedHandler | null = null

/** 注册 / 注销 401 回调；传 null 注销（组件卸载时调用）。 */
export function setOnUnauthorized(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 需要序列化为 JSON 的请求体；无请求体时省略。 */
  readonly body?: unknown
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * 从错误响应体提取 { code, message, requestId }；响应体非 JSON 时退回 HTTP 状态文案。
 * 入参用原始文本而非 Response 对象，避免在渲染层耦合具体的 fetch 实现类型。
 */
function toApiError(status: number, responseText: string): ApiError {
  let code = `HTTP_${status}`
  let message = `请求失败（HTTP ${status}）`
  let requestId: string | undefined

  if (responseText !== '') {
    try {
      const payload: unknown = JSON.parse(responseText)
      if (isRecord(payload)) {
        code = readString(payload, 'code') ?? code
        message = readString(payload, 'message') ?? message
        requestId = readString(payload, 'requestId')
      }
    } catch {
      /* 解析失败保留默认文案，错误细节不影响主流程 */
    }
  }

  return new ApiError(status, code, message, requestId)
}

/**
 * 通用请求封装。
 * - 自动附带 Authorization: Bearer <token>（存在令牌时）；
 * - 401 触发 onUnauthorized 回调后抛出 ApiError；
 * - 无响应体（204）返回 undefined，调用方以 request<void> 使用；
 * - 不重试：幂等与重试策略由调用方决定，避免会话类接口被隐式重复执行。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  const token = getToken()
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  })

  if (!response.ok) {
    /* 401 先通知应用层清理登录态，再抛出统一错误 */
    if (response.status === 401) {
      onUnauthorized?.()
    }
    throw toApiError(response.status, await response.text())
  }

  const text = await response.text()
  if (text === '') {
    return undefined as T
  }

  /* JSON 解析边界：结构由后端契约保证，这里只做断言不做运行时校验 */
  return JSON.parse(text) as T
}

export function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', { method: 'POST', body: { username, password } })
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', { method: 'POST', body: { username, password } })
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' })
}

export function me(): Promise<UserView> {
  return request<UserView>('/auth/me')
}

/**
 * 当前用户的会话列表（cursor 分页，最新在前）。
 * 契约为 `{ items, nextCursor }`，与消息列表一致。
 */
export interface ConversationPage {
  readonly items: Conversation[]
  readonly nextCursor: string | null
}

/** 会话分页：默认第一页 20 条（最新在前）。 */
export function listConversations(limit = 20, cursor?: string, characterId?: string): Promise<ConversationPage> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (cursor !== undefined && cursor !== '') {
    query.set('cursor', cursor)
  }
  if (characterId !== undefined && characterId !== '') {
    query.set('characterId', characterId)
  }
  return request<ConversationPage>(`/conversations?${query.toString()}`)
}

/**
 * 建会话：每个角色最多一个，由后端 ensure。
 * 已存在返回 200 + 既有会话，新建返回 201；前端不再主动调用。
 */
export function createConversation(input: CreateConversationInput = {}): Promise<Conversation> {
  return request<Conversation>('/conversations', { method: 'POST', body: input })
}

/** 保留导出仅为兼容旧调用点；会话不再允许删除（后端返回 409）。 */
export function deleteConversation(id: string): Promise<void> {
  return request<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 清空会话内的消息与记忆，保留会话本身（204）。 */
export function clearConversation(id: string): Promise<void> {
  return request<void>(`/conversations/${encodeURIComponent(id)}/clear`, { method: 'POST' })
}

/** PUT /preferences/active-character 响应：当前角色与其唯一会话。 */
export interface ActiveCharacterResult {
  readonly activeCharacterId: string | null
  readonly conversationId: string | null
}

/** 切换当前角色；后端同时 ensure 该角色的唯一会话并回传其 id。 */
export function activateCharacter(id: string): Promise<ActiveCharacterResult> {
  return request<ActiveCharacterResult>('/preferences/active-character', {
    method: 'PUT',
    body: { characterId: id }
  })
}

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly createdAt: string
}

export interface TurnResponse {
  readonly turnId: string
  readonly userMessage: Message
  readonly assistantMessage: Message
}

export interface MessagePage {
  readonly items: Message[]
  readonly nextCursor: string | null
}

/** 消息分页：默认第一页 20 条；后续可用 nextCursor 加载更多。 */
export function listMessages(conversationId: string, limit = 20, cursor?: string): Promise<MessagePage> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (cursor !== undefined && cursor !== '') {
    query.set('cursor', cursor)
  }
  return request<MessagePage>(
    `/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`
  )
}

export function sendTurn(conversationId: string, message: string): Promise<TurnResponse> {
  return request<TurnResponse>(`/conversations/${encodeURIComponent(conversationId)}/turns`, {
    method: 'POST',
    body: { message }
  })
}

/** ===== 主动消息（PRD 09 §6.4） ===== */

export type ProactiveTrigger = 'share' | 'follow_up' | 'reminder'

/** 可开口性查询结果；阻塞时 reason 为稳定错误码（如 QUIET_HOURS）。 */
export interface ProactiveEligibility {
  readonly allowed: boolean
  readonly reason: string | null
  readonly scene: ProactiveTrigger | null
  readonly dailyLimit: number
  readonly usedToday: number
  readonly nextEligibleAt: string | null
}

/** 主动消息落库后的视图（role=assistant，source=proactive）。 */
export interface ProactiveMessage {
  readonly id: string
  readonly conversationId: string
  readonly role: 'assistant'
  readonly content: string
  readonly source: 'proactive'
  readonly trigger: ProactiveTrigger
  readonly temperature: number
  /** 官方角色沿用用户级配置时为 user。 */
  readonly temperatureSource: 'auto' | 'manual' | 'user'
  readonly createdAt: string
}

/** 查询当前会话是否允许她主动开口；按钮点击前可用于提前提示原因。 */
export function getProactiveEligibility(conversationId: string): Promise<ProactiveEligibility> {
  return request<ProactiveEligibility>(
    `/conversations/${encodeURIComponent(conversationId)}/proactive/eligibility`
  )
}

/**
 * 让她先开口。不传 trigger 时由后端按温度与场景策略选择；
 * 阻塞返回 409 + 稳定 code，调用方按 PRD 09 §11 映射文案。
 */
export function triggerProactive(
  conversationId: string,
  trigger?: ProactiveTrigger
): Promise<ProactiveMessage> {
  return request<ProactiveMessage>(
    `/conversations/${encodeURIComponent(conversationId)}/proactive`,
    {
      method: 'POST',
      body: trigger === undefined ? {} : { trigger }
    }
  )
}

/**
 * SSE 流式轮次：解析后端 turn.started / assistant.text.delta / turn.completed。
 * 使用 fetch + ReadableStream 而非 EventSource，因为需要 POST 请求体与 Authorization 头。
 */
export async function streamTurn(
  conversationId: string,
  message: string,
  handlers: TurnStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json'
  }
  const token = getToken()
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(
    `${API_BASE}${API_PREFIX}/conversations/${encodeURIComponent(conversationId)}/turns/stream`,
    { method: 'POST', headers, body: JSON.stringify({ message }), signal }
  )

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized?.()
    }
    throw toApiError(response.status, await response.text())
  }
  if (response.body === null) {
    throw new ApiError(0, 'STREAM_UNAVAILABLE', '当前环境不支持流式响应', undefined)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new TurnStreamParser(handlers)

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    parser.push(decoder.decode(value, { stream: true }))
  }
}

export interface MemoryView {
  readonly id: string
  readonly memoryType: string
  readonly content: string
  readonly status: string
  readonly createdAt: string
  readonly conversationId: string | null
  readonly characterId: string | null
}

/** ===== 记忆星图（V6，见 docs/08-memory-graph.md） ===== */

export interface MemoryGraphConstellation {
  readonly id: string
  readonly label: string
  readonly kind: string
  readonly count: number
  readonly angle: number
  readonly radius: number
}

export interface MemoryGraphNode {
  readonly id: string
  readonly chunkId: string
  readonly label: string
  readonly category: string
  readonly angle: number
  readonly radius: number
  readonly importance: number
  readonly ghost: boolean
  readonly createdAt: string
  readonly conversationId: string | null
}

export type MemoryGraphEdgeKind = 'ownership' | 'semantic' | 'temporal'

export interface MemoryGraphEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly kind: MemoryGraphEdgeKind
  readonly weight: number
}

export interface MemoryGraphStats {
  readonly nodes: number
  readonly ghosts: number
  readonly edges: number
}

export interface MemoryGraphView {
  readonly version: number
  readonly characterId: string
  readonly characterName: string
  readonly generatedAt: string
  readonly mode: 'incremental' | 'nightly'
  readonly layoutSeed: string
  readonly constellations: readonly MemoryGraphConstellation[]
  readonly nodes: readonly MemoryGraphNode[]
  readonly edges: readonly MemoryGraphEdge[]
  readonly stats: MemoryGraphStats
}

export interface MemoryChunkDetail {
  readonly id: string
  readonly characterId: string
  readonly conversationId: string
  readonly userMessageId: string | null
  readonly assistantMessageId: string | null
  readonly content: string
  readonly summary: string
  readonly topics: readonly string[]
  readonly entities: readonly string[]
  readonly category: string
  readonly createdAt: string
  readonly invalidAt: string | null
}

function characterQuery(characterId?: string): string {
  return characterId === undefined || characterId === '' ? '' : `?characterId=${encodeURIComponent(characterId)}`
}

/** 取该角色最新星图快照；不存在时后端现场构建。 */
export function fetchMemoryGraph(characterId?: string): Promise<MemoryGraphView> {
  return request<MemoryGraphView>(`/memory-graph${characterQuery(characterId)}`)
}

/** 强制重建星图（手动刷新/夜间校准）。 */
export function rebuildMemoryGraph(characterId?: string): Promise<MemoryGraphView> {
  return request<MemoryGraphView>(`/memory-graph/rebuild${characterQuery(characterId)}`, { method: 'POST' })
}

export function fetchMemoryChunk(chunkId: string): Promise<MemoryChunkDetail> {
  return request<MemoryChunkDetail>(`/memory-graph/chunks/${encodeURIComponent(chunkId)}`)
}

/** 遗忘一条记忆：节点变幽灵，不再参与检索。 */
export function forgetMemoryChunk(chunkId: string): Promise<void> {
  return request<void>(`/memory-graph/chunks/${encodeURIComponent(chunkId)}/forget`, { method: 'POST' })
}

export interface ActivityEventView {
  readonly id: string
  readonly eventType: string
  readonly actor: string
  readonly source: string
  readonly occurredAt: string
  readonly conversationId: string | null
  readonly turnId: string | null
  readonly payload: string | null
}

export function listMemories(characterId?: string): Promise<MemoryView[]> {
  const query = new URLSearchParams()
  if (characterId !== undefined && characterId !== '') {
    query.set('characterId', characterId)
  }
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  return request<MemoryView[]>(`/memories${suffix}`)
}

export function deleteMemory(id: string): Promise<void> {
  return request<void>(`/memories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listActivityEvents(type?: string, limit = 50): Promise<ActivityEventView[]> {
  const query = new URLSearchParams()
  if (type !== undefined && type !== '') {
    query.set('type', type)
  }
  query.set('limit', String(limit))
  return request<ActivityEventView[]>(`/activity-events?${query.toString()}`)
}

export interface VoiceTurnResponse {
  readonly turnId: string
  readonly recognizedText: string
  readonly confidence: number
  readonly assistantMessage: Message
  readonly ttsAudioBase64: string
  readonly ttsFormat: string
}

/** 语音轮次：M2 占位实现接受 text/plain 的 Base64 音频；接入真实模型后协议不变。 */
export function voiceTurn(conversationId: string, audioBase64: string, contentType = 'text/plain'): Promise<VoiceTurnResponse> {
  return request<VoiceTurnResponse>(`/conversations/${encodeURIComponent(conversationId)}/voice-turns`, {
    method: 'POST',
    body: { audioBase64, contentType }
  })
}

/** 取消进行中的流式轮次（仅归属者；未知或已结束返回 404）。 */
export function cancelTurn(conversationId: string, turnId: string): Promise<void> {
  return request<void>(
    `/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/cancel`,
    { method: 'POST' }
  )
}

export interface CharacterState {
  readonly characterId: string
  readonly mood: number
  readonly intimacy: number
  readonly stateVersion: number
}

/** 当前用户与指定角色（不传则当前角色）的关系状态。 */
export function getCharacterState(characterId?: string): Promise<CharacterState> {
  const query = characterId === undefined || characterId === ''
    ? ''
    : `?characterId=${encodeURIComponent(characterId)}`
  return request<CharacterState>(`/character-state${query}`)
}

/** 删除当前账号：服务端级联清理，返回后本地凭证必须立即清除。 */
export function deleteAccount(): Promise<void> {
  return request<void>('/account/deletion', { method: 'POST' })
}

/** 当前用户 LLM 配置的来源：USER=用户自己保存的，ENV=服务端环境变量兜底，NONE=未配置。 */
export type LlmSettingsSource = 'USER' | 'ENV' | 'NONE'

export interface LlmSettingsView {
  readonly enabled: boolean
  readonly baseUrl: string
  readonly model: string
  /** 只表示“已保存 Key”，接口不会返回 Key 明文。 */
  readonly hasApiKey: boolean
  readonly maxTokens: number
  readonly temperature: number
  readonly timeoutSeconds: number
  readonly source: LlmSettingsSource
  readonly updatedAt: string | null
}

export interface LlmSettingsInput {
  readonly enabled: boolean
  readonly baseUrl: string
  readonly model: string
  /** 留空表示不修改已有 Key。 */
  readonly apiKey: string
  readonly maxTokens: number
  readonly temperature: number
  readonly timeoutSeconds: number
}

export interface LlmTestResult {
  readonly ok: boolean
  readonly latencyMs: number
  readonly model: string
  readonly error: string | null
}

export function getLlmSettings(): Promise<LlmSettingsView> {
  return request<LlmSettingsView>('/settings/llm')
}

export function saveLlmSettings(input: LlmSettingsInput): Promise<LlmSettingsView> {
  return request<LlmSettingsView>('/settings/llm', { method: 'PUT', body: input })
}

/** 删除用户自己的配置，回退到服务端环境变量 / 占位回复。 */
export function resetLlmSettings(): Promise<void> {
  return request<void>('/settings/llm', { method: 'DELETE' })
}

export function testLlmSettings(): Promise<LlmTestResult> {
  return request<LlmTestResult>('/settings/llm/test', { method: 'POST' })
}

/* ── 语音工作台（docs/17-modular-voice-architecture.md）────────────────────── */

export type VoiceCapability = 'SPEAK' | 'SING' | 'HUM'
export type VoiceFieldType = 'TEXT' | 'PASSWORD' | 'SELECT' | 'TEXTAREA' | 'NUMBER' | 'SWITCH'
export type GenerationMode = 'single' | 'single_two' | 'dual'

export interface VoiceFieldOption {
  readonly value: string
  readonly label: string
}

export interface VoiceFieldSchema {
  readonly key: string
  readonly label: string
  readonly type: VoiceFieldType
  readonly required: boolean
  readonly secret: boolean
  readonly placeholder: string | null
  readonly options: readonly VoiceFieldOption[] | null
  readonly help: string | null
  readonly maxLength: number | null
  readonly defaultValue: string | null
}

export interface VoiceProviderDescriptor {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly capabilities: readonly VoiceCapability[]
  readonly credentialFields: readonly VoiceFieldSchema[]
  readonly generationFields: Readonly<Partial<Record<VoiceCapability, readonly VoiceFieldSchema[]>>>
  readonly languages: readonly string[]
  readonly maxTextChars: number
  readonly enabled: boolean
}

export interface VoiceCredentialView {
  readonly providerId: string
  readonly configured: boolean
  readonly status: string
  readonly lastVerifiedAt: string | null
  readonly values: Readonly<Record<string, string>>
  readonly configuredSecrets: readonly string[]
}

export interface VoiceProviderView {
  readonly descriptor: VoiceProviderDescriptor
  readonly credential: VoiceCredentialView
}

export interface VoiceSegmentView {
  readonly id: string
  readonly providerId: string
  readonly capability: VoiceCapability
  readonly status: string
  readonly audioBase64: string | null
  readonly format: string | null
  readonly durationMs: number | null
  readonly errorCode: string | null
  readonly message: string | null
}

export interface VoiceBatchView {
  readonly batchId: string
  readonly status: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly segments: readonly VoiceSegmentView[]
}

export interface VoiceValidationView {
  readonly valid: boolean
  readonly message: string | null
}

export interface VoiceSegmentInput {
  readonly id: string
  readonly providerId: string
  readonly capability: VoiceCapability
  readonly text: string
  readonly params: Readonly<Record<string, string>>
}

export function listVoiceProviders(): Promise<VoiceProviderView[]> {
  return request<VoiceProviderView[]>('/ai-girl/voice/providers')
}

export function saveVoiceCredential(
  providerId: string,
  fields: Readonly<Record<string, string>>
): Promise<VoiceCredentialView> {
  return request<VoiceCredentialView>(`/ai-girl/voice/providers/${encodeURIComponent(providerId)}/credential`, {
    method: 'PUT',
    body: { fields }
  })
}

export function validateVoiceCredential(providerId: string): Promise<VoiceValidationView> {
  return request<VoiceValidationView>(`/ai-girl/voice/providers/${encodeURIComponent(providerId)}/validate`, {
    method: 'POST'
  })
}

export function deleteVoiceCredential(providerId: string): Promise<void> {
  return request<void>(`/ai-girl/voice/providers/${encodeURIComponent(providerId)}/credential`, {
    method: 'DELETE'
  })
}

export function generateVoice(
  mode: GenerationMode,
  segments: readonly VoiceSegmentInput[]
): Promise<VoiceBatchView> {
  return request<VoiceBatchView>('/ai-girl/voice/generate', { method: 'POST', body: { mode, segments } })
}

export function getVoiceBatch(batchId: string): Promise<VoiceBatchView> {
  return request<VoiceBatchView>(`/ai-girl/voice/generate/${encodeURIComponent(batchId)}`)
}
