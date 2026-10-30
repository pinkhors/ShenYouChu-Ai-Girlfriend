# 13 双云 TTS 方案评估：CosyVoice/Qwen + Breeze

> 评估已完成，最终取舍见 [14 语音方案定稿](./14-voice-final-design.md)。

- 状态：评估完成，决策见 14
- 版本：v0.1（2026-10-29）
- 关联：[12 Breeze TTS 2 重构方案](./12-breeze-tts-2-redesign.md)、[10 声音克隆（历史）](./10-voice-cloning-genie-tts.md)、[11 对话与唱歌双模式（历史）](./11-voice-clone-dialogue-and-singing.md)、[产品需求文档](./01-product-requirements.md)、[技术实现路线](./02-technical-roadmap.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：评估“语音/视频通信用 CosyVoice-v3-Flash 或 qwen-audio-3.0-tts-flash，唱歌/表演用 Breeze TTS 2，前后端都通过 API 调用”的可行性、成本、易用性与演进路径；不含代码改动。

## 0. 结论

**可行，但不是“成本最低、使用最方便”的方案；它更像一个“按场景选型”的成本/效果折中。**

- **技术可行**：三家都是 HTTP/流式/实时 API，后端统一封装即可；前端不直接拿厂商 Key。
- **成本不是最低**：中文语音 CosyVoice/Qwen 约 ¥100/百万字符；Breeze 约 $30/百万加权字符，中文每字算 2 units，折合约 $60/百万中文字（约 ¥430），是前者的 4 倍左右。Breeze 只适合“唱一句”这类短内容，不适合承担全部对话。
- **使用不是最方便**：两家厂商 = 两套 Key、两套音色、两套配额、两套错误码、两套音频格式；用户会听到“通话一个音色、唱歌另一个音色”。前端直连厂商还会暴露 Key、无法限额、无法降级。
- **最大问题**：这张表把“TTS 模型”当成了“语音/视频通话方案”。通话还需要 ASR、LLM、RTC/回声消除、VAD、打断、头像/口型；视频通话更不是 TTS 能解决的。Breeze 也不是 SVS，`[唱歌]` 只能做唱腔短句，不能做完整歌曲。

**推荐重构：**

1. **前端只调自己的后端**，不直接调 CosyVoice/Qwen/Breeze；后端做统一 `SpeechService` 和 provider 路由。
2. **对话/通话用 CosyVoice-v3-Flash**（有声音复刻、流式、中文便宜）；qwen-audio-3.0-tts-flash 作为 A/B 备选（指令/标签更灵活，但声音复刻支持需确认）。
3. **Breeze 只用于“唱一句/哼一段/表演短句”和多语言**，不承担全量对话。
4. **同一角色音色要统一**：用同一段参考音频分别在 CosyVoice 和 Breeze 克隆，做 ABX 相似度测试；如果差异不可接受，改为单一厂商（Breeze 全包或 CosyVoice 全包），或加 SVC 做音色对齐。
5. **完整歌曲另立 SVC/SVS 项目**；视频通话另立 RTC/口型项目。不要把它们塞进 TTS 选型表。

## 1. 方案拆解与可行性

### 1.1 “前后端都通过 API 调用”有两种含义

| 解释 | 形态 | 可行性 | 判断 |
|---|---|---|---|
| A. 前端直接调厂商 API，后端也调厂商 API | Electron/React → api.breeze.blue / DashScope；core 也调 | 技术上可跑 | **不建议**：Key 暴露、CORS、无法限额、无法统一降级、重复计费 |
| B. 前端只调后端，后端调厂商 API | Electron → core `/speech` → CosyVoice/Breeze | 标准做法 | **推荐**；前端只负责播放/录音/UI |

> 下面默认讨论 B；A 只在“实时通话临时 token”这一种场景下可局部使用（例如 Breeze 的 `client_secret`），且 token 必须由后端签发。

### 1.2 场景与模型匹配

| 场景 | 推荐模型 | 能做什么 | 不能做什么 |
|---|---|---|---|
| 语音通话 | CosyVoice-v3-Flash（首选）/ qwen-audio-3.0-tts-flash（备选） | 低延迟 TTS、流式、情绪/语速；CosyVoice 支持 5–20 秒声音复刻 | 不负责 ASR/LLM/RTC；不负责视频/口型 |
| 视频通话 | 同上 + 独立 RTC/头像/口型 | 只提供“声音” | TTS 不提供视频、唇形、表情、回声消除 |
| 唱歌/表演 | Breeze TTS 2 | `[唱歌]`/`[哼歌]` 唱腔短句、情绪/风格、声音克隆、51 语言 | 不做音符/旋律/伴奏同步；不做完整歌曲 |
| 完整歌曲 | Breeze 不够 | — | 需要 SVC/SVS（Seed-VC/RVC/DiffSinger 等） |
| 语音消息 | CosyVoice-v3-Flash 或 Breeze | 文本→音频，存消息 | 长文本要分段；按字符计费 |

### 1.3 关键能力核对

| 能力 | CosyVoice-v3-Flash | qwen-audio-3.0-tts-flash | Breeze TTS 2 |
|---|---|---|---|
| 声音复刻 | ✅ 5–20 秒参考音频，免费创建音色 | ⚠️ 模型页未列复刻；声音复刻文档列的是“千问3-TTS-声音复刻”，需确认是否适用于该模型 | ✅ 3 秒–5 MB，自动转写/截取 30 秒，保存消耗 slot |
| 流式 | ✅ 实时流式 | ✅ 面向实时交互 | ✅ HTTP 流式 + 实时 WebSocket |
| 情绪/指令 | ✅ instruction/SSML/方言 | ✅ free-style 指令、细粒度标签、方言/小语种 | ✅ instructions、guidance_scale、音频标签 |
| 语言 | 约 16 种 | 更多小语种/方言（以文档为准） | 51 种 |
| 计费 | ¥1/万字符（北京） | ¥1/万字符（北京） | $30/百万加权字符；CJK 每字 2 units |
| 限流 | 180 RPM | 180 RPM | 按套餐并发（Free 2 / Starter 4 / Creator 8 / Pro 16） |
| 商用 | 阿里云条款 | 阿里云条款 | 付费托管可商用；自托管非商用 |

> 价格与能力以 2026-10-29 公开文档为准，后续可能调整；上线前重新核对。

## 2. 成本分析：是不是最低？

### 2.1 单价对比（粗算）

| 厂商/模型 | 公开单价 | 折合每百万中文字 | 备注 |
|---|---|---|---|
| CosyVoice-v3-Flash | ¥1 / 万字符 | **约 ¥100** | 北京地域；声音复刻免费 |
| qwen-audio-3.0-tts-flash | ¥1 / 万字符 | **约 ¥100** | 北京地域；复刻支持需确认 |
| Breeze TTS 2 | $30 / 百万加权字符；中文每字 2 units | **约 $60 ≈ ¥430** | 国际托管（Region 以合同为准）；付费套餐才可商用 |
| 本地 TTS（后期） | 电费 + 硬件折旧 | 高用量下更低 | 需 GPU/运维；模型许可要核查 |

结论：

- **中文对话用 Breeze 全包，成本明显更高**（约 4 倍）。Breeze 适合“短唱句/多语言/特殊音色”，不适合承担每天大量对话。
- **CosyVoice/Qwen 做对话，Breeze 做唱句**，在中文场景下是成本更合理的组合；但两家厂商的固定成本、运维、音色一致性要另算。
- **“前后端都调 API”可能产生双份合成费用**：如果前端预览一次、后端发送又合成一次，同一句话付两次钱。必须只合成一次，或共享缓存/音频资产。

### 2.2 场景化成本示例

假设：1,000 个活跃用户；每人每天 20 条语音回复，每条 50 个中文字；每月 30 天。

- 月字符量：1,000 × 20 × 50 × 30 = **30,000,000 中文字**。
- CosyVoice：30 × ¥100 = **¥3,000/月**。
- Breeze：30 × ¥430 ≈ **¥12,900/月**（按 $60/百万中文字，汇率 7.2 粗算）。
- 若再加“每人每天 1 条唱句、每条 50 字”：+1.5M 中文字/月；Breeze 约 +¥645/月；这部分用 Breeze 合理。

如果月量只有 1M 中文字：

- CosyVoice 约 ¥100；Breeze 约 ¥430；绝对差价约 ¥330/月，量小时可接受，**Breeze 全包可以换来单一音色/单一供应商**，这时“贵一点但简单”可能更划算。
- 量大后，差价会变成主要成本；再考虑本地/混合。

### 2.3 隐藏成本

| 成本项 | 说明 |
|---|---|
| 两家厂商的账号/合同/发票 | 采购、法务、对账复杂度翻倍 |
| 两套音色克隆 | CosyVoice 复刻免费但需管理；Breeze 保存 voice 消耗 slot；同一用户可能要克隆两次 |
| Breeze 套餐 | 50/300/1000 个 voice slot；用户量大时要升档；并发也受限 |
| 重试/重复计费 | 前端+后端都调、超时重试、失败重放都会增加费用 |
| 音频存储/流量 | 语音消息、唱句、历史记录；对象存储与下行流量 |
| 运维/监控 | 两套限流、两套错误码、两套 SDK 升级 |
| 数据合规 | 两家都存声音/文本；删除、出境、授权分别处理 |

### 2.4 结论

- **低量、追求快速上线**：后端统一接 CosyVoice（对话）+ Breeze（唱句）是合理的；总成本不一定比 Breeze 全包低很多，但对话成本更低。
- **中高量、中文为主**：CosyVoice 做对话明显更便宜；Breeze 只做唱句。
- **高量、长期**：本地 TTS/混合部署可能更低，但要算 GPU、运维、模型许可；云端保留峰值/多语言/唱句。
- **“成本最低”不能只看单价**：还要看音色一致性、失败率、重试、人工客服、合规；两家厂商的隐性成本不低。

## 3. 易用性分析：是不是最方便？

| 维度 | 两家厂商 + 前后端都调 | 后端统一 + 场景路由 |
|---|---|---|
| 前端开发 | 两套 SDK/鉴权/错误/音频格式；Key 风险 | 一套 `/speech` 契约；前端只播放 |
| 后端开发 | 两套适配器、两套重试/限流 | 一个 `SpeechProvider` 接口 + 两个实现 |
| 用户配置 | 通话音色、唱歌音色两套；容易混淆 | 一个“角色音色”，内部路由 |
| 音色一致性 | 通话/唱歌可能像两个人 | 可统一音色策略 |
| 失败降级 | 两套失败路径；前端要判断 | 后端统一回退/提示 |
| 计费/配额 | 两家账单；前端调用难限额 | 后端统一计量/配额 |
| 运维 | 两套监控/告警 | 一套入口，多 provider 指标 |
| 供应商切换 | 前端也要改 | 只改后端 provider |

结论：**“使用最方便”的不是两家都调，而是“前端只调后端、后端按场景路由”**。两家厂商本身可以保留，但必须被一个统一契约包住。

## 4. 明显的问题

1. **把 TTS 当成完整通话方案**：表里“语音/视频通话”只列了 TTS；实际还需要 ASR、LLM、RTC、VAD、回声消除、打断、字幕、头像/口型。TTS 只是其中一环。
2. **视频通话没有着落**：CosyVoice/Qwen/Breeze 都不生成视频；如果“视频”指数字人/立绘口型，需要单独的 lip-sync/viseme/RTC 方案。
3. **Breeze 不是 SVS**：`[唱歌]` 是 vocal delivery 标签，不能指定旋律/音高/伴奏；完整歌曲做不到。表里“唱歌/表演”容易让产品/用户误解。
4. **两家音色不一致**：同一角色在通话用 CosyVoice 克隆、唱歌用 Breeze 克隆，音色/发音习惯可能明显不同；用户会听出“换了个人”。
5. **qwen-audio-3.0-tts-flash 的复刻能力不确定**：模型页没有列声音复刻；声音复刻文档列的是“千问3-TTS-声音复刻”。如果它不能复刻，角色音色只能靠 CosyVoice 或 Breeze。
6. **前端直连厂商 API**：Key 暴露、CORS、盗刷、无法按用户限额、无法统一降级；Electron 也不能保证密钥安全。
7. **重复计费**：前端预览 + 后端发送，两次合成同一句；必须做“一次合成、多处复用”。
8. **成本被低估**：Breeze 中文单价约为 CosyVoice 的 4 倍；两家账号/套餐/slot/并发/运维都是额外成本。
9. **数据合规**：Breeze 为国际托管服务，语音/文本可能出境（以合同/Region 为准）；CosyVoice/Qwen 国内节点合规更简单。两家都要处理声音授权、删除、留存。
10. **格式/延迟/限流差异**：CosyVoice 支持 8k–48k、mp3/pcm/wav/opus；Breeze 24k 单声道；两家流式协议不同；前端要兼容。
11. **没有统一可观测性**：两套 requestId、错误码、用量；出问题难定位、难对账。
12. **供应商锁定/版本漂移**：模型名、价格、限流、API 字段都可能变；两家都要锁版本/契约测试。

## 5. 更优替代方案

### 5.1 推荐架构：后端统一，按场景路由

```text
Electron/React
   │ 一套 /api/v1/speech/* 契约
Spring Boot core
   ├─ SpeechService（场景路由、配额、缓存、降级）
   ├─ VoiceProfileService（一个角色音色，多 provider 映射）
   ├─ Provider: CosyVoiceProvider（对话/通话）
   ├─ Provider: BreezeProvider（唱句/多语言）
   ├─ Provider: QwenProvider（A/B 备选）
   └─ Provider: LocalProvider（后期）
        │
   CosyVoice / Breeze / Qwen / Local
```

前端只知道“文本、角色、场景、音色”，不知道厂商；后端决定用谁。

### 5.2 场景路由

| 场景 | Provider | 理由 |
|---|---|---|
| 聊天语音消息 | CosyVoice-v3-Flash | 中文便宜、可复刻、流式 |
| 语音通话 | CosyVoice-v3-Flash | 低延迟流式、可复刻 |
| 唱一句/哼一段 | Breeze TTS 2 | `[唱歌]`/`[哼歌]`、情绪/风格、51 语言 |
| 多语言/小语种 | Breeze | 51 种语言 |
| A/B 情绪表达 | qwen-audio-3.0-tts-flash | free-style 指令/标签；先验证复刻 |
| 离线/隐私模式 | LocalProvider（后期） | 本地推理、无出境 |
| 完整歌曲 | SVC/SVS（另立项） | Breeze 不够 |

### 5.3 音色一致性策略（最关键）

1. **同一参考音频**：同一段 10–20 秒干声，分别给 CosyVoice 复刻和 Breeze 克隆。
2. **ABX/相似度测试**：让 5–10 人听“通话一句/唱句一句”，判断是否像同一人；记录 MOS/偏好。
3. **可接受**：两家都可用，按场景路由。
4. **不可接受**：
   - 方案 A：Breeze 全包（对话+唱句），音色统一，成本高；
   - 方案 B：CosyVoice 全包（只说话，不唱歌），唱歌另找 SVC；
   - 方案 C：加 SVC 做“音色对齐”（复杂，V2）。
5. **不要**默认“同一段音频克隆出来就一样”；不同厂商的声学模型/发音风格差异很大。

### 5.4 成本优化

- 同一句只合成一次；消息音频复用；预览用低码率/短文本。
- 缓存固定问候/系统提示；按 `voice + text + instructions + format` 哈希。
- 对话用 CosyVoice；唱句用 Breeze；不要反过来。
- Breeze 只做短句（1–4 行），不要用它读长文。
- 配额/限流/预算告警；Breeze 套餐按 slot/并发选，不盲目升档。
- 高量后再评估本地 TTS；不要一开始为了“省单价”上 GPU 运维。

### 5.5 视频通话要单独设计

- TTS 只提供声音；视频通话还需要：
  - RTC/媒体传输、回声消除、VAD、打断；
  - ASR、LLM、字幕；
  - 头像/立绘渲染、口型/表情同步（viseme/音素时间戳）。
- CosyVoice 支持字级时间戳（部分音色/流式），可用于口型；Breeze 有 word timestamps 接口；但视频链路仍需单独 POC。
- 不要用“TTS 模型选型”代替“视频通话方案”。

## 6. 后期增加本地功能的可行路径

### 6.1 目标

让用户可以选择“云端音色/本地音色”，或在离线/隐私模式下用本地 TTS；不重写前端。

### 6.2 路径

| 阶段 | 做法 | 用户价值 |
|---|---|---|
| L0（现在） | 后端 `SpeechProvider` 接口；云 provider 可插拔 | 为本地化留缝 |
| L1 | 本地 TTS sidecar（Genie/GPT-SoVITS/CosyVoice 自托管），只服务“对话/语音消息” | 离线、隐私、无按字符费用 |
| L2 | 本地音色克隆/音色包下载；本地 provider 注册到同一 `VoiceProfile` | 用户可带自己的音色 |
| L3 | 本地 ASR/LLM（可选）；云端只做唱句/多语言/峰值 | 完整体验离线 |
| L4 | 桌面端打包本地模型/GPU 检测/自动降级 | 一键本地模式 |

### 6.3 关键设计

- **一个 `voice_profile`，多个 provider 映射**：`cosyvoice_voice_id`、`breeze_voice_id`、`local_model_key`；不要把一个外部 ID 当主键。
- **路由策略**：场景（对话/唱句）、网络（在线/离线）、隐私（本地优先）、成本（配额）、质量（A/B）。
- **降级**：本地不可用→云；云不可用→本地/文字；唱句无本地→提示“离线不支持唱句”。
- **数据迁移**：新增 provider 时，用同一参考音频重新克隆/训练；保留原 provider 直到新 provider 验证通过。
- **删除**：删除音色时，逐个 provider 删除；本地模型/缓存也要清。
- **许可证**：本地模型（Genie/GPT-SoVITS/CosyVoice 自托管/Breeze 自托管）许可不同；Breeze 自托管权重非商用，不能作为“本地商用”路径。
- **打包**：Electron 不建议内置 Python/模型；优先“后端本地 sidecar”或“可选本地包下载”，避免安装包过大。

## 7. 关键设计决策与需要确认的取舍

| 决策 | 推荐 | 备选 | 代价 |
|---|---|---|---|
| D1 前端是否直连厂商 | **否；前端只调后端** | 实时场景用后端签发的短时 token | 后端多一跳；但安全/限额/降级可控 |
| D2 一家还是两家 | **对话 CosyVoice + 唱句 Breeze** | Breeze 全包（音色统一、成本高） | 两家一致性与运维成本 |
| D3 对话模型 | CosyVoice-v3-Flash（有复刻、便宜、流式） | qwen-audio-3.0-tts-flash（指令/标签更灵活，复刻待确认） | 需 POC 对比音质/延迟/复刻 |
| D4 Breeze 范围 | **只做唱句/哼唱/多语言** | 全量对话 | 成本约 4 倍；音色统一但贵 |
| D5 视频通话 | **另立 RTC/口型项目** | 先做语音通话 | 工期/成本；不要混在 TTS 表里 |
| D6 完整歌曲 | **V2 另接 SVC/SVS** | 不做 | Breeze 做不到 |
| D7 本地化 | **先 provider seam，后本地 sidecar** | 现在不上本地 | 长期看本地可省单价，但 GPU/运维成本高 |
| D8 计费 | 产品统一账号 + 用户配额 | 用户自带 Key | 成本/体验/Key 安全 |

### 需要你确认

1. **“前后端都通过 API”具体指哪种？** 前端直连厂商，还是前端→后端→厂商？我建议后者。
2. **优先级排序**：成本最低 / 音色一致 / 延迟最低 / 上线最快，哪个第一？
3. **对话模型选 CosyVoice 还是 Qwen？** 如果角色音色必须复刻，先确认 qwen-audio-3.0-tts-flash 是否支持；否则默认 CosyVoice。
4. **Breeze 是否只做唱句？** 如果让它全包对话，成本约 4 倍；如果只做唱句，音色一致性要 POC。
5. **“视频通话”是什么形态？** 实时视频/数字人/立绘口型？TTS 只能提供声音，视频链路要另算。
6. **完整歌曲是否近期必须？** 必须则 Breeze-only 不成立，需要 SVC/SVS。
7. **本地功能什么时候要？** 离线/隐私/省成本三种目标，优先级不同；本地 Breeze 权重不可商用，不能作为商用本地方案。
8. **两家厂商的声音授权/删除/出境**是否可接受？需要产品/法务确认。

## 8. POC 清单（上线前必须做）

| 项 | 方法 | 通过标准 |
|---|---|---|
| 音色一致性 | 同一 10–20 秒样本，CosyVoice 复刻 + Breeze 克隆；ABX 5 人 | 多数人认为“同一人”；否则改单厂商/SVC |
| 对话延迟 | CosyVoice 流式首音；Qwen 流式首音；Breeze 流式首音 | 满足产品首音目标（建议 P95 <2s） |
| 唱句质量 | Breeze `[唱歌]`/`[哼歌]` 3 种风格 × 3 段歌词 | 有唱腔感、不破音；明确“非完整歌曲” |
| 复刻可用性 | qwen-audio-3.0-tts-flash 是否支持复刻/自定义音色 | 支持则可作为备选；不支持则仅系统音色 |
| 成本 | 1M 中文字/月的对话 + 唱句 | 月度成本可接受；两家账单可对账 |
| 限流/失败 | 429/503/超时/断流 | 有降级、不重复计费 |
| 合规 | 声音授权、AI 标识、数据出境/留存 | 法务通过 |

## 9. 文档同步

评审通过后：

- 12 标记为“Breeze-only 基线；混合方案见 13”；
- PRD 明确“语音消息/语音通话/唱句/视频通话”的范围与优先级；
- 契约新增 `SpeechProvider`、`voice_profiles` 多 provider 映射、`audio_messages`、`singing_clips`、用量；
- 05 增加 CosyVoice/Qwen/Breeze 接入、流式/实时、计费、排查；
- 04 增加音色一致性/唱句/降级验收；
- 03 登记 provider/音频存储/计量模块；
- README 索引新增本篇。

## 10. 参考

- [CosyVoice-v3-Flash 模型信息（¥1/万字符、5–20 秒复刻、流式）](https://help.aliyun.com/zh/model-studio/cosyvoice-v3-flash)
- [qwen-audio-3.0-tts-flash 模型信息（¥1/万字符、实时交互、指令/标签）](https://help.aliyun.com/zh/model-studio/qwen-audio-3-0-tts-flash)
- [阿里云声音复刻/声音设计（支持模型列表）](https://help.aliyun.com/zh/model-studio/voice-cloning-and-voice-design)
- [CosyVoice HTTP API（流式/格式/时间戳/AIGC 标识）](https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api)
- [Breeze TTS 2 产品页](https://breezeblue.ai/zh/breeze-tts-2)
- [Breeze TTS 调用与计费](https://docs.breezeblue.ai/guides/text-to-speech)
- [Breeze 声音克隆](https://docs.breezeblue.ai/guides/voice-clone)
- [Breeze 音频标签（`[唱歌]`/`[哼歌]`）](https://docs.breezeblue.ai/guides/audio-tags)
- [Breeze 实时 TTS](https://docs.breezeblue.ai/guides/realtime-text-to-speech)
- [12 Breeze TTS 2 重构方案](./12-breeze-tts-2-redesign.md)
