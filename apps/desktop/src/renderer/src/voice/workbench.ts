/**
 * 语音工作台纯逻辑：能力/模式推导、动态表单校验、草稿与批量请求组装。
 *
 * 设计约束（docs/17-modular-voice-architecture.md）：
 * - 前端不出现 `provider === 'breeze'` 这类业务分支，差异全部来自后端 descriptor；
 * - 模式由「能力 + provider 可用性」决定，不绑定具体模型名；
 * - 一个模型可以同时声明 SPEAK 与 SING，此时单模型即可完成说话 + 唱歌。
 */

export type VoiceCapability = 'SPEAK' | 'SING' | 'HUM'

export type VoiceFieldType = 'TEXT' | 'PASSWORD' | 'SELECT' | 'TEXTAREA' | 'NUMBER' | 'SWITCH'

export type GenerationMode = 'single' | 'single_two' | 'dual'

export interface VoiceFieldOption {
  readonly value: string
  readonly label: string
}

export interface VoiceFieldSchema {
  readonly key: string
  readonly label: string
  readonly type: VoiceFieldType
  readonly required: boolean
  readonly secret: boolean
  readonly placeholder: string | null
  readonly options: readonly VoiceFieldOption[] | null
  readonly help: string | null
  readonly maxLength: number | null
  readonly defaultValue: string | null
}

export interface VoiceProviderDescriptor {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly capabilities: readonly VoiceCapability[]
  readonly credentialFields: readonly VoiceFieldSchema[]
  readonly generationFields: Readonly<Partial<Record<VoiceCapability, readonly VoiceFieldSchema[]>>>
  readonly languages: readonly string[]
  readonly maxTextChars: number
  readonly enabled: boolean
}

export interface VoiceCredentialView {
  readonly providerId: string
  readonly configured: boolean
  readonly status: string
  readonly lastVerifiedAt: string | null
  readonly values: Readonly<Record<string, string>>
  readonly configuredSecrets: readonly string[]
}

export interface VoiceProviderView {
  readonly descriptor: VoiceProviderDescriptor
  readonly credential: VoiceCredentialView
}

export interface VoiceSegmentView {
  readonly id: string
  readonly providerId: string
  readonly capability: VoiceCapability
  readonly status: string
  readonly audioBase64: string | null
  readonly format: string | null
  readonly durationMs: number | null
  readonly errorCode: string | null
  readonly message: string | null
}

export interface VoiceBatchView {
  readonly batchId: string
  readonly status: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly segments: readonly VoiceSegmentView[]
}

const CAPABILITY_LABELS: Record<VoiceCapability, string> = {
  SPEAK: '说话',
  SING: '唱歌',
  HUM: '哼唱'
}

export function capabilityLabel(capability: VoiceCapability): string {
  return CAPABILITY_LABELS[capability] ?? capability
}

/** 模型是否可用：后台开关开启 + 凭据已配置且有效。 */
export function isProviderUsable(view: VoiceProviderView | undefined): view is VoiceProviderView {
  if (view === undefined) {
    return false
  }
  return view.descriptor.enabled && view.credential.configured && view.credential.status === 'active'
}

/** 该模型在当前状态下能承担的能力。 */
export function usableCapabilities(view: VoiceProviderView | undefined): VoiceCapability[] {
  if (!isProviderUsable(view)) {
    return []
  }
  return [...view.descriptor.capabilities]
}

/** 是否存在“一个模型同时会说话又会唱”的模型。 */
export function hasAllInOneProvider(views: readonly VoiceProviderView[]): boolean {
  return views.some((view) => {
    const caps = usableCapabilities(view)
    return caps.includes('SPEAK') && (caps.includes('SING') || caps.includes('HUM'))
  })
}

/** 当前配置下可用的模式集合（按优先级排序）。 */
export function availableModes(views: readonly VoiceProviderView[]): GenerationMode[] {
  const usable = views.filter((view) => isProviderUsable(view))
  const modes: GenerationMode[] = []
  if (usable.length > 0) {
    modes.push('single')
  }
  const canTwo = usable.some((view) => usableCapabilities(view).length > 0)
  if (canTwo) {
    modes.push('single_two')
  }
  if (usable.length >= 2) {
    modes.push('dual')
  }
  return modes
}

/** 模式不可用时选一个默认模式。 */
export function pickDefaultMode(views: readonly VoiceProviderView[]): GenerationMode | null {
  const modes = availableModes(views)
  if (modes.includes('dual')) {
    return 'dual'
  }
  return modes[0] ?? null
}

/** 双模型模式下可选的 provider 对（能力互补）。 */
export function dualCandidates(views: readonly VoiceProviderView[]): VoiceProviderView[] {
  return views.filter((view) => isProviderUsable(view))
}

