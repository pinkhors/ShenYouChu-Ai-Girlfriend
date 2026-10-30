import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  deleteVoiceCredential,
  generateVoice,
  getVoiceBatch,
  listVoiceProviders,
  saveVoiceCredential,
  type VoiceBatchView,
  type VoiceCapability,
  type VoiceCredentialView,
  type VoiceFieldSchema,
  type VoiceProviderView,
  type VoiceSegmentView
} from '../api/client'
import Icon from '../ui/Icon'
import DynamicField from './DynamicField'
import {
  availableModes,
  buildDraft,
  capabilityLabel,
  defaultParams,
  deriveStatus,
  dualCandidates,
  isProviderUsable,
  pickDefaultMode,
  pickSingCapability,
  usableCapabilities,
  validateDraft,
  toGenerateRequest,
  type GenerationMode,
  type ValidationIssue,
  type VoiceProviderDescriptor,
  type WorkbenchDraft
} from './workbench'

/**
 * 语音生成工作台（docs/16、docs/17）：
 * - 模型卡与表单全部由后端 descriptor 配置驱动；
 * - 三种模式：单模型一段 / 单模型两段 / 双模型各一段；
 * - 一个模型同时声明 SPEAK+SING 时，单模型即可完成说话+唱歌。
 */

const MODE_LABELS: Record<GenerationMode, string> = {
  single: '单模型 · 一段',
  single_two: '单模型 · 两段',
  dual: '双模型 · 各一段'
}

const MODE_HINTS: Record<GenerationMode, string> = {
  single: '选择一个模型生成一段内容',
  single_two: '同一个模型生成两段（可一段说话、一段唱歌）',
  dual: '两个模型各生成一段，可对比试听'
}

interface CredentialFormState {
  readonly values: Record<string, string>
  readonly dirty: boolean
  readonly busy: 'save' | 'validate' | null
  readonly error: string | null
}

function initialCredentialForm(view: VoiceProviderView): CredentialFormState {
  const values: Record<string, string> = {}
  for (const field of view.descriptor.credentialFields) {
    values[field.key] = view.credential.values[field.key] ?? ''
  }
  return { values, dirty: false, busy: null, error: null }
}

