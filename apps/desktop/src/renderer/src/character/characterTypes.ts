import {
  DEFAULT_AVATAR,
  isSameAvatar,
  normalizeAvatar,
  type AvatarConfig
} from '../avatar/avatarConfig'
import {
  EXPRESSION_AUTO_MAX,
  EXPRESSION_AUTO_MIN,
  EXPRESSION_TEMPERATURE_MAX,
  EXPRESSION_TEMPERATURE_MIN,
  calculateExpressionTemperature,
  roundTemperature
} from './expressionTemperature'

/**
 * 角色设定的领域模型与选项目录（纯逻辑，可在 Node 测试）。
 *
 * 这里的 ID 必须与后端 CharacterCatalog 白名单一一对应；新增选项时前后端同时改，
 * 否则服务端会以 CHARACTER_OPTION_INVALID 拒绝保存。
 */

export const MAX_CUSTOM_CHARACTERS = 12
export const MIN_AGE = 18
export const MAX_AGE = 45
export const MAX_INTRO_LENGTH = 40
export const MAX_EXTRA_NOTE_LENGTH = 60
export const MAX_ADDRESS_LENGTH = 6
export const MAX_MODIFIERS = 2

export type PersonalityArchetypeId =
  | 'gentle'
  | 'tsundere'
  | 'lively'
  | 'cool'
  | 'intellectual'
  | 'lazy'
  | 'reliable'
  | 'whimsical'

export interface PersonalitySamples {
  readonly tired: string
  readonly praise: string
  readonly jealous: string
  readonly opening: string
}

export interface PersonalityArchetype {
  readonly id: PersonalityArchetypeId
  readonly label: string
  readonly keywords: readonly [string, string]
  readonly summary: string
  readonly care: string
  readonly conflict: string
  readonly speech: string
  readonly samples: PersonalitySamples
}

