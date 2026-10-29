import { parseFrame, readPayloadField } from './sse'

/** 流式轮次回调；由调用方决定如何更新界面状态。 */
export interface TurnStreamHandlers {
  readonly onStarted?: (turnId: string) => void
  readonly onDelta?: (delta: string) => void
  readonly onCompleted?: (turnId: string, messageId: string) => void
  /** 服务端 `turn.failed`：本轮失败（后端不会补发 delta / completed） */
  readonly onFailed?: (code: string, message: string) => void
}

/**
 * SSE 增量解析器：按 `\n\n` 切帧，能正确处理任意分块边界（包括一帧被拆成多次 push、
 * 一次 push 含多帧、结尾残留半帧）。纯逻辑，可在 Node 中直接测试。
 */
export class TurnStreamParser {
  private buffer = ''
  private readonly handlers: TurnStreamHandlers

  constructor(handlers: TurnStreamHandlers) {
    this.handlers = handlers
  }

  push(chunk: string): void {
    this.buffer += chunk
    let separator = this.buffer.indexOf('\n\n')
    while (separator >= 0) {
      const frame = this.buffer.slice(0, separator)
      this.buffer = this.buffer.slice(separator + 2)
      this.dispatch(frame)
      separator = this.buffer.indexOf('\n\n')
    }
  }

  /** 尚未构成完整帧的残留内容（用于断言与调试）。 */
  pending(): string {
    return this.buffer
  }

  private dispatch(frame: string): void {
    const parsed = parseFrame(frame)
    if (parsed === null) {
      return
    }
    if (parsed.event === 'turn.started') {
      const turnId = readPayloadField(parsed.data, 'turnId')
      if (turnId !== undefined) {
        this.handlers.onStarted?.(turnId)
      }
    } else if (parsed.event === 'assistant.text.delta') {
      const delta = readPayloadField(parsed.data, 'delta')
      if (delta !== undefined) {
        this.handlers.onDelta?.(delta)
      }
    } else if (parsed.event === 'turn.completed') {
      this.handlers.onCompleted?.(
        readPayloadField(parsed.data, 'turnId') ?? '',
        readPayloadField(parsed.data, 'messageId') ?? ''
      )
    } else if (parsed.event === 'turn.failed') {
      this.handlers.onFailed?.(
        readPayloadField(parsed.data, 'code') ?? '',
        readPayloadField(parsed.data, 'message') ?? ''
      )
    }
  }
}