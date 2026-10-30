# 17 语音模块化架构：多模型接入与扩展点设计

- 状态：草案，待评审（评审通过前不改契约正文、不写实现）
- 版本：v0.1（2026-10-30）
- 关联：[15 BYOK 落地决策](./15-byok-launch-decisions.md)、[16 语音生成工作台](./16-voice-generation-mode-ui.md)、[14 语音方案定稿](./14-voice-final-design.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)
- 术语：遵循 [CONTEXT.md](../CONTEXT.md)
- 范围：模块划分、模型接入扩展点、接口约定、当前方案的扩展风险与更优设计；不含代码改动。

## 0. 结论

**可以模块化，而且现在就应该做；但不要做成“大而全的插件平台”，而是“端口/适配器 + 能力注册表 + 配置驱动的 UI”。**

推荐目标：

```text
前端（通用工作台）
  └─ 只依赖后端返回的 ProviderDescriptor / Capability / CredentialSchema
后端（领域 + 端口）
  ├─ VoiceGenerationService（说话/唱句/批量）
  ├─ VoiceProfileService（一个音色，多 provider 绑定）
  ├─ ProviderRegistry（注册、路由、健康、限流）
  ├─ ProviderPolicy（产品策略：谁能做什么、默认谁、开关）
  └─ TtsProvider 端口
       ├─ CosyVoiceAdapter
       ├─ BreezeAdapter
       └─ 未来 Local/其他云适配器
```

当前 15/16 的方案是“两个 provider 的定制实现”：能跑，但扩展新模型会牵动前端卡片、模式矩阵、数据库列、接口枚举和错误处理。要支持“后期方便接新模型”，需要把 **provider 差异** 收敛到适配器和描述符里，把 **产品策略** 留在 policy 层，把 **UI** 变成配置驱动。

## 1. 当前方案的模块化程度

| 维度 | 当前 15/16 设计 | 模块化评价 | 扩展新模型的影响 |
|---|---|---|---|
| 前端模型卡 | 两张固定卡，字段写死（Workspace/Region vs Key） | 低 | 要改 TSX、表单校验、布局 |
| 生成模式 | 三种模式，类型与 provider 绑定 | 中 | 新模式/新 provider 要改模式矩阵 |
| 后端接口 | `/speak`、`/sing`、`/generate` | 中低 | 新能力（hum/rap/对话）可能要新端点或分支 |
| Provider 适配 | CosyVoiceClient / BreezeClient | 中 | 新 provider 要改 service 分支 |
| 凭据 | 固定 provider 枚举 + 固定字段 | 低 | 新 provider 要加列/迁移/校验分支 |
| 音色档案 | `cosyvoice_voice_id`、`breeze_voice_id` 固定列 | 低 | 新 provider 要加列/迁移/回填 |
| 能力矩阵 | 代码/文档里写死 CosyVoice=说话、Breeze=唱 | 低 | 新 provider 支持多能力时无法表达 |
| 克隆流程 | 两家流程写死 | 中低 | 新 provider 的 clone 流程要加分支 |
| 音频格式 | 各 provider 自行处理 | 低 | 前端/播放器要适配更多格式 |
| 错误/计费 | 各 provider 分别映射 | 中低 | 新错误码/计费方式要扩散 |
| 开关 | Breeze 专用 `sing.enabled` | 低 | 新 provider 要再加开关 |
| 测试 | 按 provider 手写 | 低 | 无统一契约测试，回归风险高 |

**结论**：当前是“可维护的两家定制”，不是“可扩展的多模型架构”。在只接两家时可以接受；一旦要接第三家（本地 TTS、其他云、SVS、语音设计），会开始出现分支和迁移成本。

## 2. 目标模块划分

### 2.1 后端分层

| 层 | 模块 | 职责 | 不做什么 |
|---|---|---|---|
| 接口层 | `VoiceController` | 鉴权、参数校验、调用应用服务、错误映射 | 不判断 CosyVoice/Breeze 细节 |
| 应用层 | `VoiceGenerationService` | 说话/唱句/批量生成、任务编排、部分成功 | 不拼厂商 HTTP |
| 应用层 | `VoiceProfileService` | 音色档案、provider 绑定、就绪状态 | 不存厂商密钥明文 |
| 应用层 | `CredentialService` | 凭据加密、校验、轮换、删除 | 不渲染 UI |
| 领域层 | `ProviderRegistry` | 注册 provider、按能力路由、健康/熔断 | 不做产品策略 |
| 领域层 | `ProviderPolicy` | 默认 provider、允许组合、开关、配额 | 不做厂商协议 |
| 领域层 | `VoiceBinding` / `GenerationJob` | 通用领域对象 | 不绑定具体 provider |
| 适配器层 | `CosyVoiceAdapter`、`BreezeAdapter`、`LocalAdapter` | 厂商协议、克隆、流式/异步、错误翻译 | 不做产品策略 |
| 基础设施 | `AudioPipeline`、`ObjectStore`、`UsageLedger` | 音频规范化、存储、计量 | 不感知业务模式 |

