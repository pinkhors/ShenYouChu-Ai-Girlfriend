import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPRESSION_AUTO_MAX,
  EXPRESSION_AUTO_MIN,
  calculateExpressionTemperature,
  formatTemperature,
  formatTemperatureDelta,
  resolveBaseTemperature,
  resolveEffectiveTemperature
} from '../src/renderer/src/character/expressionTemperature'
import {
  DEFAULT_AVATAR,
  type AvatarConfig
} from '../src/renderer/src/avatar/avatarConfig'
import {
  DEFAULT_EXPRESSION,
  DEFAULT_PERSONALITY,
  PERSONALITY_ARCHETYPES,
  type PersonalityConfig
} from '../src/renderer/src/character/characterTypes'

/**
 * 前端镜像必须与 docs/09-expression-temperature-and-proactive-message.md §7 完全一致。
 * 这些断言同时起到“后端公式/文案变更提醒”的作用。
 */

/** 形象贡献只保留奶油白 +0.01，其余字段取 0，便于隔离主性格等单项。 */
const NEUTRAL_AVATAR: AvatarConfig = {
  ...DEFAULT_AVATAR,
  outfitStyle: 'casual',
  hairStyle: 'updo',
  outfitColor: 'cream'
}

function avatar(overrides: Partial<AvatarConfig>): AvatarConfig {
  return { ...NEUTRAL_AVATAR, ...overrides }
}

function personality(overrides: Partial<PersonalityConfig>): PersonalityConfig {
  return { ...DEFAULT_PERSONALITY, modifiers: [], ...overrides }
}

test('§7.2 八个主性格的增量与解释文案逐项一致', () => {
  const cases = [
    ['gentle', '温柔治愈', '-0.05', 0.74],
    ['tsundere', '傲娇嘴硬', '+0.03', 0.82],
    ['lively', '活泼元气', '+0.12', 0.91],
    ['cool', '清冷慢热', '-0.12', 0.67],
    ['intellectual', '知性从容', '-0.03', 0.76],
    ['lazy', '慵懒松弛', '+0.02', 0.81],
    ['reliable', '认真可靠', '-0.08', 0.71],
    ['whimsical', '古灵精怪', '+0.15', 0.94]
  ] as const

  for (const [archetype, label, delta, expected] of cases) {
    const result = calculateExpressionTemperature(
      personality({ archetype }),
      NEUTRAL_AVATAR
    )
    assert.equal(
      result.autoTemperature,
      expected,
      `${label} 的自动温度应为 ${expected}`
    )
    assert.ok(
      result.explanation.includes(`主性格 ${label} ${delta}`),
      `${label} 的解释应包含增量 ${delta}，实际：${result.explanation.join(' / ')}`
    )
  }

  /* 文案镜像与角色目录不能漂移 */
  assert.deepEqual(
    cases.map(([id]) => id),
    PERSONALITY_ARCHETYPES.map((item) => item.id)
  )
  for (const item of PERSONALITY_ARCHETYPES) {
    const matched = cases.find(([id]) => id === item.id)
    assert.equal(matched?.[1], item.label, `主性格 ${item.id} 的文案漂移`)
  }
})

test('§7.3 调味标签合计夹取到 ±0.08', () => {
  const positive = calculateExpressionTemperature(
    personality({
      modifiers: ['soft-tsundere', 'affectionate', 'teasing', 'clingy']
    }),
    NEUTRAL_AVATAR
  )
  /* 0.78 - 0.05 + clamp(0.12, ±0.08) + 0 + 0.01 */
  assert.equal(positive.autoTemperature, 0.82)
  assert.ok(
    positive.explanation.includes('调味 小傲娇、爱撒娇、爱吐槽、黏人 +0.08'),
    positive.explanation.join(' / ')
  )

  const negative = calculateExpressionTemperature(
    personality({ modifiers: ['slow-warm', 'attentive', 'independent'] }),
    NEUTRAL_AVATAR
  )
  /* 0.78 - 0.05 + clamp(-0.11, ±0.08) + 0 + 0.01 */
  assert.equal(negative.autoTemperature, 0.66)
  assert.ok(
    negative.explanation.includes('调味 慢热、细心、独立 -0.08'),
    negative.explanation.join(' / ')
  )
})

test('§7.4 表达强度三档映射', () => {
  const low = calculateExpressionTemperature(
    personality({ intensity: 'low' }),
    NEUTRAL_AVATAR
  )
  assert.equal(low.autoTemperature, 0.66)
  assert.ok(low.explanation.includes('表达 克制 -0.08'))

  const medium = calculateExpressionTemperature(
    personality({ intensity: 'medium' }),
    NEUTRAL_AVATAR
  )
  assert.equal(medium.autoTemperature, 0.74)
  assert.ok(medium.explanation.includes('表达 自然 +0.00'))

  const high = calculateExpressionTemperature(
    personality({ intensity: 'high' }),
    NEUTRAL_AVATAR
  )
  assert.equal(high.autoTemperature, 0.82)
  assert.ok(high.explanation.includes('表达 明显 +0.08'))
})