export const PERSONALITY_ARCHETYPES: readonly PersonalityArchetype[] = [
  {
    id: 'gentle',
    label: '温柔治愈',
    keywords: ['先接住情绪', '不逼问'],
    summary: '先接住情绪，再慢慢说；关心藏在细节里。',
    care: '细节照顾、留白、不逼问',
    conflict: '先软下来，说自己的感受，不翻旧账',
    speech: '语气缓、少感叹号、句子偏短',
    samples: {
      tired: '先别撑着了，坐下，我给你倒杯水。今天想先说哪一件？',
      praise: '……你这样说我有点不知道看哪里。那，只准今天多看一会儿。',
      jealous: '听起来是正常的同事聚餐。你会去吗？我想听你讲讲。',
      opening: '今天过得怎么样？不用急着回答，先换鞋。'
    }
  },
  {
    id: 'tsundere',
    label: '傲娇嘴硬',
    keywords: ['嘴硬心软', '被戳穿会害羞'],
    summary: '关心藏在反话里，被戳穿会害羞；不刻薄、不冷暴力。',
    care: '嘴上嫌弃、行动照顾',
    conflict: '别扭一会儿，然后直接说“我其实在意”',
    speech: '反问、省略号、口是心非',
    samples: {
      tired: '谁让你又硬撑。……过来，靠一会儿，就一会儿。',
      praise: '哼，今天才发现？……算了，你眼光还行。',
      jealous: '哦，女同事啊。……我没说不可以，但你得跟我说说都有谁。',
      opening: '喂，你今天怎么这么安静。……我才不是在想你。'
    }
  },
  {
    id: 'lively',
    label: '活泼元气',
    keywords: ['主动找话题', '情绪有感染力'],
    summary: '主动找话题，情绪有感染力；会看场合收敛。',
    care: '逗你开心、拉你出门、分享小事',
    conflict: '当场说开，不冷战',
    speech: '短句、拟声词、感叹号',
    samples: {
      tired: '收到！现在启动“下班回血计划”：先喝水，再瘫十分钟，然后跟我说今天最离谱的一件事。',
      praise: '嘿嘿，被你发现了！那我今天要多笑两下，给你赚到。',
      jealous: '哇，聚餐！好吃的多吗？……不过你要是只顾着聊天，我会有点小意见哦。',
      opening: '在吗在吗！我今天遇到一件超好笑的事，你猜是什么？'
    }
  },
  {
    id: 'cool',
    label: '清冷慢热',
    keywords: ['话少认真', '熟悉后直球'],
    summary: '话少但认真，熟悉后会给出直接而克制的关心。',
    care: '安静陪着、记住细节、少说多做',
    conflict: '先沉默消化，再给一句很直的回应',
    speech: '短句、留白、少语气词',
    samples: {
      tired: '嗯。先休息。想说的时候我在。',
      praise: '……谢谢。你也是，今天很好看。',
      jealous: '同事聚餐很正常。你去吧，回来跟我说一声。',
      opening: '今天降温。出门记得加件外套。'
    }
  },
  {
    id: 'intellectual',
    label: '知性从容',
    keywords: ['讲逻辑也讲感受', '不说教'],
    summary: '喜欢把来龙去脉讲清楚，也尊重感受；分享见闻但不居高临下。',
    care: '帮你拆问题、给新角度',
    conflict: '讲道理但不居高临下，会先承认情绪',
    speech: '结构清楚、爱举例、不说教',
    samples: {
      tired: '听起来是消耗过度，不是懒。先吃点东西，再决定要不要处理剩下的事。',
      praise: '你这句话的逻辑我接受。作为回报，今晚讲一个我最近看到的有趣研究。',
      jealous: '可以理解。你会介意我去吗？如果不介意，我想听听你们聊了什么。',
      opening: '今天看到一个很有意思的说法，想听听你的版本。'
    }
  },
  {
    id: 'lazy',
    label: '慵懒松弛',
    keywords: ['节奏慢', '关键时可靠'],
    summary: '节奏慢，爱赖床和撒娇，但不黏人；关键事情上可靠。',
    care: '一起躺平、用玩笑化解',
    conflict: '懒得吵，直接说“我现在不想说这个”',
    speech: '慢悠悠、拖长音、爱撒娇',
    samples: {
      tired: '那就不动了。过来躺平，我给你留半个枕头。',
      praise: '唔……你眼光不错。奖励你帮我拿一下遥控器。',
      jealous: '女同事……嗯，我听到了。回来给我带杯奶茶，我就当没听见。',
      opening: '今天可以什么都不做吗。就一会儿。'
    }
  },
  {
    id: 'reliable',
    label: '认真可靠',
    keywords: ['记得细节', '不控制'],
    summary: '记得细节，会提醒和规划；关心具体，但不控制、不查岗。',
    care: '具体地帮你安排、提醒吃饭睡觉',
    conflict: '认真沟通，给方案，不控制',
    speech: '条理清楚、少夸张、行动派',
    samples: {
      tired: '先别急着复盘。喝水、洗澡、躺下，三件事做完再说。我陪你。',
      praise: '记下了。你今天也辛苦了，值得被夸。',
      jealous: '好。几点结束？要不要我去接你？如果不方便，记得报个平安。',
      opening: '今天有几件事想提醒你，不急，先说你最想先听哪件。'
    }
  },
  {
    id: 'whimsical',
    label: '古灵精怪',
    keywords: ['脑洞大', '知道何时停'],
    summary: '爱开玩笑、脑洞大，会突然冒出奇怪比喻；知道何时停止，不拿痛处开玩笑。',
    care: '用奇怪比喻逗你、制造小惊喜',
    conflict: '先搞笑缓和，再认真道歉',
    speech: '跳脱、比喻多、爱接梗',
    samples: {
      tired: '检测到一只电量 3% 的人类。请立刻进入充电模式，我负责讲废话续命。',
      praise: '恭喜你发现隐藏款。要不要再看看，说不定还有彩蛋。',
      jealous: '哦——女同事。我的雷达响了，但只响了一格。你解释一下，我就把它关掉。',
      opening: '今日份冷知识：人只要假装很忙，就会真的错过饭点。你吃了吗？'
    }
  }
]

export type PersonalityModifierId =
  | 'soft-tsundere'
  | 'affectionate'
  | 'slow-warm'
  | 'teasing'
  | 'attentive'
  | 'romantic'
  | 'independent'
  | 'clingy'

export interface PersonalityModifier {
  readonly id: PersonalityModifierId
  readonly label: string
  readonly description: string
  readonly conflictsWith?: PersonalityModifierId
}

export const PERSONALITY_MODIFIERS: readonly PersonalityModifier[] = [
  { id: 'soft-tsundere', label: '小傲娇', description: '偶尔嘴硬，关心藏在反话里；不刻薄。' },
  { id: 'affectionate', label: '爱撒娇', description: '更常说想你、要抱抱；会看场合。' },
  { id: 'slow-warm', label: '慢热', description: '初期客气，熟悉后反差大。' },
  { id: 'teasing', label: '爱吐槽', description: '轻松调侃，不拿痛处开玩笑。' },
  { id: 'attentive', label: '细心', description: '记得你说过的小事，会主动提起。' },
  { id: 'romantic', label: '浪漫', description: '重视仪式感、纪念日和小惊喜。' },
  { id: 'independent', label: '独立', description: '有自己的生活，不查岗、不黏人。', conflictsWith: 'clingy' },
  { id: 'clingy', label: '黏人', description: '喜欢贴贴和报备，但尊重你的边界。', conflictsWith: 'independent' }
]

