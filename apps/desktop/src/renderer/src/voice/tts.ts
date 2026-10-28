/**
 * 浏览器内置语音合成（Web Speech API）封装。
 *
 * 为什么先用它：零密钥、零调用费，Windows/macOS 自带中文语音；
 * 局限是拿不到音频样本，只能靠 boundary 事件/节奏驱动口型，
 * 后续接云端 TTS（返回音频）后可换成 analyser 驱动。
 */

export interface SpeakHandlers {
  readonly onStart?: () => void
  readonly onBoundary?: () => void
  readonly onEnd?: () => void
  readonly onError?: (message: string) => void
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) {
    return null
  }
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^zh/i.test(voice.lang))
  if (voices.length === 0) {
    return null
  }
  const preferred = voices.find((voice) =>
    /xiaoxiao|huihui|yaoyao|xiaoyi|female|女/i.test(voice.name)
  )
  return preferred ?? voices[0] ?? null
}

/** 朗读一段文本；返回取消函数。重复调用会先停掉上一段。 */
export function speak(text: string, handlers: SpeakHandlers = {}): () => void {
  if (!speechSupported()) {
    handlers.onError?.('当前系统不支持语音合成')
    return () => {}
  }
  if (text.trim() === '') {
    return () => {}
  }

  const synthesis = window.speechSynthesis
  synthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 1.02
  utterance.pitch = 1.08
  const voice = pickChineseVoice()
  if (voice !== null) {
    utterance.voice = voice
  }

  let finished = false
  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    handlers.onEnd?.()
  }

  utterance.onstart = () => {
    handlers.onStart?.()
  }
  utterance.onboundary = () => {
    handlers.onBoundary?.()
  }
  utterance.onend = finish
  utterance.onerror = (event) => {
    if (event.error === 'interrupted' || event.error === 'canceled') {
      finish()
      return
    }
    handlers.onError?.(`语音合成失败：${event.error}`)
    finish()
  }

  synthesis.speak(utterance)

  return () => {
    synthesis.cancel()
    finish()
  }
}

export function stopSpeaking(): void {
  if (speechSupported()) {
    window.speechSynthesis.cancel()
  }
}
