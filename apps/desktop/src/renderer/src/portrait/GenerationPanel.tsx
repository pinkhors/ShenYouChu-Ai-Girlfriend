import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/Icon'
import {
  DEFAULT_CHARACTER_PROMPT,
  buildExpressionPack,
  buildPrompt,
  loadGenerationConfig,
  saveGenerationConfig,
  type ImageGenerationConfig,
  type ImageProvider
} from './generationConfig'
import { PORTRAIT_SLOTS, type PortraitExpression } from './expression'

interface GenerationPanelProps {
  /** 生成成功后直接写入对应槽位；返回 false 表示持久化失败。 */
  readonly onSave: (slot: PortraitExpression, dataUrl: string) => Promise<boolean>
  /** 当前角色的基础提示词；不传则使用旧的沈幼楚默认值。 */
  readonly basePrompt?: string
}

type BusyState = 'idle' | 'single' | 'batch'

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : '生成失败'
  const cleaned = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(cleaned)) {
    return '无法连接出图服务，请检查地址、端口，以及 ComfyUI / 云 API 是否已启动。'
  }
  return cleaned
}

/** AI 出图面板：ComfyUI（本地）或 OpenAI 兼容云 API，生成基础图与整组表情。 */
export default function GenerationPanel({ onSave, basePrompt }: GenerationPanelProps) {
  const [config, setConfig] = useState<ImageGenerationConfig>(() => loadGenerationConfig())
  const [prompt, setPrompt] = useState(basePrompt ?? DEFAULT_CHARACTER_PROMPT)
  const [busy, setBusy] = useState<BusyState>('idle')
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ slot: PortraitExpression; dataUrl: string } | null>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    saveGenerationConfig(config)
  }, [config])

  useEffect(() => {
    return () => {
      cancelRef.current = true
    }
  }, [])

  const update = (patch: Partial<ImageGenerationConfig>): void => {
    setConfig((previous) => ({ ...previous, ...patch }))
  }

  const switchProvider = (provider: ImageProvider): void => {
    if (provider === 'openai' && config.provider === 'comfyui') {
      update({
        provider,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-image-1',
        width: 1024,
        height: 1536
      })
      return
    }
    if (provider === 'comfyui' && config.provider === 'openai') {
      update({
        provider,
        baseUrl: 'http://127.0.0.1:8188',
        model: 'sd_xl_base_1.0.safetensors',
        width: 832,
        height: 1216
      })
      return
    }
    update({ provider })
  }

  const generateOne = async (expression: PortraitExpression, promptText: string): Promise<void> => {
    const desktop = window.desktop
    if (desktop === undefined) {
      throw new Error('当前是浏览器环境：生图需要 Electron 桌面端，请用 npm run dev 打开应用窗口，而不是浏览器标签页')
    }
    if (desktop.imagegen === undefined || desktop.bridgeVersion !== 2) {
      throw new Error('桌面端 preload 还是旧版本：请完全退出 Electron 后重新运行 npm run dev（preload 改动不会热更新）')
    }
    const dataUrl = await desktop.imagegen.generate({
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      prompt: promptText,
      negativePrompt: config.negativePrompt,
      width: config.width,
      height: config.height,
      steps: config.steps,
      cfgScale: config.cfgScale,
      seed: config.seed
    })
    const saved = await onSave(expression, dataUrl)
    if (!saved) {
      throw new Error('图片生成成功，但保存到本机失败')
    }
    setPreview({ slot: expression, dataUrl })
  }

  const handleSingle = async (): Promise<void> => {
    if (busy !== 'idle') {
      return
    }
    setBusy('single')
    setError(null)
    setProgress({ current: 1, total: 1, label: '基础' })
    try {
      await generateOne('neutral', buildPrompt(prompt, 'neutral'))
    } catch (generateError) {
      setError(describeError(generateError))
    } finally {
      setBusy('idle')
      setProgress(null)
    }
  }

  const handlePack = async (): Promise<void> => {
    if (busy !== 'idle') {
      return
    }
    setBusy('batch')
    setError(null)
    cancelRef.current = false
    const pack = buildExpressionPack(prompt)
    try {
      for (let index = 0; index < pack.length; index += 1) {
        if (cancelRef.current) {
          break
        }
        const item = pack[index]
        if (item === undefined) {
          continue
        }
        const label = PORTRAIT_SLOTS.find((slot) => slot.id === item.expression)?.label ?? item.expression
        setProgress({ current: index + 1, total: pack.length, label })
        await generateOne(item.expression, item.prompt)
      }
    } catch (generateError) {
      setError(describeError(generateError))
    } finally {
      setBusy('idle')
      setProgress(null)
    }
  }

  const busyLabel = progress === null ? '生成中…' : `${progress.current}/${progress.total} · ${progress.label}`

  return (
    <details className="gen">
      <summary className="gen__summary">
        <Icon name="sparkles" size={16} />
        AI 生成（可选）
        <span className="gen__summary-hint">ComfyUI / 云 API</span>
      </summary>

      <div className="gen__body">
        <div className="gen__row">
          <label className="gen__field">
            <span>服务</span>
            <select
              className="select"
              value={config.provider}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                switchProvider(event.target.value === 'openai' ? 'openai' : 'comfyui')
              }}
            >
              <option value="comfyui">ComfyUI（本地）</option>
              <option value="openai">OpenAI 兼容（云）</option>
            </select>
          </label>
          <label className="gen__field gen__field--grow">
            <span>服务地址</span>
            <input
              className="creator__input"
              type="text"
              value={config.baseUrl}
              placeholder={config.provider === 'comfyui' ? 'http://127.0.0.1:8188' : 'https://api.openai.com/v1'}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ baseUrl: event.target.value })
              }}
            />
          </label>
        </div>

        <label className="gen__field">
          <span>{config.provider === 'comfyui' ? 'Checkpoint' : '图像模型（不是聊天模型）'}</span>
          <input
            className="creator__input"
            type="text"
            value={config.model}
            placeholder={config.provider === 'comfyui' ? 'sd_xl_base_1.0.safetensors' : 'gpt-image-1 / flux / seedream'}
            disabled={busy !== 'idle'}
            onChange={(event) => {
              update({ model: event.target.value })
            }}
          />
        </label>

        {config.provider === 'openai' && (
          <label className="gen__field">
            <span>API Key（只存本机）</span>
            <input
              className="creator__input"
              type="password"
              value={config.apiKey}
              placeholder="sk-..."
              autoComplete="off"
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ apiKey: event.target.value })
              }}
            />
          </label>
        )}

        <label className="gen__field">
          <span>角色描述</span>
          <textarea
            className="gen__textarea"
            rows={3}
            value={prompt}
            disabled={busy !== 'idle'}
            onChange={(event) => {
              setPrompt(event.target.value)
            }}
          />
        </label>

        <label className="gen__field">
          <span>负面提示词</span>
          <textarea
            className="gen__textarea"
            rows={2}
            value={config.negativePrompt}
            disabled={busy !== 'idle'}
            onChange={(event) => {
              update({ negativePrompt: event.target.value })
            }}
          />
        </label>

        <div className="gen__grid">
          <label className="gen__field">
            <span>宽</span>
            <input
              className="creator__input"
              type="number"
              min={256}
              max={2048}
              step={8}
              value={config.width}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ width: Number(event.target.value) || config.width })
              }}
            />
          </label>
          <label className="gen__field">
            <span>高</span>
            <input
              className="creator__input"
              type="number"
              min={256}
              max={2048}
              step={8}
              value={config.height}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ height: Number(event.target.value) || config.height })
              }}
            />
          </label>
          <label className="gen__field">
            <span>步数</span>
            <input
              className="creator__input"
              type="number"
              min={1}
              max={80}
              value={config.steps}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ steps: Number(event.target.value) || config.steps })
              }}
            />
          </label>
          <label className="gen__field">
            <span>CFG</span>
            <input
              className="creator__input"
              type="number"
              min={1}
              max={20}
              step={0.5}
              value={config.cfgScale}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ cfgScale: Number(event.target.value) || config.cfgScale })
              }}
            />
          </label>
          <label className="gen__field">
            <span>Seed</span>
            <input
              className="creator__input"
              type="number"
              min={0}
              value={config.seed}
              disabled={busy !== 'idle'}
              onChange={(event) => {
                update({ seed: Number(event.target.value) || 0 })
              }}
            />
          </label>
          <button
            className="btn btn--ghost btn--sm gen__dice"
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => {
              update({ seed: Math.floor(Math.random() * 2_000_000_000) })
            }}
          >
            随机 seed
          </button>
        </div>

        <div className="gen__actions">
          <button
            className="btn btn--primary btn--sm"
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => {
              void handleSingle()
            }}
          >
            生成基础图
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={busy !== 'idle'}
            onClick={() => {
              void handlePack()
            }}
          >
            生成整组表情（7 张）
          </button>
          {busy === 'batch' && (
            <button
              className="btn btn--danger btn--sm"
              type="button"
              onClick={() => {
                cancelRef.current = true
              }}
            >
              停止
            </button>
          )}
        </div>

        {busy !== 'idle' && (
          <p className="gen__status" role="status">
            <span className="gen__spinner" aria-hidden="true" />
            {busyLabel}
          </p>
        )}

        {error !== null && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {preview !== null && (
          <div className="gen__preview">
            <img src={preview.dataUrl} alt="生成结果" />
            <span className="muted">
              已保存到「{PORTRAIT_SLOTS.find((slot) => slot.id === preview.slot)?.label ?? preview.slot}」
            </span>
          </div>
        )}

        <p className="gen__hint">
          ComfyUI 需要先启动并填对 checkpoint；云 API 的地址要包含 <code>/v1</code>，模型必须是支持
          <code>images/generations</code> 的图像模型（kimi 等聊天模型不能生图）。整组生成会逐张写入槽位，中途可停止。
        </p>
      </div>
    </details>
  )
}
