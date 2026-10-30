# 15 BYOK 落地决策：CosyVoice 通话 + Breeze 唱句

- 状态：方案定稿，待技术评审（评审通过前不改契约正文、不写实现）
- 版本：v0.1（2026-10-29）
- 关联：[14 语音方案定稿](./14-voice-final-design.md)、[13 双云 TTS 方案评估](./13-dual-cloud-tts-evaluation.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)、[产品需求文档](./01-product-requirements.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：在 14 的架构上，落实“用户自带 API Key、自付费；Breeze 唱句后台开关默认关闭；2D 口型先用电平；唱句保留 7 天；导出强制 AI 标识”；不含代码改动。

## 0. 五条落地决策

| # | 决策 | 对设计的影响 |
|---|---|---|
| 1 | 语音/视频通话默认 CosyVoice-v3-Flash + 复刻音色 | 通话主链路锁定百炼；需要用户自己的百炼 Key + Workspace + 复刻 voice_id |
| 2 | Breeze TTS 2 唱句做成后台开关，默认关闭 | 全局 `voice.sing.enabled=false`；关闭时 `/voice/sing` 不可用、UI 隐藏；开启需满足 Key/套餐/合规条件 |
| 3 | 2D 口型 V1 先用电平驱动 | 不做 viseme/音素级口型；复用现有音频 analyser 驱动张嘴；V1.5 再精细 |
| 4 | 唱句保留 7 天；导出必须带 AI 标识 | 任务/音频 TTL 7 天；导出文件强制元数据 + 可听标识 + 文件名后缀 |
| 5 | 用户自己填自己的 API，自己付费 | **BYOK**：每家用户自己的百炼/Breeze Key；后端加密存储、只写不读；产品不承担厂商字符费 |

> 这五条把 14 的“产品统一账号 + 配额”改成“用户自带 Key”。成本从产品侧转移到用户侧，但**安全、Key 校验、删除、套餐/商用责任**全部变复杂，必须按本篇执行。

## 1. 对 14 的修订

| 项 | 14 原方案 | 15 落地 |
|---|---|---|
| 厂商账号 | 产品统一账号 | 每用户自己的百炼/Breeze 账号 |
| 计费 | 产品承担/配额 | 用户自己的厂商账单；产品只做限流/展示 |
| Key | 服务端环境变量 | 用户填写，服务端加密保存；前端不回显 |
| 通话音色 | 产品复刻音色 | 用户自己 Workspace 下复刻的 CosyVoice voice_id |
| 唱句开关 | 默认可配置 | 全局后台开关，默认关闭 |
| 口型 | V1 电平，V1.5 精细 | 维持：V1 电平 |
| 唱句保留 | 未定 | 7 天 TTL |
| 导出 | 未定 | 强制 AI 标识（元数据 + 可听 + 文件名） |

## 2. BYOK 总体架构

> **先澄清：Breeze TTS 2 和 CosyVoice 都不是 OpenAI 格式。** 现有前端 `window.desktop.tts.synthesize` 走的是 OpenAI 兼容 `/audio/speech`，那是历史的本机朗读通道，不能拿来套这两家。新链路必须用两个独立适配器，把厂商原生协议映射到我们自己的 `/ai-girl/voice/*`。

### 2.0 两家 API 的调用差异

| 项 | CosyVoice-v3-Flash（百炼） | Breeze TTS 2 |
|---|---|---|
| 鉴权 | `Authorization: Bearer <DASHSCOPE_API_KEY>` | `xi-api-key: <BREEZE_API_KEY>` |
| 单次 HTTP | `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer` | `POST https://api.breeze.blue/v1/text-to-speech/{voice_id}?output_format=mp3_24000_128` |
| 请求体 | DashScope 信封：`{model, input:{text, voice, format, sample_rate, instruction?}}` | Breeze 原生：`{text, model_id, language_code, instructions, voice_settings:{guidance_scale,speed,volume,use_speaker_boost}}` |
| 流式 | HTTP 加 `X-DashScope-SSE: enable`；实时走 DashScope WebSocket `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`（`run-task/continue-task/finish-task` 事件，SDK 封装） | HTTP 流式 `POST .../{voice_id}/stream?output_format=pcm`；实时先 `POST .../realtime-sessions` 再连 Breeze WebSocket |
| 音色 | `voice` 参数放 body，值为 `cosyvoice-v3-flash` 复刻出的 voice_id | `voice_id` 放 URL path；克隆 voice_id 由 Breeze 返回 |
| 克隆 | `POST .../api/v1/services/audio/tts/customization`，`model=voice-enrollment`，`input.action=create_voice` | `POST /v1/voice-previews/clone` → `GET .../stream` → `POST .../save` |
| 音频 | 8k–48k、mp3/pcm/wav/opus；实时常见 24k | 24k 单声道；mp3/pcm/wav/flac/aac/opus |
| 错误 | DashScope 错误结构 | Breeze 错误结构（`code/detail/error` 等） |
| 是否 OpenAI | **否** | **否** |

适配原则：

- `CosyVoiceClient`：把我们的 `SpeakRequest` 翻译成 DashScope 信封/WebSocket 事件；处理 `voice`、`format`、`sample_rate`、`instruction`、AIGC 标识。
- `BreezeClient`：把我们的 `SingRequest` 翻译成 Breeze 原生 body；处理 `voice_id` 路径、`xi-api-key`、`[唱歌]`/`[哼歌]`、`instructions`、`voice_settings`。
- 对外只暴露 `/ai-girl/voice/speak`、`/speak/stream`、`/sing`；前端不知道厂商字段差异。
- 错误统一映射：`VOICE_CREDENTIAL_INVALID`、`VOICE_PROVIDER_TIMEOUT`、`VOICE_RATE_LIMITED`、`SING_DISABLED` 等。

### 2.1 总体架构


```text
Electron/React
  ├─ 设置 → 语音服务：填写百炼/Breeze Key（只发后端）
  ├─ HTTPS  /ai-girl/voice/speak
  ├─ WS     /ai-girl/voice/speak/stream
  ├─ HTTPS  /ai-girl/voice/sing
  └─ HTTPS  /ai-girl/voice/sing/{jobId}
        │ 登录态；不携带厂商 Key
Spring Boot core
  ├─ VoiceController（鉴权、限流、开关）
  ├─ UserCredentialService（Key 加密、校验、轮换、删除）
  ├─ VoiceProfileService（用户 Workspace 下的 voice_id）
  ├─ SpeechService（CosyVoice 实时/单次）
  ├─ SingingService（Breeze 异步；受全局开关控制）
  ├─ KeyVault（AES-GCM + KMS/主密钥）
  ├─ AudioStore（对象存储/本地卷，7 天 TTL）
  └─ UsageLedger（字符/估算费用，仅展示/审计）
        │ 使用当前用户凭据
  ├─ 百炼 CosyVoice-v3-Flash（用户自己的 Workspace/Key）
  └─ Breeze TTS 2（用户自己的 Key/套餐）
```

原则：

- **前端永远不直接调厂商**；Key 只提交给后端，后端不回显。
- **一个用户一套凭据**：百炼 `apiKey + workspaceId + region`；Breeze `apiKey`。
- **一个 `voice_profile` 绑定某套凭据**：换 Key/Workspace 后，旧 voice_id 可能不可用，需要重新克隆/绑定。
- **Breeze 只走 `sing`**；日常对话不碰 Breeze，满足“成本最低”。
- **产品不代付**：厂商账单由用户自己的账号承担；产品只做限流、错误提示、用量展示。

## 3. 凭据管理（BYOK 核心）

### 3.1 数据模型

`user_provider_credentials`：

| 字段 | 说明 |
|---|---|
| id / user_id / provider | `cosyvoice` / `breeze`；每用户每 provider 一条 |
| encrypted_secret | AES-256-GCM 密文；**不存明文** |
| key_last4 / key_fingerprint | 仅用于展示/去重，不可反推 |
| workspace_id / region | 百炼必填；Breeze 为空 |
| status | `unverified/active/invalid/revoked` |
| last_verified_at / last_error_code | 校验状态 |
| created_at / updated_at | 审计 |

- 加密：AES-256-GCM + KMS 主密钥（或部署密钥管理）；每条记录独立 nonce；密文与 AAD 绑定 `userId+provider`，防止拼接。
- 解密只在请求内存中短暂发生；不写日志、不进异常信息、不进 APM。
- 前端只返回 `configured`、`keyLast4`、`workspaceIdMasked`、`status`、`lastVerifiedAt`。

### 3.2 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ai-girl/voice/credentials` | 返回两家配置状态（不含 Key） |
| PUT | `/ai-girl/voice/credentials/cosyvoice` | `{apiKey, workspaceId, region}`；保存前校验 |
| PUT | `/ai-girl/voice/credentials/breeze` | `{apiKey}`；保存前校验 |
| POST | `/ai-girl/voice/credentials/{provider}/test` | 最小请求验证；可能产生极少量费用 |
| DELETE | `/ai-girl/voice/credentials/{provider}` | 删除凭据；提示语音/唱句将不可用 |

校验：

- 百炼：用 `workspaceId + region` 调最小 TTS（如“你好”），确认模型/权限可用；失败返回 `CREDENTIAL_INVALID`/`WORKSPACE_INVALID`/`MODEL_NOT_AUTHORIZED`。
- Breeze：调 `GET /v1/models` 或账户余额/权益接口；确认 Key 有效、套餐可用；失败返回 `BREEZE_KEY_INVALID`/`BREEZE_PLAN_REQUIRED`。
- 校验请求会消耗用户自己的额度，UI 明示。

### 3.3 轮换与删除

- 换 Key：保留同一账号/Workspace 时，voice_id 通常仍可用；跨账号/Workspace 必须重新克隆。
- 换 Workspace/Region：旧 voice_id 失效；`voice_profile` 标记 `needs_reclone`。
- 删除 Key：停止合成；是否同时删除厂商 voice 由用户选择（默认保留，便于换 Key 后继续用；但产品不再能调用）。
- 账号删除：先尝试删除两家 voice，再删凭据；失败进入重试/审计；不因厂商失败阻塞账号删除。

## 4. 声音克隆（用户自己的账号）

### 4.1 流程

```text
设置 → 语音服务
  → 填百炼 Key/Workspace/Region → 校验
  → 填 Breeze Key → 校验（可选，唱句开关开启时才需要）
  → 上传 10–20 秒干声 + 授权
  → 百炼 create_voice（target_model=cosyvoice-v3-flash）
  → 轮询 query_voice 到 OK
  → 若唱句开关开启：Breeze clone preview → save
  → profile：speech_ready / sing_ready
```

- 同一段参考音频给两家；接受“近似一致”。
- 百炼复刻：`POST .../api/v1/services/audio/tts/customization`，`model=voice-enrollment`，`action=create_voice`，`target_model=cosyvoice-v3-flash`，`prefix`，`audio`（Base64 Data URI/URL），`language_hints`，`max_prompt_audio_length`，`enable_preprocess`；返回 `voice_id`，状态 `DEPLOYING/OK/UNDEPLOYED`。
- Breeze：`POST /v1/voice-previews/clone` → `GET .../stream` → `POST .../save`；保存消耗用户套餐的 voice slot。
- 百炼 voice_id 属于用户 Workspace；Breeze voice_id 属于用户 Breeze 账号；两者都不能跨用户复用。

### 4.2 失败与部分可用

| 情况 | 处理 |
|---|---|
| 百炼复刻失败/审核不通过 | `speech_ready=false`；可重录；可先用系统音色（仍需用户 Key） |
| Breeze 克隆失败/slot 满 | `sing_ready=false`；唱句不可用；不影响通话 |
| 只有百炼 Key | 只开通通话/语音消息；唱句入口隐藏/禁用 |
| 只有 Breeze Key | 唱句开关开启时可唱句；通话不可用 |
| 换 Key/Workspace | 标记 `needs_reclone`；提示重新克隆 |

## 5. Breeze 唱句后台开关

- 全局配置：`voice.sing.enabled=false`（默认关闭）。
- 关闭时：
  - `/ai-girl/voice/sing` 返回 `404/403 SING_DISABLED`；
  - 前端不显示“唱一句”入口；
  - 不调用 Breeze，不校验 Breeze Key。
- 开启条件（后台管理员）：
  1. 产品已确认 Breeze 商用条款/套餐策略；
  2. 用户已填 Breeze Key；
  3. 用户已确认其 Breeze 套餐允许商用（Free 不可商用）；
  4. 导出 AI 标识已实现；
  5. 7 天保留/删除任务已实现。
- 开启后仍按用户限流/配额；Breeze 费用由用户承担。
- 关闭不影响 CosyVoice 通话；这是“成本最低”的硬隔离。

## 6. 2D 口型 V1：电平驱动

- 复用现有 `playAudioDataUrl` 的 AnalyserNode 电平：`mouthOpen = level > threshold`；可加平滑/衰减。
- 不做 viseme/音素口型；不承诺“对字型”。
- 适用范围：语音通话、语音消息、唱句播放。
- 局限：元音/辅音差异不体现；唱句高音可能嘴型过大；V1.5 再用字级时间戳/viseme。
- 验收：播放有电平、张嘴不过度抖动、静音闭嘴；不要求字型准确。

## 7. 唱句 7 天保留与导出 AI 标识

### 7.1 保留

- `sing_jobs.expires_at = created_at + 7 天`。
- 定时任务每天清理：删除音频对象；任务状态改 `expired`；保留最小审计（id/user/provider/字符数/时间），不保留音频/文本原文。
- UI 显示“剩余 X 天”；到期后不可播放/导出；导出文件在用户本地，不受 TTL 控制。
- 用户可提前删除；删除立即清音频。

### 7.2 导出 AI 标识（强制）

导出文件必须同时带：

1. **可听标识**：文件开头插入约 1 秒固定提示音/语音“本音频由 AI 合成”（预生成，不调用厂商）；不可关闭。
2. **元数据标识**：
   - MP3：ID3v2 `TXXX:AIGC=AI-generated;provider=Breeze;model=breeze-tts-2;exportedAt=...` + `COMM` 说明；
   - WAV：`LIST/INFO` 的 `ICMT`/`ISFT` 写入同样内容；
   - 同时生成同名 `.json` 清单（可选，便于审计）。
3. **文件名**：追加 `_AI合成` 后缀，例如 `生日歌_AI合成.mp3`。

- 应用内播放不加可听前缀；仅“导出”加。
- 导出前提示：“该文件含 AI 合成标识；请勿用于冒充他人/未授权商用。”
- 公开分享/商业使用：V1 不做站内公开发布；用户自行承担版权/平台合规。
- 法务确认：可听标识 + 元数据 + 文件名是目前可执行的最小组合；如监管要求更强，追加显式水印/声明。

## 8. 成本与计费

- **产品不再承担厂商字符费**；用户自己的百炼/Breeze 账单。
- 产品仍承担：后端、存储、带宽、7 天音频、日志；需限额防刷。
- 展示估算：
  - 百炼：¥1/万字符；按用户文本长度估算；
  - Breeze：$30/百万加权字符；唱句短，按文本估算；
  - 只展示“估算”，以厂商账单为准。
- 限流（防误用/盗刷）：
  - 每用户每分钟请求数、并发通话数、唱句任务数；
  - 单条文本上限；单日字符上限（可配置，默认宽松）；
  - 429/403 明确提示，不静默扣费。
- 套餐/商用责任：
  - Breeze Free 不可商用；导出前要求用户确认套餐允许；
  - 百炼账号权限/实名/复刻资格由用户负责；
  - 产品不代付、不代开、不担保用户账号状态。

## 9. 安全与隐私

| 风险 | 对策 |
|---|---|
| Key 泄露 | 加密存储；只写不读；日志/异常/APM 脱敏；前端只显示 last4；TLS |
| Key 权限过大 | 建议用户用子 Workspace/受限 Key；UI 说明最小权限；Breeze 可设 Key 预算 |
| 跨用户盗用 | 凭据按 user_id 隔离；调用前校验归属；WS 鉴权；跨用户 404 |
| 内存/调试泄露 | 解密仅在请求作用域；禁止 debug 打请求头；异常不打印 Key |
| 删除不彻底 | 删除凭据 + 厂商 voice（可选）+ 本地音频/任务；审计 |
| 账号删除 | 先 best-effort 删厂商 voice，再删凭据；失败重试；不阻塞 |
| 数据出境 | Breeze 国际托管，语音/文本可能出境；用户授权/隐私政策明示；百炼国内地域 |
| 厂商侧留存 | 产品 7 天 TTL 只清本地副本；Breeze/百炼账号侧历史/音频可能按其政策保留；用户可在厂商侧删除/关闭日志（如 Breeze `enable_logging=false`） |
| AI 滥用 | 声音授权、禁止公众人物/冒充、AI 标识、导出提示、审计 |

## 10. 界面结构

```text
设置 → 语音服务
 ├─ 百炼 CosyVoice
 │   ├─ API Key（password，只显示 last4）
 │   ├─ Workspace ID / Region
 │   ├─ [测试连接]
 │   └─ 状态：有效/无效/未配置
 ├─ Breeze（仅唱句；后台开关关闭时隐藏）
 │   ├─ API Key
 │   ├─ [测试连接]
 │   └─ 套餐/商用提示
 ├─ 我的音色
 │   ├─ 会说话 ✓ / 会唱歌 ✓
 │   ├─ 克隆/重录/删除
 │   └─ 到期/需要重克隆提示
 ├─ 语音回复开关
 └─ 用量/费用估算
```

聊天/通话：

- 无百炼 Key：语音入口置灰/引导配置；可回退文字/系统语音。
- 唱句开关关：不显示“唱一句”；即使有 Breeze Key 也不可用。
- 唱句任务卡片显示“剩余 7 天”；导出按钮带 AI 标识说明。
- 2D 口型：电平驱动，不做字型承诺。

## 11. 失败与降级

| 失败 | 行为 |
|---|---|
| 百炼 Key 无效/过期 | 通话/语音消息不可用；提示更新 Key；回退文字 |
| Workspace/Region 变更 | voice_id 失效；提示重新克隆 |
| 百炼限流/欠费 | 提示用户检查百炼账户；不重试到无限 |
| Breeze 开关关闭 | 唱句入口隐藏；API 403 `SING_DISABLED` |
| Breeze Key 无效/Free 套餐 | 唱句不可用；提示套餐/Key；不影响通话 |
| 唱句导出超 7 天 | 音频已删除；提示无法导出 |
| 导出标识失败 | 中止导出，不生成无标识文件 |

## 12. 验收

| ID | 场景 | 期望 |
|---|---|---|
| AC-BYOK-1 | 填错百炼 Key/Workspace | 校验失败，明确错误，不保存明文 |
| AC-BYOK-2 | 正确 Key + 克隆 | 通话可用复刻音色；首音达标 |
| AC-BYOK-3 | 只有百炼 Key | 唱句入口隐藏；通话正常 |
| AC-BYOK-4 | Breeze 开关关闭 | `/sing` 403；不调用 Breeze |
| AC-BYOK-5 | 开关开启 + 有效 Breeze Key | 异步唱句成功；7 天后音频删除 |
| AC-BYOK-6 | 导出 | 文件含可听 AI 提示、元数据、文件名后缀 |
| AC-BYOK-7 | 删除 Key/账号 | 凭据删除；厂商 voice best-effort 删除；无残留 |
| AC-BYOK-8 | 2D 口型 | 电平驱动张嘴；静音闭嘴；无字型承诺 |
| AC-BYOK-9 | 跨用户 | 不能读取他人凭据/音色/任务 |
| AC-BYOK-10 | 限流/欠费 | 明确提示；不无限重试/不静默失败 |

## 13. 风险与待确认

| 风险 | 影响 | 缓解 |
|---|---|---|
| 用户不会配百炼 Workspace/Key | 上手困难 | 分步引导、测试连接、错误码、文档 |
| Key 安全责任 | 泄露/盗刷 | 加密、最小权限、审计、用户教育 |
| 用户 Breeze 套餐不支持商用 | 导出违规 | 导出前确认；Free 禁用导出/唱句 |
| 换 Key 导致 voice 失效 | 体验断裂 | 提示重克隆；保留旧配置直到新配置验证 |
| 7 天删除与用户预期 | 投诉 | UI 倒计时、导出提醒、可提前导出 |
| 可听 AI 标识影响听感 | 体验 | 仅导出加；应用内不播；1 秒固定提示 |
| 电平口型不自然 | 出戏 | V1 接受；V1.5 viseme |
| Breeze 开关误开 | 成本/合规 | 默认关闭；管理员二次确认；审计 |

待确认：

1. 百炼 Key 是否要求用户填 Workspace/Region，还是产品固定一个 Workspace？BYOK 下建议用户填；若产品固定，则无法用用户自己的百炼账号。
2. 用户删除 Key 时，默认是否同时删厂商 voice？建议默认保留、提示可选删除。
3. 唱句导出是否允许关闭可听提示？按“必须带 AI 标识”，建议不允许。
4. 7 天到期后是否保留任务元数据？建议保留最小审计，不保留音频/文本。
5. Breeze 开关开启的审批人/条件（管理员/环境变量/白名单）？
6. 电平口型的阈值/平滑参数由谁调（产品/设计）？

## 14. 参考

- [14 语音方案定稿](./14-voice-final-design.md)
- [CosyVoice-v3-Flash](https://help.aliyun.com/zh/model-studio/cosyvoice-v3-flash)
- [声音复刻 HTTP API](https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api)
- [CosyVoice 实时语音合成](https://help.aliyun.com/zh/model-studio/realtime-tts-user-guide)
- [Breeze 声音克隆](https://docs.breezeblue.ai/guides/voice-clone)
- [Breeze 音频标签](https://docs.breezeblue.ai/guides/audio-tags)
- [Breeze 计费](https://docs.breezeblue.ai/concepts/pricing)
