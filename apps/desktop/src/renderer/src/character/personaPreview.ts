import {
  archetypeOf,
  modifierOf,
  type PersonalityConfig
} from './characterTypes'

/**
 * 性格试聊模板：纯本地拼装，不调用模型。
 * 作用不是预测真实回复，而是让用户立刻看到“这个性格 + 这个称呼”大概是什么味道。
 */

export interface PersonalityPreview {
  readonly lines: readonly string[]
  readonly tone: string
  readonly summary: string
}

function applyAddress(line: string, address: string): string {
  if (address === '' || address === '你') {
    return line
  }
  if (line.startsWith('你')) {
    return address + line.slice(1)
  }
  return `${address}，${line}`
}

export function buildPersonalityPreview(personality: PersonalityConfig): PersonalityPreview {
  const archetype = archetypeOf(personality.archetype)
  const address = personality.addressUser.trim() === '' ? '你' : personality.addressUser.trim()
  const modifiers = personality.modifiers.map((id) => modifierOf(id).label)
  const lines = [
    applyAddress(archetype.samples.tired, address),
    applyAddress(archetype.samples.praise, address),
    applyAddress(archetype.samples.jealous, address),
    applyAddress(archetype.samples.opening, address)
  ]
  const tone = [
    `表达：${intensityLabel(personality.intensity)}`,
    `主动：${initiativeLabel(personality.initiative)}`,
    `称呼：${address}`
  ].join(' · ')
  const summary = modifiers.length === 0
    ? archetype.summary
    : `${archetype.summary} 再加一点${modifiers.join('、')}。`
  return { lines, tone, summary }
}

export function intensityLabel(value: PersonalityConfig['intensity']): string {
  return value === 'low' ? '克制' : value === 'high' ? '明显' : '自然'
}

export function initiativeLabel(value: PersonalityConfig['initiative']): string {
  return value === 'low' ? '慢热' : value === 'high' ? '主动' : '适中'
}

/** 温度分档（PRD 09 §5.2）：<0.6 克制 / 0.6–0.85 自然 / >0.85 灵动。 */
export type TemperatureTone = 'restrained' | 'natural' | 'vivid'

export function temperatureTone(temperature: number): TemperatureTone {
  if (temperature < 0.6) {
    return 'restrained'
  }
  if (temperature > 0.85) {
    return 'vivid'
  }
  return 'natural'
}

/**
 * “她主动开场”的本地风格模板：只按温度分档换语气，不代表真实生成内容。
 * 保持与列表里其他示例一致的“风格示例，实际对话由模型生成”定位。
 */
const PROACTIVE_OPENINGS: Readonly<Record<TemperatureTone, string>> = {
  restrained: '今天没什么事，就是想说一声，我在。',
  natural: '今天路过一家店，忽然想到你。你吃饭了吗？',
  vivid: '在吗在吗！我今天遇到一件超好玩的事，第一个就想讲给你听，你猜是什么？'
}

export function buildProactiveOpeningLine(temperature: number, addressUser: string): string {
  const address = addressUser.trim() === '' ? '你' : addressUser.trim()
  return applyAddress(PROACTIVE_OPENINGS[temperatureTone(temperature)], address)
}
