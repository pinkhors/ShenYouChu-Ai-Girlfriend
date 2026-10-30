# 10 声音克隆（Genie-TTS）引入方案

> **已被 [12 Breeze TTS 2 重构方案](./12-breeze-tts-2-redesign.md) 取代（2026-10-29）。本篇仅保留为历史方案，不再作为实现依据。**

- 状态：已取代，仅存档
- 版本：v0.1（2026-10-29）
- 关联：[产品需求文档](./01-product-requirements.md)、[技术实现路线](./02-technical-roadmap.md)、[真实模型接入手册](./05-voice-and-model-integration.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)、[角色设定设计](./07-character-customization.md)、[唱歌双模式](./11-voice-clone-dialogue-and-singing.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：方案、架构、契约草案、前端入口与风险清单；本文不含代码改动。唱歌模式（SVC/SVS）见 11，本篇只解决“说话音色”。

## 0. 结论摘要

**推荐“集成引擎、不集成插件”：以 Genie-TTS 作为推理引擎，自研声音档案、合成编排与桌面端设置入口；参考插件的流程可以借鉴，但不把 AstrBot 插件或其运行时搬进产品。**

理由一句话：参考插件是一个可工作的 **AstrBot 消息适配器**，不是可复用的 TTS 服务；它真正的价值只有“加载音色模型 → 设置参考音频 → 调 `/tts` → 封装 WAV”这段流程，而这段流程用我们自己的服务实现更干净、更可控。

落地前必须先过三道门：

| 门 | 要回答的问题 | 不过门的后果 |
|---|---|---|
| 效果门 | 单一基础 ONNX 模型 + 任意 5–10 秒参考音频，音色相似度是否可接受？ | 若每个音色都必须单独训练/导出 ONNX，“上传即克隆”就不成立，V1 要改成“导入音色模型”或改用云端复刻 |
| 合规门 | 参考音频的授权、真人声音、未成年人、AI 标识、模型权重许可证是否可控？ | 不能上线，或只能做“授权音色库”而不能开放用户上传 |
| 产品门 | PRD 目前把“声音克隆”列为非目标，是否改为 P1 实验特性？ | 需求与验收没有依据，做完也无法按 PRD 验收 |

在这三道门通过前，建议功能开关默认关闭，按“实验特性”灰度；不要把它写成默认卖点。

如果合规门只允许“授权音色”而不允许用户上传，仍有可交付的降级路径：先做**授权音色库**（预置若干有商用授权的 ONNX 模型，用户只选音色、不训练也不上传），把用户上传克隆留到灰度或后续。它满足“音色定制”，但不承诺“任意声音克隆”。

## 1. 背景与现状

### 1.1 已有能力

| 层 | 现状 | 对声音克隆的含义 |
|---|---|---|
| 后端 TTS seam | `TtsAdapter.synthesize(text, emotion)`；`HttpTtsAdapter` 调外部 CosyVoice 风格服务；失败/空结果回退 `StubTtsAdapter`（`format=none`） | 当前接口没有“音色”维度，无法表达“用哪个声音” |
| 后端语音轮次 | `POST /conversations/{id}/voice-turns`：Base64 音频 → ASR → 文本轮次 → TTS → 返回 `ttsAudioBase64` | 链路已通，但桌面端没有用它 |
| 桌面端语音设置 | `VoiceSettings` 把 TTS/ASR 配置存本机 `localStorage`：系统语音 / OpenAI 兼容 `/audio/speech` | 与后端 TTS 是两套路径，优先级和降级需要统一 |
| 通话页播放 | `CallView` 用 Electron 主进程的 `window.desktop.tts.synthesize`（OpenAI 兼容 `/audio/speech`），失败回退浏览器 `speechSynthesis`；ASR 也走 `window.desktop.asr` | **只改后端 adapter，用户在通话页听不到克隆音色**；必须补播放接线 |
| 产品范围 | PRD 明确把“声音克隆”列为非目标；07 把“每个角色独立音色”列为 P2（首版全局音色） | 引入即改变产品范围，需要 PRD/验收/契约同步 |
| 角色模型 | 官方沈幼楚 + 用户自定义角色；角色只有形象/人设，没有音色字段 | V1 先做“用户级默认音色”，按角色绑定放 V1.5/P2 |

### 1.2 三个必须先承认的现实

1. **后端 `/voice-turns` 不是当前 UI 的主路径。** 桌面端通话页直接调 Electron 侧 ASR/TTS；`voiceTurn()` 在 renderer 中没有调用点。克隆音色若只接 `VoiceTurnController`，设置页做完了也没有声音。V1 必须新增一个统一的语音合成端点，并让通话页在“克隆音色就绪”时优先走它。
2. **“零样本克隆”在参考插件里不是纯上传。** 它的配置要求 `onnx_model_dir`（服务器上的音色模型目录）+ `ref_audio_path` + `ref_audio_text`；参考音频主要提供音色/韵律条件。是否能用**一个基础模型**对任意参考音频达到可用相似度，必须 POC 验证，不能按宣传语直接排期。
3. **声音是敏感数据。** 参考音频可能包含声纹、身份、环境信息；删除、隔离、日志、跨境、二次使用都要在设计阶段定好，不能等上线前补。

### 1.3 目标与非目标（本方案）

**目标**

- G1：用户可在桌面端设置页上传/录制 5–10 秒参考音频，填写对应文本，生成一个可试听、可设默认、可删除的“声音档案”。
- G2：声音档案就绪后，通话页的 AI 回复优先用克隆音色合成；合成失败自动回退默认语音，不中断对话。
- G3：声音档案按用户隔离；账号删除/档案删除时，数据库、对象存储、合成服务缓存三处都被清理。
- G4：引擎、模型、音色 provider 可替换；不把 AstrBot 或 Genie 的内部实现泄漏到业务代码。
- G5：全链路有可观测性与可验收标准，能在本仓库沙箱内做纯逻辑测试与契约测试。

**非目标（本期不做）**

- 在线训练/微调平台、GPU 训练任务编排；
- 声音市场、公开分享、跨用户音色借用；
- 实时变声、多人分离、背景音乐分离；
- 逐词流式 TTS（V1 先做整句/整段，流式放 V1.5）；
- 每个角色独立音色（V1 先全局默认；按角色绑定放 V1.5/P2，尊重 07 的 C-7）；
- 云端声音复刻 provider（作为同一 seam 的 V2 备选，不在 V1 强绑定）。

## 2. 参考插件评估

### 2.1 它是什么

截图中“自定义音色 Genie TTS”这一类插件，代表实现是 [`victical/astrbot_plugin_genie-tts`](https://github.com/victical/astrbot_plugin_genie-tts)。它是一个 **AstrBot Star 插件**（Python 单文件约 25 KB，MIT），本身不做推理，只做三件事：

1. 启动时调用本地 Genie-TTS 服务的 `/load_character` 与 `/set_reference_audio`；
2. 在 AstrBot 的 `on_decorating_result` 钩子里拦截 LLM 文本回复；
3. 调 `/tts` 拿音频，封装成 WAV，替换消息链里的文本组件为语音组件。

默认连 `127.0.0.1:9999`，要求用户另行部署 [Genie-TTS](https://github.com/High-Logic/Genie-TTS)。

### 2.2 运行链路

```text
AstrBot 收到消息
  → LLM 生成回复（AstrBot 的 provider 体系）
  → on_decorating_result 钩子
  → 仅处理 LLM 结果；提取 Plain 文本
  → 会话开关 / 触发概率 / 长度上限 / 冷却时间
  → POST Genie /tts { character_name, text, split_sentence }
  → 原始音频字节（按裸 PCM 处理）
  → 加 WAV 头：32 kHz / 16-bit / 单声道
  → pydub 去首尾静音（可选依赖）
  → Comp.Record 替换 Plain，发送语音
  → 10 秒后异步删除临时文件
```

初始化链路：

```text
插件 __init__
  → 异步 POST /load_character { character_name, onnx_model_dir }
  → POST /set_reference_audio { character_name, audio_path, audio_text }
  → initialized = true
```

### 2.3 代码级要点与问题

| 观察 | 说明 | 对我们的意义 |
|---|---|---|
| 音色 = 模型目录 + 参考音频 + 参考文本 | `_conf_schema.json` 暴露 `onnx_model_dir`、`ref_audio_path`、`ref_audio_text` | 这就是“声音档案”的雏形；但路径是**服务器本地路径**，不能直接搬给终端用户 |
| 未传 `language` | 当前 Genie 的 `CharacterPayload` / `ReferenceAudioPayload` 要求 `language`；插件请求没有该字段 | 插件针对旧版 API；当前 master 上存在 422 风险，说明直接复用会踩版本漂移 |
| 默认地址拼接有 bug | 配置默认值是 `http://127.0.0.1`，代码又拼 `http://{host}:{port}` | 默认配置会得到 `http://http://127.0.0.1:9999`；成熟度信号，不适合作为生产依赖 |
| 单音色、全局配置 | 只有一个 `character_name`；没有“每个用户/每个角色”的音色 | 与产品多用户、多角色模型不匹配 |
| 无上传、无鉴权、无隔离 | 参考音频必须是服务器路径；AstrBot 进程内没有租户概念 | 用户无法自助配置；不能把服务暴露给客户端 |
| 无队列/锁 | `_reload_model_if_needed` 可被并发触发；模型加载是重操作 | 并发下会重复加载/争抢内存；需要网关层串行化 |
| 无空闲卸载 | `last_model_use_time` 只写不读；`_unload_model` 仅手动命令 | 模型常驻；多音色场景内存会持续增长 |
| 重试策略简单 | 递归重试 + 音频 <1000 字节判定失败；没有熔断 | 失败会放大延迟；需要超时、熔断、快速降级 |
| 后处理依赖 pydub | 未安装则跳过静音裁剪；没有 ffmpeg 转码 | 参考音频格式/手机录音兼容性不足 |
| 配置项声明未使用 | `filter_code`、`filter_emoji`、`filter_url` 在 schema 中存在，主流程未实现 | 文本清洗要我们自己补，不能照抄配置 |
| 情绪未接入 | `/tts` 没有 emotion 参数；插件也不传 | 克隆音色的“情绪”只能靠参考音频或后续多参考，不能假装支持 |
| 无测试 | 仓库没有测试；README 自述由 AI 开发 | 不能把它当稳定基础库 |

> 关于音频格式：当前 Genie 服务端 `set_reference_audio` 只接受 `.wav/.flac/.ogg/.aiff/.aif` 扩展名；`mp3/m4a/webm` 需要网关先转码。`/tts` 官方文档写 `audio/wav` 流，但参考插件与官方客户端教程都按 **32 kHz、16-bit、单声道裸 PCM** 处理；适配层必须实测确认并自己封装 WAV，不能只看 `Content-Type`。

### 2.4 值得借鉴的部分

1. **声音档案四元组**：模型、参考音频、参考文本、语言。这个抽象是对的，我们保留并扩展为数据库实体。
2. **初始化顺序**：先加载模型，再设置参考音频，再预热合成；顺序不能反。
3. **文本门控**：只处理 LLM 文本、长度上限、冷却时间；我们改成用户级/会话级配置，而不是全局。
4. **后处理**：去首尾静音、补 WAV 头、临时文件清理；我们放到网关统一做。
5. **失败回退**：插件失败时保留文本；我们要求更强——回退默认 TTS，且不阻塞轮次。
6. **状态/试听入口**：插件的 `gentts test/status/load/unload` 对应我们设置页的“试听/状态/重试”，交互可以借鉴。

另一个社区实现 [`Qiscard/astrbot_plugin_genie-tts`](https://github.com/Qiscard/astrbot_plugin_genie-tts) 已经把“Gateway + 角色/情绪同步 + 逐句 TTS + 预热/休眠 + API Key”做成独立网关，说明**网关化**比“插件里塞业务”更可持续；这正好支持我们的方向。

### 2.5 为什么不能直接集成这个插件

1. **运行时耦合**：插件 import `astrbot.api`，依赖 AstrBot 的事件总线、消息组件、provider 体系；我们的 Electron + Spring Boot 没有这些。要“直接集成”，等于把 AstrBot 作为旁路服务跑起来，再想办法把我们的对话灌进去、把语音捞出来——引入一个完整的 IM/Agent 框架只为 TTS，架构上不成立。
2. **许可证边界**：AstrBot 本体是 AGPL-3.0（已核对其仓库 LICENSE），插件是 MIT。直接内嵌/分发 AstrBot 运行时会把 AGPL 义务带进产品；即使只借鉴思路，也要避免复制其运行时代码。需要法务确认，不应由工程单方面决定。
3. **没有服务契约**：插件面向 AstrBot 的“消息结果”，没有面向桌面端的 REST/鉴权/错误码/限流；它也不接受上传，只接受服务器路径。我们的客户端不可能拿到服务器文件路径。
4. **多租户缺失**：单 `character_name`、全局配置、无 `user_id` 概念；无法满足“A 不能读取/使用 B 的音色”。
5. **质量与可维护性**：无测试、无并发控制、无熔断、无空闲卸载、API 版本漂移、默认地址 bug；把它作为生产依赖，维护成本会高于重写一个薄适配层。
6. **产品边界**：AstrBot 插件默认“每条 LLM 回复都转语音”，我们是“通话/朗读时按需合成”；触发模型不同，硬接会带来不必要的合成与费用。

**结论：不直接集成插件，也不 fork 插件。** 去掉 AstrBot 依赖后，插件真正可复用的只有约百行 HTTP 调用与 WAV 封装；重写一个干净的网关更便宜。

### 2.6 方案对比

| 方案 | 含义 | 结论 | 理由 |
|---|---|---|---|
| A. 直接安装 AstrBot + 插件 | 把 AstrBot 当 TTS 服务 | 否 | 引入完整 IM/Agent 框架、AGPL、双 LLM 链路；无 API/鉴权/上传 |
| B. 复制插件代码到自有 Python 服务 | 去掉 AstrBot 依赖，保留 Genie 调用 | 否（仅借鉴） | 只剩薄薄一层 HTTP；仍继承路径、单音色、无上传、无隔离问题 |
| C. 集成 Genie-TTS 引擎 + 自研业务层 | 新网关 + Java 编排 + UI | **推荐** | 引擎 MIT、CPU 可用、零样本潜力；业务层掌握上传、鉴权、档案、降级、合规 |
| D. 纯自研 ONNX 推理 | Java/Rust 重写 GPT-SoVITS | 否 | G2P、模型转换、音频链路工作量巨大，无差异化收益 |
| E. 云厂商声音复刻 API | 同一 seam 接云 | 备选（V2） | 质量/流式/运维更省，但成本、隐私、合规、供应商锁定；适合作 failover 或高质量档 |

## 3. 推荐方案

### 3.1 设计原则

- **引擎与产品分离**：Genie 只负责“给定模型 + 参考音频 + 文本 → 音频”；上传、档案、权限、配额、删除、降级都在我们自己的服务里。
- **声音档案是一等公民**：不是“一个全局音色字符串”，而是有 id、归属、状态、授权记录、可删除的资源。
- **本地优先、provider 可替换**：默认本地 Genie（隐私、零边际成本）；云端复刻通过同一 `SpeechSynthesizer` seam 接入，不绑死。
- **失败必降级**：任何克隆失败都不能让对话失声；回退顺序明确、可观测。
- **明确授权、最小留存**：没有授权不创建；参考音频只用于合成，不用于训练；删除要三处一致。
- **先测量再承诺**：相似度、延迟、内存都以 POC 数据为准；不在 UI 上做引擎不支持的假旋钮。

### 3.2 总体架构

```text
┌──────────────────────────────┐
│ Electron / React             │
│  设置 → 声音克隆              │
│  通话页 → 合成播放            │
└──────────────┬───────────────┘
               │ HTTPS + Bearer
┌──────────────▼───────────────┐
│ Spring Boot core             │
│  VoiceProfileService         │
│  SpeechSynthesisService      │
│  GenieTtsAdapter             │
│  MySQL: 档案元数据            │
│  MinIO: 参考音频（私有桶）     │
└──────────────┬───────────────┘
               │ 内网 HTTP + X-Internal-Token
┌──────────────▼───────────────┐
│ services/voice-clone         │
│  FastAPI 网关                 │
│  ├ 上传/校验/ffmpeg 转码      │
│  ├ 档案运行时（LRU/队列/锁）   │
│  └ genie_tts + ONNX Runtime  │
│     模型目录（服务器本地）      │
└──────────────────────────────┘
```

关键点：**客户端永远不接触模型路径、参考音频路径或 sidecar 地址**；只和 core 的 REST 交互。这是与参考插件最本质的区别。

### 3.3 组件职责

| 组件 | 职责 | 不做什么 |
|---|---|---|
| `VoiceCloneSettings`（前端） | 上传/录制、文本编辑、试听、设默认、删除、状态展示 | 不直接调 sidecar；不保存音频到 localStorage |
| `VoiceProfileService`（core） | 档案 CRUD、归属校验、默认音色、状态机、调用 sidecar、删除编排 | 不做音频重采样/模型推理 |
| `SpeechSynthesisService`（core） | 解析当前用户/角色的有效音色；选择 provider；超时/熔断/降级；统一返回 | 不直接拼 Genie 请求 |
| `GenieTtsAdapter`（core） | 把内部合成请求翻译成 sidecar 契约 | 不管理模型槽位（交给 sidecar） |
| `services/voice-clone` | 音频校验/转码、模型加载、参考音频设置、队列、LRU、预热、合成 | 不做用户鉴权/计费/档案归属（信任 core，但校验 token） |
| MySQL / MinIO | 元数据、授权记录、参考音频 | 不存模型权重（模型在 sidecar 数据卷） |

**seam 演进（实现约束，不在本次改代码）**：当前 `TtsAdapter` 只有 `synthesize(text, emotion)`，没有音色维度。实现时二选一：给接口增加 `SynthesisRequest{text, emotion, voiceKey}`，或新建 `SpeechSynthesizer` 编排接口并让 `GenieTtsAdapter`/`HttpTtsAdapter` 成为 provider；无论哪种，`SpeechSynthesisService` 负责解析用户档案，provider 只做“给定 voiceKey 的合成”。另外，`StubTtsAdapter` 现在与 `HttpTtsAdapter` 的条件互斥（`voice.enabled=false` 才创建），新增克隆 provider 后必须把 stub 改成无条件兜底 Bean，否则 `voice.enabled=false` 时没有可注入的 fallback。

### 3.4 数据模型

新增迁移 `V7__user_voice_profiles.sql`（示意，最终以实现为准）：

```sql
CREATE TABLE user_voice_profiles (
    id                  BIGINT       NOT NULL,
    user_id             BIGINT       NOT NULL,
    display_name        VARCHAR(64)  NOT NULL,
    provider            VARCHAR(20)  NOT NULL DEFAULT 'genie',
    model_key           VARCHAR(128) NULL,              -- 基础模型/授权模型标识，不是路径
    voice_key           VARCHAR(64)  NOT NULL,           -- 交给 sidecar 的随机标识
    language            VARCHAR(8)   NOT NULL DEFAULT 'zh',
    ref_text            VARCHAR(500) NOT NULL,
    ref_audio_object_key VARCHAR(300) NOT NULL,          -- MinIO 私有对象 key
    ref_audio_sha256    CHAR(64)     NOT NULL,
    ref_duration_ms     INT          NOT NULL,
    status              VARCHAR(20)  NOT NULL,           -- draft/validating/ready/failed/disabled
    is_default          TINYINT      NULL,               -- 1=默认；NULL=非默认（利用 MySQL 唯一索引对 NULL 的宽松）
    consent_version     VARCHAR(20)  NOT NULL,
    consented_at        DATETIME(3)  NOT NULL,
    last_error_code     VARCHAR(64)  NULL,               -- 只存错误码，不存原始异常/路径
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at          DATETIME(3)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_voice_key (voice_key),
    UNIQUE KEY uk_user_default (user_id, is_default),
    KEY idx_user_status (user_id, status, created_at),
    CONSTRAINT fk_voice_profile_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
```

说明：

- **一用户一个默认音色**：`uk_user_default(user_id, is_default)` 只允许一行 `is_default=1`，其余为 `NULL`；MySQL 唯一索引允许多个 `NULL`。切换默认值必须在事务里先清空旧值再写新值。
- **V1 不做 `character_id`**：保持“用户级默认音色”，与 07 的 C-7 一致。V1.5 若要按角色绑定，新增 `user_character_voices(user_id, character_id, voice_profile_id)`，唯一键 `(user_id, character_id)`；不改本表语义。
- **`model_key` 是白名单标识**，不是文件路径；客户端不能传路径，sidecar 只接受允许的模型 key。参考插件的“任意路径”是我们要明确避免的。
- **`ref_text` 是用户内容**：接口只在档案详情返回给本人；日志、监控、活动事件不记录原文。
- **逻辑删除**：用户删除先 `deleted_at` 置位并清默认；物理清理由删除编排完成（见 §3.10）。
- **存储路径**：MinIO 私有桶 `users/{userId}/voices/{profileId}/reference.wav`；sidecar 缓存目录 `voices/{voiceKey}/reference.wav` + 特征缓存。对象 key 不含用户文件名，避免路径注入。
- **对象存储未启用时**：走同一个 `VoiceAudioStore` seam（core 内接口，MinIO 与本地卷两种实现），写入本地卷 `VOICE_DATA_DIR/users/{userId}/voices/{profileId}/reference.wav`；删除逻辑复用同一套。不要把“必须部署 MinIO”作为 V1 的硬前提，否则单机用户体验会被基础设施卡住。

### 3.5 接口契约（草案）

统一沿用现有约定：`Authorization: Bearer <token>`、ID 字符串、错误体 `{code, message, requestId}`；所有查询带 `user_id`，跨用户一律 404。

#### 公共 REST

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/voice/status` | 引擎状态、默认音色、限额、能力；前端决定播放策略 |
| GET | `/api/v1/voice/profiles` | 当前用户的声音档案列表（不含音频二进制） |
| POST | `/api/v1/voice/profiles` | 创建档案（multipart：音频 + 文本 + 语言 + 授权 + 可选设默认）；202 返回 `validating` |
| GET | `/api/v1/voice/profiles/{id}` | 档案详情（含 `refText`，仅本人） |
| PATCH | `/api/v1/voice/profiles/{id}` | 改名称/文本/语言/启用状态；改变参考内容需重新校验 |
| DELETE | `/api/v1/voice/profiles/{id}` | 删除档案与音频；204 |
| POST | `/api/v1/voice/profiles/{id}/test` | 用短文本试听；返回音频 + 延迟 |
| PUT | `/api/v1/voice/settings` | 设置默认音色 `{defaultProfileId}`；传 null 清除 |
| POST | `/api/v1/voice/synthesize` | 统一合成入口：`{text, characterId?}`；供通话页/朗读使用 |

**创建档案**（`multipart/form-data`）：

```text
audio=@sample.wav
displayName=我的声音
language=zh
refText=今天也想见你，记得早点休息。
consentVersion=2026-10
makeDefault=true
```

响应（202）：

```json
{
  "id": "1834...",
  "displayName": "我的声音",
  "provider": "genie",
  "language": "zh",
  "status": "validating",
  "durationMs": 7200,
  "isDefault": false,
  "warnings": [],
  "createdAt": "2026-10-29T09:00:00.000Z"
}
```

前端轮询 `GET /voice/profiles/{id}`，直到 `ready` 或 `failed`；默认 1 秒一次、120 秒超时。不要在创建请求里同步等模型加载（会顶到网关/反向代理超时）。

约束：

- `consentVersion` 不能由前端任意指定。后端只接受配置中的当前版本，未知版本直接 400，防止伪造授权记录。
- `makeDefault=true` 时，默认值要等档案 `ready` 后再落库；不要让默认指向 `validating/failed` 的档案。
- 创建限流建议 3 次/小时/用户，试听 5 次/分钟/用户，合成 30 次/分钟/用户；超限返回 429。
- V1 的“替换音频”采用删除旧档案后新建；`PATCH` 只改名称/文本/语言。改 `refText` 必须重新 `set_reference_audio` 并短暂进入 `validating`；音频替换不做原地更新，避免“音频换了但缓存没换”的半更新。
- `/voice/synthesize` 的 `characterId` 在 V1 仅作为预留参数忽略；V1.5 才用于按角色解析音色，避免 V1 偷跑未评审的角色绑定语义。

**试听**：

```json
POST /api/v1/voice/profiles/1834.../test
{ "text": "今天也想见你。" }
```

```json
{
  "audioBase64": "...",
  "format": "wav",
  "latencyMs": 1800,
  "warnings": []
}
```

**统一合成**：

```json
POST /api/v1/voice/synthesize
{ "text": "今天也想见你。", "characterId": "1834..." }
```

```json
{
  "audioBase64": "...",
  "format": "wav",
  "provider": "genie",
  "voiceProfileId": "1834...",
  "latencyMs": 1800,
  "degraded": false
}
```

- 未启用克隆、没有默认音色、引擎不可用、合成失败时，`degraded=true` 并按 §3.6 回退；前端据此决定是否再用本地 TTS。
- 文本上限建议 500 字符；超过由后端按句切分，最多合成前 N 段，剩余部分前端继续按本地 TTS 或文本展示。V1 可先拒绝超长并提示。

**错误码**：

| HTTP | code | 场景 |
|---|---|---|
| 400 | `VOICE_AUDIO_INVALID` | 无法解码、非音频、声道/采样率异常 |
| 400 | `VOICE_AUDIO_TOO_LONG` / `VOICE_AUDIO_TOO_LARGE` | 超过 15 秒 / 10 MB |
| 400 | `VOICE_TRANSCRIPT_REQUIRED` | 参考文本为空或不匹配长度 |
| 400 | `VOICE_CONSENT_REQUIRED` | 未勾选授权或版本不合法 |
| 404 | `VOICE_PROFILE_NOT_FOUND` | 不存在或不属于当前用户 |
| 409 | `VOICE_PROFILE_LIMIT` | 超过每用户档案上限（建议 3） |
| 409 | `VOICE_PROFILE_NOT_READY` | 档案未就绪 |
| 429 | `VOICE_RATE_LIMITED` | 试听/创建过频 |
| 503 | `VOICE_ENGINE_UNAVAILABLE` | sidecar 未启动/模型缺失 |
| 503 | `VOICE_QUEUE_FULL` | 合成队列满 |
| 502 | `VOICE_SYNTHESIS_FAILED` | 引擎返回错误/音频为空 |

#### 内部 sidecar 契约

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 进程存活 |
| GET | `/v1/status` | 模型槽位、已加载档案、队列、版本 |
| PUT | `/v1/voices/{voiceKey}` | multipart：audio、refText、language、modelKey；校验/转码/加载/预热 |
| POST | `/v1/voices/{voiceKey}/warmup` | 幂等预热 |
| DELETE | `/v1/voices/{voiceKey}` | 卸载模型、删除缓存与参考音频 |
| POST | `/v1/synthesize` | `{voiceKey, text, splitSentence}` → `audio/wav`（或 PCM + 采样率头） |
| GET | `/v1/voices` | 诊断：已加载/最近使用 |

- sidecar 只绑定 `127.0.0.1` 或容器内网，不暴露公网；core 用 `X-Internal-Token` 调用。
- sidecar 不信任 `voiceKey` 之外的任何路径；所有文件路径由它自己拼装，拒绝 `..`、绝对路径、符号链接。
- `workers=1`：Genie 的参考音频/模型状态在进程内存里，多 worker 会状态不一致；并发由网关的信号量/队列控制，不靠多进程。

### 3.6 合成链路与优先级

**有效音色解析顺序**（与 LLM 配置的“用户优先、服务端兜底”风格一致）：

1. 按角色绑定音色（V1.5；V1 跳过）；
2. 用户默认克隆音色（`status=ready` 且未禁用）；
3. 服务端默认音色（授权音色/预置 Genie 模型）；
4. `HttpTtsAdapter`（现有 CosyVoice 风格服务）；
5. `StubTtsAdapter`（`format=none`，前端纯文本/本地系统语音）。

**规则**：

- 用户显式关闭克隆（`enabled=false`）时不再使用克隆音色，也不静默回退到服务端克隆音色；直接走 4/5。
- 克隆失败（超时、503、空音频）→ 记录 `last_error_code` + 指标，按 3→4→5 继续；**绝不把失败抛给对话轮次**。
- 每个 provider 独立熔断：连续 3 次失败打开 30 秒，期间直接跳过；半开时放一个探针。
- 超时：连接 3 秒、合成 60 秒、模型预热 120 秒；队列等待 15 秒。超时错误可识别，便于前端提示“已回退默认语音”。
- 取消：沿用 `turnId`/请求 token；迟到的合成结果丢弃，不播放。sidecar 不提供“按请求取消”，不要用全局 `/stop`（会误杀其他用户的合成）。

**通话页时序（V1）**：

```text
用户进入通话
  → GET /voice/status（缓存 30s）
  → 若 enabled && defaultProfileId && engine READY：标记 useClone=true
  → 用户说话 → 本地 ASR（现状不变）→ streamTurn 得到文本
  → playAnswer(text)
      → useClone ? POST /voice/synthesize : 本地 OpenAI/系统语音
      → 播放 WAV（data URL）
      → 失败：toast + 回退本地 TTS；不阻塞文本
```

> 这里刻意不动 ASR 链路：克隆只改变“回答怎么发声”，把 ASR 也迁到后端会扩大回归面。V1.5 再评估统一。

### 3.7 音频规范与校验

| 项 | 建议 | 处理 |
|---|---|---|
| 时长 | 推荐 5–10 秒；接受 3–15 秒 | <3 秒或 >15 秒拒绝，给出明确提示 |
| 采样率 | ≥16 kHz | 统一重采样到 32 kHz |
| 声道 | 单声道 | 多声道下混 |
| 位深 | 16-bit PCM | ffmpeg 转换 |
| 响度 | 峰值约 -3 dBFS | 归一化；削波告警 |
| 静音 | 首尾静音占比低 | 裁剪首尾，保留约 100 ms 尾音 |
| 噪声 | 无 BGM、无混响、单人 | 用能量/静音比例做启发式告警；不承诺自动识别多人 |
| 格式 | wav/flac/ogg/aiff 直通；mp3/m4a/webm 转码 | MediaRecorder 常见 webm/opus，必须 ffmpeg |
| 大小 | ≤10 MB | 流式大小限制，防解压炸弹 |
| 文本 | 1–200 字，必须与音频逐字一致 | 可自动 ASR 填充，但必须让用户确认/编辑 |
| 语言 | zh/en/ja/ko，与音频/模型一致 | 不一致时告警，不保证效果 |

校验只做“可解释的启发式”，不要给“音质评分 95 分”这种伪精确指标；用“通过/警告/拒绝 + 原因”三态。

### 3.8 模型与运行时

**核心未知：一个基础模型能否克隆任意音色？**

- Genie 的 `load_character` 需要 `onnx_model_dir`；参考音频通过 `set_reference_audio` 提供。参考插件也因此要求用户准备模型目录。
- GPT-SoVITS 系列支持零样本推理，但“基础模型 + 任意参考音频”的相似度是否达到产品可用，必须以 POC 为准。
- **POC 结果 A**：基础模型可用 → V1 只需一个基础模型（约 230 MB）+ 每用户参考音频；产品体验最轻。
- **POC 结果 B**：必须每个音色单独 ONNX 模型 → “上传 5–10 秒即克隆”不成立；V1 改为“导入/选择授权音色模型 + 参考音频”（高级用户），或走云端复刻；不要用宣传语掩盖训练/转换成本。
- **POC 结果 C**：CPU 延迟/音质不达标 → 云端复刻（同一 seam）或 GPU 部署；本地 Genie 降为可选。

**网关实现方式**：两种都可行——直接 `import genie_tts`（单进程，自己管加载/队列/LRU），或反向代理官方 `start_server`。推荐直接 import：上传、路径隔离、模型槽位、队列都需要进程内控制；官方 server 没有鉴权/上传，且状态在进程内存里，只适合临时 POC。无论哪种，锁定 `genie-tts` 版本并写契约测试（加载、设置参考、合成、卸载），否则下次升级会重演参考插件的 `language` 字段漂移。

**质量分层**：即使 POC 结果 A 通过，专用音色模型通常仍优于“基础模型 + 任意参考”。V1.5 可提供**白名单模型导入**作为高质量档（服务器管理员放置模型，用户只选 key），但 V1 不开放用户上传 ONNX，避免供应链与路径风险。

**模型与参考音频的绑定粒度（容易踩坑）**：Genie 的模型和参考音频都按 `character_name` 存在进程内。若给每个用户档案分配独立 `character_name` 但共用同一个基础模型目录，可能出现**同一模型被重复加载**（内存按档案数增长）；若所有档案共用一个 `character_name`，参考音频又是全局状态，合成必须串行并在每次请求前 `set_reference_audio`。V1 建议：

- 单机/少量音色：一档案一 `character_name`，配合 `GENIE_MAX_LOADED_VOICES=1` 的 LRU，简单但内存有上限；
- 多用户/共享基础模型：一模型一 `character_name`，全局锁内按 `voiceKey` 切换参考音频，参考特征按 `voiceKey + ref_sha256` 缓存；切换延迟与缓存命中率必须实测；
- POC 必须量一件事：同一 `onnx_model_dir` 用两个 `character_name` 加载，内存是否翻倍；以及反复 `set_reference_audio` 的耗时。答案决定 V1 的并发/槽位设计。

**运行时策略**：

- 模型槽位：`GENIE_MAX_LOADED_VOICES=1`（4 核/8 GB 默认），内存充足可设 2；LRU 淘汰，淘汰时 `unload_character`。
- 加载：创建档案/设默认/应用启动时预热默认音色；首次合成不应承担冷启动。
- 队列：`asyncio.Semaphore(1)` + 有界队列（默认 8）；队列满返回 503，前端降级。
- 线程：限制 `OMP_NUM_THREADS`/ONNX intra-op，避免和 ASR/LLM 抢 CPU。
- 磁盘：运行时约 200 MB + 共享资源约 391 MB + 每音色模型约 230 MB；模型缓存放数据卷，不随镜像膨胀。
- 版本：锁定 `genie-tts`、`onnxruntime`、Python 3.10–3.11（3.12 需 POC 实测）；模型文件校验和；禁止 V1 接受用户上传的任意 ONNX（供应链风险）。
- 输出：V1 用 `save_path` 或官方 `/tts` 流，网关统一转 WAV；确认裸 PCM 后自己加 44 字节 WAV 头。V1.5 再做 chunked 流式。

### 3.9 桌面端设置入口

**位置**：`设置 → 声音克隆（实验）`，作为独立 `setting-card` 放在现有 `VoiceSettings` 之后；不要塞进现有“语音”卡片（已经很长，且一个是本机配置、一个是服务端档案，语义不同）。通话页加一个“克隆音色”状态徽标/入口，点击跳到设置。

**线框**：

```text
┌─ 声音克隆（实验） ─────────────────────────────┐
│  [未配置] / [准备中] / [就绪] / [失败]          │
│                                                │
│  音色名称   [我的声音____________]              │
│                                                │
│  参考音频   ┌──────────────────────────────┐   │
│            │ 拖入 / 选择文件 / 按住录制     │   │
│            │ 推荐 5–10 秒，单人，无 BGM     │   │
│            └──────────────────────────────┘   │
│            [▶ 试听原声]  时长 0:07   [替换]     │
│                                                │
│  参考文本   [今天也想见你，记得早点休息。____]  │
│            [自动识别]  12/200                  │
│                                                │
│  语言       [中文 v]                            │
│                                                │
│  [x] 我确认这是本人声音，或已取得声音所有者     │
│      明确授权；不用于冒充他人。 [授权说明]       │
│                                                │
│  [保存并生成音色]  [试听合成]  [设为默认] [删除] │
│                                                │
│  提示：首次生成需加载模型，约 10–60 秒；失败会   │
│  自动回退默认语音，不影响聊天。                  │
└────────────────────────────────────────────────┘
```

**用户可配置的参数**（只放引擎真正支持的）：

- 音色名称；
- 参考音频（上传/录制/替换/试听）；
- 参考文本（自动识别 + 手动校对）；
- 语言（中文/英语/日语/韩语）；
- 是否设为默认；
- 试听文本（仅试听，不持久化）。

**不做的假旋钮**：相似度、情感强度、音高、语速、呼吸感等——Genie 当前 `/tts` 没有这些参数，不要用滑块制造“可调”的错觉。情绪需要多参考音频或模型能力，放 V1.5 评估。

**状态与文案**：

| 状态 | 展示 | 操作 |
|---|---|---|
| `loading` | 骨架屏 | — |
| `engine-off` | “声音克隆服务未启动，当前使用默认语音” | 重试 / 查看部署说明 |
| `empty` | “还没有克隆音色” | 上传/录制 |
| `validating` | “正在校验音频并加载模型…” + 进度 | 取消（可选） |
| `ready` | “已就绪 · 7.2 秒参考音频” | 试听/设默认/删除 |
| `failed` | 错误码对应的可操作文案 | 重试/替换音频 |
| `deleting` | “正在删除…” | 禁用按钮 |

必要文案：

- “参考文本必须与音频逐字一致，否则音色会跑偏。”
- “参考音频只用于你自己的音色合成，不用于训练公共模型。”
- “删除音色会同时删除参考音频；删除账号会清理全部音色数据。”
- “合成失败会自动回退默认语音，不会影响聊天。”

**播放接线**：

- 新增 `voiceClone.ts`（前端状态/缓存）与 `VoiceCloneSettings.tsx`；API 函数加在 `api/client.ts`。
- `CallView.playAnswer`：先读缓存的 `/voice/status`；`useClone` 为真时调 `POST /voice/synthesize`，把 `audioBase64` 转 data URL，复用 `playAudioDataUrl`（口型/电平分析不变）；失败回退现有 OpenAI/系统语音，并 toast。
- 不在每句话前请求 `/voice/status`；进入通话时取一次，设置页保存后刷新缓存。
- 若 `/voice/synthesize` 返回 `format=none`/`degraded=true`，不要播放空音频，直接走本地 TTS。
- 迟到结果用现有 `speechToken` 机制丢弃；必要时给请求加 `AbortController`。

**无障碍与隐私**：

- 所有输入有 label；状态变化用 `aria-live="polite"`；上传区支持键盘选择。
- 参考音频不在浏览器持久化；页面刷新后从服务端取元数据，不自动重播。
- 共用电脑提示：“参考音频保存在你的账号下；退出登录后其他人不可见，但本机磁盘仍可能有缓存，请及时删除。”

### 3.10 删除与账号清理

| 触发 | 要清理 | 失败处理 |
|---|---|---|
| 删除单个档案 | DB 逻辑删除 + 对象存储（MinIO/本地卷）对象 + sidecar 缓存/卸载 + 清默认 | 失败进入重试任务；UI 显示“删除中”，不谎报成功 |
| 切换默认 | 旧默认置 NULL、新默认置 1（事务） | 冲突重试；保证至多一个默认 |
| 删除自定义角色（V1.5） | 解绑/删除该角色的音色绑定；档案本身是否删除由产品定 | 默认保留档案，仅解绑，避免误删 |
| 删除账号 | 所有档案、MinIO `users/{userId}/voices/`、sidecar 全部对应缓存、活动事件最小审计 | 新增 `VoiceAccountPurgePort`，与 `S3AccountPurgePort`、Redis 清理一起纳入删除矩阵 |
| 备份/日志 | 参考音频不进普通日志；备份保留期与删除策略需产品/法务确认 | 不能承诺“立即从所有备份消失” |

> 现有 `S3AccountPurgePort` 按 `users/{userId}/` 前缀删除；如果参考音频放 MinIO，这个前缀天然覆盖；本地卷则走 `VoiceAccountPurgePort` 的同一套路径规则。sidecar 缓存不在对象存储前缀内，必须单独清理，否则会留下“已删账号还能合成”的残留。

### 3.11 分阶段计划

| 阶段 | 内容 | 出口条件 | 粗略工作量 |
|---|---|---|---|
| P0 POC | 在目标机器跑 Genie；验证基础模型 vs 每音色模型；测相似度、冷/热延迟、内存；验证裸 PCM/WAV、参考格式、语言 | 3 名内部评审对相似度 ≥3/5；热首音 P95 <3 秒；单音色内存 <2.5 GB；明确模型前提 | 2–3 天 |
| V1 | `services/voice-clone` 网关；`user_voice_profiles` + 默认音色；上传/校验/试听/删除；`/voice/synthesize`；通话页接线；降级/熔断；设置卡片；测试 | 上传→就绪→通话发声；失败回退；跨用户 404；账号删除三处清理；开关关闭零调用 | 8–12 人日 |
| V1.5 | 按角色绑定；多参考音频/情绪；流式；聊天朗读统一入口；音色库（授权预置） | 角色切换音色正确；流式首包达标；朗读与通话一致 | 5–8 人日 |
| V2 | 云端复刻 provider；模型导入/微调；分享/市场（如产品需要） | 依产品决策 | 另评估 |

> 工作量不含法务评审、模型授权采购、Python 打包/分发。若 POC 结果是“每音色一个模型”，V1 范围要重写，不能按上表硬做。

### 3.12 验收标准（草案）

| ID | 场景 | 期望 | 验证方式 |
|---|---|---|---|
| AC-VC-1 | 上传 5–10 秒干净中文单人音频 + 正确文本 | 120 秒内 `ready`；试听返回可播放 WAV | 手动 + 集成测试 |
| AC-VC-2 | 设为默认后进入通话 | 回复用克隆音色；口型/电平正常 | 手动 |
| AC-VC-3 | sidecar 停止 | 通话不中断；提示并回退默认语音 | 停进程演练 |
| AC-VC-4 | 用户 A 访问 B 的档案 id | 404，不泄露存在性 | 隔离测试 |
| AC-VC-5 | 删除档案/账号 | DB、MinIO、sidecar 缓存均清理；无残留合成 | 删除矩阵测试 |
| AC-VC-6 | 未勾选授权 | 400 `VOICE_CONSENT_REQUIRED`，不落库 | 接口测试 |
| AC-VC-7 | 20 秒/立体声/mp3/带 BGM 样本 | 超长拒绝；立体声下混；mp3 转码；BGM 给警告 | 参数化测试 |
| AC-VC-8 | 文本含 emoji/Markdown/URL | 不朗读符号；不因清洗失败而报错 | 单测 |
| AC-VC-9 | 并发 3 个合成 | 不崩溃；队列/超时错误可识别；前端降级 | 压测 |
| AC-VC-10 | `VOICE_CLONE_ENABLED=false` | 行为与现状完全一致；零 sidecar 调用 | 开关测试 |
| AC-VC-11 | 文本 500 字 | 分句合成或明确拒绝；不超时卡死 | 边界测试 |
| AC-VC-12 | 指标/日志 | 有 latency/queue/error/load 指标；日志无音频/参考文本 | 日志抽查 |

### 3.13 指标与 SLO（建议）

| 指标 | 目标（P95） | 说明 |
|---|---|---|
| 热合成首音 | <3 秒（20 字中文，4 核 CPU） | 以 POC 实测校准；不含网络 |
| 冷启动首次合成 | <15 秒 | 模型加载 + 参考设置；UI 显示准备中 |
| 上传校验 | <5 秒 | 含 ffmpeg 转码 |
| 合成错误率 | <2% | 不含用户取消 |
| 降级成功率 | 100% | 任何失败都能回退，不静默失声 |
| 单音色内存 | <2.5 GB | 含运行时与 ONNX arena |
| 队列等待 | <2 秒 | 超过则拒绝并降级 |

## 4. 关键问题

### 4.1 技术

| 问题 | 影响 | 对策 |
|---|---|---|
| 零样本能力未验证 | 可能“上传即克隆”根本不成立 | P0 先验证；结果 B 就改产品形态，不硬排期 |
| 每音色模型 | 模型体积/加载/内存随用户增长 | 基础模型优先；模型导入走白名单；LRU + 槽位上限 |
| 模型复用/参考切换 | 独立 `character_name` 可能重复加载同一模型；共用名称则参考音频是全局状态 | POC 测内存与切换耗时；单机一档案一名称，多用户一模型一名称 + 全局锁 + 参考缓存 |
| 裸 PCM vs WAV | 播放杂音/格式错误 | 网关实测并统一封装 44 字节 WAV 头；契约写死采样率/位深/声道 |
| 参考格式限制 | 手机录音 mp3/m4a/webm 不可用 | ffmpeg 转码到 wav；限制时长/大小；失败给可操作提示 |
| CPU 并发 | 合成排队、首音抖动 | 单 worker + 信号量 + 有界队列；限制 ONNX 线程；必要时 GPU |
| 冷启动 | 首次合成 10 秒+ | 创建/设默认/启动预热；冷启动单独统计，不混入稳态 P95 |
| 情绪缺失 | 产品要求“带情绪回应”，克隆音色只有一种语气 | V1 明确不支持情绪；V1.5 多参考音频/情绪路由；不要假装 |
| 语言不匹配 | 参考中文、合成英文效果差 | 语言必填且与模型/音频一致；跨语言给警告 |
| 文本清洗 | Markdown/emoji/URL 被朗读 | 统一清洗器；保留标点；测试覆盖 |
| 流式 | 当前整段合成，首音慢 | V1 整句；V1.5 chunked；沿用 FR-3.3 的流式目标 |

### 4.2 安全与隐私

| 问题 | 影响 | 对策 |
|---|---|---|
| 声纹属于敏感个人信息 | 泄露/滥用风险高 | 最小收集；私有桶；仅本人可读；不训练公共模型；删除可验证 |
| 参考音频上传攻击 | 解压炸弹、畸形文件、ffmpeg 漏洞 | 限制大小/时长；ffprobe 校验；重编码；禁用网络协议；更新 ffmpeg |
| sidecar 暴露 | 无鉴权的模型服务可被滥用 | 只绑内网/回环；`X-Internal-Token`；不发布端口到公网 |
| 路径注入 | 读写任意文件 | 客户端永不传路径；sidecar 自己拼路径；拒绝 `..`/绝对路径/符号链接 |
| 跨用户访问 | 音色串用/隐私泄露 | 所有查询带 `user_id`；跨用户 404；sidecar 只认 core 的 token |
| 日志泄露 | 参考文本/音频进日志 | 结构化日志只记 id/耗时/错误码；禁止 debug 打请求体 |
| DoS | 大量上传/合成拖垮服务 | 每用户档案上限、创建/试听限流、队列上限、熔断 |
| 模型供应链 | 恶意 ONNX/依赖 | 只加载白名单模型；校验和；锁版本；V1 不接受用户模型 |

### 4.3 合规与版权

| 问题 | 影响 | 对策 |
|---|---|---|
| 真人声音授权 | 侵权、诈骗、名誉风险 | 强制授权勾选 + 版本化记录；ToS 明确禁止冒充；投诉/下架通道 |
| 公众人物/他人声音 | 伪造发言、诈骗、舆论风险 | 明确禁止克隆公众人物或未授权他人；发现即停用并留存审计；不做“绕过检测”的功能 |
| 声纹与个人信息保护 | 声纹可识别身份，属于敏感个人信息 | 按最小必要收集；单独授权；目的限定（只做合成）；保存期限；删除/导出；跨境评估（参照《个人信息保护法》） |
| 未成年人 | 法律与伦理风险 | ToS 禁止；发现即停用；必要时年龄门槛 |
| AI 生成标识 | 监管要求 | UI/元数据标注“AI 合成语音”；遵循《人工智能生成合成内容标识办法》等现行要求，法务复核 |
| 参考音频版权 | 音乐/BGM/影视片段侵权 | 引导干声；检测到 BGM 警告；用户承诺权利 |
| 模型权重许可 | Genie/GPT-SoVITS 代码 MIT，但角色模型/素材可能另有条款 | 逐一核查模型卡；默认音色只用自录/已授权；不商用未授权动漫音色 |
| AstrBot AGPL | 直接集成/分发带来 AGPL 义务 | 不内嵌 AstrBot；只借鉴思路；法务确认 |
| 数据跨境 | 云端复刻可能出境 | 本地优先；云端 provider 上线前做合规评估 |
| 删除承诺 | 备份/日志残留 | 明确保留期；删除矩阵覆盖；不承诺“所有备份立即消失” |

> 本节是工程风险提示，不构成法律意见；上线前需法务/合规评审。

### 4.4 产品与体验

| 问题 | 影响 | 对策 |
|---|---|---|
| 用户以为“上传就完美克隆” | 期望落差、差评 | 明确“5–10 秒干声、文本一致、效果因素材而异”；试听前置 |
| 没有默认音色 | 新用户没有可听的声音 | 官方角色配授权默认音色；克隆是增强，不是唯一路径 |
| 失败无感知 | 用户以为克隆生效 | 状态徽标 + 失败 toast + “已回退默认语音” |
| 设置项太多 | 认知负担 | 只暴露 5 个用户参数；高级项走环境变量/部署文档 |
| 与本地 TTS 冲突 | 两套声音 | 统一优先级；设置页说明“克隆优先于本机朗读” |
| 按角色音色 | 与 07 的 P2 冲突 | V1 全局；V1.5 再改 C-7，不在 V1 偷跑 |

### 4.5 工程与运维

| 问题 | 影响 | 对策 |
|---|---|---|
| 新增 Python 服务 | 部署/打包/升级复杂 | Docker compose profile；健康检查；core 启动不依赖 sidecar |
| 模型下载 ~391 MB + 230 MB/音色 | 首次启动慢/磁盘占用 | 预下载/数据卷；启动检查；UI 提示 |
| 版本漂移 | Genie API 变更（如 language 必填） | 锁版本 + 契约测试；网关隔离内部 API |
| ffmpeg 依赖 | 转码必需；不同构建的许可证不同 | 固定版本/构建；优先 LGPL 构建；只处理本地文件，禁用网络协议 |
| Windows 开发环境 | ffmpeg/路径/编码问题 | 文档写明；CI 用 Linux；路径统一 `/` |
| 可观测性 | 出问题无法定位 | 指标 + traceId + 结构化日志；不记录敏感内容 |
| 测试成本 | 真实模型 CI 不可行 | 单测 mock Genie；契约测试用固定 WAV；真实 smoke 手动/夜间 |
| 数据库迁移 | 新表/索引/默认唯一性 | V7 迁移；回滚脚本；并发设默认测试 |
| 账号删除遗漏 | 残留音色 | 新 purge port + 删除矩阵 + 集成测试 |

### 4.6 如果坚持直接集成插件

必须额外做：

1. 部署 AstrBot + 插件 + Genie 三个进程；
2. 为 AstrBot 写一个“我们的客户端 → AstrBot”的桥接（平台适配器/自定义 API），把用户消息灌进去、把语音捞出来；
3. 解决 AstrBot 的鉴权、用户映射、多租户、配额、删除；
4. 接受 AGPL 分发义务与 AstrBot 升级耦合；
5. 仍然要解决上传、路径、单音色、无队列、无熔断。

结论：这比自研网关更重，且把产品核心链路绑在别人的 bot 框架上；**不建议**。

## 5. 风险登记

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 零样本效果不达标 | 中高 | 高（方案形态变化） | POC 先行；备选云端/模型导入 |
| 参考音频质量差导致效果差 | 高 | 中 | 校验 + 引导 + 试听 + 警告 |
| CPU 延迟不达标 | 中 | 高 | 预热/队列/流式/GPU/云端 |
| 合规不允许开放上传 | 中 | 高 | 先做授权音色库；用户上传灰度；法务前置 |
| 模型/素材授权不清 | 中 | 高 | 只发自录/已授权；模型卡核查 |
| 账号删除残留 | 中 | 高 | 三处清理 + 删除矩阵测试 |
| 两套 TTS 行为不一致 | 高 | 中 | 统一 `/voice/synthesize` + 明确优先级 |
| sidecar 运维复杂 | 中 | 中 | 容器化 + 健康检查 + 降级 |
| 功能蔓延到训练平台 | 中 | 高 | 明确非目标；V1 只做推理 |

## 6. 待确认项

| 编号 | 问题 | 默认建议 |
|---|---|---|
| VC-1 | 基础模型能否克隆任意音色？ | POC 决定；不通过则改“模型导入/云端” |
| VC-2 | V1 全局音色还是按角色？ | 全局默认；按角色 V1.5，尊重 07 C-7 |
| VC-3 | 本地 Genie 还是云端复刻？ | 本地优先；云端同 seam 作为 V2/备选 |
| VC-4 | 参考音频存哪里？ | MinIO 私有桶 + sidecar 缓存；客户端不碰路径 |
| VC-5 | 参考文本自动识别还是手填？ | 自动 ASR 填充 + 必须人工确认 |
| VC-6 | 是否支持情绪？ | V1 不支持；V1.5 多参考/路由 |
| VC-7 | 默认音色从哪来？ | 官方角色配授权音色；不默认用动漫模型 |
| VC-8 | 档案上限/时长/大小？ | 3 个 / 15 秒 / 10 MB |
| VC-9 | 功能开关默认？ | 关闭；POC + 合规通过后灰度 |
| VC-10 | 删除保留期？ | 档案删除立即；备份保留期待法务/产品定 |

## 7. 评审产物与文档同步

按 07 的做法：**评审通过后再改契约正文**，避免“文档先行于决策”。

| 产物 | 内容 |
|---|---|
| ADR（编号按当时顺延） | “声音克隆采用 Genie-TTS 引擎 + 自研业务层，不集成 AstrBot 插件”；记录备选与后果 |
| PRD | 把“声音克隆”从非目标移出；新增 FR-3.6（P1，实验，默认关闭）与页面章节；补验收 |
| 契约 | 新增 `user_voice_profiles` 表、§3.5 声音克隆 API、删除矩阵、敏感数据等级、限额；版本号递增 |
| 05 接入手册 | sidecar 部署、模型准备、协议、WAV/PCM 说明、排查 |
| 07 角色设计 | 更新 C-7；把“每角色独立音色”从 P2 调整为 V1.5/P2 的明确结论 |
| 04 验收清单 | 增加 AC-VC 行与复现步骤 |
| 03 开发规范 | 登记 `services/voice-clone` 新服务目录、Python 依赖与许可证 |
| README | 文档索引新增本篇 |

## 8. 参考

- [Genie-TTS（GPT-SoVITS ONNX 推理引擎，MIT）](https://github.com/High-Logic/Genie-TTS)
- [Genie-TTS API Server Tutorial](https://github.com/High-Logic/Genie-TTS/blob/master/Tutorial/English/API%20Server%20Tutorial.py)
- [Genie-TTS Server.py（当前接口与格式约束）](https://github.com/High-Logic/Genie-TTS/blob/master/src/genie_tts/Server.py)
- [参考插件 victical/astrbot_plugin_genie-tts](https://github.com/victical/astrbot_plugin_genie-tts)
- [参考插件 main.py](https://github.com/victical/astrbot_plugin_genie-tts/blob/main/main.py)
- [参考插件配置 schema](https://github.com/victical/astrbot_plugin_genie-tts/blob/main/_conf_schema.json)
- [Gateway 形态的社区实现 Qiscard/astrbot_plugin_genie-tts](https://github.com/Qiscard/astrbot_plugin_genie-tts)
- [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS)
- [AstrBot（AGPL-3.0）](https://github.com/AstrBotDevs/AstrBot)
- [CosyVoice（云端/自托管备选）](https://github.com/FunAudioLLM/CosyVoice)