### 2.2 前端分层

| 层 | 模块 | 职责 |
|---|---|---|
| 页面 | `VoiceWorkbench` | 模式切换、卡片布局、生成/取消/结果 |
| 通用组件 | `ProviderCard` | 根据 descriptor + credentialSchema 渲染配置 |
| 通用组件 | `SegmentEditor` | 根据 capability 渲染文本/音色/参数 |
| 通用组件 | `GenerationResult` | 播放、重试、发送、导出 |
| 状态 | `useVoiceProviders` | 拉取 provider 描述/状态/开关 |
| 状态 | `useGenerationDraft` | 按模式/模型/段落保存草稿 |
| 适配 | `VoiceApi` | 只调用后端 `/ai-girl/voice/*` |

前端**不出现** `if (provider === 'breeze')` 这样的业务分支；provider 差异来自 descriptor/schema。

### 2.3 Provider 适配器层

每个 provider 一个包/模块：

```text
provider/cosyvoice/
  CosyVoiceAdapter
  CosyVoiceDescriptor
  CosyVoiceCredentialSchema
  CosyVoiceCloneStrategy
  CosyVoiceErrorMapper
provider/breeze/
  ...
provider/local/
  ...
```

适配器只做“协议翻译 + 能力实现”；注册到 `ProviderRegistry`。

## 3. 扩展点与接口约定

### 3.1 ProviderDescriptor（能力描述）

每个 provider 必须暴露一份可序列化的描述，供后端路由和前端渲染：

```text
ProviderDescriptor {
  id: string                  // "cosyvoice", "breeze", "local-genie"
  displayName: string
  version: string
  capabilities: Set<Capability> // SPEAK, SING, HUM, STREAM, REALTIME, CLONE, ASYNC
  credentialSchema: FieldSchema[]
  voiceClone: CloneCapability   // NONE / PREVIEW_SAVE / CREATE_POLL / IMPORT
  languages: string[]
  outputFormats: string[]
  maxTextChars: number
  supportsStreaming: boolean
  supportsAsync: boolean
  supportsRealtime: boolean
  supportsVoiceClone: boolean
  priceHint: PriceHint          // 仅展示/估算，不参与计费硬编码
  limits: ProviderLimits        // 并发、RPM、slot 等
  enabled: boolean              // 后台开关（替代 Breeze 专用开关）
}
```

- `Capability` 用枚举/位标志，不用“provider 类型”枚举。
- `enabled` 与 `capabilities` 是通用机制；Breeze 的“唱句开关”变成 `breeze.capabilities` 的运行时开关，不再写死。
- 前端根据 `credentialSchema` 动态渲染卡片；根据 `capabilities` 过滤模式/类型。

### 3.2 TtsProvider 端口

建议拆成“核心 + 可选能力接口”，避免一个巨型接口：

```text
interface TtsProvider {
  ProviderDescriptor descriptor()
  CredentialValidation validate(CredentialInput input)
  SynthesisResult synthesize(SynthesisCommand cmd, ProviderCredential cred)
  Health health()
}

interface StreamingTtsProvider extends TtsProvider {
  StreamingSession openStream(StreamCommand cmd, ProviderCredential cred)
}

interface AsyncTtsProvider extends TtsProvider {
  AsyncHandle submitAsync(AsyncCommand cmd, ProviderCredential cred)
  AsyncStatus pollAsync(String providerJobId, ProviderCredential cred)
}

interface VoiceCloneProvider extends TtsProvider {
  CloneSession createClone(CloneCommand cmd, ProviderCredential cred)
  CloneStatus pollClone(String cloneId, ProviderCredential cred)
  void deleteVoice(String providerVoiceId, ProviderCredential cred)
  List<ProviderVoice> listVoices(ProviderCredential cred)
}
```

说明：

