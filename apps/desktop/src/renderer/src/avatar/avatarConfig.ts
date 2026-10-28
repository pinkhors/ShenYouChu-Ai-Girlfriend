/**
 * 捏脸参数模型（纯逻辑，不依赖 DOM，可在 Node 测试中直接编译）。
 *
 * 设计目标：
 * - 参数是**可序列化的有限枚举 + 0..1 连续值**，便于本地保存与后续迁移到后端；
 * - 渲染层只消费 AvatarConfig，不反向修改状态，未来可把 SVG 预览替换为生成式写实渲染；
 * - normalizeAvatar 对任何脏数据都给出合法配置，避免损坏的本地数据把界面卡死。
 */

export const SKIN_TONES = [
  { id: 'porcelain', label: '瓷白', base: '#f8e3d6', shadow: '#e6bfae', highlight: '#fff4ee' },
  { id: 'natural', label: '自然', base: '#f2cdb8', shadow: '#d8a68c', highlight: '#fbe3d6' },
  { id: 'honey', label: '暖蜜', base: '#e3b090', shadow: '#c1876a', highlight: '#f3d0b8' },
  { id: 'wheat', label: '小麦', base: '#c98f6d', shadow: '#a36c4d', highlight: '#e3b493' }
] as const

export type SkinToneId = (typeof SKIN_TONES)[number]['id']

export const HAIR_COLORS = [
  { id: 'black', label: '墨黑', base: '#2a2320', shadow: '#171210', highlight: '#544640' },
  { id: 'brown', label: '深棕', base: '#4a3326', shadow: '#2f1f17', highlight: '#7a5740' },
  { id: 'chestnut', label: '栗色', base: '#6d4430', shadow: '#4a2c1e', highlight: '#9c6644' },
  { id: 'flaxen', label: '亚麻', base: '#b0854f', shadow: '#8a6538', highlight: '#d8b078' },
  { id: 'rose', label: '玫瑰', base: '#a85a68', shadow: '#7e3d49', highlight: '#cf8b96' },
  { id: 'silver', label: '银灰', base: '#b9b4b2', shadow: '#8e8886', highlight: '#e3dfdc' }
] as const

export type HairColorId = (typeof HAIR_COLORS)[number]['id']

export const HAIR_STYLES = [
  { id: 'long-straight', label: '长直发' },
  { id: 'long-wave', label: '波浪长发' },
  { id: 'bob', label: '齐肩短发' },
  { id: 'twin-tails', label: '双马尾' },
  { id: 'updo', label: '低盘发' }
] as const

export type HairStyleId = (typeof HAIR_STYLES)[number]['id']

export const EYE_COLORS = [
  { id: 'dark', label: '深棕', iris: '#4a2f22', ring: '#2a1a12' },
  { id: 'amber', label: '琥珀', iris: '#a3662c', ring: '#6d3f16' },
  { id: 'green', label: '松绿', iris: '#4d7a5f', ring: '#2f5240' },
  { id: 'blue', label: '雾蓝', iris: '#577b9e', ring: '#35536f' },
  { id: 'violet', label: '紫藤', iris: '#7a628f', ring: '#514064' }
] as const

export type EyeColorId = (typeof EYE_COLORS)[number]['id']

export const BROW_STYLES = [
  { id: 'soft', label: '柔弧' },
  { id: 'straight', label: '平直' },
  { id: 'arch', label: '上挑' }
] as const

export type BrowStyleId = (typeof BROW_STYLES)[number]['id']

export const LIP_COLORS = [
  { id: 'rose', label: '玫瑰', base: '#c2636c', dark: '#9e4652', swatch: '#c2636c' },
  { id: 'coral', label: '珊瑚', base: '#d9796f', dark: '#b4564e', swatch: '#d9796f' },
  { id: 'berry', label: '莓果', base: '#a94f68', dark: '#7f354c', swatch: '#a94f68' },
  { id: 'nude', label: '裸粉', base: '#cf8f86', dark: '#a96b63', swatch: '#cf8f86' }
] as const

export type LipColorId = (typeof LIP_COLORS)[number]['id']

export const OUTFIT_COLORS = [
  { id: 'cream', label: '奶油白', base: '#f3ece2', shade: '#ddd1c2' },
  { id: 'ink', label: '墨黑', base: '#2b2b30', shade: '#1b1b1f' },
  { id: 'sage', label: '灰绿', base: '#9db3a2', shade: '#7f9785' },
  { id: 'blush', label: '烟粉', base: '#e3b7bf', shade: '#c9979f' },
  { id: 'navy', label: '藏青', base: '#3c4a63', shade: '#2b364a' }
] as const

export type OutfitColorId = (typeof OUTFIT_COLORS)[number]['id']

