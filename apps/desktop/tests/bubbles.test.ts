import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_BUBBLES,
  MAX_BUBBLE_CHARS,
  bubbleDelayMs,
  splitIntoBubbles
} from '../src/renderer/src/chat/bubbles'

/**
 * PRD 09 §5.4 / AC-18：助手消息按 1–3 个气泡、≤120 字/气泡稳定拆分；
 * 纯函数单测覆盖切分、合并、硬切、标点与延迟区间。
 */

const FIRST_SENTENCE = '今天下班路上看到一只很可爱的猫。'
const SECOND_SENTENCE = '它一直跟着我走了好远一段路。'
const THIRD_SENTENCE = '我蹲下来摸了摸它的头。'
const FOURTH_SENTENCE = '改天想带点猫粮去看看它。'

test('exported limits match the PRD contract', () => {
  assert.equal(MAX_BUBBLES, 3)
  assert.equal(MAX_BUBBLE_CHARS, 120)
})

test('a single sentence becomes one bubble', () => {
  assert.deepEqual(splitIntoBubbles('今天有点想你了。'), ['今天有点想你了。'])
  assert.deepEqual(splitIntoBubbles('晚安'), ['晚安'])
})

test('four sentences are capped at three bubbles', () => {
  const content = FIRST_SENTENCE + SECOND_SENTENCE + THIRD_SENTENCE + FOURTH_SENTENCE
  const bubbles = splitIntoBubbles(content)

  assert.equal(bubbles.length, 3)
  /* 余下句子并入最后一个气泡，内容与顺序不丢失 */
  assert.equal(bubbles.join(''), content)
  assert.ok(bubbles[2].includes(THIRD_SENTENCE))
  assert.ok(bubbles[2].includes(FOURTH_SENTENCE))
})

test('empty or whitespace-only content yields no bubbles', () => {
  assert.deepEqual(splitIntoBubbles(''), [])
  assert.deepEqual(splitIntoBubbles('   '), [])
  assert.deepEqual(splitIntoBubbles('\n \n\t'), [])
})

test('every bubble stays within the character limit', () => {
  const inputs = [
    FIRST_SENTENCE + SECOND_SENTENCE + THIRD_SENTENCE + FOURTH_SENTENCE,
    '长'.repeat(250) + '。',
    '短句。'.repeat(60)
  ]

  for (const input of inputs) {
    for (const bubble of splitIntoBubbles(input)) {
      assert.ok(
        bubble.length <= MAX_BUBBLE_CHARS,
        `bubble of ${bubble.length} chars exceeds ${MAX_BUBBLE_CHARS}`
      )
    }
  }
})

test('an overlong sentence is hard-cut at 120 chars without losing text', () => {
  const content = '长'.repeat(250) + '。'
  const bubbles = splitIntoBubbles(content)

  assert.equal(bubbles.length, 3)
  assert.deepEqual(
    bubbles.map((bubble) => bubble.length),
    [120, 120, 11]
  )
  assert.equal(bubbles.join(''), content)
})

test('short fragments merge instead of producing choppy bubbles', () => {
  assert.deepEqual(splitIntoBubbles('嗯。'), ['嗯。'])
  assert.deepEqual(splitIntoBubbles('嗯。好的，路上小心。'), ['嗯。好的，路上小心。'])
})

test('sentence punctuation is preserved in order', () => {
  const content = '你好呀，今天过得开心吗。我下午去了公园散步。晚上想你想到睡不着！'
  const bubbles = splitIntoBubbles(content)

  assert.deepEqual(bubbles, [
    '你好呀，今天过得开心吗。',
    '我下午去了公园散步。',
    '晚上想你想到睡不着！'
  ])
  assert.equal(bubbles.join(''), content)
})

test('ellipsis and exclamation runs stay attached to the sentence', () => {
  const bubbles = splitIntoBubbles('你终于回来了……我等了好一会儿！')

  assert.deepEqual(bubbles, ['你终于回来了……', '我等了好一会儿！'])
})

test('newlines also split bubbles', () => {
  const bubbles = splitIntoBubbles('第一句话写得长一些。\n第二句话也写得长一些。')

  assert.equal(bubbles.length, 2)
  assert.equal(bubbles.join(''), '第一句话写得长一些。第二句话也写得长一些。')
})

test('the same input always produces the same result', () => {
  const content = FIRST_SENTENCE + SECOND_SENTENCE + THIRD_SENTENCE + FOURTH_SENTENCE
  const first = splitIntoBubbles(content)
  const second = splitIntoBubbles(content)

  assert.deepEqual(first, second)
  assert.deepEqual(splitIntoBubbles('安静。'), splitIntoBubbles('安静。'))
})

test('first bubble delay is deterministic and within 800-2000ms', () => {
  for (const text of ['', '嗯', '中等长度的一句话。', '长'.repeat(MAX_BUBBLE_CHARS)]) {
    const delay = bubbleDelayMs(text, 0)
    assert.ok(Number.isInteger(delay), 'delay should be an integer number of ms')
    assert.ok(delay >= 800, `${delay} should be >= 800`)
    assert.ok(delay <= 2000, `${delay} should be <= 2000`)
  }

  assert.ok(bubbleDelayMs('长'.repeat(MAX_BUBBLE_CHARS), 0) > bubbleDelayMs('嗯', 0))
})

test('later bubble delays are deterministic and within 1500-4000ms', () => {
  for (const index of [1, 2]) {
    for (const text of ['', '嗯', '中等长度的一句话。', '长'.repeat(MAX_BUBBLE_CHARS)]) {
      const delay = bubbleDelayMs(text, index)
      assert.ok(Number.isInteger(delay), 'delay should be an integer number of ms')
      assert.ok(delay >= 1500, `${delay} should be >= 1500`)
      assert.ok(delay <= 4000, `${delay} should be <= 4000`)
    }
  }

  assert.ok(bubbleDelayMs('长'.repeat(MAX_BUBBLE_CHARS), 1) > bubbleDelayMs('嗯', 1))
})