- `supportsStreaming/Async/Clone` 来自 descriptor；`ProviderRegistry` 只在能力存在时调用对应接口。
- 不要让所有 provider 实现所有方法；CosyVoice 有 streaming+clone，Breeze 有 async+clone，Local 可能只有 sync。
- `SynthesisCommand` 用通用字段 + `Map<String,Object> params` 承载 provider 特有参数（如 `guidance_scale`、`instruction`）；参数校验由 adapter 做。
- 返回值统一为 canonical audio（见 3.5），provider 原始格式在 adapter 内转换或标记。

### 3.3 凭据 schema（BYOK 扩展点）

不要为每个 provider 加数据库列。用“通用密文 + 描述符 schema”：

```text
FieldSchema {
  key: string
  label: string
  type: TEXT | PASSWORD | SELECT | REGION
  required: boolean
  secret: boolean
  placeholder?: string
  options?: {label,value}[]
  help?: string
}
```

- 前端根据 schema 渲染表单；CosyVoice 的 Workspace/Region、Breeze 的 Key、未来 Local 的 endpoint/model 都由 schema 描述。
- 后端把非 secret 字段存 JSON，secret 字段加密存 `encrypted_secret`；不新增 provider 专用列。
- 校验由 adapter 的 `validate` 实现；错误统一映射。

### 3.4 音色绑定（一个音色，多 provider）

不要继续加 `cosyvoice_voice_id`、`breeze_voice_id` 列。改为：

```text
voice_profiles         // 逻辑音色：用户、名称、参考音频、授权
voice_provider_bindings
  id, voice_profile_id, provider_id,
  provider_voice_id, status, metadata_json,
  last_verified_at, created_at, updated_at
  UNIQUE(voice_profile_id, provider_id)
```

- 一个逻辑音色可绑定 N 个 provider；每个 provider 独立 `ready/failed/needs_reclone`。
- 前端“会说话/会唱歌”由 bindings + capabilities 推导，不写死两个状态。
- 删除音色时遍历 bindings 删除厂商 voice；新增 provider 只加 binding，不改表。

### 3.5 统一生成请求/任务

```text
GenerateBatchCommand {
  mode: DUAL | SINGLE | SINGLE_TWO   // 产品模式，可扩展
  segments: [
    { id, providerId, capability: SPEAK|SING|HUM,
      text, voiceProfileId, params, outputFormat }
  ]
}

GenerationJob {
  batchId, userId, mode, status,
  segments: [{ id, providerId, capability, status,
               providerJobId?, objectKey?, errorCode? }],
  createdAt, expiresAt
}
```

- Controller 不判断 `providerId == breeze`；只校验“该 provider 的 descriptor 是否支持 capability + policy 是否允许”。
- 批量模式的产品规则放 `ProviderPolicy`，例如：
  - `dual`: 两个不同 provider，分别 speak + sing；
  - `single`: 一个 provider，一个 capability；
  - `single_two`: 同一 provider，两段同 capability（CosyVoice 两段 speak；Breeze 两段 sing/hum）。
- 未来新增 provider 只要 descriptor 声明能力，policy 决定是否出现在模式里。

### 3.6 音频 canonical 契约

- 统一内部音频：`pcm_s16le / 24 kHz / mono` 或 `wav`；adapter 负责重采样/转码。
- 消息输出可选 `mp3`，由 `AudioPipeline` 统一编码；前端只处理一种播放接口。
- 不把 Breeze 的 24k、CosyVoice 的 8k–48k 差异泄漏到业务层。
- 流式：统一 chunk 事件（`audio`/`done`/`error`），不暴露厂商 WS 事件。

### 3.7 错误与重试

统一错误分类：

```text
VOICE_CREDENTIAL_INVALID
VOICE_CREDENTIAL_MISSING
VOICE_VOICE_NOT_READY
VOICE_CAPABILITY_UNSUPPORTED
VOICE_PROVIDER_DISABLED
VOICE_PROVIDER_TIMEOUT
VOICE_RATE_LIMITED
VOICE_QUOTA_EXCEEDED
VOICE_PROVIDER_UNAVAILABLE
VOICE_INVALID_REQUEST
VOICE_CONTENT_REJECTED
```

- adapter 把厂商错误翻译成上述分类，并带 `retryable` 标志。
- 重试策略由 capability + 错误类型决定，不按 provider 写死。
- `providerRequestId` 保留用于对账，但不暴露给用户。

### 3.8 注册、路由与策略

