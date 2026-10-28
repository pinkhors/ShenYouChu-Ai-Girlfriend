import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  ApiError,
  streamTurn,
  type CharacterState,
  type Conversation
} from '../api/client'
import type { AvatarConfig } from '../avatar/avatarConfig'
import GirlfriendAvatar from '../avatar/GirlfriendAvatar'
import Icon from '../ui/Icon'
import {
  audioPlaybackSupported,
  playAudioDataUrl,
  primeAudio,
  type AudioPlaybackHandle
} from '../voice/audio'
import { blobToBase64, pickAudioMimeType, recordingSupported } from '../voice/recording'
import { speak, speechSupported, stopSpeaking } from '../voice/tts'
import {
  isAsrEnabled,
  isCloudTts,
  loadAsrConfig,
  loadTtsConfig,
  type AsrConfig
} from '../voice/voiceConfig'
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

function cleanVoiceError(error: unknown): string {
  const message = error instanceof Error ? error.message : '语音服务不可用'
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

/**
 * 通话页：立绘 + 表情差分 + 自动眨眼 + 呼吸感 + 动作。
 *
 * 语音链路：
 * - 文字输入或按住说话（可选云端 ASR）→ 后端 SSE 回复；
 * - 朗读优先用云端 TTS（返回音频，AnalyserNode 驱动口型），未配置/失败时回退系统语音；
 * - 不接 ASR 时仍可纯文字输入。
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
  const [usingAudio, setUsingAudio] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [mouthOpen, setMouthOpen] = useState(false)
  const [line, setLine] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState<CallAction | null>(null)
  const [asrConfig] = useState<AsrConfig>(() => loadAsrConfig())

  const abortRef = useRef<AbortController | null>(null)
  const actionTimer = useRef<number | null>(null)
  const speechToken = useRef(0)
  const closedRef = useRef(false)
  const audioRef = useRef<AudioPlaybackHandle | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const asrConfigRef = useRef<AsrConfig | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastLevelAt = useRef(0)
  const holdingMic = useRef(false)

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

  /* 系统语音拿不到音频样本，只能用节奏开合；云端音频由 analyser 驱动 */
  useEffect(() => {
    if (!speaking || usingAudio) {
      if (!speaking) {
        setMouthOpen(false)
      }
      return
    }
    const timer = window.setInterval(() => {
      setMouthOpen((previous) => !previous)
    }, 150)
    return () => {
      window.clearInterval(timer)
    }
  }, [speaking, usingAudio])

  useEffect(() => {
    return () => {
      closedRef.current = true
      audioRef.current?.stop()
      const recorder = recorderRef.current
      if (recorder !== null && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      stopSpeaking()
      abortRef.current?.abort()
      if (actionTimer.current !== null) {
        window.clearTimeout(actionTimer.current)
      }
    }
  }, [])

  const handleClose = useCallback((): void => {
    closedRef.current = true
    speechToken.current += 1
    audioRef.current?.stop()
    audioRef.current = null
    const recorder = recorderRef.current
    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
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

  const playAnswer = async (text: string): Promise<void> => {
    if (closedRef.current) {
      return
    }
    const tts = loadTtsConfig()
    if (isCloudTts(tts) && window.desktop?.tts !== undefined && audioPlaybackSupported()) {
      const token = speechToken.current + 1
      speechToken.current = token
      setUsingAudio(true)
      setSpeaking(true)
      try {
        const dataUrl = await window.desktop.tts.synthesize({
          baseUrl: tts.baseUrl,
          apiKey: tts.apiKey,
          model: tts.model,
          voice: tts.voice,
          text
        })
        if (closedRef.current || speechToken.current !== token) {
          return
        }
        const handle = await playAudioDataUrl(dataUrl, {
          onLevel: (level) => {
            const now = performance.now()
            if (now - lastLevelAt.current < 70) {
              return
            }
            lastLevelAt.current = now
            setMouthOpen(level > 0.045)
          },
          onEnd: () => {
            audioRef.current = null
            setUsingAudio(false)
            setSpeaking(false)
            setMouthOpen(false)
          },
          onError: (message) => {
            audioRef.current = null
            setUsingAudio(false)
            setSpeaking(false)
            setError(message)
          }
        })
        audioRef.current = handle
        return
      } catch (cloudError) {
        if (closedRef.current) {
          return
        }
        setUsingAudio(false)
        setSpeaking(false)
        setError(`云端语音失败，已回退系统语音：${cleanVoiceError(cloudError)}`)
      }
    }

    if (!speechSupported()) {
      setSpeaking(false)
      setError('当前系统没有可用的语音合成，请检查系统语音包')
      return
    }
    const token = speechToken.current + 1
    speechToken.current = token
    setUsingAudio(false)
    setSpeaking(true)
    speak(text, {
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

  const handleSay = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const text = line.trim()
    if (text === '' || thinking || speaking || recording) {
      return
    }
    primeAudio()

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
            /* 流式开始后界面由 thinking 状态托底 */
          },
          onDelta: (delta) => {
            accumulated += delta
            setReply(accumulated)
          },
          onCompleted: () => {
            /* 流结束后统一朗读，避免边流边读 */
          }
        },
        controller.signal
      )
      setThinking(false)
      const answer = accumulated.trim()
      if (answer !== '' && !closedRef.current) {
        await playAnswer(answer)
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

  const startRecording = async (): Promise<void> => {
    if (recording || transcribing || thinking || speaking) {
      return
    }
    if (!recordingSupported() || window.desktop?.asr === undefined) {
      setError('当前环境不支持录音，或没有语音识别通道')
      return
    }
    const configForRecording = loadAsrConfig()
    if (!isAsrEnabled(configForRecording)) {
      setError('还没有配置语音识别服务，请先到设置里填写')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (closedRef.current || !holdingMic.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mimeType = pickAudioMimeType()
      const recorder = mimeType === '' ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      chunksRef.current = []
      asrConfigRef.current = configForRecording

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        void finishRecording()
      }
      recorder.start()
      setRecording(true)
      setError(null)
    } catch {
      setError('无法访问麦克风，请检查系统权限')
    }
  }

  const stopRecording = (): void => {
    const recorder = recorderRef.current
    if (recorder !== null && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }

  const finishRecording = async (): Promise<void> => {
    setRecording(false)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    const chunks = chunksRef.current
    chunksRef.current = []
    const recorder = recorderRef.current
    const mimeType = recorder?.mimeType !== undefined && recorder.mimeType !== '' ? recorder.mimeType : 'audio/webm'
    recorderRef.current = null

    if (chunks.length === 0) {
      return
    }

    const asr = asrConfigRef.current ?? loadAsrConfig()
    const bridge = window.desktop?.asr
    if (bridge === undefined) {
      setError('当前环境没有语音识别通道')
      return
    }

    setTranscribing(true)
    setError(null)
    try {
      const blob = new Blob(chunks, { type: mimeType })
      const audioBase64 = await blobToBase64(blob)
      const text = await bridge.transcribe({
        baseUrl: asr.baseUrl,
        apiKey: asr.apiKey,
        model: asr.model,
        audioBase64,
        mimeType
      })
      setLine(text)
      inputRef.current?.focus()
    } catch (transcribeError) {
      setError(cleanVoiceError(transcribeError))
    } finally {
      setTranscribing(false)
    }
  }

  const handleMicDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    holdingMic.current = true
    void startRecording()
  }

  const handleMicUp = (): void => {
    holdingMic.current = false
    if (recording) {
      stopRecording()
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

  const handleStopPlayback = (): void => {
    speechToken.current += 1
    setSpeaking(false)
    setMouthOpen(false)
    setUsingAudio(false)
    if (audioRef.current !== null) {
      audioRef.current.stop()
      audioRef.current = null
      return
    }
    stopSpeaking()
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

  const canRecord = recordingSupported() && window.desktop?.asr !== undefined && isAsrEnabled(asrConfig)

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
          {thinking
            ? '她正在想…'
            : transcribing
              ? '正在识别…'
              : recording
                ? '我在听…'
                : reply !== ''
                  ? reply
                  : moodLine(characterState)}
        </p>
      </div>

      {error !== null && <p className="call__error">{error}</p>}

      <form className="call__say" onSubmit={(event) => void handleSay(event)}>
        {canRecord && (
          <button
            className={recording ? 'call__mic call__mic--recording' : 'call__mic'}
            type="button"
            title={recording ? '松开结束' : '按住说话'}
            aria-label={recording ? '松开结束录音' : '按住说话'}
            disabled={thinking || speaking || transcribing}
            onPointerDown={handleMicDown}
            onPointerUp={handleMicUp}
            onPointerLeave={handleMicUp}
            onPointerCancel={handleMicUp}
          >
            <Icon name={recording ? 'stop' : 'mic'} size={18} />
          </button>
        )}
        <input
          ref={inputRef}
          className="call__say-input"
          type="text"
          placeholder="对她说点什么…（回车发送，她会朗读回复）"
          maxLength={500}
          value={line}
          disabled={thinking || speaking || recording}
          onChange={(event) => setLine(event.target.value)}
        />
        <button
          className="call__say-submit"
          type="submit"
          disabled={thinking || speaking || recording || transcribing || line.trim() === ''}
        >
          {thinking ? '思考中…' : transcribing ? '识别中…' : '说'}
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
          onClick={handleStopPlayback}
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
        文字输入或按住麦克风说话（需在设置里配置 ASR）；回复用系统/云端语音朗读，云端音频会驱动口型。
      </p>
    </div>
  )
}