export interface SegmentDraft {
  readonly id: string
  readonly providerId: string
  readonly capability: VoiceCapability
  readonly text: string
  readonly params: Readonly<Record<string, string>>
}

export interface WorkbenchDraft {
  readonly mode: GenerationMode
  readonly providerId: string
  readonly secondProviderId: string
  readonly segments: readonly SegmentDraft[]
}

/** 段落数量由模式决定。 */
export function segmentCount(mode: GenerationMode): number {
  return mode === 'single' ? 1 : 2
}

/** 双模型模式的段落能力：第 1 段说话，第 2 段唱/哼。 */
export function dualCapabilities(
  first: VoiceProviderView | undefined,
  second: VoiceProviderView | undefined
): [VoiceCapability, VoiceCapability] {
  const speakFirst = usableCapabilities(first).includes('SPEAK')
  const singSecond = pickSingCapability(second)
  if (speakFirst && singSecond !== null) {
    return ['SPEAK', singSecond]
  }
  const singFirst = pickSingCapability(first)
  const speakSecond = usableCapabilities(second).includes('SPEAK')
  if (singFirst !== null && speakSecond) {
    return [singFirst, 'SPEAK']
  }
  return ['SPEAK', 'SING']
}

export function pickSingCapability(view: VoiceProviderView | undefined): VoiceCapability | null {
  const caps = usableCapabilities(view)
  if (caps.includes('SING')) {
    return 'SING'
  }
  if (caps.includes('HUM')) {
    return 'HUM'
  }
  return null
}

/** 为该能力挑一个默认 provider：优先“全能模型”，其次第一个可用模型。 */
export function defaultProviderFor(
  views: readonly VoiceProviderView[],
  capability: VoiceCapability
): VoiceProviderView | undefined {
  const candidates = views.filter((view) => usableCapabilities(view).includes(capability))
  if (candidates.length === 0) {
    return undefined
  }
  const allInOne = candidates.find((view) => {
    const caps = usableCapabilities(view)
    return caps.includes('SPEAK') && (caps.includes('SING') || caps.includes('HUM'))
  })
  return allInOne ?? candidates[0]
}

/** 模式的初始草稿：尽量带入上一个模式已填的文本。 */
export function buildDraft(
  mode: GenerationMode,
  views: readonly VoiceProviderView[],
  previous: WorkbenchDraft | null
): WorkbenchDraft {
  const segments: SegmentDraft[] = []

  if (mode === 'single') {
    const capability: VoiceCapability = previous?.segments[0]?.capability ?? 'SPEAK'
    const provider =
      findUsable(views, previous?.providerId, capability) ?? defaultProviderFor(views, capability)
    segments.push(makeSegment('s1', provider, capability, previous?.segments[0]?.text ?? ''))
    return { mode, providerId: provider?.descriptor.id ?? '', secondProviderId: '', segments }
  }

  if (mode === 'single_two') {
    const providerId = previous?.providerId ?? ''
    const provider = findUsable(views, providerId, null) ?? defaultProviderFor(views, 'SPEAK')
    const caps = usableCapabilities(provider)
    const first: VoiceCapability = previous?.segments[0]?.capability ?? 'SPEAK'
    const second: VoiceCapability = previous?.segments[1]?.capability ?? pickSingCapability(provider) ?? 'SPEAK'
    const texts = previous?.mode === 'single_two'
      ? [previous.segments[0]?.text ?? '', previous.segments[1]?.text ?? '']
      : [previous?.segments[0]?.text ?? '', '']
    segments.push(makeSegment('s1', provider, caps.includes(first) ? first : caps[0] ?? 'SPEAK', texts[0]))
    segments.push(makeSegment('s2', provider, caps.includes(second) ? second : caps[0] ?? 'SPEAK', texts[1]))
    return {
      mode,
      providerId: provider?.descriptor.id ?? '',
      secondProviderId: '',
      segments
    }
  }

  const firstId = previous?.providerId ?? ''
  const secondId = previous?.secondProviderId ?? ''
  let first = findUsable(views, firstId, null) ?? views.find((view) => isProviderUsable(view))
  let second = findUsable(views, secondId, null)
  if (second === undefined || second.descriptor.id === first?.descriptor.id) {
    second = views.find((view) => isProviderUsable(view) && view.descriptor.id !== first?.descriptor.id)
  }
  const [capA, capB] = dualCapabilities(first, second)
  const prevSegments = previous?.mode === 'dual' ? previous.segments : []
  segments.push(makeSegment('s1', first, capA, prevSegments[0]?.text ?? ''))
  segments.push(makeSegment('s2', second, capB, prevSegments[1]?.text ?? ''))
  return {
    mode,
    providerId: first?.descriptor.id ?? '',
    secondProviderId: second?.descriptor.id ?? '',
    segments
  }
}