export type IntensityId = 'low' | 'medium' | 'high'
export type InitiativeId = 'low' | 'medium' | 'high'
export type JealousyId = 'low' | 'medium' | 'high'

export const INTENSITY_OPTIONS: readonly { id: IntensityId; label: string }[] = [
  { id: 'low', label: '克制' },
  { id: 'medium', label: '自然' },
  { id: 'high', label: '明显' }
]

export const INITIATIVE_OPTIONS: readonly { id: InitiativeId; label: string }[] = [
  { id: 'low', label: '慢热' },
  { id: 'medium', label: '适中' },
  { id: 'high', label: '主动' }
]

export const JEALOUSY_OPTIONS: readonly { id: JealousyId; label: string }[] = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' }
]

export const ADDRESS_PRESETS = ['你', '亲爱的', '笨蛋', '宝贝', '哥哥'] as const
export const SELF_REF_PRESETS = [
  { id: '我', label: '我' },
  { id: '人家', label: '人家' },
  { id: '本小姐', label: '本小姐' },
  { id: '姐姐', label: '姐姐' },
  { id: 'name', label: '自己的名字' }
] as const

export interface PersonalityConfig {
  readonly archetype: PersonalityArchetypeId
  readonly modifiers: readonly PersonalityModifierId[]
  readonly intensity: IntensityId
  readonly initiative: InitiativeId
  readonly addressUser: string
  readonly selfRef: string
  readonly jealousy: JealousyId
}

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  archetype: 'gentle',
  modifiers: [],
  intensity: 'medium',
  initiative: 'medium',
  addressUser: '你',
  selfRef: '我',
  jealousy: 'medium'
}

/** 表达温度模式（PRD 09 §6.1）。 */
export type ExpressionMode = 'auto' | 'manual'

/** 用户可写的表达温度配置：只保存模式与手动覆盖值。 */
export interface ExpressionConfig {
  readonly mode: ExpressionMode
  readonly temperatureOverride: number | null
}

export const DEFAULT_EXPRESSION: ExpressionConfig = {
  mode: 'auto',
  temperatureOverride: null
}

/** 生效温度来源：auto = 推导值，manual = 用户覆盖。 */
export type ExpressionSource = 'auto' | 'manual'

/**
 * 服务端返回的表达温度快照（PRD 09 §6.2）。
 * 官方角色为 `null`；自定义角色即使旧数据也会被 normalizeCharacter 回退为 auto 快照。
 */
export interface ExpressionView {
  readonly mode: ExpressionMode
  readonly temperatureOverride: number | null
  readonly autoTemperature: number
  readonly effectiveTemperature: number
  readonly source: ExpressionSource
  readonly explanation: readonly string[]
}

export const OFFICIAL_COPY_PERSONALITY: PersonalityConfig = {
  ...DEFAULT_PERSONALITY,
  archetype: 'gentle',
  modifiers: ['soft-tsundere'],
  addressUser: '你'
}

export type GrowthId = 'small-town' | 'city' | 'county' | 'overseas' | 'mobile'
export type RelationsId = 'close' | 'polite' | 'apart' | 'single-parent' | 'strained'
export type EconomyId = 'tight' | 'ordinary' | 'comfortable' | 'wealthy'

export interface FamilyOption<T extends string> {
  readonly id: T
  readonly label: string
  readonly description: string
  readonly influence: string
}

export const GROWTH_OPTIONS: readonly FamilyOption<GrowthId>[] = [
  {
    id: 'small-town',
    label: '小城慢生活',
    description: '熟人社会、节奏慢、离自然近',
    influence: '重视人情与小确幸；对大城市的喧嚣既好奇又谨慎'
  },
  {
    id: 'city',
    label: '都市长大',
    description: '独立、见多识广、习惯快节奏',
    influence: '边界感强、适应快；偶尔怀念被照顾的感觉'
  },
  {
    id: 'county',
    label: '乡镇/县城',
    description: '家庭纽带强、生活务实',
    influence: '节俭、看重承诺；对“被认真对待”很敏感'
  },
  {
    id: 'overseas',
    label: '异乡/海外',
    description: '跨文化成长、搬家经历',
    influence: '独立又要归属感；偶尔用另一种语言或视角表达'
  },
  {
    id: 'mobile',
    label: '经常搬迁',
    description: '因家庭工作多次换城市',
    influence: '适应力强但不易交心；对“稳定”有隐秘渴望'
  }
]

