/**
 * 从 AI 立绘里抠出人物，生成聊天页用的透明底主视觉。
 *
 * 做法是“边缘漫水填充”：从图片上、左、右与底部两角开始，
 * 把颜色与相邻背景像素接近的连通区域设为透明；再按人物包围盒裁剪。
 * 对纯色/渐变背景效果最好；复杂场景背景会残留，属于已知限制。
 */

const MAX_EDGE = 1600
const COLOR_TOLERANCE = 18

function distance(r: number, g: number, b: number, r2: number, g2: number, b2: number): number {
  const dr = r - r2
  const dg = g - g2
  const db = b - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new Error('立绘加载失败'))
    }
    image.src = dataUrl
  })
}

export async function cutoutPortrait(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight, 1))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    throw new Error('当前环境不支持 Canvas')
  }
  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data

  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0

  const enqueue = (index: number): void => {
    if (visited[index] === 0) {
      visited[index] = 1
      queue[tail] = index
      tail += 1
    }
  }

  /* 只从上方/左右边缘和底部两角开始，避免把底部的衣服当背景整块删掉 */
  for (let x = 0; x < width; x += 1) {
    enqueue(x)
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }
  const corner = Math.min(12, width)
  for (let x = 0; x < corner; x += 1) {
    enqueue((height - 1) * width + x)
    enqueue((height - 1) * width + width - 1 - x)
  }

  while (head < tail) {
    const index = queue[head]
    head += 1
    if (index === undefined) {
      continue
    }
    const x = index % width
    const y = Math.floor(index / width)
    const offset = index * 4
    const r = pixels[offset] ?? 0
    const g = pixels[offset + 1] ?? 0
    const b = pixels[offset + 2] ?? 0

    const tryNeighbor = (nx: number, ny: number): void => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        return
      }
      const neighbor = ny * width + nx
      if (visited[neighbor] !== 0) {
        return
      }
      const no = neighbor * 4
      if (distance(r, g, b, pixels[no] ?? 0, pixels[no + 1] ?? 0, pixels[no + 2] ?? 0) <= COLOR_TOLERANCE) {
        enqueue(neighbor)
      }
    }

    tryNeighbor(x - 1, y)
    tryNeighbor(x + 1, y)
    tryNeighbor(x, y - 1)
    tryNeighbor(x, y + 1)
  }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (visited[index] !== 0) {
        pixels[index * 4 + 3] = 0
        continue
      }
      if (pixels[index * 4 + 3] === 0) {
        continue
      }
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('没有识别到人物主体，请换一张背景更简单的立绘')
  }

  const padding = 6
  const cropX = Math.max(0, minX - padding)
  const cropY = Math.max(0, minY - padding)
  const cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2)
  const cropHeight = Math.min(height - cropY, maxY - minY + 1 + padding * 2)

  context.putImageData(imageData, 0, 0)

  const output = document.createElement('canvas')
  output.width = cropWidth
  output.height = cropHeight
  const outputContext = output.getContext('2d')
  if (outputContext === null) {
    throw new Error('当前环境不支持 Canvas')
  }
  outputContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  return output.toDataURL('image/webp', 0.92)
}