function findUsable(
  views: readonly VoiceProviderView[],
  providerId: string | undefined,
  capability: VoiceCapability | null
): VoiceProviderView | undefined {
  if (providerId === undefined || providerId === '') {
    return undefined
  }
  const view = views.find((item) => item.descriptor.id === providerId)
  if (!isProviderUsable(view)) {
    return undefined
  }
  if (capability !== null && !usableCapabilities(view).includes(capability)) {
    return undefined
  }
  return view
}

function makeSegment(
  id: string,
  provider: VoiceProviderView | undefined,
  capability: VoiceCapability,
  text: string
): SegmentDraft {
  return {
    id,
    providerId: provider?.descriptor.id ?? '',
    capability,
    text,
    params: defaultParams(provider, capability)
  }
}

/** 用 schema 的 defaultValue 初始化动态参数。 */
export function defaultParams(
  view: VoiceProviderView | undefined,
  capability: VoiceCapability
): Record<string, string> {
  const fields = view?.descriptor.generationFields[capability] ?? []
  const params: Record<string, string> = {}
  for (const field of fields) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      params[field.key] = field.defaultValue
    }
  }
  return params
}

export interface ValidationIssue {
  readonly segmentId: string
  readonly field: string
  readonly message: string
}

/** 提交前校验：文本非空 + 长度上限 + required 动态字段。 */
export function validateDraft(draft: WorkbenchDraft, views: readonly VoiceProviderView[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const segment of draft.segments) {
    const view = views.find((item) => item.descriptor.id === segment.providerId)
    if (!isProviderUsable(view)) {
      issues.push({ segmentId: segment.id, field: 'providerId', message: '请先配置该模型的凭据' })
      continue
    }
    if (segment.text.trim() === '') {
      issues.push({ segmentId: segment.id, field: 'text', message: '内容不能为空' })
    } else if (segment.text.trim().length > view.descriptor.maxTextChars) {
      issues.push({
        segmentId: segment.id,
        field: 'text',
        message: `超过 ${view.descriptor.maxTextChars} 字上限`
      })
    }
    const fields = view.descriptor.generationFields[segment.capability] ?? []
    for (const field of fields) {
      if (!field.required) {
        continue
      }
      const value = segment.params[field.key]
      if (value === undefined || value.trim() === '') {
        issues.push({ segmentId: segment.id, field: field.key, message: `请填写${field.label}` })
      }
    }
  }
  return issues
}

/** 组装后端批量生成请求。 */
export function toGenerateRequest(draft: WorkbenchDraft): {
  readonly mode: GenerationMode
  readonly segments: readonly {
    id: string
    providerId: string
    capability: VoiceCapability
    text: string
    params: Readonly<Record<string, string>>
  }[]
} {
  return {
    mode: draft.mode,
    segments: draft.segments.map((segment) => ({
      id: segment.id,
      providerId: segment.providerId,
      capability: segment.capability,
      text: segment.text.trim(),
      params: segment.params
    }))
  }
}

/** 把生成结果合并回段落草稿（用于展示音频）。 */
export function mergeSegmentResults(
  draft: WorkbenchDraft,
  batch: VoiceBatchView
): Readonly<Record<string, VoiceSegmentView>> {
  const byId: Record<string, VoiceSegmentView> = {}
  for (const segment of batch.segments) {
    byId[segment.id] = segment
  }
  for (const local of draft.segments) {
    if (byId[local.id] === undefined) {
      byId[local.id] = {
        id: local.id,
        providerId: local.providerId,
        capability: local.capability,
        status: 'queued',
        audioBase64: null,
        format: null,
        durationMs: null,
        errorCode: null,
        message: null
      }
    }
  }
  return byId
}

export type WorkbenchStatus = 'loading' | 'setup_required' | 'ready' | 'generating' | 'done' | 'partial' | 'failed'

/** 页面级状态推导。 */
export function deriveStatus(
  loading: boolean,
  views: readonly VoiceProviderView[],
  batch: VoiceBatchView | null,
  submitting: boolean
): WorkbenchStatus {
  if (loading) {
    return 'loading'
  }
  if (availableModes(views).length === 0) {
    return 'setup_required'
  }
  if (submitting || batch === null) {
    return submitting ? 'generating' : 'ready'
  }
  if (batch.status === 'succeeded') {
    return 'done'
  }
  if (batch.status === 'partial') {
    return 'partial'
  }
  if (batch.status === 'failed') {
    return 'failed'
  }
  return 'generating'
}
