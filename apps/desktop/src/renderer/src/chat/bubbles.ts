/**
 * 气泡级节奏的展示层纯逻辑（PRD 09 §5.4、AC-18）。
 *
 * 同一轮助手回复在服务端仍是一条 messages 记录，这里只负责按句切分、
 * 合并碎句、限制气泡数量与单气泡长度；不产生任何持久化副作用。
 */

/** 一条助手消息在界面上最多拆成的气泡数。 */
export const MAX_BUBBLES = 3

/** 单气泡的目标最大字符数。 */
export const MAX_BUBBLE_CHARS = 120

/** 少于该长度的片段会并入相邻气泡，避免“嗯。”“好。”这样的碎句。 */
export const MIN_BUBBLE_CHARS = 8

/** 句末标点；连续出现（如“……” “！？”）时整体算作前一句的结尾。 */
const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '…'])

/** 句末标点后紧跟的收尾符号，跟随前一句，避免被切成独立碎句。 */
const CLOSERS = new Set(['”', '’', '"', "'", '」', '』', '）', ')', '】', '》', '〉'])

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n?/g, '\n')
}

/** 按句末标点与换行切成保留标点的句子（已去掉首尾空白，丢弃纯空白片段）。 */
function splitSentences(content: string): string[] {
  const text = normalizeNewlines(content)
  const sentences: string[] = []
  let buffer = ''

  const flush = (): void => {
    const trimmed = buffer.trim()
    if (trimmed !== '') {
      sentences.push(trimmed)
    }
    buffer = ''
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\n') {
      flush()
      continue
    }
    buffer += char
    if (!SENTENCE_END.has(char)) {
      continue
    }
    /* 把紧随其后的连续标点与右引号/右括号一起收进本句，保留原标点 */
    while (index + 1 < text.length) {
      const next = text[index + 1]
      if (SENTENCE_END.has(next) || CLOSERS.has(next)) {
        buffer += next
        index += 1
      } else {
        break
      }
    }
    flush()
  }
  flush()

  return sentences
}

/** 把过短片段并入相邻气泡；并入后会超过上限时保持独立，交给后续硬切。 */
function mergeShortFragments(sentences: readonly string[], maxChars: number): string[] {
  const merged: string[] = []
  let pendingPrefix = ''

  for (const sentence of sentences) {
    const fragment = pendingPrefix + sentence
    pendingPrefix = ''
    if (fragment.length < MIN_BUBBLE_CHARS) {
      const lastIndex = merged.length - 1
      if (lastIndex >= 0 && merged[lastIndex].length + fragment.length <= maxChars) {
        merged[lastIndex] += fragment
        continue
      }
      /* 没有上一个气泡（或并入会超长）：先攒着，并入下一句 */
      pendingPrefix = fragment
      continue
    }
    merged.push(fragment)
  }

  if (pendingPrefix !== '') {
    if (merged.length > 0) {
      merged[merged.length - 1] += pendingPrefix
    } else {
      merged.push(pendingPrefix)
    }
  }

  return merged
}

/** 超长片段在 maxChars 处硬切，切出的每一段都不超过 maxChars。 */
function cutLongBubbles(bubbles: readonly string[], maxChars: number): string[] {
  const cut: string[] = []
  for (const bubble of bubbles) {
    for (let offset = 0; offset < bubble.length; offset += maxChars) {
      cut.push(bubble.slice(offset, offset + maxChars))
    }
  }
  return cut
}

/** 超过气泡上限时把多出来的部分并进最后一个气泡（余下内容不丢失）。 */
function capBubbles(bubbles: readonly string[], maxBubbles: number): string[] {
  const capped = [...bubbles]
  while (capped.length > maxBubbles) {
    const tail = capped.pop() ?? ''
    capped[capped.length - 1] += tail
  }
  return capped
}

/**
 * 合并后若最后一个气泡超长（总内容仍装得下），按字符重新均分，
 * 保证每个气泡都不超过 maxChars；内容顺序与标点不变。
 */
function rebalanceToMaxChars(bubbles: readonly string[], maxChars: number): string[] {
  if (bubbles.every((bubble) => bubble.length <= maxChars)) {
    return [...bubbles]
  }
  const total = bubbles.reduce((sum, bubble) => sum + bubble.length, 0)
  if (total > bubbles.length * maxChars) {
    /* 物理上装不下（> maxBubbles × maxChars）：保留全部内容，最后一个气泡必然超长 */
    return [...bubbles]
  }
  const size = Math.ceil(total / bubbles.length)
  const content = bubbles.join('')
  const balanced: string[] = []
  for (let offset = 0; offset < content.length; offset += size) {
    balanced.push(content.slice(offset, offset + size))
  }
  return balanced
}

/**
 * 把一条助手消息切分成 1–maxBubbles 个气泡。
 *
 * - 按 `。！？!?…` 与换行切分，标点保留；
 * - 过短片段（< MIN_BUBBLE_CHARS）并入相邻气泡；
 * - 单气泡尽量不超过 maxChars，超长在 maxChars 处硬切；
 * - 气泡数超过 maxBubbles 时，余下内容并入最后一个气泡；
 * - 空串/纯空白返回 []，结果稳定（同一输入重复调用一致）。
 */
export function splitIntoBubbles(
  content: string,
  maxBubbles: number = MAX_BUBBLES,
  maxChars: number = MAX_BUBBLE_CHARS
): string[] {
  const bubbleLimit = Math.max(1, Math.floor(maxBubbles))
  const charsLimit = Math.max(1, Math.floor(maxChars))

  const sentences = splitSentences(content)
  if (sentences.length === 0) {
    return []
  }

  const merged = mergeShortFragments(sentences, charsLimit)
  const cut = cutLongBubbles(merged, charsLimit)
  const capped = capBubbles(cut, bubbleLimit)
  return rebalanceToMaxChars(capped, charsLimit)
}

/**
 * 气泡出现前的延迟（毫秒），由气泡长度决定，结果是确定值：
 * - 首个气泡 800–2000ms；
 * - 后续气泡 1500–4000ms。
 */
export function bubbleDelayMs(text: string, index: number): number {
  const length = Math.min(Math.max(text.length, 0), MAX_BUBBLE_CHARS)
  const ratio = length / MAX_BUBBLE_CHARS
  if (index <= 0) {
    return Math.round(800 + ratio * 1200)
  }
  return Math.round(1500 + ratio * 2500)
}