export const ACCESSORIES = [
  { id: 'none', label: '无' },
  { id: 'earrings', label: '耳饰' },
  { id: 'hairpin', label: '发饰' },
  { id: 'glasses', label: '眼镜' }
] as const

export type AccessoryId = (typeof ACCESSORIES)[number]['id']

export interface AvatarConfig {
  readonly skinTone: SkinToneId
  readonly hairStyle: HairStyleId
  readonly hairColor: HairColorId
  /** 0 = 圆脸，1 = 鹅蛋脸 */
  readonly faceShape: number
  readonly eyeColor: EyeColorId
  /** 0 = 细长，1 = 圆大 */
  readonly eyeSize: number
  /** 0 = 眼距近，1 = 眼距宽 */
  readonly eyeSpacing: number
  readonly browStyle: BrowStyleId
  readonly lipColor: LipColorId
  /** 0 = 薄唇，1 = 厚唇 */
  readonly lipFullness: number
  /** 0 = 无腮红，1 = 明显 */
  readonly blush: number
  readonly outfitColor: OutfitColorId
  readonly accessory: AccessoryId
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skinTone: 'natural',
  hairStyle: 'long-straight',
  hairColor: 'black',
  faceShape: 0.6,
  eyeColor: 'dark',
  eyeSize: 0.55,
  eyeSpacing: 0.5,
  browStyle: 'soft',
  lipColor: 'rose',
  lipFullness: 0.5,
  blush: 0.35,
  outfitColor: 'cream',
  accessory: 'none'
}

export interface AvatarPreset {
  readonly id: string
  readonly name: string
  readonly hint: string
  readonly config: AvatarConfig
}

export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  {
    id: 'gentle',
    name: '温柔',
    hint: '栗色波浪发 · 琥珀眼 · 发饰',
    config: {
      ...DEFAULT_AVATAR,
      hairStyle: 'long-wave',
      hairColor: 'chestnut',
      faceShape: 0.6,
      eyeColor: 'amber',
      browStyle: 'soft',
      lipColor: 'coral',
      blush: 0.45,
      outfitColor: 'cream',
      accessory: 'hairpin'
    }
  },
  {
    id: 'cool',
    name: '清冷',
    hint: '墨黑长直 · 深棕眼 · 耳饰',
    config: {
      ...DEFAULT_AVATAR,
      hairStyle: 'long-straight',
      hairColor: 'black',
      faceShape: 0.7,
      eyeColor: 'dark',
      browStyle: 'straight',
      lipColor: 'berry',
      lipFullness: 0.4,
      blush: 0.18,
      outfitColor: 'navy',
      accessory: 'earrings'
    }
  },
  {
    id: 'vivid',
    name: '元气',
    hint: '双马尾 · 亚麻发 · 珊瑚唇',
    config: {
      ...DEFAULT_AVATAR,
      hairStyle: 'twin-tails',
      hairColor: 'flaxen',
      faceShape: 0.35,
      eyeColor: 'amber',
      eyeSize: 0.7,
      browStyle: 'arch',
      lipColor: 'coral',
      blush: 0.55,
      outfitColor: 'blush',
      accessory: 'hairpin'
    }
  },
  {
    id: 'scholar',
    name: '知性',
    hint: '齐肩短发 · 松绿眼 · 眼镜',
    config: {
      ...DEFAULT_AVATAR,
      hairStyle: 'bob',
      hairColor: 'brown',
      faceShape: 0.5,
      eyeColor: 'green',
      browStyle: 'straight',
      lipColor: 'nude',
      lipFullness: 0.35,
      blush: 0.22,
      outfitColor: 'sage',
      accessory: 'glasses'
    }
  }
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberIn(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback
}

function oneOf<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return typeof value === 'string' && (ids as readonly string[]).includes(value) ? (value as T) : fallback
}

const SKIN_IDS = SKIN_TONES.map((item) => item.id)
const HAIR_STYLE_IDS = HAIR_STYLES.map((item) => item.id)
const HAIR_COLOR_IDS = HAIR_COLORS.map((item) => item.id)
const EYE_IDS = EYE_COLORS.map((item) => item.id)
const BROW_IDS = BROW_STYLES.map((item) => item.id)
const LIP_IDS = LIP_COLORS.map((item) => item.id)
const OUTFIT_IDS = OUTFIT_COLORS.map((item) => item.id)
const ACCESSORY_IDS = ACCESSORIES.map((item) => item.id)