- `ProviderRegistry`：启动时注册 adapter；按 `providerId` 查找；按 `capability` 过滤；健康检查/熔断。
- `ProviderPolicy`：
  - 默认 provider（对话→CosyVoice；唱句→Breeze）；
  - 允许的模式/能力组合（V1 限制 Breeze 只唱）；
  - 开关（Breeze sing 默认关）；
  - 用户/环境白名单；
  - 配额/限流。
- Controller 只依赖 `VoiceGenerationService`；service 通过 registry/policy 选择 adapter。

## 4. 对外 API 约定

### 4.1 Provider 元数据

```http
GET /ai-girl/voice/providers
```

返回：

```json
[
  {
    "id": "cosyvoice",
    "displayName": "CosyVoice-v3-Flash",
    "capabilities": ["SPEAK", "STREAM", "CLONE"],
    "credentialSchema": [
      {"key":"apiKey","label":"API Key","type":"PASSWORD","secret":true,"required":true},
      {"key":"workspaceId","label":"Workspace ID","type":"TEXT","secret":false,"required":true},
      {"key":"region","label":"Region","type":"SELECT","options":[...],"required":true}
    ],
    "enabled": true,
    "limits": {"maxTextChars": 3000}
  },
  {
    "id": "breeze",
    "displayName": "Breeze TTS 2",
    "capabilities": ["SING", "HUM", "ASYNC", "CLONE"],
    "credentialSchema": [
      {"key":"apiKey","label":"API Key","type":"PASSWORD","secret":true,"required":true}
    ],
    "enabled": false,
    "limits": {"maxTextChars": 120}
  }
]
```

前端不再写死两张卡；按数组渲染。`enabled` 控制开关；`capabilities` 控制类型。

### 4.2 凭据

```http
GET  /ai-girl/voice/providers/{providerId}/credential
PUT  /ai-girl/voice/providers/{providerId}/credential
POST /ai-girl/voice/providers/{providerId}/validate
DELETE /ai-girl/voice/providers/{providerId}/credential
```

- 请求体由 `credentialSchema` 驱动；secret 字段只写不读。
- 返回只含 `configured/last4/status/fields(非 secret)`。

### 4.3 克隆与生成

```http
POST /ai-girl/voice/profiles
POST /ai-girl/voice/profiles/{id}/clone/{providerId}
GET  /ai-girl/voice/profiles/{id}/bindings
POST /ai-girl/voice/generate
GET  /ai-girl/voice/generate/{batchId}
```

- `generate` 的 segments 用 `providerId + capability`，不再用 `/sing` 代表某个厂商。
- `/ai-girl/voice/speak`、`/sing` 可保留为兼容别名：
  - `speak` = 默认 SPEAK provider 的单段；
  - `sing` = 默认 SING provider 的单段；
  - 内部都转成 `GenerateBatchCommand`。

## 5. 前端如何做到“加模型不改页面”

1. 启动拉 `GET /providers`，得到卡片列表、字段 schema、能力、开关。
2. `ProviderCard` 用 schema 渲染字段；CosyVoice 自动出现 Workspace/Region，Breeze 只有 Key，未来 Local 出现 endpoint/model。
3. 模式切换器仍是三种产品模式，但每个模式的“可用性”来自 capabilities + policy：
   - 双模型：需要两个不同 provider，一个 SPEAK、一个 SING；
   - 单模型：一个 provider + 一个 capability；
   - 单模型两段：一个 provider + 两段同 capability。
4. `SegmentEditor` 根据 capability 显示不同字段（speak: 情绪；sing: 风格/唱/哼）。
5. 新 provider 只要后端注册并返回 descriptor，前端自动多一张卡；如果它支持 SPEAK，就能被选进单模型/双模型，无需改 TSX。
6. 仅当需要**provider 特有 UI**（例如某家独有的“韵律滑杆”）时，才用 `uiExtensions` schema 做局部扩展；V1 不需要。

## 6. 当前方案中影响扩展的明显问题

