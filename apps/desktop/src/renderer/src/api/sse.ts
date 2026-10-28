/** SSE 帧解析（纯函数，便于单元测试）。 */

export interface SseFrame {
  readonly event: string
  readonly data: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

/** 解析 `event:` / `data:` 行；无 data 行返回 null（心跳或注释帧）。 */
export function parseFrame(frame: string): SseFrame | null {
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

/** 从 JSON data 中读取字符串字段；解析失败返回 undefined，保持流不中断。 */
export function readPayloadField(data: string, key: string): string | undefined {
  try {
    const payload: unknown = JSON.parse(data)
    if (isRecord(payload)) {
      return readString(payload, key)
    }
  } catch {
    /* 忽略无法解析的帧 */
  }
  return undefined
}