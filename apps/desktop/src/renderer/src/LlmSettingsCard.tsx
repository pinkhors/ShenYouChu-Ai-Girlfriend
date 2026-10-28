import { useEffect, useState } from 'react'
import {
  ApiError,
  getLlmSettings,
  resetLlmSettings,
  saveLlmSettings,
  testLlmSettings,
  type LlmSettingsSource,
  type LlmSettingsView,
  type LlmTestResult
} from './api/client'
import Icon from './ui/Icon'
import { formatTime } from './ui/time'

interface FormState {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string
  maxTokens: number
  temperature: number
  timeoutSeconds: number
}

const EMPTY_FORM: FormState = {
  enabled: false,
  baseUrl: '',
  model: '',
  apiKey: '',
  maxTokens: 512,
  temperature: 0.8,
  timeoutSeconds: 60
}

function toForm(view: LlmSettingsView): FormState {
  return {
    enabled: view.enabled,
    baseUrl: view.baseUrl,
    model: view.model,
    apiKey: '',
    maxTokens: view.maxTokens,
    temperature: view.temperature,
    timeoutSeconds: view.timeoutSeconds
  }
}

function sourceLabel(source: LlmSettingsSource): string {
  switch (source) {
    case 'USER':
      return '用户配置'
    case 'ENV':
      return '服务端默认'
    default:
      return '未配置'
  }
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

/**
 * 设置页「模型」卡片：每个账号保存自己的 OpenAI 兼容 LLM 配置。
 * Key 只写不读；留空表示保留已保存的 Key；重置后回退到服务端环境变量。
 */
export default function LlmSettingsCard() {
  const [view, setView] = useState<LlmSettingsView | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | 'reset' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)

  const applyView = (next: LlmSettingsView): void => {
    setView(next)
    setForm(toForm(next))
  }

  const load = async (): Promise<void> => {
    setLoading(true)
    setLoadFailed(false)
    setError(null)
    try {
      applyView(await getLlmSettings())
    } catch (loadError) {
      setError(toMessage(loadError))
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const update = (patch: Partial<FormState>): void => {
    setForm((previous) => ({ ...previous, ...patch }))
    setTestResult(null)
  }

  const handleSave = async (): Promise<void> => {
    setError(null)
    setTestResult(null)
    if (form.enabled && form.baseUrl.trim() === '') {
      setError('启用时必须填写 Base URL')
      return
    }
    if (form.enabled && form.model.trim() === '') {
      setError('启用时必须填写模型名')
      return
    }
    if (
      form.enabled &&
      view !== null &&
      view.source === 'ENV' &&
      view.hasApiKey &&
      form.apiKey.trim() === ''
    ) {
      setError('服务端 Key 不会复制到用户配置：请填写你自己的 Key，或直接使用服务端默认（不要保存）')
      return
    }

    setBusy('save')
    try {
      const saved = await saveLlmSettings({
        enabled: form.enabled,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey.trim(),
        maxTokens: form.maxTokens,
        temperature: form.temperature,
        timeoutSeconds: form.timeoutSeconds
      })
      applyView(saved)
    } catch (saveError) {
      setError(toMessage(saveError))
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async (): Promise<void> => {
    setError(null)
    setTestResult(null)
    setBusy('test')
    try {
      setTestResult(await testLlmSettings())
    } catch (testError) {
      setError(toMessage(testError))
    } finally {
      setBusy(null)
    }
  }

  const handleReset = async (): Promise<void> => {
    if (!window.confirm('恢复服务端默认后，你保存的 Base URL、模型与 Key 都会被删除，确定吗？')) {
      return
    }
    setError(null)
    setTestResult(null)
    setBusy('reset')
    try {
      await resetLlmSettings()
      applyView(await getLlmSettings())
    } catch (resetError) {
      setError(toMessage(resetError))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <section className="setting-card">
        <h2 className="setting-card__title">模型（LLM）</h2>
        <p className="muted">正在读取模型配置…</p>
      </section>
    )
  }

  if (loadFailed || view === null) {
    return (
      <section className="setting-card">
        <h2 className="setting-card__title">模型（LLM）</h2>
        <p className="alert" role="alert">
          {error ?? '模型配置读取失败；为避免覆盖服务端默认配置，暂不允许保存。'}
        </p>
        <button className="btn btn--ghost" type="button" onClick={() => void load()}>
          重试
        </button>
      </section>
    )
  }

  return (
    <section className="setting-card">
      <h2 className="setting-card__title">模型（LLM）</h2>
      <p className="setting-card__desc">
        每个账号独立保存；修改后下一条消息即生效。Key 只存服务端，接口不会回显。
      </p>

      <div className="setting-row">
        <span className="setting-row__label">当前来源</span>
        <span className="setting-row__value">
          <span className={`llm-badge llm-badge--${(view?.source ?? 'NONE').toLowerCase()}`}>
            {sourceLabel(view?.source ?? 'NONE')}
          </span>
          {view?.hasApiKey === true && <span className="llm-badge llm-badge--key">Key 已保存</span>}
          {view?.updatedAt !== null && view?.updatedAt !== undefined && (
            <span className="muted">更新于 {formatTime(view.updatedAt)}</span>
          )}
        </span>
      </div>

      <label className="llm-toggle">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        启用真实 LLM（关闭时使用确定性占位回复）
      </label>

      <div className="gen__row">
        <label className="gen__field gen__field--grow">
          <span>Base URL（含 /v1）</span>
          <input
            className="creator__input"
            type="text"
            placeholder="https://api.deepseek.com/v1"
            value={form.baseUrl}
            disabled={busy !== null}
            onChange={(event) => update({ baseUrl: event.target.value })}
          />
        </label>
        <label className="gen__field">
          <span>模型</span>
          <input
            className="creator__input"
            type="text"
            placeholder="deepseek-chat"
            value={form.model}
            disabled={busy !== null}
            onChange={(event) => update({ model: event.target.value })}
          />
        </label>
      </div>

      <label className="gen__field">
        <span>API Key</span>
        <input
          className="creator__input"
          type="password"
          autoComplete="off"
          placeholder={view?.hasApiKey === true ? '已保存，留空不修改' : 'sk-...'}
          value={form.apiKey}
          disabled={busy !== null}
          onChange={(event) => update({ apiKey: event.target.value })}
        />
      </label>

      <div className="gen__grid">
        <label className="gen__field">
          <span>Max tokens</span>
          <input
            className="creator__input"
            type="number"
            min={1}
            max={4096}
            value={form.maxTokens}
            disabled={busy !== null}
            onChange={(event) => update({ maxTokens: Number(event.target.value) || form.maxTokens })}
          />
        </label>
        <label className="gen__field">
          <span>Temperature</span>
          <input
            className="creator__input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature}
            disabled={busy !== null}
            onChange={(event) => {
              const value = Number(event.target.value)
              update({ temperature: Number.isFinite(value) ? value : form.temperature })
            }}
          />
        </label>
        <label className="gen__field">
          <span>超时（秒）</span>
          <input
            className="creator__input"
            type="number"
            min={1}
            max={120}
            value={form.timeoutSeconds}
            disabled={busy !== null}
            onChange={(event) => update({ timeoutSeconds: Number(event.target.value) || form.timeoutSeconds })}
          />
        </label>
      </div>

      <div className="setting-card__actions">
        <button className="btn btn--primary" type="button" disabled={busy !== null} onClick={() => void handleSave()}>
          {busy === 'save' ? '保存中…' : '保存'}
        </button>
        <button className="btn btn--ghost" type="button" disabled={busy !== null} onClick={() => void handleTest()}>
          <Icon name="pulse" size={16} />
          {busy === 'test' ? '测试中…' : '测试连接'}
        </button>
        <button className="btn btn--ghost" type="button" disabled={busy !== null} onClick={() => void handleReset()}>
          恢复服务端默认
        </button>
      </div>

      {testResult !== null && (
        <p className={testResult.ok ? 'llm-test llm-test--ok' : 'llm-test llm-test--fail'} role="status">
          {testResult.ok
            ? `连接成功 · ${testResult.latencyMs}ms · ${testResult.model}`
            : `连接失败 · ${testResult.error ?? '未知错误'}`}
        </p>
      )}

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <p className="gen__hint">
        “测试连接”使用已保存的配置；修改后请先保存。DeepSeek：<code>https://api.deepseek.com/v1</code> +{' '}
        <code>deepseek-chat</code>；服务端默认只读，重置后回退到环境变量。
      </p>
    </section>
  )
}