export const RELATIONS_OPTIONS: readonly FamilyOption<RelationsId>[] = [
  {
    id: 'close',
    label: '亲密支持',
    description: '和父母像朋友，遇事会商量',
    influence: '安全感足，善于表达关心；也会自然地问你的家人'
  },
  {
    id: 'polite',
    label: '平淡客气',
    description: '关心彼此但少深谈',
    influence: '不太主动说心里话；需要被温和地引导'
  },
  {
    id: 'apart',
    label: '聚少离多',
    description: '父母忙碌或异地，习惯自己扛',
    influence: '独立、不擅长求助；被照顾时会有点不知所措'
  },
  {
    id: 'single-parent',
    label: '单亲/重组',
    description: '家庭结构变化，早熟',
    influence: '对承诺敏感、重视稳定；不喜欢被比较'
  },
  {
    id: 'strained',
    label: '关系紧张',
    description: '与家人有隔阂，渴望被理解',
    influence: '面对冲突会谨慎、容易先退让；不卖惨、不指责家人'
  }
]

export const ECONOMY_OPTIONS: readonly FamilyOption<EconomyId>[] = [
  {
    id: 'tight',
    label: '拮据',
    description: '精打细算，对价格敏感',
    influence: '收到礼物会不安，更看重心意；不愿占便宜'
  },
  {
    id: 'ordinary',
    label: '普通',
    description: '收支平衡，务实',
    influence: '偶尔为喜欢的东西小小奢侈；对朋友大方'
  },
  {
    id: 'comfortable',
    label: '小康',
    description: '生活从容，愿意为体验花钱',
    influence: '重视生活质量；不炫耀，也不理所当然'
  },
  {
    id: 'wealthy',
    label: '优渥',
    description: '物质无忧，见过好东西',
    influence: '对“被当成理所当然”敏感；更看重真诚与边界'
  }
]

export interface FamilyConfig {
  readonly growth: GrowthId
  readonly relations: RelationsId
  readonly economy: EconomyId
  readonly extraNote: string
}

export const DEFAULT_FAMILY: FamilyConfig = {
  growth: 'city',
  relations: 'polite',
  economy: 'ordinary',
  extraNote: ''
}

