import { useEffect, useState } from 'react'
import {
  loadAsrConfig,
  loadTtsConfig,
  saveAsrConfig,
  saveTtsConfig,
  type AsrConfig,
  type TtsConfig
} from './voiceConfig'

/**
 * 设置页的「语音」卡片：TTS 与 ASR 都走 OpenAI 兼容接口，
 * 留空即保持系统语音 / 不启用语音识别。
 */
export default function VoiceSettings() {
  const [tts, setTts] = useState<TtsConfig>(() => loadTtsConfig())
  const [asr, setAsr] = useState<AsrConfig>(() => loadAsrConfig())

  useEffect(() => {
    saveTtsConfig(tts)
  }, [tts])

  useEffect(() => {
    saveAsrConfig(asr)
  }, [asr])

  return (
    <section className="setting-card">
      <h2 className="setting-card__title">语音</h2>
      <p className="setting-card__desc">
        默认使用系统语音朗读；填了 OpenAI 兼容服务后，通话会用返回的音频驱动口型。地址写到 <code>/v1</code>。
      </p>

      <div className="gen__row">
        <label className="gen__field">
          <span>朗读方式</span>
          <select
            className="select"
            value={tts.provider}
            onChange={(event) => {
              setTts((previous) => ({
                ...previous,
                provider: event.target.value === 'openai' ? 'openai' : 'browser'
              }))
            }}
          >
            <option value="browser">系统语音</option>
            <option value="openai">云端 TTS</option>
          </select>
        </label>
        {tts.provider === 'openai' && (
          <label className="gen__field gen__field--grow">
            <span>服务地址</span>
            <input
              className="creator__input"
              type="text"
              placeholder="https://api.openai.com/v1"
              value={tts.baseUrl}
              onChange={(event) => {
                setTts((previous) => ({ ...previous, baseUrl: event.target.value }))
              }}
            />
          </label>
        )}
      </div>

      {tts.provider === 'openai' && (
        <>
          <div className="gen__row">
            <label className="gen__field gen__field--grow">
              <span>模型</span>
              <input
                className="creator__input"
                type="text"
                placeholder="tts-1"
                value={tts.model}
                onChange={(event) => {
                  setTts((previous) => ({ ...previous, model: event.target.value }))
                }}
              />
            </label>
            <label className="gen__field">
              <span>音色</span>
              <input
                className="creator__input"
                type="text"
                placeholder="nova"
                value={tts.voice}
                onChange={(event) => {
                  setTts((previous) => ({ ...previous, voice: event.target.value }))
                }}
              />
            </label>
          </div>
          <label className="gen__field">
            <span>API Key（只存本机）</span>
            <input
              className="creator__input"
              type="password"
              autoComplete="off"
              placeholder="sk-..."
              value={tts.apiKey}
              onChange={(event) => {
                setTts((previous) => ({ ...previous, apiKey: event.target.value }))
              }}
            />
          </label>
        </>
      )}

      <div className="setting-card__divider" />

      <p className="setting-card__desc">
        语音识别（ASR）：留空则通话页不显示麦克风；填地址后可以按住说话，录音会上传到该服务。
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

      <p className="gen__hint">
        两项都只保存在本机 localStorage；共用电脑时注意清理。云端服务不可用时会回退系统语音。
      </p>
    </section>
  )
}
