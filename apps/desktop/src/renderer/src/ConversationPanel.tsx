import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, listMessages, streamTurn, textToBase64, voiceTurn, type Conversation, type Message } from './api/client'

interface ConversationPanelProps {
  readonly conversation: Conversation
  readonly onBack: () => void
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return '请求失败，请稍后重试'
}

/**
 * 会话详情：加载历史消息，发送轮次并消费 SSE 流式回复。
 * 流式文本只写入独立的 streaming 状态，历史消息列表保持不可变，避免整树重渲染。
 */
export default function ConversationPanel({ conversation, onBack }: ConversationPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const loaded = await listMessages(conversation.id)
      setMessages(loaded)
      setError(null)
    } catch (loadError) {
      setError(toMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [conversation.id])

  useEffect(() => {
    void load()
    return () => {
      abortRef.current?.abort()
    }
  }, [load])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || isSending) {
      return
    }

    setDraft('')
    setError(null)
    setStreamingText('')
    setIsSending(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamTurn(
        conversation.id,
        text,
        {
          onDelta: (delta) => {
            setStreamingText((previous) => previous + delta)
          },
          onCompleted: () => {
            void load()
          }
        },
        controller.signal
      )
    } catch (sendError) {
      if (!(sendError instanceof DOMException && sendError.name === 'AbortError')) {
        setError(toMessage(sendError))
      }
    } finally {
      setIsSending(false)
      setStreamingText('')
      abortRef.current = null
    }
  }

  const handleVoicePlaceholder = async () => {
    const text = draft.trim()
    if (text === '' || isSending) {
      return
    }
    setDraft('')
    setError(null)
    setVoiceNotice(null)
    setIsSending(true)
    try {
      const result = await voiceTurn(conversation.id, textToBase64(text))
      setVoiceNotice(
        `识别为「${result.recognizedText}」（置信度 ${result.confidence}）。` +
          (result.ttsFormat === 'none' ? '当前为占位语音，未合成音频。' : `语音格式：${result.ttsFormat}`)
      )
      await load()
    } catch (voiceError) {
      setError(toMessage(voiceError))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__identity">
          <button className="button button--ghost" type="button" onClick={onBack}>
            ← 返回会话列表
          </button>
          <span className="topbar__name">{conversation.title ?? '未命名会话'}</span>
        </div>
        <div className="topbar__actions">
          <span className="badge">{conversation.status}</span>
        </div>
      </header>

      <main className="workspace workspace--chat">
        <section className="panel panel--chat">
          {error !== null && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          {isLoading ? (
            <p className="muted">正在加载消息…</p>
          ) : messages.length === 0 && streamingText === '' ? (
            <p className="muted">还没有消息，说点什么开始吧。</p>
          ) : (
            <ul className="messages">
              {messages.map((message) => (
                <li className={`message message--${message.role}`} key={message.id}>
                  <span className="message__role">{message.role === 'user' ? '我' : '沈幼楚'}</span>
                  <p className="message__content">{message.content}</p>
                </li>
              ))}
              {streamingText !== '' && (
                <li className="message message--assistant message--streaming">
                  <span className="message__role">沈幼楚</span>
                  <p className="message__content">{streamingText}</p>
                </li>
              )}
            </ul>
          )}

          {voiceNotice !== null && <p className="muted">{voiceNotice}</p>}

          <form className="composer" onSubmit={(event) => void handleSubmit(event)}>
            <input
              className="field__input"
              type="text"
              placeholder="说点什么…"
              maxLength={2000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isSending}
            />
            <button className="button button--primary" type="submit" disabled={isSending || draft.trim() === ''}>
              {isSending ? '她正在回应…' : '发送'}
            </button>
            <button
              className="button button--ghost"
              type="button"
              disabled={isSending || draft.trim() === ''}
              onClick={() => void handleVoicePlaceholder()}
            >
              语音（占位）
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