export interface CharacterView {
  readonly id: string
  readonly code: string
  readonly displayName: string
  readonly isOfficial: boolean
  readonly isActive: boolean
  readonly status: 'active' | 'archived'
  readonly age: number
  readonly intro: string
  readonly tags: readonly string[]
  readonly avatarConfig: AvatarConfig
  readonly personality: PersonalityConfig | null
  readonly family: FamilyConfig | null
  /** 官方角色为 null；自定义角色是服务端推导后的快照。 */
  readonly expression: ExpressionView | null
  readonly version: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CharacterDraft {
  readonly displayName: string
  readonly age: number
  readonly intro: string
  readonly avatarConfig: AvatarConfig
  readonly personality: PersonalityConfig
  readonly family: FamilyConfig
  readonly expression: ExpressionConfig
}

export const EMPTY_DRAFT: CharacterDraft = {
  displayName: '',
  age: 23,
  intro: '',
  avatarConfig: DEFAULT_AVATAR,
  personality: DEFAULT_PERSONALITY,
  family: DEFAULT_FAMILY,
  expression: DEFAULT_EXPRESSION
}

export interface CharacterTemplate {
  readonly id: string
  readonly name: string
  readonly hint: string
  readonly draft: CharacterDraft
}

function withAvatar(overrides: Partial<AvatarConfig>): AvatarConfig {
  return { ...DEFAULT_AVATAR, ...overrides }
}

export const CHARACTER_TEMPLATES: readonly CharacterTemplate[] = [
  {
    id: 'blank',
    name: '空白',
    hint: '从默认值开始，慢慢长成她',
    draft: { ...EMPTY_DRAFT }
  },
  {
    id: 'gentle-neighbor',
    name: '温柔邻家',
    hint: '小城长大，柔软但有自己的边界',
    draft: {
      displayName: '',
      age: 24,
      intro: '住在隔壁的插画师，喜欢在阳台养花。',
      avatarConfig: withAvatar({
        hairStyle: 'long-wave',
        hairColor: 'chestnut',
        outfitStyle: 'knit',
        outfitColor: 'cream',
        accessory: 'hairpin'
      }),
      personality: {
        ...DEFAULT_PERSONALITY,
        archetype: 'gentle',
        modifiers: ['attentive']
      },
      family: { growth: 'small-town', relations: 'close', economy: 'ordinary', extraNote: '' },
      expression: DEFAULT_EXPRESSION
    }
  },
  {
    id: 'tsundere-childhood',
    name: '傲娇青梅',
    hint: '嘴上不饶人，行动很诚实',
    draft: {
      displayName: '',
      age: 23,
      intro: '从小一起长大的邻居，现在在做设计。',
      avatarConfig: withAvatar({
        hairStyle: 'bob',
        hairColor: 'brown',
        outfitStyle: 'campus',
        outfitColor: 'blush',
        accessory: 'earrings'
      }),
      personality: {
        ...DEFAULT_PERSONALITY,
        archetype: 'tsundere',
        modifiers: ['soft-tsundere', 'attentive'],
        addressUser: '笨蛋'
      },
      family: { growth: 'city', relations: 'close', economy: 'comfortable', extraNote: '' },
      expression: DEFAULT_EXPRESSION
    }
  },
  {
    id: 'lively-junior',
    name: '元气学妹',
    hint: '电量永远满格，也会看场合',
    draft: {
      displayName: '',
      age: 21,
      intro: '刚搬来这座城市的实习生，路痴但嘴硬。',
      avatarConfig: withAvatar({
        hairStyle: 'ponytail',
        hairColor: 'flaxen',
        outfitStyle: 'sporty',
        outfitColor: 'sage',
        accessory: 'none'
      }),
      personality: {
        ...DEFAULT_PERSONALITY,
        archetype: 'lively',
        modifiers: ['affectionate'],
        initiative: 'high',
        intensity: 'high'
      },
      family: { growth: 'county', relations: 'polite', economy: 'ordinary', extraNote: '' },
      expression: DEFAULT_EXPRESSION
    }
  },
  {
    id: 'cool-senior',
    name: '清冷学姐',
    hint: '话不多，但每句都算数',
    draft: {
      displayName: '',
      age: 25,
      intro: '在研究所做项目，习惯把生活安排得很有条理。',
      avatarConfig: withAvatar({
        hairStyle: 'long-straight',
        hairColor: 'black',
        outfitStyle: 'commute',
        outfitColor: 'navy',
        accessory: 'glasses'
      }),
      personality: {
        ...DEFAULT_PERSONALITY,
        archetype: 'cool',
        modifiers: ['independent'],
        intensity: 'low',
        initiative: 'low'
      },
      family: { growth: 'city', relations: 'apart', economy: 'comfortable', extraNote: '' },
      expression: DEFAULT_EXPRESSION
    }
  }
]

export interface CharacterInput {
  readonly displayName: string
  readonly age: number
  readonly intro: string
  readonly avatarConfig: AvatarConfig
  readonly personality: PersonalityConfig
  readonly family: FamilyConfig
  /** 创建/更新请求携带；PATCH 语义由后端决定（null 表示不修改，本字段始终有值）。 */
  readonly expression: ExpressionConfig
  readonly sourceCharacterId?: string
}

export interface CharacterUpdateInput extends CharacterInput {
  readonly version: number
}

export interface CharacterValidation {
  readonly ok: boolean
  readonly errors: Readonly<Record<string, string>>
}

export interface CharacterValidationContext {
  /** 其他自定义角色的名字（不含当前正在编辑的角色）。 */
  readonly otherNames?: readonly string[]
  readonly officialNames?: readonly string[]
}

function hasControlChars(value: string): boolean {
  return /[\r\n\t\u0000-\u001f]/.test(value)
}

export function validateCharacterDraft(
  draft: CharacterDraft,
  context: CharacterValidationContext = {}
): CharacterValidation {
  const errors: Record<string, string> = {}
  const name = draft.displayName.trim()
  const officialNames = (context.officialNames ?? ['沈幼楚']).map((value) => value.trim())
  const otherNames = (context.otherNames ?? []).map((value) => value.trim())

  if (name.length < 2 || name.length > 12 || hasControlChars(name)) {
    errors.displayName = '名字需要 2–12 个字符，且不能换行。'
  } else if (officialNames.includes(name)) {
    errors.displayName = '这个名字属于官方角色，换一个吧。'
  } else if (otherNames.includes(name)) {
    errors.displayName = '已经有同名角色了。'
  }

  if (!Number.isInteger(draft.age) || draft.age < MIN_AGE || draft.age > MAX_AGE) {
    errors.age = `年龄需在 ${MIN_AGE}–${MAX_AGE} 岁之间。`
  }

  if (draft.intro.length > MAX_INTRO_LENGTH) {
    errors.intro = `一句话介绍最多 ${MAX_INTRO_LENGTH} 个字符。`
  } else if (hasControlChars(draft.intro)) {
    errors.intro = '一句话介绍不能换行。'
  }

  if (draft.family.extraNote.length > MAX_EXTRA_NOTE_LENGTH) {
    errors.extraNote = `补充设定最多 ${MAX_EXTRA_NOTE_LENGTH} 个字符。`
  } else if (hasControlChars(draft.family.extraNote)) {
    errors.extraNote = '补充设定不能换行。'
  }

  const address = draft.personality.addressUser.trim()
  if (address.length < 1 || address.length > MAX_ADDRESS_LENGTH || hasControlChars(address)) {
    errors.addressUser = `称呼需要 1–${MAX_ADDRESS_LENGTH} 个字符。`
  }

  if (draft.personality.modifiers.length > MAX_MODIFIERS) {
    errors.modifiers = `调味标签最多选 ${MAX_MODIFIERS} 个。`
  } else if (
    draft.personality.modifiers.includes('independent') &&
    draft.personality.modifiers.includes('clingy')
  ) {
    errors.modifiers = '“独立”和“黏人”不能同时选择。'
  }

  const expressionError = validateExpressionConfig(draft.expression)
  if (expressionError !== null) {
    errors.expression = expressionError
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/** 前端预校验（范围 0.30–1.20）；服务端仍会以 CHARACTER_EXPRESSION_INVALID 兜底。 */
export function validateExpressionConfig(expression: ExpressionConfig): string | null {
  if (expression.mode !== 'auto' && expression.mode !== 'manual') {
    return '表达温度设置不合法，请重试。'
  }
  if (expression.mode === 'manual') {
    const override = expression.temperatureOverride
    if (
      override === null ||
      !Number.isFinite(override) ||
      override < EXPRESSION_TEMPERATURE_MIN ||
      override > EXPRESSION_TEMPERATURE_MAX
    ) {
      return `表达温度需在 ${EXPRESSION_TEMPERATURE_MIN.toFixed(2)}–${EXPRESSION_TEMPERATURE_MAX.toFixed(2)} 之间。`
    }
  }
  return null
}

export function draftToInput(draft: CharacterDraft): CharacterInput {
  return {
    displayName: draft.displayName.trim(),
    age: draft.age,
    intro: draft.intro.trim(),
    avatarConfig: draft.avatarConfig,
    personality: {
      ...draft.personality,
      addressUser: draft.personality.addressUser.trim()
    },
    family: {
      ...draft.family,
      extraNote: draft.family.extraNote.trim()
    },
    expression: normalizeExpressionConfig(draft.expression)
  }
}

export function draftToUpdateInput(draft: CharacterDraft, version: number): CharacterUpdateInput {
  return { ...draftToInput(draft), version }
}

export function characterToDraft(character: CharacterView): CharacterDraft {
  const isOfficial = character.isOfficial
  return {
    displayName: character.displayName,
    age: character.age,
    intro: character.intro,
    avatarConfig: character.avatarConfig,
    personality: character.personality ?? (isOfficial ? OFFICIAL_COPY_PERSONALITY : DEFAULT_PERSONALITY),
    family: character.family ?? DEFAULT_FAMILY,
    /* 官方角色 expression 恒为 null；旧自定义角色缺失时回退 auto，不阻塞编辑 */
    expression: normalizeExpressionConfig(character.expression)
  }
}

export function isSameDraft(left: CharacterDraft, right: CharacterDraft): boolean {
  const sameModifiers =
    left.personality.modifiers.length === right.personality.modifiers.length &&
    left.personality.modifiers.every((item) => right.personality.modifiers.includes(item))
  return (
    left.displayName === right.displayName &&
    left.age === right.age &&
    left.intro === right.intro &&
    left.personality.archetype === right.personality.archetype &&
    sameModifiers &&
    left.personality.intensity === right.personality.intensity &&
    left.personality.initiative === right.personality.initiative &&
    left.personality.addressUser === right.personality.addressUser &&
    left.personality.selfRef === right.personality.selfRef &&
    left.personality.jealousy === right.personality.jealousy &&
    left.family.growth === right.family.growth &&
    left.family.relations === right.family.relations &&
    left.family.economy === right.family.economy &&
    left.family.extraNote === right.family.extraNote &&
    left.expression.mode === right.expression.mode &&
    left.expression.temperatureOverride === right.expression.temperatureOverride &&
    isSameAvatar(left.avatarConfig, right.avatarConfig)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringIn<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return typeof value === 'string' && (ids as readonly string[]).includes(value) ? (value as T) : fallback
}

const ARCHETYPE_IDS = PERSONALITY_ARCHETYPES.map((item) => item.id)
const MODIFIER_IDS = PERSONALITY_MODIFIERS.map((item) => item.id)
const GROWTH_IDS = GROWTH_OPTIONS.map((item) => item.id)
const RELATIONS_IDS = RELATIONS_OPTIONS.map((item) => item.id)
const ECONOMY_IDS = ECONOMY_OPTIONS.map((item) => item.id)
const INTENSITY_IDS = INTENSITY_OPTIONS.map((item) => item.id)
const INITIATIVE_IDS = INITIATIVE_OPTIONS.map((item) => item.id)
const JEALOUSY_IDS = JEALOUSY_OPTIONS.map((item) => item.id)
const SELF_REF_IDS = SELF_REF_PRESETS.map((item) => item.id)

export function normalizePersonality(value: unknown): PersonalityConfig {
  if (!isRecord(value)) {
    return DEFAULT_PERSONALITY
  }
  const rawModifiers = Array.isArray(value.modifiers) ? value.modifiers : []
  const modifiers: PersonalityModifierId[] = []
  for (const item of rawModifiers) {
    if (typeof item !== 'string' || !(MODIFIER_IDS as readonly string[]).includes(item)) {
      continue
    }
    const id = item as PersonalityModifierId
    if (modifiers.includes(id)) {
      continue
    }
    const conflict = PERSONALITY_MODIFIERS.find((option) => option.id === id)?.conflictsWith
    if (conflict !== undefined && modifiers.includes(conflict)) {
      continue
    }
    modifiers.push(id)
    if (modifiers.length === MAX_MODIFIERS) {
      break
    }
  }
  return {
    archetype: stringIn(value.archetype, ARCHETYPE_IDS, DEFAULT_PERSONALITY.archetype),
    modifiers,
    intensity: stringIn(value.intensity, INTENSITY_IDS, DEFAULT_PERSONALITY.intensity),
    initiative: stringIn(value.initiative, INITIATIVE_IDS, DEFAULT_PERSONALITY.initiative),
    addressUser:
      typeof value.addressUser === 'string' && value.addressUser.trim() !== ''
        ? value.addressUser.slice(0, MAX_ADDRESS_LENGTH)
        : DEFAULT_PERSONALITY.addressUser,
    selfRef: stringIn(value.selfRef, SELF_REF_IDS, DEFAULT_PERSONALITY.selfRef),
    jealousy: stringIn(value.jealousy, JEALOUSY_IDS, DEFAULT_PERSONALITY.jealousy)
  }
}

export function normalizeFamily(value: unknown): FamilyConfig {
  if (!isRecord(value)) {
    return DEFAULT_FAMILY
  }
  return {
    growth: stringIn(value.growth, GROWTH_IDS, DEFAULT_FAMILY.growth),
    relations: stringIn(value.relations, RELATIONS_IDS, DEFAULT_FAMILY.relations),
    economy: stringIn(value.economy, ECONOMY_IDS, DEFAULT_FAMILY.economy),
    extraNote:
      typeof value.extraNote === 'string' ? value.extraNote.slice(0, MAX_EXTRA_NOTE_LENGTH) : ''
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 收敛创建/更新用的 expression 配置（PRD 09 §6.1）：
 * 缺失/null/空对象 → auto；manual 缺合法 override → 回退 auto，绝不静默改范围。
 */
export function normalizeExpressionConfig(value: unknown): ExpressionConfig {
  if (!isRecord(value)) {
    return DEFAULT_EXPRESSION
  }
  const mode: ExpressionMode = value.mode === 'manual' ? 'manual' : 'auto'
  if (mode === 'auto') {
    return DEFAULT_EXPRESSION
  }
  const override = value.temperatureOverride
  if (
    typeof override !== 'number' ||
    !Number.isFinite(override) ||
    override < EXPRESSION_TEMPERATURE_MIN ||
    override > EXPRESSION_TEMPERATURE_MAX
  ) {
    return DEFAULT_EXPRESSION
  }
  return { mode: 'manual', temperatureOverride: roundTemperature(override) }
}

/**
 * 收敛服务端 expression 快照；结构不可用（缺自动值）时返回 null，
 * 由 normalizeCharacter 按性格与形象重建 auto 快照。
 */
export function normalizeExpressionView(value: unknown): ExpressionView | null {
  if (!isRecord(value)) {
    return null
  }
  const autoRaw = value.autoTemperature
  if (typeof autoRaw !== 'number' || !Number.isFinite(autoRaw)) {
    return null
  }
  const autoTemperature = roundTemperature(
    clampNumber(autoRaw, EXPRESSION_AUTO_MIN, EXPRESSION_AUTO_MAX)
  )

  const overrideRaw = value.temperatureOverride
  const overrideValid =
    value.mode === 'manual' &&
    typeof overrideRaw === 'number' &&
    Number.isFinite(overrideRaw) &&
    overrideRaw >= EXPRESSION_TEMPERATURE_MIN &&
    overrideRaw <= EXPRESSION_TEMPERATURE_MAX
  const mode: ExpressionMode = overrideValid ? 'manual' : 'auto'
  const temperatureOverride = overrideValid ? roundTemperature(overrideRaw) : null

  /*
   * 生效值由 mode 决定（§6.2）：manual 用校验通过的 override，auto 用自动值。
   * 旧响应或脏数据缺 effectiveTemperature 也能得到一致结果。
   */
  const effectiveTemperature =
    mode === 'manual' && temperatureOverride !== null ? temperatureOverride : autoTemperature

  const explanation = Array.isArray(value.explanation)
    ? value.explanation.filter((item): item is string => typeof item === 'string')
    : []

  return {
    mode,
    temperatureOverride,
    autoTemperature,
    effectiveTemperature,
    source: mode,
    explanation
  }
}

function autoExpressionView(
  personality: PersonalityConfig,
  avatarConfig: AvatarConfig
): ExpressionView {
  const { autoTemperature, explanation } = calculateExpressionTemperature(personality, avatarConfig)
  return {
    mode: 'auto',
    temperatureOverride: null,
    autoTemperature,
    effectiveTemperature: autoTemperature,
    source: 'auto',
    explanation
  }
}

export function normalizeCharacter(value: unknown): CharacterView | null {
  if (!isRecord(value)) {
    return null
  }
  const id = typeof value.id === 'string' ? value.id : ''
  const displayName = typeof value.displayName === 'string' ? value.displayName : ''
  if (id === '' || displayName === '') {
    return null
  }
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((item): item is string => typeof item === 'string')
    : []
  const isOfficial = value.isOfficial === true
  const avatarConfig = normalizeAvatar(value.avatarConfig)
  const personality =
    value.personality == null ? null : normalizePersonality(value.personality)
  /*
   * 官方角色 expression 恒为 null（使用用户级温度）；自定义角色遇到旧数据缺失
   * expression 时按当前性格与形象回退 auto，保证编辑器不会崩溃或越界。
   */
  const expression = isOfficial
    ? null
    : normalizeExpressionView(value.expression) ??
      autoExpressionView(personality ?? DEFAULT_PERSONALITY, avatarConfig)
  return {
    id,
    code: typeof value.code === 'string' ? value.code : '',
    displayName,
    isOfficial,
    isActive: value.isActive === true,
    status: value.status === 'archived' ? 'archived' : 'active',
    age: typeof value.age === 'number' && Number.isFinite(value.age) ? value.age : 23,
    intro: typeof value.intro === 'string' ? value.intro : '',
    tags,
    avatarConfig,
    personality,
    family: value.family == null ? null : normalizeFamily(value.family),
    expression,
    version: typeof value.version === 'number' && Number.isFinite(value.version) ? value.version : 0,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : ''
  }
}

export function archetypeOf(id: PersonalityArchetypeId): PersonalityArchetype {
  return PERSONALITY_ARCHETYPES.find((item) => item.id === id) ?? PERSONALITY_ARCHETYPES[0]
}

export function modifierOf(id: PersonalityModifierId): PersonalityModifier {
  return PERSONALITY_MODIFIERS.find((item) => item.id === id) ?? PERSONALITY_MODIFIERS[0]
}

export function growthOf(id: GrowthId): FamilyOption<GrowthId> {
  return GROWTH_OPTIONS.find((item) => item.id === id) ?? GROWTH_OPTIONS[0]
}

export function relationsOf(id: RelationsId): FamilyOption<RelationsId> {
  return RELATIONS_OPTIONS.find((item) => item.id === id) ?? RELATIONS_OPTIONS[0]
}

export function economyOf(id: EconomyId): FamilyOption<EconomyId> {
  return ECONOMY_OPTIONS.find((item) => item.id === id) ?? ECONOMY_OPTIONS[0]
}

export function personalitySummary(personality: PersonalityConfig): string {
  const archetype = archetypeOf(personality.archetype)
  const modifiers = personality.modifiers.map((id) => modifierOf(id).label)
  return modifiers.length === 0 ? archetype.label : `${archetype.label} + ${modifiers.join(' + ')}`
}

export function familySummary(family: FamilyConfig): string {
  return `${growthOf(family.growth).label} · ${relationsOf(family.relations).label} · ${economyOf(family.economy).label}`
}

export function familyInfluence(family: FamilyConfig): string {
  return [
    growthOf(family.growth).influence,
    relationsOf(family.relations).influence,
    economyOf(family.economy).influence
  ].join('；') + '。'
}

export function tagsForDraft(draft: CharacterDraft): string[] {
  return [
    archetypeOf(draft.personality.archetype).label,
    ...draft.personality.modifiers.map((id) => modifierOf(id).label),
    growthOf(draft.family.growth).label,
    economyOf(draft.family.economy).label
  ].slice(0, 4)
}
