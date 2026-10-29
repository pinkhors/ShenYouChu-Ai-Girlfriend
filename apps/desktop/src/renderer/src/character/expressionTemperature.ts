import {
  HAIR_STYLES,
  OUTFIT_COLORS,
  OUTFIT_STYLES,
  type AvatarConfig,
  type HairStyleId,
  type OutfitColorId,
  type OutfitStyleId
} from '../avatar/avatarConfig'
import type {
  ExpressionConfig,
  IntensityId,
  PersonalityArchetypeId,
  PersonalityConfig,
  PersonalityModifierId
} from './characterTypes'

/**
 * 表达温度推导（前端预览镜像）。
 *
 * 权威实现在后端（docs/09-expression-temperature-and-proactive-message.md §7）。
 * 本文件是无 DOM 的纯函数，仅用于角色编辑页在“尚未保存”时即时显示自动值与解释；
 * 保存后以服务端返回的 `expression` 快照为准。
 *
 * 以后端为准：改动 §7 的系数、夹取范围或解释文案时，必须同步修改本文件与
 * `com.shenyouchu.core.expression` 的推导器，否则预览值与保存后的值会不一致。
 */

/** 推导基线。 */
export const EXPRESSION_BASE_TEMPERATURE = 0.78

/** 自动值夹取范围（§7.1）。 */
export const EXPRESSION_AUTO_MIN = 0.5
export const EXPRESSION_AUTO_MAX = 0.95

/** 最终生效值（手动覆盖 + 场景偏移后）的夹取范围（§7.1 / §5.1 滑块）。 */
export const EXPRESSION_TEMPERATURE_MIN = 0.3
export const EXPRESSION_TEMPERATURE_MAX = 1.2

/** 调味标签合计夹取范围（§7.3）。 */
const MODIFIER_DELTA_MIN = -0.08
const MODIFIER_DELTA_MAX = 0.08

/** 形象合计夹取范围（§7.5）。 */
const APPEARANCE_DELTA_MIN = -0.05
const APPEARANCE_DELTA_MAX = 0.05

/** 主性格映射（§7.2）。 */
const ARCHETYPE_DELTAS: Readonly<Record<PersonalityArchetypeId, number>> = {
  gentle: -0.05,
  tsundere: 0.03,
  lively: 0.12,
  cool: -0.12,
  intellectual: -0.03,
  lazy: 0.02,
  reliable: -0.08,
  whimsical: 0.15
}

/**
 * 文案镜像：与 `PERSONALITY_ARCHETYPES` 的 label 一致。
 * 此处独立写死是为了让本文件不反向依赖 characterTypes（后者会引用本模块做旧数据回退）；
 * `expressionTemperature.test.ts` 会逐个断言两处文案没有漂移。
 */
const ARCHETYPE_LABELS: Readonly<Record<PersonalityArchetypeId, string>> = {
  gentle: '温柔治愈',
  tsundere: '傲娇嘴硬',
  lively: '活泼元气',
  cool: '清冷慢热',
  intellectual: '知性从容',
  lazy: '慵懒松弛',
  reliable: '认真可靠',
  whimsical: '古灵精怪'
}

/** 调味标签映射（§7.3）。 */
const MODIFIER_DELTAS: Readonly<Record<PersonalityModifierId, number>> = {
  'soft-tsundere': 0.02,
  affectionate: 0.03,
  'slow-warm': -0.06,
  teasing: 0.04,
  attentive: -0.02,
  romantic: 0.03,
  independent: -0.03,
  clingy: 0.03
}

const MODIFIER_LABELS: Readonly<Record<PersonalityModifierId, string>> = {
  'soft-tsundere': '小傲娇',
  affectionate: '爱撒娇',
  'slow-warm': '慢热',
  teasing: '爱吐槽',
  attentive: '细心',
  romantic: '浪漫',
  independent: '独立',
  clingy: '黏人'
}

/** 表达强度映射（§7.4）。 */
const INTENSITY_DELTAS: Readonly<Record<IntensityId, number>> = {
  low: -0.08,
  medium: 0,
  high: 0.08
}

