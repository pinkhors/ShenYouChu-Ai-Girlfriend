/**
 * 立绘导入：把用户选择的图片压到长边 1400px 的 WebP data URL。
 *
 * 目的：IndexedDB 每个用户存 7 张图也不至于膨胀；WebP 保留透明通道。
 * 浏览器解码失败（HEIC 等）时退回原文件 data URL，让用户至少能先看到图。
 */

const MAX_EDGE = 1400
const MAX_FILE_BYTES = 12 * 1024 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('读取图片失败'))
      }
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取图片失败'))
    }
    reader.readAsDataURL(file)
  })
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件（PNG / JPG / WebP）')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('图片太大，请控制在 12MB 以内')
  }

  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (context === null) {
        return await readAsDataUrl(file)
      }
      context.drawImage(bitmap, 0, 0, width, height)
      return canvas.toDataURL('image/webp', 0.88)
    } finally {
      bitmap.close()
    }
  } catch {
    /* 解码失败时保留原图，至少不阻断导入 */
    return await readAsDataUrl(file)
  }
}
