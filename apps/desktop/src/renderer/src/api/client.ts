import { getToken } from '../auth/tokenStore'

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

export function listMessages(conversationId: string): Promise<Message[]> {
  return request<Message[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`)
}

export function sendTurn(conversationId: string, message: string): Promise<TurnResponse> {
  return request<TurnResponse>(`/conversations/${encodeURIComponent(conversationId)}/turns`, {
    method: 'POST',
    body: { message }
  })
}

export interface TurnStreamHandlers {
  readonly onStarted?: (turnId: string) => void
  readonly onDelta?: (delta: string) => void
  readonly onCompleted?: (turnId: string, messageId: string) => void
}

function parseFrame(frame: string): { event: string; data: string } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }
  if (dataLines.length === 0) {
    return null
  }
  return { event, data: dataLines.join('\n') }
}

function readPayloadField(data: string, key: string): string | undefined {
  try {
    const payload: unknown = JSON.parse(data)
    if (isRecord(payload)) {
      return readString(payload, key)
    }
  } catch {
    /* 忽略无法解析的帧，保持流不中断 */
  }
  return undefined
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
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })

    let separator = buffer.indexOf('\n\n')
    while (separator >= 0) {
      const frame = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      const parsed = parseFrame(frame)
      if (parsed !== null) {
        if (parsed.event === 'turn.started') {
          const turnId = readPayloadField(parsed.data, 'turnId')
          if (turnId !== undefined) {
            handlers.onStarted?.(turnId)
          }
        } else if (parsed.event === 'assistant.text.delta') {
          const delta = readPayloadField(parsed.data, 'delta')
          if (delta !== undefined) {
            handlers.onDelta?.(delta)
          }
        } else if (parsed.event === 'turn.completed') {
          handlers.onCompleted?.(
            readPayloadField(parsed.data, 'turnId') ?? '',
            readPayloadField(parsed.data, 'messageId') ?? ''
          )
        }
      }
      separator = buffer.indexOf('\n\n')
    }
  }
}
