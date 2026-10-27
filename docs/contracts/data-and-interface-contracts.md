# 数据与接口契约

- 版本：v0.1
- 适用范围：Core、Vision、Media、Desktop 的服务端作者与调用方
- 配套：[PRD](../01-product-requirements.md)、[技术路线](../02-technical-roadmap.md)、[开发规范](../03-development-standards.md)
- 术语遵循 [CONTEXT.md](../../CONTEXT.md)

本文是数据字段与接口的**单一权威来源**。实现与本文不一致时，改实现或先改本文并通过评审。

## 1. 通用约定

### 1.1 标识与时间

- 主键：雪花 ID（数据库 `BIGINT`，Java `Long`，见 [ADR-0005](../adr/0005-snowflake-ids.md)），全局唯一，不作为授权凭据；**API/JSON 中所有 ID 一律以字符串返回，避免 JavaScript 端丢失精度**；
- 归属：所有用户私有数据含 `user_id`；系统模板表（如 `characters` 预设）可为空但需显式区分；
- 时间：统一 UTC，数据库 `DATETIME(3)`；对外 API 使用 ISO 8601（带 `Z` 或偏移）；
- 审计字段：所有业务表 `created_at`、`updated_at`、`deleted_at`（未删为 `NULL`）；
- 事件类表另加 `occurred_at`：行为实际发生时间，与入库时间 `created_at` 区分；
- `updated_at` 由应用写入，避免依赖数据库隐式行为造成时区不一致。

### 1.2 删除语义

| 语义 | 行为 |
|---|---|
| 逻辑删除 | 置 `deleted_at`，普通查询必须过滤；用于常规业务隐藏 |
| 物理删除 | 用户主动清除/删除账号，经 `deletion_jobs` 级联清理全部存储 |
| 删除审计 | 保留最小元数据（谁、何时、删除何类资源），不含正文与文件 |

逻辑删除不等于数据清除。产品文案与接口文档必须区分。

### 1.3 隔离原则

- `user_id` 仅来自服务端认证上下文，**任何请求体/查询参数中的 userId 都不作为归属依据**；
- 按 ID 读取资源时必须同时校验 `user_id`，越权统一返回 404 或 403（不泄露资源是否存在）；
- Redis、Milvus、对象存储（S3 兼容）、异步任务、日志同样执行归属约束；
- 跨服务调用传递 ID，接收方重新校验归属。

### 1.4 分页与幂等

- 分页：cursor 模式，`limit` 默认 20、最大 100，响应含 `nextCursor`；
- 写操作：支持 `Idempotency-Key` 请求头，服务端按用户+键去重，重放返回首次结果；
- 时间线排序默认 `occurred_at DESC, id DESC`。

## 2. 核心实体

字段只列关键项，未列字段由实现补充但不得违反通用约定。

### 2.1 users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| username | VARCHAR(64) | 唯一 |
| password_hash | VARCHAR(255) | 强哈希（算法见待确认项 C-1） |
| status | VARCHAR(20) | active / disabled / deleting |
| role | VARCHAR(20) | user / operator；默认 user，授予与撤销需审计（ADR-0002） |
| role_granted_at | DATETIME(3) | 可空，角色最近授予时间 |
| last_login_at | DATETIME(3) | 可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`UNIQUE(username)`、`INDEX(status)`、`INDEX(role)`。

### 2.2 characters

角色模板与版本，全局只读数据。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| code | VARCHAR(64) | 唯一，如 `shenyouchu` |
| display_name | VARCHAR(64) | 沈幼楚 |
| persona_version | VARCHAR(20) | 人设版本 |
| persona_config | JSON | 人设/提示词引用，不含密钥 |
| is_public | BOOLEAN | 开源版本默认 true |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

### 2.3 user_character_states

每个用户与角色一条关系状态。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| character_id | BIGINT | 角色 |
| mood | INT | 有界区间（实现定义上下限） |
| intimacy | INT | 有界，单事件只累加一次 |
| state_version | BIGINT | 乐观锁 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`UNIQUE(user_id, character_id)`。

