/** 录音相关的小工具：MediaRecorder 支持探测与 Blob → Base64。 */

export function recordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('读取录音失败'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取录音失败'))
    }
    reader.readAsDataURL(blob)
  })
}

/** 选出 MediaRecorder 支持的首个音频格式；返回空串表示用浏览器默认。 */
export function pickAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return ''
}
