import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  streamTurn,
  type CharacterState,
  type Conversation
} from '../api/client'
import type { AvatarConfig } from '../avatar/avatarConfig'
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
import AvatarPortrait from './AvatarPortrait'
import { resolveAvatarSource } from './avatarSource'
import {
  PORTRAIT_SLOTS,
  moodToExpression,
  type PortraitExpression,
  type PortraitSet
} from './expression'

interface CallViewProps {
  readonly conversation: Conversation
  readonly portraits: PortraitSet | null
  readonly portraitsLoading: boolean
  readonly config: AvatarConfig
  readonly characterName: string
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
 * 通话页：参考豆包的通话布局——柔和渐变、圆形形象、顶部情景/文字入口、
 * 中间状态与字幕、底部麦克风/摄像头/挂断，表情与动作收进“更多”面板。
 *
 * 语音链路：
 * - 点麦克风录音（可选云端 ASR）→ 识别文本直接发送；也可以“字”切文字输入；
 * - 后端 SSE 回复后朗读：云端 TTS 的音频驱动口型，否则系统语音按节奏开合。
 */
export default function CallView({
  conversation,
  portraits,
  portraitsLoading,
  config,
  characterName,
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
  const [toast, setToast] = useState<string | null>(null)
  const [action, setAction] = useState<CallAction | null>(null)
  const [textMode, setTextMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [asrConfig] = useState<AsrConfig>(() => loadAsrConfig())

  const abortRef = useRef<AbortController | null>(null)
  const actionTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)
  const speechToken = useRef(0)
  const closedRef = useRef(false)
  const audioRef = useRef<AudioPlaybackHandle | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const asrConfigRef = useRef<AsrConfig | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastLevelAt = useRef(0)

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
      if (toastTimer.current !== null) {
        window.clearTimeout(toastTimer.current)
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

  const showToast = (message: string): void => {
    setToast(message)
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current)
    }
    toastTimer.current = window.setTimeout(() => {
      setToast(null)
    }, 2800)
  }

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

  const sendText = async (raw: string): Promise<void> => {
    const text = raw.trim()
    if (text === '' || thinking || speaking) {
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
            /* 流式开始后由 thinking 状态托底 */
          },
          onDelta: (delta) => {
            accumulated += delta
            setReply(accumulated)
          },
          onCompleted: () => {
            /* 流结束后统一朗读 */
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

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void sendText(line)
  }

  const startRecording = async (): Promise<void> => {
    if (recording || transcribing || thinking || speaking) {
      return
    }
    if (!recordingSupported() || window.desktop?.asr === undefined) {
      showToast('当前环境不支持录音')
      return
    }
    const configForRecording = loadAsrConfig()
    if (!isAsrEnabled(configForRecording)) {
      setTextMode(true)
      showToast('先在设置里配置语音识别，或直接打字')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (closedRef.current) {
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
    const mimeType =
      recorder?.mimeType !== undefined && recorder.mimeType !== '' ? recorder.mimeType : 'audio/webm'
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
      if (text !== '' && !closedRef.current) {
        await sendText(text)
      }
    } catch (transcribeError) {
      setError(cleanVoiceError(transcribeError))
    } finally {
      setTranscribing(false)
    }
  }

  const handleMicClick = (): void => {
    if (recording) {
      stopRecording()
      return
    }
    if (!recordingSupported() || window.desktop?.asr === undefined) {
      showToast('当前环境不支持录音')
      return
    }
    if (!isAsrEnabled(asrConfig)) {
      setTextMode(true)
      showToast('先在设置里配置语音识别，或直接打字')
      return
    }
    void startRecording()
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

  const avatarSource = resolveAvatarSource(portraits, portraitsLoading)

  const orbClass = [
    'call__orb',
    action === null ? '' : `call__orb--${action}`,
    speaking ? 'call__orb--speaking' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const idleText = reply === '' ? '点击麦克风开始说话' : ''

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`与${characterName}通话`}>
      <header className="call__top">
        <button
          className="call__round"
          type="button"
          aria-label="表情与动作"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((previous) => !previous)}
        >
          •••
        </button>
        <span className="call__pill">
          语音通话 · {formatDuration(seconds)}
        </span>
        <button
          className={textMode ? 'call__round call__round--active' : 'call__round'}
          type="button"
          aria-pressed={textMode}
          onClick={() => setTextMode((previous) => !previous)}
        >
          字
        </button>
      </header>

      <main className="call__center">
        <div className={orbClass} data-avatar-source={avatarSource}>
          {avatarSource === 'loading' ? (
            <div className="call__orb-loading" role="status" aria-label="正在加载她的形象" />
          ) : (
            <AvatarPortrait
              config={config}
              portraits={portraits}
              expression={displayExpression}
              variant="avatar"
              name={characterName}
            />
          )}
        </div>

        <div className="call__status" aria-live="polite">
          {(portraitsLoading || thinking || recording || transcribing) && (
            <span className="call__dots" aria-hidden="true">
              <span className="call__dot" />
              <span className="call__dot" />
              <span className="call__dot" />
            </span>
          )}
          <p className="call__status-text">
            {portraitsLoading
              ? '正在加载她的形象…'
              : thinking
                ? '她正在想…'
                : recording
                  ? '正在听… 点击麦克风发送'
                  : transcribing
                    ? '正在识别…'
                    : speaking
                      ? '她在说话…'
                      : idleText}
          </p>
          {reply !== '' && !thinking && !recording && (
            <p className="call__reply" title={reply}>
              {reply}
            </p>
          )}
          {speaking && (
            <button className="call__stop" type="button" onClick={handleStopPlayback}>
              停止朗读
            </button>
          )}
          {reply === '' && !thinking && !recording && !speaking && (
            <p className="call__mood">{moodLine(characterState)}</p>
          )}
        </div>
      </main>

      {sheetOpen && (
        <section className="call__sheet" aria-label="表情与动作">
          <div className="call__sheet-label">表情</div>
          <div className="call__sheet-row">
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
            {speaking && (
              <button className="call__chip" type="button" onClick={handleStopPlayback}>
                停止朗读
              </button>
            )}
          </div>
          <div className="call__sheet-label">动作</div>
          <div className="call__sheet-row">
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
        </section>
      )}

      {textMode && (
        <form className="call__text" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="call__text-input"
            type="text"
            placeholder="打字对她说…"
            maxLength={500}
            value={line}
            disabled={thinking || speaking || recording}
            onChange={(event) => setLine(event.target.value)}
          />
          <button
            className="call__text-send"
            type="submit"
            disabled={thinking || speaking || recording || transcribing || line.trim() === ''}
          >
            发送
          </button>
        </form>
      )}

      {error !== null && <p className="call__error">{error}</p>}
      {toast !== null && <p className="call__toast">{toast}</p>}

      <footer className="call__dock">
        <button
          className={
            recording
              ? 'call__dock-btn call__dock-btn--mic call__dock-btn--recording'
              : 'call__dock-btn call__dock-btn--mic'
          }
          type="button"
          aria-label={recording ? '发送语音' : '开始语音输入'}
          disabled={!recording && (thinking || speaking || transcribing)}
          onClick={handleMicClick}
        >
          <Icon name={recording ? 'stop' : 'mic'} size={26} />
        </button>
        <button
          className="call__dock-btn call__dock-btn--off"
          type="button"
          disabled
          title="摄像头通话还没接入"
          aria-label="摄像头通话还没接入"
        >
          <Icon name="camera" size={22} />
        </button>
        <button
          className="call__dock-btn call__dock-btn--off"
          type="button"
          disabled
          title="视频通话还没接入"
          aria-label="视频通话还没接入"
        >
          <Icon name="video" size={22} />
        </button>
        <button
          className="call__dock-btn call__dock-btn--end"
          type="button"
          aria-label="挂断"
          onClick={handleClose}
        >
          <Icon name="phone" size={24} />
        </button>
      </footer>

      <p className="call__disclaimer">内容由 AI 生成</p>
    </div>
  )
}