### 2.4 conversations

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| character_id | BIGINT | 角色 |
| title | VARCHAR(200) | 可空，可由首条消息生成 |
| last_message_at | DATETIME(3) | 列表排序 |
| status | VARCHAR(20) | active / archived |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`INDEX(user_id, last_message_at)`。

### 2.5 messages

会话消息（用户与 AI 正文的唯一存储）。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| conversation_id | BIGINT | 归属会话 |
| user_id | BIGINT | 冗余归属，用于强制执行隔离 |
| turn_id | VARCHAR(36) | 所属轮次 |
| role | VARCHAR(16) | user / assistant / system |
| content | MEDIUMTEXT | 正文 |
| content_format | VARCHAR(16) | text / markdown |
| source | VARCHAR(16) | text / voice |
| asr_confidence | DECIMAL(4,3) | 可空，语音来源 |
| token_count | INT | 可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`INDEX(conversation_id, created_at)`、`INDEX(user_id, created_at)`、`INDEX(turn_id)`。

### 2.6 memories

经整理的长期记忆。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| conversation_id | BIGINT | 来源会话，可空 |
| source_message_id | BIGINT | 来源消息，可空 |
| memory_type | VARCHAR(32) | preference / event / relationship / other |
| content | TEXT | 记忆正文 |
| status | VARCHAR(20) | active / corrected / deleted |
| embedding_model | VARCHAR(64) | 可空，未向量化时为空 |
| embedding_dim | INT | 可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`INDEX(user_id, memory_type, created_at)`。向量数据存 Milvus，`id` 与本文一致；**向量检索必须携带 user_id 过滤**，禁止先全局检索再应用层过滤作为唯一防线。

### 2.7 media_sessions

一次实时媒体连接。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| conversation_id | BIGINT | 关联会话 |
| room_ref | VARCHAR(128) | 媒体服务房间引用，唯一 |
| status | VARCHAR(20) | connecting / active / ended / failed |
| recording_enabled | BOOLEAN | 当次是否录制 |
| started_at / ended_at | DATETIME(3) | 可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`UNIQUE(room_ref)`、`INDEX(user_id, started_at)`。

### 2.8 recordings

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| media_session_id | BIGINT | 来源 |
| conversation_id | BIGINT | 可空 |
| object_key | VARCHAR(512) | `users/{userId}/recordings/{recordingId}/{uuid}.mp4` |
| bucket | VARCHAR(128) | 私有桶名 |
| format / duration_ms / size_bytes | VARCHAR / BIGINT | 元数据 |
| status | VARCHAR(20) | recording / processing / ready / failed / deleted |
| expires_at | DATETIME(3) | 保留期，可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

约束：`object_key` 只能由服务端生成；客户端提交的路径一律不采信。播放走短期签名 URL 或受控流式接口，**Bucket 永远私有**。

### 2.9 visual_events

视觉状态变化与质量信息，不存原始帧与关键点。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| media_session_id | BIGINT | 来源 |
| conversation_id | BIGINT | 可空 |
| expression_estimate | VARCHAR(32) | smile_like / frown_like / surprise_like / neutral / unknown |
| posture | VARCHAR(32) | leaning_forward / leaning_back / sideways / neutral / unknown |
| camera_orientation | VARCHAR(32) | camera_oriented / away / unknown |
| confidence | DECIMAL(4,3) | 0–1 |
| quality | VARCHAR(16) | good / low_light / occluded / no_face |
| capture_ts / inference_end_ts / emit_ts | DATETIME(3) | 信号时序 |
| model_version | VARCHAR(64) | 模型/规则版本 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

只记录**状态变化**或有意义事件，不写逐帧数据。低置信度写 unknown 或不产生事件。

### 2.10 activity_events

行为审计事件，只读、引用正文而非复制。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 服务端派生归属 |
| conversation_id | BIGINT | 可空 |
| turn_id | VARCHAR(36) | 可空 |
| event_type | VARCHAR(64) | `domain.action`，如 `turn.cancelled` |
| actor | VARCHAR(16) | USER / AI / SYSTEM |
| source | VARCHAR(32) | desktop / core / vision / media / system |
| occurred_at | DATETIME(3) | 行为发生时间 |
| trace_id | VARCHAR(64) | 链路追踪 |
| schema_version | INT | 事件结构版本 |
| payload | JSON | 仅必要元数据与资源 ID，不含正文/帧/密钥 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`INDEX(user_id, occurred_at)`、`INDEX(user_id, event_type, occurred_at)`、`INDEX(trace_id)`。

