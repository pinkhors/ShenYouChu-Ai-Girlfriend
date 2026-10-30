# 12 Breeze TTS 2 重构方案：语音发送与“唱歌”

> Breeze-only 基线；最终混合方案见 [14 语音方案定稿](./14-voice-final-design.md)。

- 状态：Breeze-only 基线，最终方案见 14
- 版本：v0.1（2026-10-29）
- 关联：[产品需求文档](./01-product-requirements.md)、[技术实现路线](./02-technical-roadmap.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)、[角色设定设计](./07-character-customization.md)、[10 声音克隆（历史）](./10-voice-cloning-genie-tts.md)、[11 对话与唱歌双模式（历史）](./11-voice-clone-dialogue-and-singing.md)、[13 双云 TTS 方案评估](./13-dual-cloud-tts-evaluation.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：基于 Breeze TTS 2 API 的整体重构；不含代码改动。

> 本文取代 10/11 的本地 Genie/SVC 方案。10/11 保留为历史评估，不再作为实现依据。

## 0. 结论

**Breeze TTS 2 适合做“说话 + 语音消息 + 实时通话”，也支持 `[唱歌]`/`[哼歌]` 这类唱腔标签；但它不是 SVS，不能做有旋律、有伴奏、有乐谱控制的完整歌曲。**

先接受这个边界，方案才成立：

| 能力 | Breeze TTS 2 能做到 | 不能做到 | 设计结论 |
|---|---|---|---|
| 语音发送 | 文本 → 24 kHz 音频；MP3/WAV/PCM；同步/流式/异步 | 无 | **V1 主功能** |
| 实时通话 | WebSocket 实时 TTS，turn 级打断，首音 p50 约 127 ms（官方基准） | 无 | **V1 可用 HTTP 流式；V1.5 上实时** |
| 声音克隆 | 3 秒–5 MB 单样本；自动转写/截取/归一化；保存为 voice_id | 不能自定义参考文本/预览脚本 | **V1 支持** |
| 音色设计 | 自然语言描述生成音色，无需参考音频 | 无 | **官方角色/默认音色优先用** |
| “唱歌” | `[唱歌]`、`[哼歌]` 作为 vocal delivery 事件，可让模型用唱/哼的方式演绎邻近文本 | 不能指定音高、时值、旋律、乐谱、伴奏同步；不保证整首歌唱对 | **V1 只做“唱一句/哼一段”** |
| 完整歌曲翻唱 | 不能 | 需要 SVC/SVS 或商业歌声合成 | **不在 Breeze-only 范围** |
| 商用 | 付费套餐的托管 API 输出可商用 | 免费套餐不可商用（以官方条款为准）；自托管权重仅研究/非商用 | **必须用付费托管 API** |

一句话方案：**Breeze 负责“声音”与“说话”，`[唱歌]` 负责“唱一句”的彩蛋；完整歌曲另立项目，不混进 V1。**

## 1. API 能力边界与调用方式

### 1.1 它是什么

Breeze TTS 2 是 BreezeBlue 的托管 TTS API，核心能力：

- 文本转语音（同步、HTTP 流式、异步任务、实时 WebSocket）；
- 声音克隆（参考音频 → 预览 → 保存 voice_id）；
- 音色设计（自然语言描述 → 音色）；
- 声音指令（情绪、语气、语速、表达）；
- 34 种音频事件标签（笑声、叹气、咳嗽、`唱歌`、`哼歌` 等）；
- 51 种语言（`breeze-tts-2-multilingual`）；中英文可用 `breeze-tts-2`；
- 原生 24 kHz 单声道音频；MP3/WAV/FLAC/PCM/AAC/Opus。

**托管 vs 自托管（必须先定）**：

| 方式 | 商用 | 硬件 | 说明 |
|---|---|---|---|
| Breeze 托管 API（付费套餐） | ✅ 可商用 | 无 GPU | 推荐；按字符计费，voice slot/并发受套餐限制 |
| 开源自托管 | ❌ 权重仅研究/非商用 | 约 7.7 GiB 显存（eager），12 GB GPU 起；fast 路径 24 GB | 除非拿到商业授权，否则不能用于产品；不推荐 |

> 开源代码是 Apache-2.0，但**模型权重、派生模型、自托管输出**受 BreezeBlue Research and Non-Commercial License 约束；付费托管 API 的输出才可商用。不要把“代码 Apache”误当成“权重可商用”。

### 1.2 两类场景的能力矩阵

| 场景 | 能做 | 边界/限制 | 设计含义 |
|---|---|---|---|
| 聊天里发一条语音 | 同步 TTS 返回 MP3/WAV；可按角色音色 | 单请求默认 1000 字符，最高 2000（需申请）；每个 CJK 字符算 2 units | 语音消息应短；长文本分句/截断 |
| 通话中说话 | `/stream` 流式 PCM/MP3；或实时 WebSocket | 24 kHz 单声道；实时会话 30 分钟上限；每 turn 1000 字符 | 通话用流式；V1.5 上实时 |
| 克隆用户音色 | 3 秒–5 MB 单样本；自动截取最多 30 秒、-18 LUFS；保存 voice_id | 不能自定义参考文本；需要声音授权；保存消耗 voice slot | 上传→预览→保存；槽位要管理 |
| 设计角色音色 | 自然语言描述生成音色 | 不是克隆；质量取决于描述 | 官方角色/默认音色优先 |
| 唱一句 | `[唱歌]`/`[哼歌]` 标签 + 歌词/文本 + 风格指令 | 无音高/时值/乐谱/伴奏控制；不是 SVS；效果需 POC | V1 做短句彩蛋，标注“唱腔短句” |
| 完整歌曲 | ❌ | 需要 SVC/SVS（Seed-VC/RVC/DiffSinger 等） | 不要用 Breeze 硬做；另立项目 |
| 情绪/语气 | `instructions` 控制情绪、意图、语速、表达 | 指令必须是文本语言；不是精确参数 | 把角色情绪映射成自然语言指令 |
| 多语言 | 51 种语言；`breeze-tts-2-multilingual` | `breeze-tts-2` 主要中英；语言/模型要匹配 | V1 中英；其他语言按需 |

### 1.3 调用方式（核心）

Base URL：`https://api.breeze.blue`；认证头：`xi-api-key: <BREEZE_API_KEY>`。

#### A. 同步 TTS（语音消息）

```http
POST https://api.breeze.blue/v1/text-to-speech/{voice_id}?output_format=mp3_24000_128
xi-api-key: <key>
Content-Type: application/json

{
  "text": "今天也想见你，记得早点休息。",
  "model_id": "breeze-tts-2",
  "language_code": "zh",
  "instructions": "温柔、轻声，带一点笑意，像在耳边说话。",
  "voice_settings": {
    "guidance_scale": 4.0,
    "speed": 1.0,
    "volume": 1.0,
    "use_speaker_boost": false
  }
}
```

- 返回二进制音频；`output_format` 支持 `mp3/wav/flac/pcm/aac/opus` 及 `*_24000_*` 配置；
- `delivery=async` 时返回 202 + `generation_job_id`，适合长文本；
- `text` 上限默认 1000 字符；中文超过 500 字符的非流式请求会自动分段（最多 5 段，段间 0.25 秒静音）。

#### B. 流式 TTS（通话/边说边播）

```http
POST https://api.breeze.blue/v1/text-to-speech/{voice_id}/stream?output_format=pcm
xi-api-key: <key>
Content-Type: application/json

{ "text": "我在呢，慢慢说。", "model_id": "breeze-tts-2", "language_code": "zh" }
```

- 默认 `pcm`：24 kHz、单声道、16-bit little-endian；也可 `mp3`/`wav`；
- 适合按句流式合成；客户端用 Web Audio 播放 PCM，或包装 WAV 后播放。

#### C. 实时 WebSocket（最低延迟通话）

1. 后端创建短时会话：

```http
POST https://api.breeze.blue/v1/text-to-speech/{voice_id}/realtime-sessions
xi-api-key: <key>
Content-Type: application/json

{
  "model_id": "breeze-tts-2",
  "language_code": "zh",
  "instructions": "保持温柔、自然的对话节奏。",
  "voice_settings": { "guidance_scale": 4.0 },
  "inactivity_timeout_seconds": 30
}
```

2. 返回 `client_secret`、`websocket_url`；连接：

```text
wss://api.breeze.blue/v1/text-to-speech/{voice_id}/stream-input?client_secret=...
```

3. 事件：`turn.start` → `text.append`（每段 ≤2 KB）→ `text.flush`（句末）→ `turn.end`；`turn.cancel` 打断；`session.update` 更新下一轮 instructions；
4. `client_secret` 60 秒内必须连接；会话最长 30 分钟；每 turn 1000 字符。

#### D. 声音克隆（两步）

```http
POST https://api.breeze.blue/v1/voice-previews/clone
xi-api-key: <key>
Content-Type: multipart/form-data

files=@sample.wav;type=audio/wav
name=我的声音
reference_language_code=zh
remove_background_noise=true
```

- 样本：单个文件，3 秒–5 MB；支持 MP3/WAV/M4A/FLAC/AAC/OGG/Opus/WebM/WMA/AIFF；单人、无 BGM；
- 返回 `generated_voice_id`（临时预览，不是正式 voice）；
- 预览：`GET /v1/voice-previews/{generated_voice_id}/stream`；
- 保存：`POST /v1/voice-previews/{generated_voice_id}/save`，body `{ "voice_name": "...", "language_code": "zh" }`；保存消耗一个 voice slot；
- 删除：`DELETE /v1/voices/{voice_id}`。

> 注意：Breeze 会自动转写参考音频、截取最多 30 秒、归一化到 -18 LUFS；**不能自定义参考文本/预览脚本**。这与 Genie 的“参考文本必须逐字一致”不同，少了一个用户操作，但也少了对文本的控制。

#### E. “唱歌”的调用

```http
POST https://api.breeze.blue/v1/text-to-speech/{voice_id}?output_format=mp3_24000_128
xi-api-key: <key>
Content-Type: application/json

{
  "text": "[唱歌] 祝你生日快乐，祝你生日快乐……",
  "model_id": "breeze-tts-2",
  "language_code": "zh",
  "instructions": "用轻柔的流行唱法，节奏放慢，带一点呼吸感。",
  "voice_settings": { "guidance_scale": 4.0 }
}
```

- 中文标签：`[唱歌]`、`[哼歌]`；英文：`(singing)`、`(humming)`；必须使用目标语言的确切拼写，不能混用括号；
- 它是 **vocal delivery 事件**，不是音符/乐谱控制；模型会“用唱/哼的方式演绎邻近文本”，但不保证旋律准确、能对上伴奏、能唱完整首歌；
- 想更“像唱歌”，可以：歌词短句 + `[唱歌]` + 慢速 + 温柔/抒情指令 + `guidance_scale` 提高；但仍是模型即兴，不是 SVS。

### 1.4 计费、限额与并发

| 项 | 规则 |
|---|---|
| 计费 | 10 billable units = 1 credit；CJK 字符每个 2 units，其他 1 units；$30 / 1M 加权字符 |
| 例 | 100 个中文字 = 200 units = 20 credits ≈ $0.006；1000 条 ≈ $6 |
| 文本上限 | 默认 1000 字符/请求；申请后最高 2000 |
| Voice slot | Free 5；Starter 20；Creator 50；Pro 300；Scale 1000；Business 3400 |
| 并发 | Free 2；Starter 4；Creator 8；Pro 16；Scale/Business 32 |
| 商用 | 付费托管套餐可商用；Free 不可商用；自托管不可商用 |
| 延迟 | 官方基准 TTFB p50 113 ms / TTFA p50 127 ms / p95 159 ms；实际加网络 |

> 具体套餐价格与限额以 Breeze 当前页面/合同为准；上表用于方案估算。

## 2. 重构后的产品范围

### 2.1 定位

**“会说话、会发语音、会唱一句”的角色语音能力；不做“完整歌曲翻唱”。**

- V1：对话语音、语音消息、通话流式、声音克隆/音色选择、`[唱歌]`/`[哼歌]` 短句彩蛋。
- 如果业务必须“完整歌曲”，在 V2 另接 SVC/SVS；Breeze 继续负责说话和音色，不承担歌声合成。

### 2.2 场景

| 场景 | 形态 | 使用方式 | 成功标准 |
|---|---|---|---|
| 聊天中发语音 | 语音消息气泡 | 输入文字 → “发语音” | 可播放、有波形/时长/字幕 |
| 通话 | 实时语音 | 进入通话 → AI 回复流式播放 | 首音低延迟、可打断 |
| 唱一句 | 短音频（5–20 秒） | 输入 1–4 行歌词 → “唱一句” | 有唱腔/哼唱感、可发送/保存 |
| 哄睡/生日 | 短语音消息 | 选“温柔/轻声”风格 | 情绪符合、不机械 |
| 自定义音色 | 声音档案 | 上传 3–10 秒 → 预览 → 保存 | 音色相似、可删除 |
| 角色默认音色 | 预置音色 | 选官方/设计音色 | 所有角色可用、无需克隆 |

### 2.3 模式与切换

Breeze-only 下，**“发语音”不是模式，是消息形态；“唱一句”是动作，不是常驻唱歌模式**：

- 聊天页：文字输入框旁提供“发语音”和“唱一句”；
- 通话页：默认语音对话；“唱一句”打开底部弹层，不切走通话；
- 唱歌弹层：选音色 → 输入歌词 → 选风格 → 生成 → 试听 → 发送/保存/关闭；
- 不自动切换：LLM 检测到“唱首歌”只建议“要不要唱一句”，用户确认后打开弹层；
- 同一时刻只播一条音频；打开弹层先停当前 TTS/播放；关闭弹层恢复聊天，不自动继续说话；
- 完整歌曲入口不放 V1；若未来接入 SVC/SVS，再增加“歌曲工作室”页面。

## 3. 功能模块

### 3.1 声音档案与音色库

- 来源：
  - `public`：Breeze 公共音色（精选）；
  - `designed`：用 Breeze 音色设计生成（官方角色默认）；
  - `cloned`：用户上传样本克隆。
- 每个档案存：`voice_profile_id`（本地）、`breeze_voice_id`（外部）、来源、语言、状态、授权版本、所属用户/角色。
- 官方角色使用固定音色；用户可覆盖为“我的克隆音色”；V1 先全局默认，按角色绑定放 V1.5。
- 音色库 UI 提供试听、选择、设为默认、删除；克隆音色显示“已用 1/5 槽位”之类的提示。

### 3.2 声音克隆

流程：上传/录制 → 校验（3 秒–5 MB、单人、无 BGM）→ Breeze 克隆预览 → 试听 → 保存（消耗 slot）→ 可用于语音消息/通话/唱一句。

- 不支持自定义参考文本；Breeze 自动处理；
- `reference_language_code=zh` 用于中文样本，减少识别错误；
- `remove_background_noise=true` 可尝试降噪，但不要承诺“去 BGM”；
- 保存前必须勾选声音授权；`requires_verification` 为 true 时进入待验证状态；
- 删除档案 = 删除本地映射 + 删除 Breeze voice；注意 Breeze voice 删除后不可恢复；
- 克隆音色用于 `[唱歌]` 时，唱腔质量由模型决定，不能承诺“录一段唱歌就能克隆唱功”。

### 3.3 语音消息（发送语音）

- 入口：聊天输入框“发语音”；也可对某条 AI 文本点“朗读/发语音”。
- 后端：取当前角色音色 → 调 Breeze 同步 TTS（MP3 24 kHz 128 kbps）→ 存对象存储 → 生成语音消息。
- 消息体：`audio_url`、`duration_ms`、`format`、`voice_profile_id`、`text_hash`、`transcript`（可选）。
- 播放：气泡内播放/暂停、波形、时长、字幕开关；不自动播放（避免打扰）；通话中除外。
- 失败：不生成空语音；回退为文字消息 + 提示；保留重试。
- 长度：单条 ≤ 500 中文字（约 1000 units），超过提示分段/截断；不要一次发 5 分钟语音。

### 3.4 通话（实时语音）

- V1：`/stream` 流式 PCM → 后端转发 → 客户端 Web Audio 播放；按句 flush，首音更快。
- V1.5：Breeze 实时 WebSocket，支持 `turn.cancel` 打断、`session.update` 调整语气；后端 mint `client_secret`，客户端直连或后端代理。
- 对话链路：ASR（现有）→ LLM → 按句切分 → Breeze TTS → 播放；`turnId` 贯穿，取消时停止播放并丢弃迟到音频。
- 失败：回退文字 + 浏览器系统语音（可选）；不静默。
- 音色：当前角色音色；通话页显示“Breeze / 克隆音色”状态。

### 3.5 唱一句 / 哼一段

- 两种：
  - `sing`：输入 1–4 行歌词，前置 `[唱歌]`，指令“抒情/轻快/温柔”；
  - `hum`：输入“啦/啊”或无意义音节，前置 `[哼歌]`，指令“轻声哼唱”。
- 参数：音色、风格（温柔/俏皮/伤感/激昂）、语速（0.8–1.2）、是否发送到聊天。
- 生成：同步 TTS（短文本），MP3/WAV；试听 → 发送/保存/重生成。
- 明确标注：“Breeze 唱腔短句，不是完整歌曲；无伴奏、无旋律编辑”。
- 不提供假参数：音高、音符、BPM、伴奏同步、修音强度——Breeze API 没有这些能力。

### 3.6 历史、缓存与导出

- 历史：语音消息、唱句、通话不默认存音频（可配置）；用户可删除。
- 缓存：`hash(voice_id + text + instructions + format + speed)` → 复用音频；适合固定问候/系统提示；用户隐私文本不长期缓存。
- 导出：语音消息/唱句可导出 MP3/WAV；元数据标注“AI 合成语音”。

### 3.7 用量、配额与计费

- 本地计量：按请求文本计算 weighted units（CJK×2，其他×1），10 units=1 credit；记录 `user_id`、voice、endpoint、字符数、估算费用。
- 配额：每用户每月字符/积分上限；管理员可调；超限返回明确错误。
- Breeze 账户余额/用量：定时拉取 `GET /v1/account/balance`、usage；低余额告警。
- 并发：按套餐；核心层排队/限流；429 按 `Retry-After` 退避；不要盲目重试导致重复计费。
- 对账：Breeze usage 为权威；本地账本用于产品配额；每日对账。

### 3.8 安全、隐私与合规

- 声音是敏感数据：上传到 Breeze 前明确告知；获取声音授权；提供删除；遵守 Breeze voice consent。
- 禁止克隆公众人物/未授权他人；禁止冒充；AI 合成标识；歌词/伴奏版权由用户/产品授权。
- API Key 只存服务端；客户端不直连 Breeze（V1），实时直连只能用短时 `client_secret`。
- 日志不记录完整文本/音频；只记录 ID、字符数、耗时、错误码。
- Breeze 侧留存：即使 `enable_logging=false`，Breeze 仍可能为运营/滥用保留数据；隐私政策要如实说明。
- 账号删除：删除本地音频/档案/消息，并调用 Breeze `DELETE /v1/voices/{voice_id}` 删除克隆音色；Breeze 历史音频按其政策处理。

## 4. 交互流程

### 4.1 首次配置

```text
设置 → 声音
  → 选择默认音色（官方/设计/我的克隆）
  → 试听
  → 打开“语音回复”
  → 发一条测试语音
```

### 4.2 发语音消息

```text
输入文字 → 点“发语音”
  → 后端取当前角色音色
  → Breeze 同步 TTS（MP3）
  → 存对象存储
  → 聊天中出现语音气泡
  → 播放/暂停/字幕/重发
```

### 4.3 通话

```text
进入通话 → 选择音色 → 开始
  → 用户说话 → ASR → LLM
  → 按句切分 → Breeze /stream（PCM）
  → 客户端流式播放
  → 用户再次说话/点停止 → 取消当前 turn → 丢弃迟到音频
```

### 4.4 唱一句

```text
聊天/通话 → 点“唱一句”
  → 弹层：音色 + 歌词（1–4 行）+ 风格
  → 生成（[唱歌]/[哼歌] + instructions）
  → 试听
  → 发送到聊天 / 保存 / 重生成 / 关闭
```

### 4.5 克隆音色

```text
设置 → 声音 → 克隆音色
  → 上传/录制 3–10 秒
  → 校验（时长/大小/单人/无 BGM）
  → Breeze clone preview
  → 试听预览
  → 勾选授权 → 保存（消耗 slot）
  → 设为默认/绑定角色
```

### 4.6 失败与降级

| 失败 | 用户看到 | 系统行为 |
|---|---|---|
| 429/503 | “语音服务忙，稍后重试” | 按 Retry-After 退避；回退文字 |
| 余额不足 | “语音额度不足” | 管理员告警；不重试 |
| 克隆失败 | 具体原因 + 重试/换样本 | 不保存 voice |
| 唱句失败 | “这次没唱好，重试？” | 保留歌词；不生成空音频 |
| 实时断线 | “通话语音中断” | 停止播放；重连；不重放旧 turn |

## 5. 界面结构

### 5.1 信息架构

```text
聊天
  ├─ 输入框
  │   ├─ 发语音
  │   └─ 唱一句
  ├─ 语音消息气泡（播放/波形/时长/字幕）
  └─ 唱句卡片（播放/发送/保存）
通话
  ├─ 音色状态
  ├─ 字幕
  └─ 唱一句（弹层）
设置
  └─ 声音
      ├─ 默认音色（官方/设计/克隆）
      ├─ 克隆音色（上传/预览/保存/删除）
      ├─ 语音回复开关
      ├─ 用量/额度
      └─ 隐私与授权说明
```

### 5.2 聊天输入区

```text
┌──────────────────────────────────────────────┐
│ [输入文字...]              [🎤] [🔊 发语音] [🎵] │
└──────────────────────────────────────────────┘
```

- `🎤`：语音输入（现有 ASR）；
- `🔊 发语音`：把当前文字转成语音消息；
- `🎵`：打开“唱一句”弹层（也可长按选择“哼一段”）。

### 5.3 语音消息气泡

```text
┌──────────────────────────────┐
│ ▶  ▁▂▃▅▇▅▃▂▁   0:06          │
│ 今天也想见你，记得早点休息。   │
│ [字幕] [重发] [删除]          │
└──────────────────────────────┘
```

### 5.4 唱一句弹层

```text
┌─ 唱一句（Breeze 唱腔短句） ─────────────────┐
│ 音色  [沈幼楚 · 温柔 v]                      │
│ 方式  (•) 唱歌   ( ) 哼一段                  │
│ 歌词  [祝你生日快乐，祝你生日快乐……]         │
│ 风格  [温柔] [俏皮] [伤感] [激昂]            │
│ 语速  [0.9x ——●—— 1.1x]                     │
│ [生成]  预计 2–5 秒                          │
│ ▶ 试听   [发送到聊天] [保存] [重生成] [关闭]  │
│ 提示：这是唱腔短句，不是完整歌曲；无伴奏。     │
└──────────────────────────────────────────────┘
```

### 5.5 声音设置

```text
┌─ 声音（Breeze TTS 2） ───────────────────────┐
│ 默认音色  [沈幼楚 · 温柔 v]   [试听]          │
│ 来源：官方设计音色                             │
│ [ ] 语音回复（聊天/通话）                      │
│                                                │
│ 我的克隆音色  [ + 克隆新音色 ]                 │
│  ┌ 我的声音   [试听] [设为默认] [删除] ┐      │
│  └ 已用 1 / 5 槽位                     ┘      │
│                                                │
│ 用量：本月 12,340 / 100,000 字符               │
│ 隐私：参考音频会上传到 Breeze 用于克隆；删除   │
│ 音色会同时删除 Breeze 侧 voice。               │
└────────────────────────────────────────────────┘
```

## 6. 系统架构与数据

### 6.1 架构

```text
Electron/React
  │ HTTPS / SSE / WebSocket
Spring Boot core
  ├─ VoiceProfileService（音色档案、槽位、授权）
  ├─ SpeechService（语音消息/通话流式）
  ├─ SingingService（唱一句/哼一段）
  ├─ BreezeClient（API Key、重试、限流、计量）
  ├─ AudioStore（MinIO/本地卷）
  └─ UsageLedger（字符/积分/配额）
        │ HTTPS (xi-api-key)
Breeze TTS 2 API（托管）
  ├─ /v1/text-to-speech/{voice_id}
  ├─ /v1/text-to-speech/{voice_id}/stream
  ├─ /v1/text-to-speech/{voice_id}/realtime-sessions
  ├─ /v1/voice-previews/clone
  └─ /v1/voices/{voice_id}
```

- **没有本地模型/GPU**；本地只需要网络、core、对象存储。
- API Key 只在 core；桌面端不接触长期 Key。
- 流式：core 代理 Breeze `/stream`，向前端转发 PCM/MP3；V1.5 实时 WebSocket 可让 core mint `client_secret`，客户端直连，或继续代理（计费/配额更可控）。
- 所有 Breeze 调用带 `requestId`/`userId` 关联，便于对账。

### 6.2 数据模型（草案）

`voice_profiles`：

| 字段 | 说明 |
|---|---|
| id / user_id / character_id | 本地归属；character_id 可空（V1 全局） |
| provider | 固定 `breeze` |
| breeze_voice_id | Breeze voice_id；不暴露给其他用户 |
| source | `public/designed/cloned` |
| display_name / language_code | 展示与语言 |
| status | `active/disabled/pending_verification/deleted` |
| consent_version / consented_at | 声音授权 |
| created_at / updated_at / deleted_at | 审计 |

`audio_messages`：

| 字段 | 说明 |
|---|---|
| id / message_id / user_id | 归属 |
| voice_profile_id | 使用的音色 |
| object_key / format / duration_ms | 音频资产 |
| text_hash / transcript | 防重/字幕；不存完整敏感文本时可只存 hash |
| provider / model / created_at | 审计 |

`singing_clips`：

| 字段 | 说明 |
|---|---|
| id / user_id / character_id | 归属 |
| voice_profile_id | 音色 |
| text / style / mode | `sing/hum`，风格 |
| object_key / format / duration_ms | 成品 |
| status / created_at / deleted_at | 状态 |

`breeze_usage`：

| 字段 | 说明 |
|---|---|
| id / user_id / request_id | 归属 |
| endpoint / model / voice_id | 调用 |
| text_characters / billable_units / credits | 计量 |
| estimated_cost / created_at | 成本 |

### 6.3 后端 API（草案）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/voice/profiles` | 我的音色列表 |
| POST | `/api/v1/voice/clone-previews` | 上传样本，创建 Breeze 克隆预览 |
| POST | `/api/v1/voice/clone-previews/{id}/save` | 保存为 voice（消耗 slot） |
| DELETE | `/api/v1/voice/profiles/{id}` | 删除本地档案 + Breeze voice |
| POST | `/api/v1/speech/messages` | 生成语音消息 `{text, voiceProfileId, conversationId}` |
| POST | `/api/v1/speech/stream` | 流式合成（SSE/WebSocket） |
| POST | `/api/v1/singing/clips` | 生成唱句 `{text, mode, style, voiceProfileId}` |
| GET | `/api/v1/voice/usage` | 本地用量/配额 |
| GET | `/api/v1/voice/status` | Breeze 连通性/余额/套餐 |

### 6.4 关键实现约束

- **不要**在前端保存 Breeze API Key；不要直接调用 `api.breeze.blue`（实时 `client_secret` 例外，且短时有效）。
- **不要**重试已可能计费的同步 TTS 请求；优先用 `history-item-id` 恢复/查询，避免重复扣费。
- **不要**让用户自由注入 `[标签]`；后端按语言白名单构造标签（`[唱歌]`/`[哼歌]` 只在唱句模式）。
- **不要**承诺“完整歌曲”；UI 明确“唱腔短句”。
- **不要**把 Breeze voice_id 当作本地主键；本地 `voice_profile_id` 才是归属/权限边界。
- **不要**假设 voice slot 无限；保存前检查套餐余量，删除时释放。
- **不要**把 Breeze 的 24 kHz 音频直接当 48 kHz 播放；客户端按 24 kHz 解码，或转码。

## 7. 关键设计决策

| 决策 | 推荐 | 理由 | 代价 |
|---|---|---|---|
| D1 托管 vs 自托管 | **托管 API（付费）** | 可商用、无 GPU、低延迟、少运维 | 数据出境/第三方处理、按量计费、槽位/并发限制 |
| D2 “唱歌”范围 | **只做唱一句/哼一段** | Breeze 没有 SVS；短句可控、成本低 | 不能做完整歌曲；用户预期要管理 |
| D3 账号与计费 | **产品统一 Breeze 账号 + 用户配额** | 体验统一、Key 安全、方便对账 | 成本由产品承担；需要预算/限流 |
| D4 音色策略 | **官方固定音色 + 用户可选克隆** | 官方质量可控；克隆满足个性化 | voice slot 成本；克隆授权/隐私 |
| D5 通话传输 | **V1 HTTP 流式；V1.5 实时 WebSocket** | V1 简单；实时更低延迟/可打断 | 实时增加连接/重连复杂度 |
| D6 消息形态 | **显式“发语音”，不自动播放** | 避免打扰；符合聊天习惯 | 多一步点击 |
| D7 失败降级 | **回文字 + 可选系统语音** | 不中断对话 | 音色不一致 |
| D8 语言 | **V1 中英；多语言按需** | 降低测试面 | 其他语言后置 |
| D9 完整歌曲 | **V2 另接 SVC/SVS** | Breeze 做不到；不混架构 | 额外引擎/成本/版权 |

## 8. 需要你确认的取舍点

1. **“唱歌”到底要做到什么程度？**
   - A. 只要“唱一句/哼一段”的彩蛋（Breeze-only，推荐）；
   - B. 必须能唱完整首歌/带伴奏翻唱（Breeze 不够，需另接 SVC/SVS）；
   - C. 先 A，B 放 V2。
2. **Breeze 费用谁承担？**
   - 产品统一账号（体验好，需预算/配额）；
   - 用户自带 API Key（省成本，但 Key 管理/隐私/体验复杂）；
   - 混合：官方音色产品付，用户克隆/BYO。
3. **是否允许用户上传声音到 Breeze？**
   - 允许（需授权、隐私披露、删除机制）；
   - 不允许（则不能做用户克隆，只能用官方/设计音色）。
4. **音色槽位策略？**
   - 每个用户 1 个克隆 + 官方音色共享；
   - 高套餐多槽位；
   - 不做用户克隆，只做音色库。
5. **通话延迟目标？**
   - 可接受 HTTP 流式（实现简单）；
   - 必须实时 WebSocket（更低延迟、可打断，复杂度高）。
6. **语音消息是否自动播放？**
   - 默认手动播放（推荐）；
   - 通话中自动流式播放。
7. **商用套餐档位？**
   - Free 不可商用；至少 Starter/Creator；按并发/槽位/字符预算选。
8. **完整歌曲是否近期必须？**
   - 若必须，Breeze-only 方案不成立，需要混合引擎；请明确优先级。

## 9. 分阶段与验收

| 阶段 | 内容 | 出口条件 |
|---|---|---|
| P0 | Breeze API 冒烟：克隆、中文语音、`[唱歌]`/`[哼歌]` 试听、流式、费用/延迟 | 质量可接受；费用/并发算清；法务确认商用条款 |
| V1 | 音色档案、克隆、语音消息、通话流式、唱一句、失败降级、用量 | 语音消息可发可播；通话可打断；唱句可发；配额生效 |
| V1.5 | 实时 WebSocket、按角色音色、音色库、唱句历史/导出 | 首音达标；角色切换正确；槽位管理正确 |
| V2 | 完整歌曲（如需要） | 另立 SVC/SVS 方案；Breeze 继续负责说话 |

验收要点：

- 语音消息：生成 ≤5 秒；音频可播放；时长/波形正确；失败不产生空消息。
- 通话：首音 P95 目标待实测（官方 TTFA 127 ms，加网络/后端）；打断后 500 ms 内停止。
- 唱句：`[唱歌]`/`[哼歌]` 生效；标注“非完整歌曲”；无伴奏；可重生成。
- 克隆：3 秒–5 MB 样本可预览/保存；删除后 Breeze voice 不可用；槽位释放。
- 配额：超限 429/402 样式错误；不重复扣费。
- 隐私：授权记录、删除、日志脱敏。

## 10. 文档同步

评审通过后：

- 10/11 标记“已被 12 取代”，仅保留历史；
- PRD 增加“语音消息/唱一句”场景与 FR；明确“完整歌曲非 V1”；
- 契约新增 `voice_profiles`、`audio_messages`、`singing_clips`、`breeze_usage` 与 API；
- 05 增加 Breeze API 接入、Key 管理、限额、排查；
- 04 增加语音消息/唱句验收；
- 03 登记 `BreezeClient`/音频存储/用量模块；
- README 索引新增本篇；
- ADR 记录“托管 Breeze TTS 2 + 不做 Breeze-only 完整歌曲”。

## 11. 参考

- [Breeze TTS 2 产品页](https://breezeblue.ai/zh/breeze-tts-2)
- [Breeze Developer API 文档](https://docs.breezeblue.ai/)
- [TTS 调用（含请求字段/限额）](https://docs.breezeblue.ai/guides/text-to-speech)
- [流式 TTS](https://docs.breezeblue.ai/api-reference/text-to-speech/stream-text-to-speech)
- [实时 TTS WebSocket](https://docs.breezeblue.ai/guides/realtime-text-to-speech)
- [声音克隆](https://docs.breezeblue.ai/guides/voice-clone)
- [音频标签（含 `[唱歌]`/`[哼歌]`）](https://docs.breezeblue.ai/guides/audio-tags)
- [输出格式](https://docs.breezeblue.ai/concepts/output-format)
- [多语言（51 种）](https://docs.breezeblue.ai/concepts/multilingual)
- [计费与并发](https://docs.breezeblue.ai/concepts/pricing)
- [Breeze TTS 2 开源仓库（权重非商用）](https://github.com/breezeblue-ai/breeze-tts)
