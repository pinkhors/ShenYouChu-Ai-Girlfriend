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
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
 * 当前用户的会话列表。
 * 契约文档 3.2 记为 cursor 分页，但当前后端 ConversationController 直接返回数组
 * （List<ConversationView>）；此处按既有实现对接，后端改为分页信封时同步调整。
 */
export function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/conversations')
}

export function createConversation(input: CreateConversationInput = {}): Promise<Conversation> {
  return request<Conversation>('/conversations', { method: 'POST', body: input })
}

export function deleteConversation(id: string): Promise<void> {
  return request<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
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

export function listMemories(): Promise<MemoryView[]> {
  return request<MemoryView[]>('/memories')
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

/** 当前用户与默认角色的关系状态。 */
export function getCharacterState(): Promise<CharacterState> {
  return request<CharacterState>('/character-state')
}

/** 删除当前账号：服务端级联清理，返回后本地凭证必须立即清除。 */
export function deleteAccount(): Promise<void> {
  return request<void>('/account/deletion', { method: 'POST' })
}