function segmentStatusClass(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'vb__chip vb__chip--ok'
    case 'failed':
      return 'vb__chip vb__chip--fail'
    case 'generating':
    case 'running':
      return 'vb__chip vb__chip--busy'
    default:
      return 'vb__chip'
  }
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function VoiceWorkbench() {
  const [providers, setProviders] = useState<VoiceProviderView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mode, setMode] = useState<GenerationMode>('single')
  const [draft, setDraft] = useState<WorkbenchDraft | null>(null)
  const [credentialForms, setCredentialForms] = useState<Record<string, CredentialFormState>>({})
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [batch, setBatch] = useState<VoiceBatchView | null>(null)
  const pollTimer = useRef<number | null>(null)
  const stopped = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null)
    try {
      const views = await listVoiceProviders()
      setProviders(views)
      const forms: Record<string, CredentialFormState> = {}
      for (const view of views) {
        forms[view.descriptor.id] = initialCredentialForm(view)
      }
      setCredentialForms(forms)
      const nextMode = pickDefaultMode(views) ?? 'single'
      setMode(nextMode)
      setDraft(buildDraft(nextMode, views, null))
    } catch (error) {
      setLoadError(describeError(error, '无法加载语音模型'))
    } finally {
      /* 加载失败也要结束 loading 态 */
      setProviders((previous) => previous ?? [])
    }
  }, [])

  useEffect(() => {
    stopped.current = false
    void load()
    return () => {
      stopped.current = true
      if (pollTimer.current !== null) {
        window.clearTimeout(pollTimer.current)
      }
    }
  }, [load])

  const views = providers ?? []
  const modes = useMemo(() => availableModes(views), [views])
  const status = deriveStatus(providers === null, views, batch, submitting)

  const switchMode = (next: GenerationMode): void => {
    if (submitting || draft === null) {
      return
    }
    setMode(next)
    setDraft(buildDraft(next, views, draft))
    setIssues([])
    setBatch(null)
  }

  const updateSegment = (segmentId: string, patch: Partial<WorkbenchDraft['segments'][number]>): void => {
    if (draft === null) {
      return
    }
    setDraft({
      ...draft,
      segments: draft.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment
      )
    })
    setIssues([])
  }

  const setSegmentProvider = (segmentId: string, providerId: string): void => {
    if (draft === null) {
      return
    }
    const view = views.find((item) => item.descriptor.id === providerId)
    const caps = usableCapabilities(view)
    setDraft({
      ...draft,
      segments: draft.segments.map((segment) => {
        if (segment.id !== segmentId) {
          return segment
        }
        const capability: VoiceCapability = caps.includes(segment.capability)
          ? segment.capability
          : caps[0] ?? 'SPEAK'
        return { ...segment, providerId, capability, params: defaultParams(view, capability) }
      })
    })
    setIssues([])
  }

  const setSegmentCapability = (segmentId: string, capability: VoiceCapability): void => {
    if (draft === null) {
      return
    }
    setDraft({
      ...draft,
      segments: draft.segments.map((segment) => {
        if (segment.id !== segmentId) {
          return segment
        }
        const view = views.find((item) => item.descriptor.id === segment.providerId)
        return { ...segment, capability, params: defaultParams(view, capability) }
      })
    })
    setIssues([])
  }

  const setParam = (segmentId: string, key: string, value: string): void => {
    if (draft === null) {
      return
    }
    setDraft({
      ...draft,
      segments: draft.segments.map((segment) =>
        segment.id === segmentId
          ? { ...segment, params: { ...segment.params, [key]: value } }
          : segment
      )
    })
    setIssues([])
  }

  const handleCredentialChange = (providerId: string, key: string, value: string): void => {
    setCredentialForms((previous) => {
      const form = previous[providerId] ?? { values: {}, dirty: false, busy: null, error: null }
      return {
        ...previous,
        [providerId]: { ...form, values: { ...form.values, [key]: value }, dirty: true, error: null }
      }
    })
  }

  const handleCredentialSave = async (descriptor: VoiceProviderDescriptor): Promise<void> => {
    const form = credentialForms[descriptor.id]
    if (form === undefined) {
      return
    }
    setCredentialForms((previous) => ({
      ...previous,
      [descriptor.id]: { ...form, busy: 'save', error: null }
    }))
    try {
      const saved: VoiceCredentialView = await saveVoiceCredential(descriptor.id, form.values)
      setProviders((previous) =>
        (previous ?? []).map((view) =>
          view.descriptor.id === descriptor.id ? { ...view, credential: saved } : view
        )
      )
      const nextMode = pickDefaultMode(
        (providers ?? []).map((view) =>
          view.descriptor.id === descriptor.id ? { ...view, credential: saved } : view
        )
      )
      if (nextMode !== null && (nextMode !== mode || draft === null)) {
        setMode(nextMode)
        setDraft(
          buildDraft(
            nextMode,
            (providers ?? []).map((view) =>
              view.descriptor.id === descriptor.id ? { ...view, credential: saved } : view
            ),
            draft
          )
        )
      }
      setCredentialForms((previous) => ({
        ...previous,
        [descriptor.id]: { values: { ...form.values }, dirty: false, busy: null, error: null }
      }))
    } catch (error) {
      setCredentialForms((previous) => ({
        ...previous,
        [descriptor.id]: { ...form, busy: null, error: describeError(error, '保存失败') }
      }))
    }
  }

  const handleCredentialDelete = async (providerId: string): Promise<void> => {
    try {
      await deleteVoiceCredential(providerId)
      await load()
    } catch (error) {
      setLoadError(describeError(error, '删除凭据失败'))
    }
  }

  const poll = useCallback((batchId: string): void => {
    if (stopped.current) {
      return
    }
    pollTimer.current = window.setTimeout(async () => {
      try {
        const next = await getVoiceBatch(batchId)
        setBatch(next)
        if (next.status === 'queued' || next.status === 'running') {
          poll(batchId)
        } else {
          setSubmitting(false)
        }
      } catch (error) {
        setSubmitting(false)
        setLoadError(describeError(error, '查询生成进度失败'))
      }
    }, 1200)
  }, [])

  const handleGenerate = async (): Promise<void> => {
    if (draft === null || submitting) {
      return
    }
    const found = validateDraft(draft, views)
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])
    setSubmitting(true)
    setBatch(null)
    const request = toGenerateRequest(draft)
    try {
      const created = await generateVoice(request.mode, request.segments)
      setBatch(created)
      poll(created.batchId)
    } catch (error) {
      setSubmitting(false)
      setLoadError(describeError(error, '生成请求失败'))
    }
  }

  const handleCancel = (): void => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current)
    }
    setSubmitting(false)
    setBatch(null)
  }

  if (status === 'loading') {
    return (
      <section className="page" aria-label="语音生成">
        <header className="page__header">
          <div>
            <h1 className="page__title">语音生成</h1>
            <p className="page__subtitle">正在加载语音模型…</p>
          </div>
        </header>
        <div className="vb__skeleton" aria-hidden="true" />
      </section>
    )
  }

  return (
    <section className="page" aria-label="语音生成">
      <header className="page__header">
        <div>
          <h1 className="page__title">语音生成</h1>
          <p className="page__subtitle">
            说话与唱句由不同模型承担；一个模型同时支持两类能力时，单模型即可完成。
          </p>
        </div>
      </header>

      {loadError !== null ? (
        <p className="alert" role="alert">
          {loadError}
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => { void load() }}>
            <Icon name="refresh" size={14} />
            重试
          </button>
        </p>
      ) : null}

      {status === 'setup_required' ? (
        <div className="vb__empty" role="status">
          <h2 className="vb__empty-title">还没有可用的语音模型</h2>
          <p className="vb__empty-desc">在下方模型卡中填写 API Key（只保存在服务端），保存并测试通过后即可生成。</p>
        </div>
      ) : null}

      <div className="setting-card">
        <h2 className="setting-card__title">生成模式</h2>
        <div className="vb__modes" role="radiogroup" aria-label="生成模式">
          {(['single', 'single_two', 'dual'] as const).map((item) => {
            const enabled = modes.includes(item)
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={mode === item}
                disabled={!enabled || submitting}
                className={mode === item && enabled ? 'vb__mode vb__mode--active' : 'vb__mode'}
                onClick={() => { switchMode(item) }}
                title={enabled ? MODE_HINTS[item] : '当前配置下不可用'}
              >
                {MODE_LABELS[item]}
              </button>
            )
          })}
        </div>
        <p className="setting-card__desc">{MODE_HINTS[mode]}</p>
      </div>

      <div className="vb__cards">
        {views.map((view) => (
          <ProviderCard
            key={view.descriptor.id}
            view={view}
            form={credentialForms[view.descriptor.id] ?? { values: {}, dirty: false, busy: null, error: null }}
            disabled={submitting}
            onChange={handleCredentialChange}
            onSave={() => { void handleCredentialSave(view.descriptor) }}
            onDelete={() => { void handleCredentialDelete(view.descriptor.id) }}
          />
        ))}
      </div>

      {draft !== null && status !== 'setup_required' ? (
        <div className="setting-card">
          <h2 className="setting-card__title">内容</h2>
          <div className="vb__segments">
            {draft.segments.map((segment, index) => {
              const view = views.find((item) => item.descriptor.id === segment.providerId)
              const caps = usableCapabilities(view)
              const fields = view?.descriptor.generationFields[segment.capability] ?? []
              const result: VoiceSegmentView | undefined = batch?.segments.find(
                (item) => item.id === segment.id
              )
              const issueFor = (field: string): string | null =>
                issues.find((issue) => issue.segmentId === segment.id && issue.field === field)?.message ?? null
              const providerOptions =
                mode === 'dual'
                  ? dualCandidates(views)
                  : views.filter((item) => isProviderUsable(item))
              return (
                <div className="vb__segment" key={segment.id}>
                  <div className="vb__segment-head">
                    <h3 className="vb__segment-title">第 {index + 1} 段</h3>
                    {result !== undefined ? (
                      <span className={segmentStatusClass(result.status)}>{result.status}</span>
                    ) : null}
                  </div>

                  <div className="gen__row">
                    <label className="gen__field gen__field--grow">
                      <span>模型</span>
                      <select
                        className="select"
                        value={segment.providerId}
                        disabled={submitting || providerOptions.length === 0}
                        onChange={(event) => { setSegmentProvider(segment.id, event.target.value) }}
                      >
                        {providerOptions.length === 0 ? <option value="">（无可用模型）</option> : null}
                        {providerOptions.map((option) => (
                          <option key={option.descriptor.id} value={option.descriptor.id}>
                            {option.descriptor.displayName}
                          </option>
                        ))}
                      </select>
                      {issueFor('providerId') !== null ? (
                        <span className="vf__error" role="alert">{issueFor('providerId')}</span>
                      ) : null}
                    </label>

                    <label className="gen__field">
                      <span>能力</span>
                      <select
                        className="select"
                        value={segment.capability}
                        disabled={submitting || caps.length <= 1}
                        onChange={(event) => { setSegmentCapability(segment.id, event.target.value as VoiceCapability) }}
                      >
                        {caps.length === 0 ? <option value={segment.capability}>{capabilityLabel(segment.capability)}</option> : null}
                        {caps.map((capability) => (
                          <option key={capability} value={capability}>
                            {capabilityLabel(capability)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="gen__field">
                    <span>
                      {segment.capability === 'SPEAK' ? '说话内容' : '唱词/哼唱文本'}
                      {view !== undefined ? `（上限 ${view.descriptor.maxTextChars} 字）` : ''}
                    </span>
                    <textarea
                      className="gen__textarea"
                      rows={3}
                      value={segment.text}
                      maxLength={view?.descriptor.maxTextChars ?? 1000}
                      disabled={submitting}
                      placeholder={
                        segment.capability === 'SPEAK'
                          ? '今天也想见你，记得早点休息。'
                          : '祝你生日快乐，祝你生日快乐……'
                      }
                      onChange={(event) => { updateSegment(segment.id, { text: event.target.value }) }}
                    />
                    {issueFor('text') !== null ? (
                      <span className="vf__error" role="alert">{issueFor('text')}</span>
                    ) : null}
                  </label>

                  {fields.length > 0 ? (
                    <div className="gen__row vb__params">
                      {fields.map((field: VoiceFieldSchema) => (
                        <DynamicField
                          key={field.key}
                          field={field}
                          value={segment.params[field.key] ?? ''}
                          error={issueFor(field.key)}
                          disabled={submitting}
                          keepExistingHint={false}
                          onChange={(key, value) => { setParam(segment.id, key, value) }}
                        />
                      ))}
                    </div>
                  ) : null}

                  {segment.capability !== 'SPEAK' ? (
                    <p className="gen__hint">唱句为短片段，无伴奏、无旋律编辑。</p>
                  ) : null}

                  {result !== undefined && result.status === 'succeeded' && result.audioBase64 !== null ? (
                    <div className="vb__result">
                      <audio
                        controls
                        src={`data:audio/${result.format ?? 'mp3'};base64,${result.audioBase64}`}
                      />
                    </div>
                  ) : null}
                  {result !== undefined && result.status === 'failed' ? (
                    <p className="vf__error" role="alert">
                      {result.message ?? '生成失败'}
                      {result.errorCode !== null ? `（${result.errorCode}）` : ''}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="setting-card__actions">
            <button className="btn btn--primary" type="button" disabled={submitting || draft.segments.length === 0} onClick={() => { void handleGenerate() }}>
              {submitting ? '生成中…' : mode === 'single' ? '生成' : '生成两段'}
            </button>
            {submitting ? (
              <button className="btn btn--ghost" type="button" onClick={handleCancel}>
                <Icon name="stop" size={14} />
                取消
              </button>
            ) : null}
            {issues.length > 0 ? (
              <span className="vf__error" aria-live="polite">
                还有 {issues.length} 处需要处理
              </span>
            ) : null}
          </div>

          {batch !== null ? (
            <p className="gen__hint" aria-live="polite">
              任务 {batch.batchId}：{batch.status}
              {batch.status === 'partial' ? '（部分成功，可单独重试失败段）' : ''}
              {batch.status !== 'queued' && batch.status !== 'running' ? ' · 结果保留 7 天' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

interface ProviderCardProps {
  readonly view: VoiceProviderView
  readonly form: CredentialFormState
  readonly disabled: boolean
  readonly onChange: (providerId: string, key: string, value: string) => void
  readonly onSave: () => void
  readonly onDelete: () => void
}

function ProviderCard({ view, form, disabled, onChange, onSave, onDelete }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(!view.credential.configured)
  const caps = view.descriptor.capabilities
  const singCap = pickSingCapability(view)
  const statusBadge = !view.descriptor.enabled
    ? { text: '暂未开放', cls: 'vb__chip vb__chip--off' }
    : view.credential.status === 'active'
      ? { text: '可用', cls: 'vb__chip vb__chip--ok' }
      : view.credential.configured
        ? { text: 'Key 无效', cls: 'vb__chip vb__chip--fail' }
        : { text: '未配置', cls: 'vb__chip' }

  return (
    <div className="setting-card vb__card">
      <div className="vb__card-head">
        <div>
          <h2 className="setting-card__title">{view.descriptor.displayName}</h2>
          <p className="setting-card__desc">{view.descriptor.description}</p>
        </div>
        <span className={statusBadge.cls}>{statusBadge.text}</span>
      </div>
      <p className="vb__caps">
        能力：
        {caps.includes('SPEAK') ? '说话 ' : ''}
        {singCap !== null ? capabilityLabel(singCap) : ''}
      </p>

      {expanded ? (
        <div className="vb__cred">
          {view.descriptor.credentialFields.map((field) => (
            <DynamicField
              key={field.key}
              field={field}
              value={form.values[field.key] ?? ''}
              error={form.error !== null && field.required ? form.error : null}
              disabled={disabled || form.busy !== null || !view.descriptor.enabled}
              keepExistingHint={field.secret && view.credential.configuredSecrets.includes(field.key)}
              onChange={(key, value) => { onChange(view.descriptor.id, key, value) }}
            />
          ))}
          {form.error !== null ? (
            <p className="vf__error" role="alert">{form.error}</p>
          ) : null}
          <div className="setting-card__actions">
            <button
              className="btn btn--primary btn--sm"
              type="button"
              disabled={disabled || form.busy !== null || !view.descriptor.enabled || !form.dirty}
              onClick={onSave}
            >
              {form.busy === 'save' ? '校验并保存…' : '保存并测试'}
            </button>
            {view.credential.configured ? (
              <button className="btn btn--ghost btn--sm" type="button" disabled={disabled} onClick={onDelete}>
                <Icon name="trash" size={14} />
                删除 Key
              </button>
            ) : null}
          </div>
          {view.credential.lastVerifiedAt !== null ? (
            <p className="gen__hint">上次校验：{new Date(view.credential.lastVerifiedAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : (
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => { setExpanded(true) }}>
          配置
        </button>
      )}
    </div>
  )
}