test('§7.5 形象三字段合计夹取到 ±0.05', () => {
  const positive = calculateExpressionTemperature(
    personality({}),
    avatar({ outfitStyle: 'sporty', hairStyle: 'twin-tails', outfitColor: 'blush' })
  )
  /* 0.78 - 0.05 + 0 + 0 + clamp(0.08, ±0.05) */
  assert.equal(positive.autoTemperature, 0.78)
  assert.ok(
    positive.explanation.includes('形象 双马尾、运动活力、烟粉 +0.05'),
    positive.explanation.join(' / ')
  )

  const negative = calculateExpressionTemperature(
    personality({}),
    avatar({ outfitStyle: 'commute', hairStyle: 'long-straight', outfitColor: 'ink' })
  )
  /* 0.78 - 0.05 + 0 + 0 + clamp(-0.06, ±0.05) */
  assert.equal(negative.autoTemperature, 0.68)
  assert.ok(
    negative.explanation.includes('形象 长直发、通勤简约、墨黑 -0.05'),
    negative.explanation.join(' / ')
  )

  /* 与后端一致：只列出有贡献的字段（casual 与 updo 为 0，不出现） */
  const onlyColor = calculateExpressionTemperature(personality({}), NEUTRAL_AVATAR)
  assert.ok(
    onlyColor.explanation.includes('形象 奶油白 +0.01'),
    onlyColor.explanation.join(' / ')
  )
})

test('§7.7 三个示例分别得到 0.74 / 0.95 / 0.50', () => {
  const gentle = calculateExpressionTemperature(
    personality({ archetype: 'gentle', modifiers: ['soft-tsundere'], intensity: 'medium' }),
    avatar({ outfitStyle: 'casual', hairStyle: 'long-straight', outfitColor: 'cream' })
  )
  assert.equal(gentle.autoTemperature, 0.74)
  assert.deepEqual(gentle.explanation, [
    '基础 0.78',
    '主性格 温柔治愈 -0.05',
    '调味 小傲娇 +0.02',
    '表达 自然 +0.00',
    '形象 长直发、奶油白 -0.01',
    '夹取后 0.74'
  ])

  const lively = calculateExpressionTemperature(
    personality({ archetype: 'lively', modifiers: ['affectionate'], intensity: 'high' }),
    avatar({ outfitStyle: 'sporty', hairStyle: 'twin-tails', outfitColor: 'blush' })
  )
  assert.equal(lively.autoTemperature, 0.95)

  const cool = calculateExpressionTemperature(
    personality({ archetype: 'cool', modifiers: ['slow-warm'], intensity: 'low' }),
    avatar({ outfitStyle: 'commute', hairStyle: 'short', outfitColor: 'ink' })
  )
  assert.equal(cool.autoTemperature, 0.50)
})

test('§7.1 自动值夹取到 0.50–0.95', () => {
  const maximum = calculateExpressionTemperature(
    personality({
      archetype: 'whimsical',
      modifiers: ['affectionate', 'teasing'],
      intensity: 'high'
    }),
    avatar({ outfitStyle: 'sporty', hairStyle: 'twin-tails', outfitColor: 'blush' })
  )
  assert.equal(maximum.autoTemperature, EXPRESSION_AUTO_MAX)
  assert.equal(maximum.explanation[5], '夹取后 0.95')

  const minimum = calculateExpressionTemperature(
    personality({ archetype: 'cool', modifiers: ['slow-warm'], intensity: 'low' }),
    avatar({ outfitStyle: 'commute', hairStyle: 'long-straight', outfitColor: 'ink' })
  )
  assert.equal(minimum.autoTemperature, EXPRESSION_AUTO_MIN)
  assert.equal(minimum.explanation[5], '夹取后 0.50')
})

test('§7.1 手动覆盖优先，auto 忽略 override', () => {
  assert.equal(
    resolveBaseTemperature(0.74, { mode: 'manual', temperatureOverride: 0.91 }),
    0.91
  )
  assert.equal(
    resolveBaseTemperature(0.74, { mode: 'auto', temperatureOverride: 1.1 }),
    0.74
  )
  /* manual 缺 override 时退回自动值，不抛错 */
  assert.equal(
    resolveBaseTemperature(0.74, { mode: 'manual', temperatureOverride: null }),
    0.74
  )
  assert.equal(
    resolveBaseTemperature(0.74, { mode: 'manual', temperatureOverride: 1.5 }),
    1.5
  )
  /* 越界覆盖由最终夹取兜底 */
  assert.equal(
    resolveEffectiveTemperature(0.74, { mode: 'manual', temperatureOverride: 1.5 }),
    1.2
  )
})

test('§7.6 场景偏移叠加后夹取到 0.30–1.20', () => {
  assert.equal(
    resolveEffectiveTemperature(0.74, DEFAULT_EXPRESSION, 'REPLY'),
    0.74
  )
  assert.equal(
    resolveEffectiveTemperature(0.74, DEFAULT_EXPRESSION, 'PROACTIVE_SHARE'),
    0.79
  )
  assert.equal(
    resolveEffectiveTemperature(0.74, DEFAULT_EXPRESSION, 'PROACTIVE_FOLLOW_UP'),
    0.71
  )
  assert.equal(
    resolveEffectiveTemperature(0.74, DEFAULT_EXPRESSION, 'PROACTIVE_REMINDER'),
    0.68
  )

  const manual = { mode: 'manual', temperatureOverride: 0.3 } as const
  /* 0.30 - 0.06 后仍夹到下限 */
  assert.equal(
    resolveEffectiveTemperature(0.74, manual, 'PROACTIVE_REMINDER'),
    0.3
  )
  /* 1.18 + 0.05 超过上限 */
  assert.equal(
    resolveEffectiveTemperature(0.74, { mode: 'manual', temperatureOverride: 1.18 }, 'PROACTIVE_SHARE'),
    1.2
  )
})

test('格式化辅助函数固定两位小数与符号', () => {
  assert.equal(formatTemperature(0.7), '0.70')
  assert.equal(formatTemperature(1.2), '1.20')
  assert.equal(formatTemperatureDelta(0), '+0.00')
  assert.equal(formatTemperatureDelta(0.02), '+0.02')
  assert.equal(formatTemperatureDelta(-0.05), '-0.05')
  assert.equal(formatTemperatureDelta(-0.001), '+0.00')
})