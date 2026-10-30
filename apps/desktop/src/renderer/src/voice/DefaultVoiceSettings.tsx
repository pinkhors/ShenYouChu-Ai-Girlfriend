import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  getVoiceSettings,
  saveVoiceSettings,
  speakVoice,
  type VoiceFieldSchema,
  type VoiceProviderView
} from '../api/client'
import Icon from '../ui/Icon'
import DynamicField from './DynamicField'
import { isProviderUsable, usableCapabilities } from './workbench'

/**
 * 通话默认声音：服务端 user_voice_settings，跨设备一致。
 * 只允许选择「已启用 + 凭据有效 + 支持 SPEAK」的模型。
 */
interface DefaultVoiceSettingsProps {
  readonly providers: readonly VoiceProviderView[]
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : fallback
}

export default function DefaultVoiceSettings({ providers }: DefaultVoiceSettingsProps) {
  const speakProviders = providers.filter(
    (view) => isProviderUsable(view) && usableCapabilities(view).includes('SPEAK')
  )

  const [configured, setConfigured] = useState(false)
  const [providerId, setProviderId] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  const selected = speakProviders.find((view) => view.descriptor.id === providerId)

  const load = useCallback(async (): Promise<void> => {
    try {
      const settings = await getVoiceSettings()
      setConfigured(settings.configured)
      setProviderId(settings.providerId ?? '')
      setParams({ ...settings.params })
    } catch (loadError) {
      setError(describeError(loadError, '无法读取通话默认声音'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* 首次拿到可用模型时，默认选中第一个，并用 schema 默认值填充参数。 */
  useEffect(() => {
    if (providerId === '' && speakProviders.length > 0) {
      selectProvider(speakProviders[0].descriptor.id, speakProviders)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  const selectProvider = (nextId: string, views: readonly VoiceProviderView[] = speakProviders): void => {
    const view = views.find((item) => item.descriptor.id === nextId)
    setProviderId(nextId)
    setParams(defaultsFor(view))
    setNotice(null)
    setPreviewSrc(null)
  }

  const fields: readonly VoiceFieldSchema[] =
    selected?.descriptor.generationFields.SPEAK ?? []

  const handleSave = async (): Promise<void> => {
    if (selected === undefined) {
      setError('请先选择语音模型')
      return
    }
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const saved = await saveVoiceSettings({ enabled: true, providerId: selected.descriptor.id, params })
      setConfigured(saved.configured)
      setProviderId(saved.providerId ?? selected.descriptor.id)
      setParams({ ...saved.params })
      setNotice('已保存为通话默认声音')
    } catch (saveError) {
      setError(describeError(saveError, '保存失败'))
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (selected === undefined) {
      return
    }
    if (!configured) {
      setError('请先保存默认声音再试听')
      return
    }
    setBusy('test')
    setError(null)
    try {
      const result = await speakVoice({ text: '你好，我在呢。' })
      setPreviewSrc(`data:audio/${result.format};base64,${result.audioBase64}`)
    } catch (testError) {
      setError(describeError(testError, '试听失败'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="setting-card">
      <h2 className="setting-card__title">通话默认声音</h2>
      <p className="setting-card__desc">
        通话页会按句调用这里的默认声音；未配置或调用失败时自动回退系统语音。
      </p>

      {speakProviders.length === 0 ? (
        <p className="gen__hint">还没有可用模型：先在下方模型卡填写 API Key 并保存测试。</p>
      ) : (
        <>
          <div className="gen__row">
            <label className="gen__field gen__field--grow">
              <span>语音模型</span>
              <select
                className="select"
                value={providerId}
                disabled={busy !== null}
                onChange={(event) => { selectProvider(event.target.value) }}
              >
                {speakProviders.map((view) => (
                  <option key={view.descriptor.id} value={view.descriptor.id}>
                    {view.descriptor.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {fields.length > 0 ? (
            <div className="gen__row vb__params">
              {fields.map((field) => (
                <DynamicField
                  key={field.key}
                  field={field}
                  value={params[field.key] ?? field.defaultValue ?? ''}
                  error={null}
                  disabled={busy !== null}
                  keepExistingHint={false}
                  onChange={(key, value) => {
                    setParams((previous) => ({ ...previous, [key]: value }))
                    setNotice(null)
                  }}
                />
              ))}
            </div>
          ) : null}

          <div className="setting-card__actions">
            <button className="btn btn--primary btn--sm" type="button" disabled={busy !== null} onClick={() => { void handleSave() }}>
              {busy === 'save' ? '保存中…' : '保存默认声音'}
            </button>
            <button className="btn btn--ghost btn--sm" type="button" disabled={busy !== null || !configured} onClick={() => { void handleTest() }}>
              <Icon name="mic" size={14} />
              {busy === 'test' ? '合成中…' : '试听一句'}
            </button>
            {notice !== null ? <span className="vb__chip vb__chip--ok">{notice}</span> : null}
          </div>

          {previewSrc !== null ? <audio controls src={previewSrc} className="vb__preview-audio" /> : null}
        </>
      )}

      {error !== null ? (
        <p className="vf__error" role="alert">{error}</p>
      ) : null}
    </section>
  )
}

function defaultsFor(view: VoiceProviderView | undefined): Record<string, string> {
  const fields = view?.descriptor.generationFields.SPEAK ?? []
  const params: Record<string, string> = {}
  for (const field of fields) {
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      params[field.key] = field.defaultValue
    }
  }
  return params
}