| # | 问题 | 为什么影响扩展 | 更优方案 |
|---|---|---|---|
| 1 | 前端两张卡写死 | 第三家要改布局/表单/校验 | descriptor + credentialSchema 动态渲染 |
| 2 | `voice_profiles` 固定两列 voice_id | 每加一家要迁移/回填 | `voice_provider_bindings` 通用表 |
| 3 | 凭据固定 provider 枚举/字段 | 新 provider 要加列/分支 | 通用密文 + schema |
| 4 | `/sing` 语义绑定 Breeze | 新唱句 provider 无处安放 | `generate` 用 providerId+capability |
| 5 | 能力矩阵写死 | 新 provider 支持多能力时表达不了 | descriptor capabilities + policy |
| 6 | Breeze 专用开关 | 每家都要新开关 | 通用 provider/capability enablement |
| 7 | 克隆流程写死 | 新 clone 模式要改 service | `CloneStrategy` 接口 |
| 8 | 音频格式差异泄漏 | 前端要适配更多格式 | canonical audio + adapter 转码 |
| 9 | 错误/计费按 provider 写死 | 新错误/计费扩散 | 统一错误分类/usage |
| 10 | 模式矩阵绑 provider 名 | 加模型要改模式逻辑 | 模式按 capability，policy 决定组合 |
| 11 | 无 provider registry/健康 | 新 provider 散落各处 | registry + health + circuit breaker |
| 12 | 无契约测试 | 新 provider 回归风险 | 统一 provider contract tests |

## 7. 不要过度设计

- **不要**为两家 provider 做完整插件运行时/热插拔；编译期 adapter + registry 足够。
- **不要**把每个 provider 拆成微服务；先同进程模块化，未来本地 sidecar 再独立部署。
- **不要**让前端完全动态到“任意 JSON 表单”；credentialSchema 只覆盖配置字段，业务模式仍由产品控制。
- **不要**把产品策略塞进 adapter；adapter 只翻译协议，policy 决定“谁能做什么”。
- **不要**过早抽象所有能力；先定义 `SPEAK/SING/HUM` + 可选流式/异步/克隆，其他能力按需加。

## 8. 迁移路径（不破坏现有开发）

| 阶段 | 动作 | 兼容性 |
|---|---|---|
| M0 | 引入 `ProviderDescriptor`、`TtsProvider`、`ProviderRegistry`；CosyVoice/Breeze 先包一层 | 现有 `/speak`/`/sing` 保持 |
| M1 | `generate` 走 registry；旧端点转调新 service | 前端可继续用旧端点 |
| M2 | 新增 `voice_provider_bindings`，双写并回填旧两列 | 旧列保留只读 |
| M3 | 凭据改为通用 schema；迁移两家字段 | 旧接口返回兼容视图 |
| M4 | 前端改用 `/providers` 动态渲染 | 旧卡片保留 feature flag |
| M5 | 下线旧列/旧分支；补 provider contract tests | 新 provider 接入只加 adapter |

## 9. 验收 / 契约测试

每个 provider 必须通过同一套 contract tests：

- `validate`：有效/无效/缺字段/权限不足；
- `synthesize`：短文本、长文本、空文本、特殊字符；
- `stream`（若支持）：首 chunk、取消、断线；
- `async`（若支持）：提交、轮询、失败、取消；
- `clone`（若支持）：创建、轮询、保存/就绪、删除、slot 满；
- 音频：采样率/声道/格式符合 canonical 契约；
- 错误：超时/限流/欠费/内容拒绝映射正确；
- 安全：Key 不出现在日志/异常/响应。

前端验收：

- 新增一个 mock provider（只返回 descriptor）即可出现第三张卡；
- 不修改 TSX 即可切换 provider 的字段/能力；
- 旧模式在 provider 缺失时正确禁用/回退。

## 10. 待确认

1. 未来最可能接入的是“本地 TTS”“其他云 TTS”“SVS/歌声合成”还是“音色设计”？优先级决定 capability 粒度。
2. 是否允许一个 provider 同时支持 SPEAK+SING？如果会，当前“双模型=说话+唱歌”的模式需要改成“两个 capability 槽”，不能绑定 provider 名。
3. 是否需要 provider 热插拔/第三方开发者接入？如果只是内部加模型，registry + 编译期 adapter 足够；如果要开放，才需要 SPI/插件沙箱。
4. 前端是否接受“配置驱动表单”，还是希望每家 provider 有定制 UI？定制 UI 要预留 `uiExtensions`，但会增加维护。
5. 本地 provider 的凭据是什么形态（无 Key、模型路径、endpoint）？credentialSchema 要支持“无凭据”与本地 endpoint。
6. 计费/配额是否继续按 provider 分别展示？统一 usage 需要 provider 价格元数据。

## 11. 参考

- [15 BYOK 落地决策](./15-byok-launch-decisions.md)
- [16 语音生成工作台](./16-voice-generation-mode-ui.md)
- [14 语音方案定稿](./14-voice-final-design.md)
- [CosyVoice-v3-Flash](https://help.aliyun.com/zh/model-studio/cosyvoice-v3-flash)
- [Breeze TTS 2](https://breezeblue.ai/zh/breeze-tts-2)
