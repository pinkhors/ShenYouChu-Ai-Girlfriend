import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  streamTurn,
  type CharacterState,
  type Conversation
} from '../api/client'
import type { AvatarConfig } from '../avatar/avatarConfig'
import GirlfriendAvatar from '../avatar/GirlfriendAvatar'
import Icon from '../ui/Icon'
import { speak, speechSupported, stopSpeaking } from '../voice/tts'
import {
  PORTRAIT_SLOTS,
  moodToExpression,
  resolvePortrait,
  type PortraitExpression,
  type PortraitSet
} from './expression'

interface CallViewProps {
  readonly conversation: Conversation
  readonly portraits: PortraitSet | null
  readonly config: AvatarConfig
  readonly characterState: CharacterState | null
  readonly onClose: () => void
}

type CallAction = 'nod' | 'tilt' | 'lean'

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function moodLine(state: CharacterState | null): string {
  if (state === null) {
    return '她在听你说。'
  }
  if (state.mood >= 70) {
    return '她看起来心情不错，正笑着看你。'
  }
  if (state.mood <= 30) {
    return '她今天有点安静，靠得更近了一点。'
  }
  return '她在听你说。'
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/**
 * 通话页：立绘 + 表情差分 + 自动眨眼 + 呼吸感 + 动作。
 * 语音链路：文字输入 → 后端流式回复 → 系统语音朗读；口型按朗读节奏开合。
 * 真实 ASR/音频分析仍未接入，属于“能出声、会动”的中间版本。
 */
export default function CallView({
  conversation,
  portraits,
  config,
  characterState,
  onClose
}: CallViewProps) {
  const [expression, setExpression] = useState<PortraitExpression>(() =>
    moodToExpression(characterState?.mood ?? null)
  )
  const [blinking, setBlinking] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [mouthOpen, setMouthOpen] = useState(false)
  const [line, setLine] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<CallAction | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const actionTimer = useRef<number | null>(null)
  const speechToken = useRef(0)
  const closedRef = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((previous) => previous + 1)
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  /* 有闭眼图就自动眨眼；说话时不抢口型 */
  useEffect(() => {
    if (portraits?.closed === undefined) {
      return
    }
    let openTimer = 0
    let closeTimer = 0
    const schedule = (): void => {
      openTimer = window.setTimeout(() => {
        setBlinking(true)
        closeTimer = window.setTimeout(() => {
          setBlinking(false)
          schedule()
        }, 150)
      }, 3400 + Math.random() * 3200)
    }
    schedule()
    return () => {
      window.clearTimeout(openTimer)
      window.clearTimeout(closeTimer)
    }
  }, [portraits])

  /* 朗读时按固定节奏开合嘴型；有真实音频后可换成 analyser 驱动 */
  useEffect(() => {
    if (!speaking) {
      setMouthOpen(false)
      return
    }
    const timer = window.setInterval(() => {
      setMouthOpen((previous) => !previous)
    }, 150)
    return () => {
      window.clearInterval(timer)
    }
  }, [speaking])

  useEffect(() => {
    return () => {
      stopSpeaking()
      abortRef.current?.abort()
      if (actionTimer.current !== null) {
        window.clearTimeout(actionTimer.current)
      }
    }
  }, [])

  const handleClose = useCallback((): void => {
    closedRef.current = true
    stopSpeaking()
    abortRef.current?.abort()
    onClose()
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClose])

  const handleSay = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const text = line.trim()
    if (text === '' || thinking || speaking) {
      return
    }
    if (!speechSupported()) {
      setError('当前系统没有可用的语音合成，请先安装中文语音包')
      return
    }

    setLine('')
    setError(null)
    setReply('')
    setThinking(true)

    const controller = new AbortController()
    abortRef.current = controller
    let accumulated = ''

    try {
      await streamTurn(
        conversation.id,
        text,
        {
          onStarted: () => {
            /* 首个事件到达即可停止“思考中”的静态提示 */
          },
          onDelta: (delta) => {
            accumulated += delta
            setReply(accumulated)
          },
          onCompleted: () => {
            /* 流结束后统一朗读，避免边流边读打断 */
          }
        },
        controller.signal
      )
      setThinking(false)
      const answer = accumulated.trim()
      if (answer !== '' && !closedRef.current) {
        const token = speechToken.current + 1
        speechToken.current = token
        setSpeaking(true)
        speak(answer, {
          onStart: () => {
            if (speechToken.current === token) {
              setSpeaking(true)
            }
          },
          onEnd: () => {
            if (speechToken.current === token) {
              setSpeaking(false)
              setMouthOpen(false)
            }
          },
          onError: (message) => {
            if (speechToken.current === token) {
              setError(message)
              setSpeaking(false)
            }
          }
        })
      }
    } catch (sendError) {
      if (!(sendError instanceof DOMException && sendError.name === 'AbortError')) {
        setError(toMessage(sendError))
      }
    } finally {
      setThinking(false)
      abortRef.current = null
    }
  }

  const triggerAction = (next: CallAction): void => {
    setAction(next)
    if (actionTimer.current !== null) {
      window.clearTimeout(actionTimer.current)
    }
    actionTimer.current = window.setTimeout(() => {
      setAction(null)
    }, 900)
  }

  const displayExpression: PortraitExpression =
    speaking && mouthOpen && portraits?.talking !== undefined
      ? 'talking'
      : blinking && !speaking && portraits?.closed !== undefined
        ? 'closed'
        : expression
  const source = resolvePortrait(portraits, displayExpression)

  const portraitClass = [
    'call__portrait',
    action === null ? '' : `call__portrait--${action}`,
    speaking ? 'call__portrait--speaking' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label="与沈幼楚通话">
      {source !== null && (
        <div className="call__bg" style={{ backgroundImage: `url(${source})` }} aria-hidden="true" />
      )}

      <header className="call__header">
        <div>
          <p className="call__eyebrow">语音通话</p>
          <h2 className="call__name">沈幼楚</h2>
          <p className="call__timer">通话中 {formatDuration(seconds)}</p>
        </div>
        <button className="call__close" type="button" aria-label="关闭通话" onClick={handleClose}>
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="call__stage">
        <div className={portraitClass}>
          {source !== null ? (
            <img src={source} alt="沈幼楚" draggable={false} />
          ) : (
            <GirlfriendAvatar config={config} />
          )}
        </div>
        <p className="call__line">
          {thinking ? '她正在想…' : reply !== '' ? reply : moodLine(characterState)}
        </p>
      </div>

      {error !== null && <p className="call__error">{error}</p>}

      <form className="call__say" onSubmit={(event) => void handleSay(event)}>
        <input
          className="call__say-input"
          type="text"
          placeholder="对她说点什么…（回车发送，她会朗读回复）"
          maxLength={500}
          value={line}
          disabled={thinking || speaking}
          onChange={(event) => setLine(event.target.value)}
        />
        <button
          className="call__say-submit"
          type="submit"
          disabled={thinking || speaking || line.trim() === ''}
        >
          {thinking ? '思考中…' : '说'}
        </button>
      </form>

      <div className="call__tray">
        <div className="call__expressions" role="group" aria-label="切换表情">
          {PORTRAIT_SLOTS.filter((slot) => slot.id !== 'closed' && slot.id !== 'talking').map((slot) => {
            const available = portraits?.[slot.id] !== undefined
            return (
              <button
                key={slot.id}
                className={expression === slot.id ? 'call__chip call__chip--active' : 'call__chip'}
                type="button"
                disabled={!available}
                onClick={() => setExpression(slot.id)}
              >
                {slot.label}
              </button>
            )
          })}
        </div>

        <div className="call__actions" role="group" aria-label="动作">
          <button className="call__chip" type="button" onClick={() => triggerAction('nod')}>
            点头
          </button>
          <button className="call__chip" type="button" onClick={() => triggerAction('tilt')}>
            歪头
          </button>
          <button className="call__chip" type="button" onClick={() => triggerAction('lean')}>
            凑近
          </button>
        </div>
      </div>

      <footer className="call__controls">
        <button
          className="call__control"
          type="button"
          disabled={!speaking}
          onClick={() => stopSpeaking()}
        >
          <Icon name="stop" size={20} />
          <span>停止朗读</span>
        </button>
        <button className="call__control call__control--hangup" type="button" onClick={handleClose}>
          <Icon name="phone" size={20} />
          <span>挂断</span>
        </button>
      </footer>

      <p className="call__hint">
        文字输入 → 后端回复 → 系统语音朗读；口型按朗读节奏开合，ASR/真实音频分析尚未接入。
      </p>
    </div>
  )
}
