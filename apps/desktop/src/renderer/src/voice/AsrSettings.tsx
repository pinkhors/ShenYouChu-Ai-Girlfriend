import { useEffect, useState } from 'react'
import { loadAsrConfig, saveAsrConfig, type AsrConfig } from './voiceConfig'

/**
 * 「语音」页的通话语音识别（ASR）设置。
 * 从旧的「设置 → 语音」卡片迁移而来：TTS 朗读改由通话默认声音承担，这里只保留识别。
 */
export default function AsrSettings() {
  const [asr, setAsr] = useState<AsrConfig>(() => loadAsrConfig())

  useEffect(() => {
    saveAsrConfig(asr)
  }, [asr])

  return (
    <section className="setting-card">
      <h2 className="setting-card__title">通话语音识别（ASR）</h2>
      <p className="setting-card__desc">
        留空则通话页不显示麦克风；填 OpenAI 兼容地址后可以按住说话，录音会上传到该服务。地址写到 <code>/v1</code>。
      </p>

      <div className="gen__row">
        <label className="gen__field gen__field--grow">
          <span>识别服务地址</span>
          <input
            className="creator__input"
            type="text"
            placeholder="https://api.openai.com/v1"
            value={asr.baseUrl}
            onChange={(event) => {
              setAsr((previous) => ({ ...previous, baseUrl: event.target.value }))
            }}
          />
        </label>
        <label className="gen__field">
          <span>模型</span>
          <input
            className="creator__input"
            type="text"
            placeholder="whisper-1"
            value={asr.model}
            onChange={(event) => {
              setAsr((previous) => ({ ...previous, model: event.target.value }))
            }}
          />
        </label>
      </div>
      <label className="gen__field">
        <span>识别 API Key（只存本机）</span>
        <input
          className="creator__input"
          type="password"
          autoComplete="off"
          placeholder="sk-..."
          value={asr.apiKey}
          onChange={(event) => {
            setAsr((previous) => ({ ...previous, apiKey: event.target.value }))
          }}
        />
      </label>

      <p className="gen__hint">只保存在本机 localStorage；共用电脑时注意清理。云端服务不可用时不会显示麦克风入口。</p>
    </section>
  )
}