事件类型基线（可扩展，需登记）：`auth.login`、`auth.logout`、`device.camera_on/off`、`device.mic_on/off`、`media.session_started/ended/failed`、`message.sent`、`asr.final`、`turn.started/completed/cancelled/failed`、`visual.state_changed`、`memory.created/updated/deleted/recalled`、`recording.started/completed/deleted`、`search.performed`、`admin.search.performed`、`settings.changed`、`access.denied`、`data.deletion_requested/completed`。

`admin.search.performed` 为强制审计事件：payload 至少包含 `operatorUserId`、`reason`、`queryHash`（不存明文查询词）、`resultTypes`、`resultCount`、`scope`；缺失该事件的跨用户检索视为实现缺陷。

### 2.11 deletion_jobs

物理删除任务与审计。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 发起用户 |
| resource_type | VARCHAR(32) | account / conversation / recording / memory |
| resource_id | BIGINT | 目标资源，账号删除时为用户 ID |
| status | VARCHAR(20) | pending / running / completed / failed |
| requested_at / completed_at | DATETIME(3) | 可空 |
| error | TEXT | 可空，不含敏感数据 |
| idempotency_key | VARCHAR(64) | 唯一 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

### 2.12 时间字段命名待确认

当前规范采用 `created_at / updated_at / deleted_at / occurred_at`。原始需求提出 `create_date + create_time + update_date + update_time` 四字段方案；两者不混用。未确认前按本规范实现，确认后统一迁移（见 C-6）。

## 3. REST 接口

前缀 `/api/v1`。身份来自认证上下文，路径与查询参数不接受归属用户。

### 3.1 认证（占位，机制待确认 C-1）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录，返回短时访问凭证 |
| POST | `/auth/logout` | 退出并使凭证失效 |
| GET | `/auth/me` | 当前用户信息 |

### 3.2 会话与消息

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/conversations` | 当前用户会话列表（cursor 分页） |
| POST | `/conversations` | 创建会话 |
| GET | `/conversations/{id}` | 详情（校验归属） |
| DELETE | `/conversations/{id}` | 删除（逻辑删除，异步物理删除可选） |
| GET | `/conversations/{id}/messages` | 消息列表（cursor） |
| POST | `/conversations/{id}/turns` | 创建轮次（文本输入），返回 turnId |

轮次状态与流式输出通过 WebSocket 下发（见第 4 节），不在 REST 中长轮询。

### 3.3 记忆

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/memories` | 列表（可按类型/状态筛选） |
| PATCH | `/memories/{id}` | 纠正内容（标记 corrected 并写入新版本） |
| DELETE | `/memories/{id}` | 删除并同步移除向量 |

### 3.4 媒体与录像

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/media-sessions` | 创建媒体会话，返回短时房间凭证与 roomRef |
| POST | `/media-sessions/{id}/end` | 结束会话 |
| GET | `/recordings` | 录像列表 |
| GET | `/recordings/{id}/playback` | 返回短期签名 URL 或流式地址（校验归属） |
| DELETE | `/recordings/{id}` | 删除文件与元数据 |

### 3.5 活动记录

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/activity-events` | 时间线查询（按类型、时间范围筛选） |

只读；不提供普通用户修改接口。

### 3.6 设置与数据权利

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/settings` | 获取设置（录制开关、追踪开关与级别、保留期） |
| PATCH | `/settings` | 更新设置，写入活动事件 |
| POST | `/data/deletion-requests` | 请求删除账号或指定资源，返回 jobId |
| GET | `/data/deletion-requests/{jobId}` | 查询删除进度 |

### 3.7 搜索

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/search` | 用户搜索本人记录；body 含 `query`、`types`、`from`、`to`、`cursor`、`limit` |
| POST | `/admin/search` | 运营跨用户检索；仅 `operator` 角色，body 必须含 `reason`，默认脱敏 |