/** 把任意来源（本地存储、旧版本、手改 JSON）的数据收敛为合法配置。 */
export function normalizeAvatar(value: unknown): AvatarConfig {
  if (!isRecord(value)) {
    return DEFAULT_AVATAR
  }
  return {
    skinTone: oneOf(value.skinTone, SKIN_IDS, DEFAULT_AVATAR.skinTone),
    hairStyle: oneOf(value.hairStyle, HAIR_STYLE_IDS, DEFAULT_AVATAR.hairStyle),
    hairColor: oneOf(value.hairColor, HAIR_COLOR_IDS, DEFAULT_AVATAR.hairColor),
    faceShape: numberIn(value.faceShape, DEFAULT_AVATAR.faceShape),
    eyeColor: oneOf(value.eyeColor, EYE_IDS, DEFAULT_AVATAR.eyeColor),
    eyeSize: numberIn(value.eyeSize, DEFAULT_AVATAR.eyeSize),
    eyeSpacing: numberIn(value.eyeSpacing, DEFAULT_AVATAR.eyeSpacing),
    browStyle: oneOf(value.browStyle, BROW_IDS, DEFAULT_AVATAR.browStyle),
    lipColor: oneOf(value.lipColor, LIP_IDS, DEFAULT_AVATAR.lipColor),
    lipFullness: numberIn(value.lipFullness, DEFAULT_AVATAR.lipFullness),
    blush: numberIn(value.blush, DEFAULT_AVATAR.blush),
    outfitColor: oneOf(value.outfitColor, OUTFIT_IDS, DEFAULT_AVATAR.outfitColor),
    accessory: oneOf(value.accessory, ACCESSORY_IDS, DEFAULT_AVATAR.accessory)
  }
}

/** 反序列化：空值、坏 JSON、结构不符都退回默认形象，而不是抛错。 */
export function deserializeAvatar(raw: string | null): AvatarConfig {
  if (raw === null || raw === '') {
    return DEFAULT_AVATAR
  }
  try {
    return normalizeAvatar(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_AVATAR
  }
}

export function serializeAvatar(config: AvatarConfig): string {
  return JSON.stringify(config)
}

function pick<T>(list: readonly T[], random: () => number): T {
  const index = Math.min(list.length - 1, Math.max(0, Math.floor(random() * list.length)))
  return list[index] ?? list[0]
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

/** 随机形象：用于“摇一摇”式换装，保持同一套参数空间。 */
export function randomizeAvatar(random: () => number = Math.random): AvatarConfig {
  return {
    skinTone: pick(SKIN_TONES, random).id,
    hairStyle: pick(HAIR_STYLES, random).id,
    hairColor: pick(HAIR_COLORS, random).id,
    faceShape: rounded(0.2 + random() * 0.7),
    eyeColor: pick(EYE_COLORS, random).id,
    eyeSize: rounded(0.3 + random() * 0.6),
    eyeSpacing: rounded(0.2 + random() * 0.6),
    browStyle: pick(BROW_STYLES, random).id,
    lipColor: pick(LIP_COLORS, random).id,
    lipFullness: rounded(0.25 + random() * 0.6),
    blush: rounded(0.1 + random() * 0.5),
    outfitColor: pick(OUTFIT_COLORS, random).id,
    accessory: pick(ACCESSORIES, random).id
  }
}

/** 参数级比较：用于“是否有未保存修改”，不依赖 JSON 键顺序。 */
export function isSameAvatar(left: AvatarConfig, right: AvatarConfig): boolean {
  return (Object.keys(DEFAULT_AVATAR) as (keyof AvatarConfig)[]).every(
    (key) => left[key] === right[key]
  )
}

function labelOf<T extends { id: string; label: string }>(list: readonly T[], id: T['id']): string {
  return list.find((item) => item.id === id)?.label ?? id
}

/** 供 aria-label / 文案使用的一句话描述。 */
export function describeAvatar(config: AvatarConfig): string {
  return [
    labelOf(HAIR_STYLES, config.hairStyle),
    labelOf(HAIR_COLORS, config.hairColor),
    labelOf(EYE_COLORS, config.eyeColor) + '眼睛',
    labelOf(LIP_COLORS, config.lipColor) + '唇色'
  ].join(' · ')
}

export function skinToneOf(id: SkinToneId): (typeof SKIN_TONES)[number] {
  return SKIN_TONES.find((item) => item.id === id) ?? SKIN_TONES[1]
}

export function hairColorOf(id: HairColorId): (typeof HAIR_COLORS)[number] {
  return HAIR_COLORS.find((item) => item.id === id) ?? HAIR_COLORS[0]
}

export function eyeColorOf(id: EyeColorId): (typeof EYE_COLORS)[number] {
  return EYE_COLORS.find((item) => item.id === id) ?? EYE_COLORS[0]
}

export function lipColorOf(id: LipColorId): (typeof LIP_COLORS)[number] {
  return LIP_COLORS.find((item) => item.id === id) ?? LIP_COLORS[0]
}

export function outfitColorOf(id: OutfitColorId): (typeof OUTFIT_COLORS)[number] {
  return OUTFIT_COLORS.find((item) => item.id === id) ?? OUTFIT_COLORS[0]
}