const INTENSITY_LABELS: Readonly<Record<IntensityId, string>> = {
  low: '克制',
  medium: '自然',
  high: '明显'
}

/** 服饰风格（§7.5）。 */
const OUTFIT_STYLE_DELTAS: Readonly<Record<OutfitStyleId, number>> = {
  sporty: 0.03,
  campus: 0.02,
  casual: 0,
  knit: -0.01,
  vintage: 0.01,
  commute: -0.02,
  home: -0.02
}

/** 发型（§7.5）。 */
const HAIR_STYLE_DELTAS: Readonly<Record<HairStyleId, number>> = {
  'twin-tails': 0.03,
  ponytail: 0.02,
  short: 0.02,
  bob: 0.01,
  'long-wave': 0.01,
  'long-straight': -0.02,
  updo: 0
}

/** 服饰颜色（§7.5）。 */
const OUTFIT_COLOR_DELTAS: Readonly<Record<OutfitColorId, number>> = {
  blush: 0.02,
  cream: 0.01,
  sage: -0.01,
  ink: -0.02,
  navy: -0.02
}

/** 场景偏移（§7.6）；REPLY 为普通回复。 */
export type ExpressionScene =
  | 'REPLY'
  | 'PROACTIVE_SHARE'
  | 'PROACTIVE_FOLLOW_UP'
  | 'PROACTIVE_REMINDER'

export const SCENE_TEMPERATURE_OFFSETS: Readonly<Record<ExpressionScene, number>> = {
  REPLY: 0,
  PROACTIVE_SHARE: 0.05,
  PROACTIVE_FOLLOW_UP: -0.03,
  PROACTIVE_REMINDER: -0.06
}

/** 角色编辑页滑块的刻度文案（§5.1）。 */
export const TEMPERATURE_SCALE_TICKS = [
  { value: 0.5, label: '克制' },
  { value: 0.7, label: '自然' },
  { value: 0.85, label: '灵动' },
  { value: 1.0, label: '跳跃' }
] as const

export interface ExpressionTemperatureResult {
  readonly autoTemperature: number
  /** 固定顺序：基础 → 主性格 → 调味 → 表达 → 形象 → 夹取。 */
  readonly explanation: readonly string[]
}

