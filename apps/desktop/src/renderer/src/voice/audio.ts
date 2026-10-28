/**
 * 播放 TTS 音频并用 AnalyserNode 取音量包络，驱动通话页口型。
 *
 * 只在云端 TTS（返回音频）时使用；系统语音无法取到音频样本，
 * 仍由 Web Speech 的节奏驱动。
 *
 * AudioContext 复用同一个实例，并在用户点击“说”时由 primeAudio() 提前解锁，
 * 避免“网络请求回来后再播放”被浏览器自动播放策略拦截。
 */

export interface AudioPlaybackHandlers {
  /** 0..1 的瞬时音量，调用方自行节流。 */
  readonly onLevel: (level: number) => void
  readonly onEnd: () => void
  readonly onError: (message: string) => void
}

export interface AudioPlaybackHandle {
  stop: () => void
}

let sharedContext: AudioContext | null = null

export function audioPlaybackSupported(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window && 'Audio' in window
}

function getContext(): AudioContext {
  if (sharedContext === null) {
    sharedContext = new AudioContext()
  }
  return sharedContext
}

/** 在用户手势里调用，提前创建/恢复 AudioContext。 */
export function primeAudio(): void {
  if (!audioPlaybackSupported()) {
    return
  }
  const context = getContext()
  void context.resume()
}

export async function playAudioDataUrl(
  dataUrl: string,
  handlers: AudioPlaybackHandlers
): Promise<AudioPlaybackHandle> {
  if (!audioPlaybackSupported()) {
    throw new Error('当前环境不支持音频播放')
  }

  const audio = new Audio()
  audio.src = dataUrl
  audio.preload = 'auto'
  const context = getContext()
  await context.resume()

  const source = context.createMediaElementSource(audio)
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.45
  source.connect(analyser)
  analyser.connect(context.destination)

  const samples = new Uint8Array(analyser.fftSize)
  let stopped = false
  let finished = false
  let frame = 0

  const cleanup = (): void => {
    if (stopped) {
      return
    }
    stopped = true
    cancelAnimationFrame(frame)
    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.src = ''
    source.disconnect()
    analyser.disconnect()
  }

  const finish = (): void => {
    if (finished) {
      return
    }
    finished = true
    cleanup()
    handlers.onEnd()
  }

  const tick = (): void => {
    if (stopped) {
      return
    }
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (const sample of samples) {
      const value = (sample - 128) / 128
      sum += value * value
    }
    handlers.onLevel(Math.sqrt(sum / samples.length))
    frame = requestAnimationFrame(tick)
  }

  audio.onended = finish
  audio.onerror = () => {
    if (finished) {
      return
    }
    finished = true
    cleanup()
    handlers.onError('音频播放失败')
  }

  try {
    await audio.play()
  } catch (error) {
    finished = true
    cleanup()
    throw error instanceof Error ? error : new Error('音频播放被浏览器拦截')
  }

  tick()
  return { stop: finish }
}