搜索使用 POST + body 而非 GET 查询串，避免搜索词进入 URL、浏览器历史与访问日志；该接口是只读查询，不需要 `Idempotency-Key`。

用户搜索响应：

```json
{
  "items": [
    {
      "entityType": "message",
      "entityId": "msg-...",
      "conversationId": "conv-...",
      "occurredAt": "2026-10-27T09:00:00.000Z",
      "snippet": "……高亮片段……",
      "score": 0.87
    }
  ],
  "nextCursor": null
}
```

规则：

- `entityType` 取值 `message`、`memory`、`activity`、`recording`；
- 用户搜索强制按认证用户过滤；运营检索的用户范围由服务端授权决定，**不接受客户端传入任意 userId**；
- 已删除（`deleted_at` 非空）或权威记录已不存在的文档不得返回；索引为派生数据时需回源校验；
- 运营检索响应默认不含完整正文，仅摘要与元数据；每次调用写入 `admin.search.performed`；
- 缺少角色、缺少事由或超出授权范围分别返回 403、`REASON_REQUIRED`、403。

`SearchPort` 接口（Core 内部 seam）：

```text
search(query, scope, types, timeRange, cursor) -> SearchPage
index(document) / remove(entityType, entityId)
rebuild(scope)
```

P1 实现 `MySqlSearchAdapter`（FULLTEXT + ngram）；后续可增加 `OpenSearchAdapter`，业务代码与接口不变。未来索引文档字段约定为：`docId`、`userId`、`entityType`、`entityId`、`conversationId`、`actor`、`content`、`occurredAt`、`deleted`、`schemaVersion`、`updatedAt`。

### 3.8 错误格式

```json
{
  "code": "TURN_ALREADY_CANCELLED",
  "message": "本轮对话已取消",
  "requestId": "req-...",
  "details": {}
}
```

常用码：`UNAUTHENTICATED`(401)、`FORBIDDEN`(403)、`NOT_FOUND`(404)、`VALIDATION_FAILED`(400)、`CONFLICT`(409)、`RATE_LIMITED`(429)、`UPSTREAM_UNAVAILABLE`(503)、`TURN_ALREADY_CANCELLED`(409)、`RECORDING_NOT_READY`(409)、`REASON_REQUIRED`(400)、`SEARCH_UNAVAILABLE`(503)。越权资源统一返回 404，避免泄露存在性。

### 3.9 幂等与重试

- 所有 POST/PATCH/DELETE 支持 `Idempotency-Key`；
- 重试不得产生重复消息、重复记忆或重复删除任务；
- 上游超时按可重试与不可重试分类，重试有次数与退避上限。

## 4. 实时协议（WebSocket）

### 4.1 连接与鉴权

- 连接时携带短时票据（由 `/auth/login` 或专用接口签发），服务端校验并绑定 userId；
- 连接绑定 `connectionId`，断线重连后按 `turnId` 恢复或明确失败；
- 协议版本通过 `schemaVersion` 协商。

### 4.2 事件信封

```json
{
  "eventId": "evt-...",
  "type": "asr.final",
  "schemaVersion": 1,
  "conversationId": "conv-...",
  "turnId": "turn-...",
  "sequence": 42,
  "occurredAt": "2026-10-27T09:00:00.000Z",
  "payload": {}
}
```

规则：客户端与服务端都丢弃过期 `sequence`；`turnId` 不匹配的消息直接忽略。

### 4.3 客户端 → 服务端

| type | payload | 说明 |
|---|---|---|
| `speech.start` | `{ "conversationId": "..." }` | 开始一轮语音 |
| `audio.chunk` | 二进制帧 + 元数据（seq、ts） | 音频分片，优先二进制通道 |
| `speech.end` | `{ "turnId": "..." }` | 结束输入，请求最终稿 |
| `turn.cancel` | `{ "turnId": "..." }` | 取消本轮（幂等） |
| `text.send` | `{ "conversationId": "...", "text": "..." }` | 文本输入 |

### 4.4 服务端 → 客户端