function clampTemperature(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 保留 2 位小数（四舍五入），并消除 `-0`。 */
export function roundTemperature(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

/** 两位小数展示，例如 0.74 / 1.20。 */
export function formatTemperature(value: number): string {
  return roundTemperature(value).toFixed(2)
}

/** 带符号的贡献值，例如 +0.02 / -0.05 / +0.00。 */
export function formatTemperatureDelta(value: number): string {
  const rounded = roundTemperature(value)
  if (rounded === 0) {
    return '+0.00'
  }
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(2)}`
}

function labelOf<T extends { id: string; label: string }>(
  list: readonly T[],
  id: string
): string | null {
  return list.find((item) => item.id === id)?.label ?? null
}

/**
 * 形象行与服务端一致：只列出实际产生贡献的字段（发型 → 服饰风格 → 服饰颜色），
 * 全部为 0 时显示“无”；数字始终是三字段夹取后的合计。
 */
function appearanceLabel(
  hairStyle: string,
  hairDelta: number,
  outfitStyle: string,
  outfitDelta: number,
  outfitColor: string,
  colorDelta: number
): string {
  const labels: string[] = []
  const add = (label: string | null): void => {
    if (label !== null && label !== '' && !labels.includes(label)) {
      labels.push(label)
    }
  }
  if (hairDelta !== 0) {
    add(labelOf(HAIR_STYLES, hairStyle))
  }
  if (outfitDelta !== 0) {
    add(labelOf(OUTFIT_STYLES, outfitStyle))
  }
  if (colorDelta !== 0) {
    add(labelOf(OUTFIT_COLORS, outfitColor))
  }
  return labels.length === 0 ? '无' : labels.join('、')
}

/**
 * 按 §7 推导自动温度与可读解释。
 *
 * 纯函数：不读取时间、随机数或 DOM，相同输入永远得到相同输出。
 * 解释文案（分隔符、形象只列有贡献项）与后端
 * `ExpressionTemperatureCalculator` 保持一致，保存前后可直接对照。
 */
export function calculateExpressionTemperature(
  personality: PersonalityConfig,
  avatar: AvatarConfig
): ExpressionTemperatureResult {
  const archetypeDelta = ARCHETYPE_DELTAS[personality.archetype] ?? 0

  const modifierDelta = clampTemperature(
    personality.modifiers.reduce((sum, id) => sum + (MODIFIER_DELTAS[id] ?? 0), 0),
    MODIFIER_DELTA_MIN,
    MODIFIER_DELTA_MAX
  )

  const intensityDelta = INTENSITY_DELTAS[personality.intensity] ?? 0

  const outfitStyleDelta = OUTFIT_STYLE_DELTAS[avatar.outfitStyle] ?? 0
  const hairStyleDelta = HAIR_STYLE_DELTAS[avatar.hairStyle] ?? 0
  const outfitColorDelta = OUTFIT_COLOR_DELTAS[avatar.outfitColor] ?? 0
  const appearanceDelta = clampTemperature(
    outfitStyleDelta + hairStyleDelta + outfitColorDelta,
    APPEARANCE_DELTA_MIN,
    APPEARANCE_DELTA_MAX
  )

  const raw = roundTemperature(
    EXPRESSION_BASE_TEMPERATURE + archetypeDelta + modifierDelta + intensityDelta + appearanceDelta
  )
  const autoTemperature = roundTemperature(
    clampTemperature(raw, EXPRESSION_AUTO_MIN, EXPRESSION_AUTO_MAX)
  )

  const modifierLabels = personality.modifiers
    .map((id) => MODIFIER_LABELS[id])
    .filter((label): label is string => typeof label === 'string')

  const explanation = [
    `基础 ${formatTemperature(EXPRESSION_BASE_TEMPERATURE)}`,
    `主性格 ${ARCHETYPE_LABELS[personality.archetype] ?? '未知'} ${formatTemperatureDelta(archetypeDelta)}`,
    `调味 ${modifierLabels.length === 0 ? '无' : modifierLabels.join('、')} ${formatTemperatureDelta(modifierDelta)}`,
    `表达 ${INTENSITY_LABELS[personality.intensity] ?? '未知'} ${formatTemperatureDelta(intensityDelta)}`,
    `形象 ${appearanceLabel(
      avatar.hairStyle,
      hairStyleDelta,
      avatar.outfitStyle,
      outfitStyleDelta,
      avatar.outfitColor,
      outfitColorDelta
    )} ${formatTemperatureDelta(appearanceDelta)}`,
    `夹取后 ${formatTemperature(autoTemperature)}`
  ]

  return { autoTemperature, explanation }
}

/**
 * 解析基础温度：manual 且 override 合法时优先，否则用自动值（§7.1）。
 * 与后端解析器一致：auto 模式忽略 override；此处不做上下限夹取，
 * 由 `resolveEffectiveTemperature` 在叠加场景偏移后统一夹取。
 */
export function resolveBaseTemperature(
  autoTemperature: number,
  expression: Pick<ExpressionConfig, 'mode' | 'temperatureOverride'>
): number {
  if (expression.mode === 'manual') {
    const override = expression.temperatureOverride
    if (typeof override === 'number' && Number.isFinite(override)) {
      return roundTemperature(override)
    }
  }
  return roundTemperature(autoTemperature)
}

/** 叠加场景偏移并夹取到 0.30–1.20（§7.1 / §7.6）。 */
export function resolveEffectiveTemperature(
  autoTemperature: number,
  expression: Pick<ExpressionConfig, 'mode' | 'temperatureOverride'>,
  scene: ExpressionScene = 'REPLY'
): number {
  const base = resolveBaseTemperature(autoTemperature, expression)
  const offset = SCENE_TEMPERATURE_OFFSETS[scene] ?? 0
  return roundTemperature(
    clampTemperature(base + offset, EXPRESSION_TEMPERATURE_MIN, EXPRESSION_TEMPERATURE_MAX)
  )
}