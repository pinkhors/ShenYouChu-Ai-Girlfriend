# 14 语音方案定稿：CosyVoice 说话 + Breeze 唱句

> **BYOK、Breeze 开关、7 天保留、导出 AI 标识、电平口型的最终落地修订见 [15 BYOK 落地决策](./15-byok-launch-decisions.md)；与本文冲突时以 15 为准。**

- 状态：架构基线；BYOK 落地见 15
- 版本：v0.1（2026-10-29）
- 关联：[13 双云 TTS 方案评估](./13-dual-cloud-tts-evaluation.md)、[12 Breeze TTS 2 重构方案](./12-breeze-tts-2-redesign.md)、[产品需求文档](./01-product-requirements.md)、[技术实现路线](./02-technical-roadmap.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：按已确认的取舍，定稿“前端 → 后端 → 厂商”的语音架构；不含代码改动。

> 本方案采纳 13 的评估结论，并按以下决策收敛：**成本最低 > 音色一致 > 延迟最低 > 上线最快**；日常对话只用 CosyVoice，Breeze 只做短唱句/表演；接受“近似一致”的音色；视频先做语音通话 + 2D 立绘/口型，不做完整数字人视频流。

优先级落到设计上的含义：

1. **成本**：日常对话绝不走 Breeze；Breeze 只用于短唱句/表演，且先确认付费套餐/商用条款。
2. **音色一致**：同一参考音频克隆两家；接受“近似一致”，但用 ABX 设底线。
3. **延迟**：通话用 CosyVoice 实时 WebSocket，复用连接，不按句重连。
4. **上线速度**：先跑通 CosyVoice 复刻 + 语音消息/通话，再补 Breeze 唱句。

## 0. 决策锁定

| 项 | 定稿 |
|---|---|
| 调用链 | 前端 → 后端 → 厂商；前端不接触任何厂商 API Key |
| 统一入口 | `POST /ai-girl/voice/speak`（语音消息/单次合成）<br>`WS /ai-girl/voice/speak/stream`（通话流式）<br>`POST /ai-girl/voice/sing`（异步唱句） |
| 对话 TTS | **CosyVoice-v3-Flash**（百炼） |
| 唱句 | **Breeze TTS 2**，只做 1–4 行短唱句/哼唱/情绪表演 |
| 音色 | 同一段参考音频，分别克隆 CosyVoice 与 Breeze；接受“近似一致” |
| 通话 | 后端 WebSocket 代理 CosyVoice 实时流；PCM/MP3 下发 |
| 唱歌 | 后端异步任务；客户端拿 `jobId` 轮询/SSE，完成后取音频 |
| 视频 | V1 不做视频流；语音通话 + 2D 立绘 + 口型驱动；完整数字人放 V2 |
| 商用 | 日常对话不碰 Breeze 商用授权；Breeze 仅短唱句，按付费套餐/条款使用 |

## 1. 总体架构

```text
Electron/React
  ├─ HTTPS  POST /ai-girl/voice/speak
  ├─ WS     /ai-girl/voice/speak/stream
  ├─ HTTPS  POST /ai-girl/voice/sing
  └─ HTTPS  /ai-girl/voice/sing/{jobId}
        │ 只带登录态，不带厂商 Key
Spring Boot core
  ├─ VoiceController（统一入口、鉴权、限流）
  ├─ VoiceProfileService（一个音色，两个 provider ID）
  ├─ SpeechService（CosyVoice 实时/单次）
  ├─ SingingService（异步任务队列）
  ├─ BreezeClient / CosyVoiceClient
  ├─ AudioStore（对象存储/本地卷）
  └─ UsageLedger（字符/成本/配额）
        │ 服务端密钥
  ├─ 百炼 CosyVoice-v3-Flash（声音复刻 + 实时 WebSocket）
  └─ Breeze TTS 2（声音克隆 + `[唱歌]`/`[哼歌]`）
```

关键原则：

- **前端无厂商 Key**；所有厂商调用在 core。
- **一个 `voice_profile` 存两个外部 voice_id**：`cosyvoice_voice_id`、`breeze_voice_id`；任何一个失败不影响另一个场景（可先说话、后唱歌）。
- **一次文本只合成一次**；语音消息、通话、唱句各自独立，不重复调用。
- **Breeze 不参与日常对话**；只有 `sing` 路径调用。

## 2. API 设计

### 2.1 `POST /ai-girl/voice/speak`（语音消息/单次合成）

请求：

```json
{
  "conversationId": "1834...",
  "text": "今天也想见你，记得早点休息。",
  "voiceProfileId": "1835...",
  "emotion": "gentle",
  "format": "mp3"
}
```

响应：

```json
{
  "messageId": "1836...",
  "audioUrl": "/api/v1/audio/1836...",
  "format": "mp3",
  "durationMs": 4200,
  "provider": "cosyvoice",
  "voiceProfileId": "1835...",
  "degraded": false
}
```

- 文本上限：建议 300 中文字/条；超过提示分段，不静默截断。
- `format`：消息用 `mp3`（24 kHz/128 kbps 或 16 kHz 兼容）；需要高质量用 `wav`。
- 失败：返回明确错误，不生成空消息；前端回退文字。

### 2.2 `WS /ai-girl/voice/speak/stream`（通话流式）

客户端连接时带登录 token；服务端校验会话归属，代理到 CosyVoice 实时 WebSocket。

客户端 → 服务端：

```json
{"type":"start","turnId":"t1","voiceProfileId":"1835...","format":"pcm"}
{"type":"text","text":"我在呢，慢慢说。"}
{"type":"flush"}
{"type":"end"}
{"type":"cancel"}
```

服务端 → 客户端：

```json
{"type":"ready","sampleRate":24000,"channels":1,"format":"pcm_s16le"}
```
```text
<binary PCM frames>
```
```json
{"type":"done","turnId":"t1","durationMs":1800}
{"type":"error","code":"COSYVOICE_TIMEOUT","message":"语音服务超时"}
```

规则：

- 一个通话复用一条 WS；每轮用 `turnId` 区分；`cancel` 立即停止播放并丢弃迟到音频。
- 后端代理 CosyVoice WebSocket，保持厂商 Key 不落到客户端；代理增加一跳，需实测延迟。
- `text` 按句发送，句末 `flush`；不要等整段 LLM 输出完。
- 首音目标：P95 < 2 秒（后端代理 + 网络 + CosyVoice），POC 校准。
- 断线：客户端重连；未完成 turn 丢弃，不重放。

### 2.3 `POST /ai-girl/voice/sing`（异步唱句）

请求：

```json
{
  "conversationId": "1834...",
  "voiceProfileId": "1835...",
  "text": "祝你生日快乐，祝你生日快乐……",
  "mode": "sing",
  "style": "gentle",
  "format": "mp3"
}
```

响应（202）：

```json
{
  "jobId": "sing_1837...",
  "status": "queued",
  "estimatedSeconds": 8
}
```

查询：

```json
GET /ai-girl/voice/sing/sing_1837...
{
  "jobId": "sing_1837...",
  "status": "succeeded",
  "audioUrl": "/api/v1/audio/sing_1837...",
  "format": "mp3",
  "durationMs": 12000,
  "provider": "breeze",
  "degraded": false
}
```

- `mode`：`sing`（`[唱歌]`）或 `hum`（`[哼歌]`）。
- `style`：`gentle/playful/sad/excited`，映射成 Breeze `instructions`。
- 后端自建异步任务：worker 调 Breeze；短句可同步等待，长句用 Breeze async delivery；对客户端统一 `202 + jobId`。
- 任务状态：`queued/running/succeeded/failed/cancelled`；可取消。
- 文本上限：1–4 行、建议 ≤120 中文字；超过拒绝/建议分句。
- 不做伴奏、不做音高/旋律编辑；UI 明确“唱腔短句”。

### 2.4 声音克隆：`POST /ai-girl/voice/clone`

`multipart/form-data`：`audio`、`name`、`language`、`consentVersion`。

流程：

```text
上传参考音频
  → 后端归一化（单声道/24k/去首尾静音/峰值归一）
  → CosyVoice create_voice（target_model=cosyvoice-v3-flash）
  → Breeze clone preview → save（消耗 slot）
  → 返回 profile：两个 provider 各自 ready/failed
```

- 参考音频：建议 10–20 秒、单人、无 BGM；CosyVoice 支持 5–20 秒；Breeze 3 秒–5 MB。
- 同一段音频给两家，保证“近似一致”。
- 任一家失败：profile 允许部分可用；UI 显示“会说话/会唱歌”两个状态。
- 删除：分别调用 CosyVoice delete_voice、Breeze DELETE voice，并清本地音频。

## 3. Provider 适配

### 3.1 CosyVoice-v3-Flash（对话）

**声音复刻**：

```http
POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/customization
Authorization: Bearer <DASHSCOPE_API_KEY>
Content-Type: application/json

{
  "model": "voice-enrollment",
  "input": {
    "action": "create_voice",
    "target_model": "cosyvoice-v3-flash",
    "prefix": "syc",
    "audio": "data:audio/wav;base64,...",
    "language_hints": ["zh"],
    "max_prompt_audio_length": 20,
    "enable_preprocess": true
  }
}
```

- 返回 `output.voice_id`；状态 `DEPLOYING → OK / UNDEPLOYED`，需轮询 `query_voice`。
- 查询/删除使用同一接口，`action=list_voice/query_voice/delete_voice`。
- 复刻音色必须与 `target_model=cosyvoice-v3-flash` 一致。

**实时流式**：

- 通过 DashScope Java SDK WebSocket：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`。
- 参数：`model=cosyvoice-v3-flash`、`voice=<clone voice_id>`、`format=pcm/mp3`、`sample_rate=24000`、`instruction`（复刻音色支持中文等自然语言指令）。
- 逐段 `send_text`、`flush`、`stop`；取消用 `streamingCancel`/`finish-task`。
- 单次 HTTP：`POST .../api/v1/services/audio/tts/SpeechSynthesizer`，适合语音消息；流式可加 `X-DashScope-SSE: enable`。
- AIGC 隐性标识：CosyVoice-v3-Flash 支持 `enable_aigc_tag=true`，合成时写入标识；产品侧同时做显式“AI 合成语音”标注。

### 3.2 Breeze TTS 2（唱句）

- Base `https://api.breeze.blue`，Header `xi-api-key`。
- 声音克隆：`POST /v1/voice-previews/clone` → `GET .../stream` → `POST .../save`；保存消耗 slot。
- 唱句：`POST /v1/text-to-speech/{voice_id}`，`text` 内放 `[唱歌]` 或 `[哼歌]`，`instructions` 描述风格；输出 `mp3/wav`。
- `[唱歌]`/`[哼歌]` 是 vocal delivery 标签，不做音符/旋律/伴奏控制；只做短句。
- 商业使用必须用付费托管套餐；Free 不可商用；自托管权重非商用。

### 3.3 音色一致性

- 同一参考音频分别克隆；`voice_profile` 保存两家的 voice_id。
- POC：同一句“今天也想见你”和同一句唱句，5–10 人 ABX；接受“近似一致”，但需设底线（例如多数人认为同一人）。
- 若差太多：
  - 优先调 CosyVoice 复刻样本/预处理（`enable_preprocess`、`max_prompt_audio_length`）；
  - 仍不行则接受“通话/唱句略有差异”并在产品上不强调“完全同声”；
  - 不在 V1 引入 SVC 对齐（成本/复杂度高）。

## 4. 数据模型（草案）

`voice_profiles`：

| 字段 | 说明 |
|---|---|
| id / user_id / character_id | 归属；V1 可全局 |
| ref_audio_object_key | 同一段参考音频 |
| cosyvoice_voice_id / cosyvoice_status | 对话音色；`deploying/ok/failed` |
| breeze_voice_id / breeze_status | 唱句音色；`ready/failed` |
| language / display_name | 展示 |
| consent_version / consented_at | 授权 |
| created_at / updated_at / deleted_at | 审计 |

`speech_messages`：

| 字段 | 说明 |
|---|---|
| id / message_id / user_id | 归属 |
| voice_profile_id / provider | 音色/厂商 |
| object_key / format / duration_ms | 音频 |
| text_hash / transcript | 防重/字幕 |
| created_at | 审计 |

`sing_jobs`：

| 字段 | 说明 |
|---|---|
| id / user_id / voice_profile_id | 归属 |
| text / mode / style | `sing/hum` |
| status / progress | 任务状态 |
| provider_job_id | Breeze 异步任务 ID（如使用） |
| object_key / duration_ms / error_code | 结果 |
| created_at / updated_at | 审计 |

`voice_usage`：

| 字段 | 说明 |
|---|---|
| id / user_id / provider / endpoint | 调用 |
| characters / credits / estimated_cost | 计量 |
| request_id / created_at | 对账 |

## 5. 关键流程

### 5.1 首次配置

```text
设置 → 声音 → 克隆音色
  → 上传 10–20 秒干声
  → 后端归一化
  → CosyVoice create_voice（轮询到 OK）
  → Breeze clone preview → save
  → 显示：会说话 ✓ / 会唱歌 ✓（或部分失败）
  → 试听两句：一句说话、一句唱句
```

### 5.2 通话

```text
进入通话 → WS /ai-girl/voice/speak/stream
  → start(turnId, voiceProfileId)
  → LLM 逐句 text → flush
  → 后端 CosyVoice WS → PCM 帧
  → 客户端流式播放 + 口型电平
  → 用户打断 → cancel → 丢弃迟到音频
```

### 5.3 语音消息

```text
输入文字 → 发语音
  → POST /voice/speak
  → CosyVoice 单次 HTTP
  → 存音频 → 语音气泡
```

### 5.4 唱句

```text
点“唱一句” → 歌词 + 风格
  → POST /voice/sing → 202 jobId
  → 轮询/SSE
  → Breeze `[唱歌]`/`[哼歌]`
  → 完成 → 试听/发送/保存
```

### 5.5 失败与降级

| 失败 | 行为 |
|---|---|
| CosyVoice 超时/限流 | 重试 1 次；仍失败回文字；通话提示“语音暂时不可用” |
| CosyVoice 复刻审核失败 | profile 标记 speech failed；可重录/重试 |
| Breeze 失败/额度不足 | 唱句失败；文字提示；不影响通话 |
| Breeze 商用授权未就绪 | 唱句功能灰度/关闭；通话不受影响 |
| WS 断线 | 停止播放；重连；不重放旧 turn |
| 余额不足 | 管理员告警；用户提示；不无限重试 |

## 6. 界面结构

```text
聊天
 ├─ 输入框：[文字] [🎤] [🔊 发语音] [🎵 唱一句]
 ├─ 语音气泡：播放/波形/时长/字幕
 └─ 唱句卡片：播放/发送/保存

通话
 ├─ 语音通话（WebSocket 流式）
 ├─ 2D 立绘/口型（复用现有头像/电平；V1.5 精细口型）
 └─ 唱一句（弹层）

设置 → 声音
 ├─ 我的音色：会说话 ✓ / 会唱歌 ✓
 ├─ 克隆音色（上传/试听/删除）
 ├─ 语音回复开关
 ├─ 用量/额度
 └─ 隐私/授权说明
```

- 不给用户暴露 CosyVoice/Breeze 品牌/Key；只显示“音色/引擎状态”。
- 唱句弹层明确“Breeze 唱腔短句，不是完整歌曲；无伴奏”。
- 视频：V1 只做语音通话 + 2D 立绘/口型电平；不做 WebRTC 视频流、不做完整数字人。

## 7. 成本、延迟与配额

### 7.1 成本

| 项 | 估算 |
|---|---|
| CosyVoice-v3-Flash | ¥1/万字符 ≈ ¥100/百万字符 |
| Breeze 唱句 | $30/百万加权字符；中文每字 2 units；短句量小 |
| Breeze 套餐 | Starter/Creator/Pro；按 voice slot/并发选 |
| 存储/流量 | 语音消息/唱句音频 |

示例（1,000 用户 × 20 条/天 × 50 字 × 30 天 = 30M 中文字/月）：

- CosyVoice 对话：约 **¥3,000/月**。
- Breeze 唱句（每人每天 1 条 × 50 字）：约 **¥645/月** + 套餐费。
- 若 Breeze 全包对话：约 **¥12,900/月**，不采用。

### 7.2 延迟

| 场景 | 目标 |
|---|---|
| 通话首音 | P95 < 2 秒（后端代理 + 百炼 + 网络） |
| 语音消息 | 2–5 秒内出音频 |
| 唱句异步 | 10–30 秒（短句）；UI 显示进度 |
| WS 取消 | 500 ms 内停止播放 |

### 7.3 配额

- 每用户每月对话字符配额；唱句次数/字符配额。
- Breeze 套餐 slot 数限制用户克隆数；超出提示升级/删除。
- 低余额/限流告警；不静默降级到 Breeze（成本优先）。

## 8. 安全与合规

- 厂商 Key 只在 core 环境变量/密钥管理；前端/日志不出现。
- WS 鉴权：登录 token + 会话归属；跨用户 404。
- 声音授权：克隆前勾选；保存 `consent_version`；禁止公众人物/未授权他人。
- AI 标识：CosyVoice `enable_aigc_tag=true` + 产品显式标注；Breeze 输出同样标注。
- 删除：CosyVoice delete_voice + Breeze DELETE voice + 本地音频/任务清理。
- 数据出境：Breeze 为国际托管，语音/文本可能出境；上线前法务/隐私评审；CosyVoice 用国内地域。
- 日志：不记录完整文本/音频；只记 id、字符数、耗时、错误码。

## 9. 后期本地功能

- **现在留 seam**：`SpeechProvider`（CosyVoice）、`SingProvider`（Breeze）、未来 `LocalSpeechProvider`。
- **本地优先**：离线/隐私模式走本地 TTS；在线走 CosyVoice；唱句仍需 Breeze（本地唱句另立项）。
- **一个 voice_profile 多 provider 映射**：`cosyvoice_voice_id`、`breeze_voice_id`、`local_model_key`。
- **路由**：场景、网络、隐私、配额、成本；本地不可用→云；云不可用→本地/文字。
- **打包**：不在 Electron 内置 Python/模型；后端本地 sidecar 或可选本地包下载。
- **许可**：Breeze 自托管权重非商用；本地商用需换许可明确的模型/商业授权。

## 10. 阶段与验收

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| P0 | CosyVoice 复刻 + 实时 WS；Breeze 克隆 + `[唱歌]`；ABX | 音色近似可接受；延迟/成本达标；Breeze 商用条款明确 |
| V1 | `/voice/speak`、`/speak/stream`、`/voice/sing`、克隆、语音消息、通话、唱句、降级 | 通话可用；语音消息可发；唱句异步可完成；Key 不泄露 |
| V1.5 | 2D 口型精细驱动、唱句历史/导出、配额/对账、缓存 | 口型同步可接受；成本可控 |
| V2 | 本地 TTS provider、完整数字人视频（如需要）、完整歌曲（SVC/SVS） | 另立项 |

验收要点：

- 同一参考音频克隆两家；ABX 多数认为“同一人/近似”。
- 通话 WS 首音 P95 <2s；取消 500ms 内停止。
- 语音消息不产生空音频；失败回文字。
- 唱句 `[唱歌]`/`[哼歌]` 生效；明确“非完整歌曲”。
- 删除音色后两家 voice 均不可用。
- Breeze 未授权/未开通时，唱句功能可安全关闭，不影响对话。

## 11. 风险与待确认

| 风险 | 影响 | 缓解 |
|---|---|---|
| Breeze 商用授权/套餐未就绪 | 唱句不能上线 | 先上 CosyVoice 对话；唱句灰度/关闭 |
| 音色差异被用户感知 | 体验不一致 | 同参考音频 + ABX；产品不承诺“完全同声” |
| CosyVoice 复刻审核失败 | 无音色 | 重录/预处理；系统音色兜底 |
| WS 代理增加延迟 | 通话不自然 | 连接复用、就近地域、POC 压测 |
| Breeze 输出不稳定 | 唱句难听 | 短句、风格模板、重生成；不承诺完整歌曲 |
| 两家删除不一致 | 隐私残留 | 删除编排 + 重试 + 审计 |
| 成本超预算 | 不可持续 | 配额、缓存、只让 Breeze 唱句、月度对账 |

待确认：

1. Breeze 付费套餐/商用条款何时就绪？唱句是否先灰度？
2. 音色“近似一致”的验收底线（ABX 通过率）？
3. 唱句任务保留多久？是否允许导出/分享？
4. 2D 口型 V1 用现有电平，还是 V1.5 上精细 viseme？
5. CosyVoice 复刻音色的审核失败率/时长，是否接受异步等待？
6. 用户每月免费额度/付费额度怎么定？

## 12. 参考

- [CosyVoice-v3-Flash 模型信息（¥1/万字符、5–20 秒复刻、实时流式）](https://help.aliyun.com/zh/model-studio/cosyvoice-v3-flash)
- [实时语音合成（CosyVoice WebSocket / 取消 / 连接复用）](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)
- [声音复刻 HTTP API（create/query/delete voice）](https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api)
- [CosyVoice HTTP API（流式/格式/AIGC 标识）](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)
- [Breeze TTS 2 产品页](https://breezeblue.ai/zh/breeze-tts-2)
- [Breeze 声音克隆](https://docs.breezeblue.ai/guides/voice-clone)
- [Breeze 音频标签（`[唱歌]`/`[哼歌]`）](https://docs.breezeblue.ai/guides/audio-tags)
- [Breeze 计费](https://docs.breezeblue.ai/concepts/pricing)
- [13 双云 TTS 方案评估](./13-dual-cloud-tts-evaluation.md)