| type | payload | 说明 |
|---|---|---|
| `turn.started` | `{ "turnId": "..." }` | 已接受轮次 |
| `asr.partial` | `{ "text": "...", "confidence": 0.8 }` | 仅用于字幕 |
| `asr.final` | `{ "text": "...", "confidence": 0.9 }` | 最终稿，触发回答 |
| `assistant.text.delta` | `{ "delta": "..." }` | 流式文本 |
| `assistant.audio.chunk` | 二进制音频 + `{ seq, format, sampleRate }` | 按 seq 顺序播放 |
| `assistant.playback.started` | `{ "firstAudioAt": "..." }` | 用于首音延迟统计 |
| `visual.signal` | VisualSignal（第 5 节） | 低频快照或变化事件 |
| `turn.completed` | `{ "turnId": "...", "reason": "done" }` | 正常结束 |
| `turn.cancelled` | `{ "turnId": "...", "reason": "user" }` | 已取消，客户端清空队列 |
| `turn.failed` | `{ "code": "...", "message": "..." }` | 失败与降级提示 |

音频编码、帧大小与二进制头格式随媒体选型确定（C-2），本文件只约定"二进制通道 + seq + 时间戳"的契约层级。

## 5. VisualSignal 契约（Core ↔ Vision）

```json
{
  "signalId": "vs-...",
  "userId": "u-...",
  "mediaSessionId": "ms-...",
  "conversationId": "conv-...",
  "expressionEstimate": "smile_like",
  "posture": "leaning_forward",
  "cameraOrientation": "camera_oriented",
  "confidence": 0.82,
  "quality": "good",
  "captureTs": "2026-10-27T09:00:00.100Z",
  "inferenceEndTs": "2026-10-27T09:00:00.150Z",
  "emitTs": "2026-10-27T09:00:00.180Z",
  "sequence": 1024,
  "modelVersion": "mediapipe-...",
  "schemaVersion": 1
}
```

约束：

- `userId` 来自服务端媒体会话绑定，不接受 Vision worker 任意声明；
- 只输出估计值，不输出身份、心理结论；
- 置信度低于阈值或质量不佳时输出 `unknown` / `quality=low_light|occluded|no_face`；
- Core 只保留最新快照（默认 2Hz）与变化事件，不排队回放旧帧信号；
- 注入提示词时附带"估计"措辞与置信度，低置信度不注入。

## 6. 模型适配接口

所有适配器以"小接口"暴露，供应商实现可替换：

| 接口 | 输入 | 输出 | 关键约束 |
|---|---|---|---|
| AsrAdapter | 音频流 | partial / final 文本 + 置信度 | partial 不触发回答 |
| LlmAdapter | 系统提示、上下文、消息、取消信号 | 文本增量流 | 支持取消；首 token 埋点 |
| TtsAdapter | 文本片段（句级） | 音频块流 | 支持取消；按序返回 |
| EmbeddingAdapter | 文本列表 | 向量 + 模型名/维度 | 维度变更需重建索引 |
| VisionAdapter（内部） | 帧或媒体引用 | VisualSignal | 丢帧优先于堆积 |

统一要求：超时、重试、降级、幂等、可观测；模型 ID 与密钥来自配置；契约测试覆盖正常、超时、取消与错误映射。

## 7. 存储与隔离契约

### 7.1 Redis

```text
sess:{userId}:{conversationId}          # 会话临时状态，TTL
turn:{userId}:{turnId}                  # 轮次状态，TTL
rate:{userId}:{action}:{window}         # 限流
media:{userId}:{mediaSessionId}         # 媒体绑定，TTL
```

规则：客户端不可直接访问；只存临时状态；不把 Redis 当权威事实源。

### 7.2 Milvus

- 每条向量含 `user_id` 标量字段；
- 检索必须携带 `user_id == 当前用户` 过滤条件；
- 维度与模型名随 Embedding 适配器版本记录，禁止混用不同维度索引；
- 删除记忆时同步删除向量（或标记并异步清理，需可验证）。

### 7.3 对象存储（S3 兼容）

- Bucket 私有；
- 对象 Key 规范：`users/{userId}/recordings/{recordingId}/{uuid}.mp4`；
- 下载前校验 `recordings.user_id`，再签发短期 URL；
- 账号删除时按前缀清理并校验结果。

## 8. 数据删除矩阵

| 存储 | 账号删除 | 单条录像删除 | 单条记忆删除 | 单会话删除 |
|---|---|---|---|---|
| MySQL | 删除/匿名化用户相关行 | 删除 recordings 行 | 删除 memories 行 | 级联 messages 等 |
| Redis | 删除用户前缀 Key | 清理相关临时状态 | 清理召回缓存 | 清理会话状态 |
| Milvus | 按 user_id 删除向量 | 无 | 删除对应向量 | 删除关联记忆向量 |
| 对象存储（S3 兼容） | 清理 `users/{userId}/` 前缀 | 删除对象 | 无 | 可选删除关联录像 |
| 异步任务 | 取消/清理待执行任务 | 取消归档任务 | 无 | 取消整理任务 |
| 日志/审计 | 保留最小删除审计 | 记录删除事件 | 记录删除事件 | 记录删除事件 |

每项必须有自动化验证；删除任务可重试且幂等，完成后写入 `data.deletion_completed` 事件。

## 9. 隔离契约测试要求

发布门禁必须覆盖：

1. A 的凭证读取 B 的会话/消息/记忆/录像/活动事件 → 拒绝；
2. A 传入 B 的 userId 或资源 ID → 不产生越权访问；
3. A 无法获取或复用 B 的媒体房间凭证与签名 URL；
4. A 取消 B 的轮次 → 拒绝且 B 的轮次不受影响；
5. 向量检索不返回他人记忆（含边界：相同文本、相同 embedding）；
6. 异步任务串线测试：A 的迟到 ASR/记忆任务不写入 B；
7. 删除矩阵逐项验证无残留；搜索索引在删除后不再返回该内容；
8. 日志与错误体不泄露他人资源存在性或敏感内容；
9. A 的搜索查询永远不返回 B 的消息、记忆、活动或录像元数据；
10. `operator` 缺少角色、缺少事由或超出授权范围时检索被拒绝，且不产生任何命中；
11. 每次成功的运营检索都存在 `admin.search.performed` 审计事件，字段完整。

## 10. 隐私分级

| 级别 | 数据 | 要求 |
|---|---|---|
| 高 | 密码哈希、对话正文、记忆、录像、音频 | 加密传输，最小访问，删除可级联，禁止进日志 |
| 中 | 视觉估计、活动事件、关系状态 | 归属明确，保留期，默认不公开 |
| 低 | 角色模板、模型配置、公开文档 | 可公开 |

搜索访问规则（ADR-0002）：

- 用户搜索只能命中本人数据；
- `operator` 跨用户检索必须带事由，默认脱敏，并强制写入审计事件；
- 搜索索引属于派生数据，继承被索引数据的隐私级别；索引快照、日志与调试输出同样不得泄露正文。

## 11. 待确认项

| 编号 | 问题 | 默认建议 |
|---|---|---|
| C-1 | 认证机制与密码哈希算法 | 本地账号 + 强哈希（如 Argon2id/bcrypt 之一），初始化时锁定 |
| C-2 | 音频帧与二进制协议细节 | 随媒体选型 POC 确定，保持 seq+ts 契约 |
| C-3 | 各数据保留期默认值 | 录像 30 天、活动 90 天，用户可调 |
| C-4 | Milvus 索引参数与维度 | 随 Embedding 模型确认后锁定，变更走重建流程 |
| C-5 | 录像加密与备份策略 | 服务端加密 + 定期备份，具体方案部署阶段定 |
| C-6 | 时间字段命名（四字段 vs `*_at`） | 本规范统一 `created_at/updated_at/deleted_at/occurred_at`，如需四字段需统一迁移评审 |
| C-7 | 媒体服务 SDK 与房间凭证格式 | POC 后确定，须满足服务端签发与最小权限 |
| C-8 | `operator` 角色模型与授权流程 | 独立角色、审批授予、可撤销；见 ADR-0002 |
| C-9 | 运营检索脱敏规则与可展示字段 | 默认仅摘要与元数据，正文展示需单独授权并留痕 |
| C-10 | 搜索索引实现与切换时点 | P1 MySQL FULLTEXT/ngram，命中质量或延迟不达标时切 OpenSearch |
