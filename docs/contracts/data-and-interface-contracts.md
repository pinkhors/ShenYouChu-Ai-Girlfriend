# 数据与接口契约

- 版本：v0.1
- 适用范围：Core、Vision、Media、Desktop 的服务端作者与调用方
- 配套：[PRD](../01-product-requirements.md)、[技术路线](../02-technical-roadmap.md)、[开发规范](../03-development-standards.md)
- 术语遵循 [CONTEXT.md](../../CONTEXT.md)

本文是数据字段与接口的**单一权威来源**。实现与本文不一致时，改实现或先改本文并通过评审。

## 1. 通用约定

### 1.1 标识与时间

- 主键：雪花 ID（数据库 `BIGINT`，Java `Long`，见 [ADR-0005](../adr/0005-snowflake-ids.md)），全局唯一，不作为授权凭据；**API/JSON 中所有 ID 一律以字符串返回，避免 JavaScript 端丢失精度**；
- 归属：所有用户私有数据含 `user_id`；官方角色（`characters.owner_user_id IS NULL`）为系统模板，自定义角色归 `owner_user_id` 对应用户；
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

角色定义，承载“官方模板 + 用户自定义角色”。官方角色 `owner_user_id` 为 NULL、`is_public=true`、人设只读；自定义角色 `owner_user_id` 为当前用户、`is_public=false`、可编辑。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| owner_user_id | BIGINT | NULL=官方；非 NULL=该用户的自定义角色 |
| source_character_id | BIGINT | 可空，复制/模板来源，不参与权限判断 |
| code | VARCHAR(64) | 唯一；官方如 `shenyouchu`，自定义为 `custom-<雪花ID>` |
| display_name | VARCHAR(64) | 名称；同一 owner 下唯一，官方名保留 |
| persona_version | VARCHAR(20) | 官方 `v1`；自定义 `custom-v1` |
| persona_config | JSON | 官方沿用 v1（age/traits/speechStyle/background）；自定义保存 v2 结构化人设，可含 `expression`（表达温度配置） |
| avatar_config | JSON | 形象参数；官方预置默认值（本机可覆盖），自定义随账号保存 |
| is_public | BOOLEAN | 官方 true；自定义永远 false |
| status | VARCHAR(20) | active / archived；归档只作用于自定义角色 |
| version | BIGINT | 乐观锁；PATCH 必须匹配，成功后 +1 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`UNIQUE(code)`、`UNIQUE(owner_user_id, display_name)`、`INDEX(owner_user_id, status)`、`INDEX(source_character_id)`；`owner_user_id` 外键指向 `users(id)`。

### 2.2.1 user_preferences

每个用户一条偏好，当前角色全局唯一。

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | BIGINT | 主键，归属 |
| active_character_id | BIGINT | 当前角色，可空；失效/归档时回退官方 |
| created_at / updated_at | DATETIME(3) | 审计 |

约束：`fk_user_preferences_user` → `users(id)`；`fk_user_preferences_character` → `characters(id) ON DELETE SET NULL`。没有 `deleted_at`，账号删除时物理删除该行。

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

用户与角色之间的**唯一会话容器**：每个 `(user_id, character_id)` 恰好一条。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属 |
| character_id | BIGINT | 角色 |
| title | VARCHAR(200) | 已废弃用户自定义；当前由系统置空，展示层回退“和{角色名}的会话” |
| last_message_at | DATETIME(3) | 列表排序；清空聊天记录时置空 |
| status | VARCHAR(20) | active / archived |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`UNIQUE(user_id, character_id)`、`INDEX(user_id, last_message_at)`、`INDEX(user_id, character_id, last_message_at)`。

规则：

- 角色创建/复制时，服务端在同一事务内自动创建唯一会话；官方/存量角色在首次拉取会话列表时幂等补建；
- `POST /conversations` 是幂等 ensure：已存在返回 200 + 原会话，新建返回 201；
- 会话不允许删除；用户只能“清空聊天记录”，会话行保留以维持唯一约束；
- 角色归档保留会话；角色彻底删除时才级联物理清理该会话。

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
| source | VARCHAR(16) | text / voice / proactive（`proactive` 表示由主动开口生成，role 仍为 assistant） |
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
| character_id | BIGINT | 记忆归属角色，写入时从会话带入，可空（历史数据回填前） |
| conversation_id | BIGINT | 来源会话，可空 |
| source_message_id | BIGINT | 来源消息，可空 |
| memory_type | VARCHAR(32) | preference / event / relationship / other |
| content | TEXT | 记忆正文 |
| status | VARCHAR(20) | active / corrected / deleted |
| embedding_model | VARCHAR(64) | 可空，未向量化时为空 |
| embedding_dim | INT | 可空 |
| created_at / updated_at / deleted_at | DATETIME(3) | 审计 |

索引：`INDEX(user_id, memory_type, created_at)`、`INDEX(user_id, character_id, created_at)`。向量数据存 Milvus，`id` 与本文一致；**向量检索必须携带 user_id 与 character_id 过滤**，禁止先全局检索再应用层过滤作为唯一防线。

### 2.6.1 memory_chunks / memory_edges / memory_graph_snapshots（V6）

记忆星图的写入模型与只读投影，详见 [08 记忆星图](../08-memory-graph.md)。

`memory_chunks`：`id, user_id, character_id, conversation_id, turn_id, user_message_id, assistant_message_id, chunk_text, summary, category(fact|promise|episode|habit), topics_json, entities_json, embedding_model, embedding_dim, embedding_json, importance, valid_from, invalid_at, superseded_by, created_at, updated_at, deleted_at`。唯一键 `(user_id, turn_id)`；索引 `(user_id, character_id, invalid_at)`；向量只存本表，不进快照。

`memory_edges`：`id, user_id, character_id, source_chunk_id, target_chunk_id, edge_type(semantic|temporal|recall), weight, created_at, updated_at, deleted_at`；唯一键 `(user_id, source_chunk_id, target_chunk_id, edge_type)`。

`memory_recall_events`：`id, user_id, character_id, chunk_id, turn_id, rank_no, injected, created_at`；P1 建表，检索管线接入后写入。

`memory_graph_snapshots`：`id, user_id, character_id, version, mode(incremental|nightly), payload_json, generated_at, created_at, updated_at, deleted_at`；唯一键 `(user_id, character_id)`，只保留最新一份。`payload_json` 禁止包含向量。

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

事件类型基线（可扩展，需登记）：`auth.login`、`auth.logout`、`device.camera_on/off`、`device.mic_on/off`、`media.session_started/ended/failed`、`message.sent`、`asr.final`、`turn.started/completed/cancelled/failed`、`visual.state_changed`、`memory.created/updated/deleted/recalled`、`relationship.updated`、`recording.started/completed/deleted`、`search.performed`、`admin.search.performed`、`settings.changed`、`access.denied`、`data.deletion_requested/completed`。

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

### 2.12 user_llm_settings

用户级 LLM 配置，一个用户一行，`user_id` 即主键。未保存配置时回退服务端环境变量。

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | BIGINT | 主键，同时是归属（外键 `users.id`） |
| enabled | BOOLEAN | 是否启用真实 LLM；`false` 时用确定性占位回复，且不再回退环境变量 |
| base_url | VARCHAR(500) | OpenAI 兼容地址（含 `/v1`），可空 |
| model | VARCHAR(200) | 模型名，可空 |
| api_key | VARCHAR(512) | 供应商 Key，**当前明文存储**，仅服务端读取，接口不回显 |
| max_tokens | INT | 默认 512，范围 1–4096 |
| temperature | DECIMAL(3,2) | 默认 0.8，范围 0–2 |
| timeout_seconds | INT | 默认 60，范围 1–120 |
| created_at / updated_at | DATETIME(3) | 审计；`updated_at` 由数据库维护 |

约束：

- 用户显式保存过配置后（即使 `enabled=false`）不再使用环境变量，避免“改了不生效”的困惑；
- 删除账号时随用户一起删除该行；
- `api_key` 以明文存 MySQL 是当前实现的已知取舍，文档不得表述为“加密存储”；迁移到加密列或密钥管理前，数据库备份与只读账号同样按高敏感数据处理。

该表不设 `deleted_at`：DELETE 接口与账号删除都直接物理删除该行。

### 2.13 时间字段命名待确认

当前规范采用 `created_at / updated_at / deleted_at / occurred_at`。原始需求提出 `create_date + create_time + update_date + update_time` 四字段方案；两者不混用。未确认前按本规范实现，确认后统一迁移（见 C-6）。

### 2.14 user_voice_credentials（V7）

语音工作台 BYOK 凭据（docs/15、docs/17）。一个用户 × 一个 provider 一行；**不存明文 Key**。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键（雪花 ID） |
| user_id | BIGINT | 归属（外键 `users.id`） |
| provider_id | VARCHAR(64) | 模型标识，如 `cosyvoice` / `breeze`；不是枚举，注册表新增即生效 |
| encrypted_payload | TEXT | AES-256-GCM 密文（内含该 provider 的字段 JSON）；密钥来自 `VOICE_CREDENTIALS_KEY` |
| status | VARCHAR(20) | `active` / `invalid`；保存时强制校验通过才写 `active` |
| last_verified_at | DATETIME(3) | 最近一次校验时间 |
| created_at / updated_at | DATETIME(3) | 审计 |

约束：

- `UNIQUE(user_id, provider_id)`；所有查询必须带 `user_id`；
- 任何响应不回显密文与明文，只回显 `configured`、`status`、非 secret 字段与已配置的 secret 字段名；
- 更新时 secret 字段留空表示保留原值，避免“改一个字段丢另一个 Key”；
- 该表不设 `deleted_at`：删除凭据与账号删除都物理删除该行；
- 与 `user_llm_settings` 不同，这里**必须**表述为加密存储；主密钥轮换是已知未决项（见 C-11）。

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
| GET | `/conversations` | 当前用户会话分页（`limit` 默认 20 最大 100，`cursor` 为上一页 nextCursor，`characterId` 可选筛选）；查询前为可见且 active 的角色幂等补建会话 |
| POST | `/conversations` | 幂等 ensure：`characterId` 不传用当前角色；已存在 200 + 原会话，新建 201；title 已废弃；归档角色 409 |
| GET | `/conversations/{id}` | 详情（校验归属） |
| POST | `/conversations/{id}/clear` | 清空聊天记录：逻辑删除 messages/memories，保留会话行，重置 title/last_message_at；204 |
| DELETE | `/conversations/{id}` | **不再允许**，返回 409 `CONVERSATION_DELETE_NOT_ALLOWED`；请使用 clear |
| GET | `/conversations/{id}/messages` | 消息分页（`limit` 默认 20 最大 100；默认返回最新一页，`cursor` 为上一页 nextCursor，用于继续向更早翻页） |
| POST | `/conversations/{id}/turns` | 创建轮次（文本输入），返回 turnId |
| POST | `/conversations/{id}/turns/{turnId}/cancel` | 取消进行中的轮次（仅归属者；未知或已结束返回 404） |
| GET | `/conversations/{id}/proactive/eligibility` | 主动开口可开口性：`allowed/reason/scene/dailyLimit/usedToday/nextEligibleAt` |
| POST | `/conversations/{id}/proactive` | 受控主动开口；body 可选 `{trigger: share/follow_up/reminder}`；成功落库 assistant 消息（source=proactive），阻塞按 §3.9 返回 409 |

轮次状态与流式输出通过 WebSocket 下发（见第 4 节），不在 REST 中长轮询。

`GET /conversations/{id}/messages` 默认返回**最新一页**，`items` 按时间升序返回（便于聊天界面自上而下渲染）；把 `nextCursor` 作为 `cursor` 传回即向更早的消息翻页。首次进入会话必须先看到最近的对话，历史只能靠翻页补齐。

一对一会话规则：

- `(user_id, character_id)` 唯一；并发 ensure 由数据库唯一键兜底，冲突后回查已有会话；
- `POST /conversations` 重复调用不产生第二条，返回原 `conversationId`；
- `PUT /preferences/active-character` 响应必须包含 `{activeCharacterId, conversationId}`；
- 归档角色不允许 ensure 新会话（409 `CHARACTER_ARCHIVED`），但已有会话仍可读写；
- 清空聊天记录后会话保留，`last_message_at` 为空，历史消息/记忆逻辑删除。

### 3.2.1 角色

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/characters?includeArchived=false` | 官方 + 当前用户自定义角色；每项含 `isOfficial`/`isActive`/`status` |
| POST | `/characters` | 创建自定义角色 |
| GET | `/characters/{id}` | 官方或本人角色详情 |
| PATCH | `/characters/{id}` | 更新自定义角色；body 必须带 `version` |
| POST | `/characters/{id}/duplicate` | 复制为我的角色；body 可带 `displayName`/`avatarConfig` |
| POST | `/characters/{id}/archive` | 归档；若为当前角色，回退官方并返回新 `activeCharacterId` |
| POST | `/characters/{id}/restore` | 恢复归档 |
| POST | `/characters/{id}/purge` | 彻底删除；body `{confirmName}`，级联清理会话/消息/记忆/状态 |
| PUT | `/preferences/active-character` | body `{characterId}`，切换当前角色；返回 `{activeCharacterId, conversationId}` |

规则：

- 所有接口的 userId 都来自认证上下文；读取/修改/删除他人自定义角色统一 404 `CHARACTER_NOT_FOUND`；
- 官方角色写操作 403 `CHARACTER_READONLY`；自定义角色上限 12 个（含归档）；
- 名字 2–12 字、同用户唯一、不能与官方角色重名；年龄 18–45；intro ≤40；补充设定 ≤60；
- `PATCH` 版本不一致 409 `CHARACTER_VERSION_CONFLICT`；归档角色开新会话 409 `CHARACTER_ARCHIVED`；
- 角色定义只接受结构化字段，不接受 systemPrompt / personaPrompt / rawConfig 等自由提示词；
- 创建/复制角色时在同一事务内自动创建该角色的唯一会话；官方/存量角色在首次 `GET /conversations` 时幂等补建；
- 官方角色列表始终返回；归档只过滤自定义角色；当前角色偏好失效或归档时读取回退官方。

`CharacterView` 关键字段：

```json
{
  "id": "1000000000000000002",
  "code": "custom-1000000000000000002",
  "displayName": "林晚",
  "isOfficial": false,
  "isActive": true,
  "status": "active",
  "age": 24,
  "intro": "刚搬来这座城市，路痴但嘴硬。",
  "tags": ["傲娇嘴硬", "小傲娇", "都市长大", "普通"],
  "avatarConfig": { "skinTone": "natural", "outfitStyle": "knit" },
  "personality": { "archetype": "tsundere", "modifiers": ["soft-tsundere"], "intensity": "medium", "initiative": "medium", "addressUser": "笨蛋", "selfRef": "我", "jealousy": "low" },
  "family": { "growth": "city", "relations": "polite", "economy": "ordinary", "extraNote": "怕打雷" },
  "expression": {
    "mode": "auto",
    "temperatureOverride": null,
    "autoTemperature": 0.74,
    "effectiveTemperature": 0.74,
    "source": "auto",
    "explanation": ["基础 0.78", "主性格 温柔治愈 -0.05", "调味 小傲娇 +0.02", "表达 自然 +0.00", "形象 长直发、奶油白 -0.01", "夹取后 0.74"]
  },
  "version": 3,
  "createdAt": "2026-10-28T09:00:00Z",
  "updatedAt": "2026-10-28T10:00:00Z"
}
```

官方角色的 `personality`/`family`/`expression` 为 `null`，`tags` 由旧 `traits` 映射；不返回 `persona_config` 原文或提示词。自定义角色提示词由服务端 `CharacterPromptCompiler` 编译，固定安全边界永远最后追加。

`expression` 规则（详见 [09 文档](../09-expression-temperature-and-proactive-message.md)）：

- `mode` 只允许 `auto` / `manual`；`manual` 必须有 `temperatureOverride ∈ [0.30, 1.20]`，否则 400 `CHARACTER_EXPRESSION_INVALID`；
- `autoTemperature` 按性格 + 形象推导，夹取 `[0.50, 0.95]`；`effectiveTemperature = temperatureOverride ?? autoTemperature`；
- `source` 为 `auto` / `manual`；主动消息的 `temperatureSource` 额外允许 `user`（官方角色沿用用户级配置）；`explanation` 顺序固定，形象行只列有贡献字段且为三字段合计；
- 创建/更新请求可带 `expression`；PATCH 为 `null` 表示不修改；复制角色保留该配置。

### 3.3 记忆

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/memories` | 列表（`characterId` 可选，按角色筛选；不传返回全部） |
| PATCH | `/memories/{id}` | 纠正内容（标记 corrected 并写入新版本） |
| DELETE | `/memories/{id}` | 删除并同步移除向量 |

### 3.3.1 记忆星图（`/memory-graph`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/memory-graph?characterId=` | 取该角色最新快照；不存在则构建。`characterId` 缺省用当前角色 |
| POST | `/memory-graph/rebuild?characterId=` | 强制重建并返回新快照 |
| GET | `/memory-graph/chunks/{chunkId}` | 记忆详情：原文、摘要、话题、实体、来源消息、失效时间 |
| POST | `/memory-graph/chunks/{chunkId}/forget` | 遗忘：写 `invalid_at`，节点变幽灵，返回 204 |
| POST | `/memory-graph/backfill?characterId=&limit=` | 历史消息回填 chunk；幂等；返回 `{created,skipped}` |

快照响应字段：`version, characterId, characterName, generatedAt, mode, layoutSeed, constellations[], nodes[], edges[], stats`；节点含 `id, chunkId, label, category, angle, radius, importance, ghost, createdAt, conversationId`；边含 `id, source, target, kind(ownership|semantic|temporal), weight`。不返回向量。越权统一 404 `MEMORY_NOT_FOUND`。

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
| GET | `/settings/llm` | 当前用户的 LLM 配置视图（不含 Key 明文） |
| PUT | `/settings/llm` | 保存当前用户的 LLM 配置，返回同 GET 视图 |
| DELETE | `/settings/llm` | 删除当前用户的 LLM 配置并回退服务端默认，204 |
| POST | `/settings/llm/test` | 用当前有效配置发一条最小请求，返回连通性与耗时 |
| POST | `/data/deletion-requests` | 请求删除账号或指定资源，返回 jobId |
| GET | `/data/deletion-requests/{jobId}` | 查询删除进度 |
| GET | `/character-state` | 当前用户与指定角色的心情/亲密度（`characterId` 可选，不传用当前角色；无记录返回初始值） |
| POST | `/account/deletion` | 删除当前账号：MySQL 级联逻辑删除、会话失效、Redis 清理（可选）、审计事件 |

### 3.7 用户级 LLM 配置（`/settings/llm`）

每个用户只能读写自己的配置；`user_id` 只来自认证上下文，路径与请求体都不接受归属用户。四个接口均要求 `Authorization: Bearer <token>`，未认证返回 401。

**有效配置优先级**（回复生成与“测试连接”共用）：

1. 用户自己的配置（`source=USER`），即使 `enabled=false` 也不再读环境变量；
2. 服务端环境变量 `LLM_*`（`source=ENV`），仅当用户没有自己的配置时生效；
3. 确定性占位回复（`source=NONE` 或用户配置 `enabled=false`）。

**GET `/settings/llm`** 响应：

```json
{
  "enabled": true,
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "hasApiKey": true,
  "maxTokens": 512,
  "temperature": 0.8,
  "timeoutSeconds": 60,
  "source": "USER",
  "updatedAt": "2026-10-28T07:00:00.000Z"
}
```

- `source`：`USER`=用户自己的配置，`ENV`=服务端环境变量兜底，`NONE`=未配置；
- 只返回 `hasApiKey`，**任何响应都不包含 `apiKey` 明文**；
- 回退到 `ENV` 或 `NONE` 时 `updatedAt` 为 `null`。

**PUT `/settings/llm`** 请求：

```json
{
  "enabled": true,
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKey": "sk-...",
  "maxTokens": 512,
  "temperature": 0.8,
  "timeoutSeconds": 60
}
```

规则：

- `apiKey` 为空或空白表示“保留已保存的 Key”，不会清空；要清空 Key 只能通过 DELETE 恢复默认；
- 首次保存且 `apiKey` 为空时，用户配置没有 Key，**不会继承**环境变量的 Key；若此时 `enabled=true` 且服务端 ENV 配置可用并带 Key，后端返回 400 `VALIDATION_FAILED`（桌面端也会提前拦截），需填写自己的 Key 或保持不保存；
- `enabled=true` 时 `baseUrl`、`model` 必填；
- `baseUrl` 只接受 `http` / `https`，且必须有主机名，不能带 query/fragment 或 `{}`；保存时去掉末尾 `/`；
- Base URL 由用户填写；自用/小范围可接受，公开多租户部署前应增加私网/云元数据地址拦截与出站代理，避免 SSRF；
- `maxTokens` 1–4096（默认 512）、`temperature` 0–2（默认 0.8）、`timeoutSeconds` 1–120（默认 60）；
- 保存成功后返回与 GET 相同的视图；请求体不合法返回 400 `VALIDATION_FAILED`。

**DELETE `/settings/llm`**：删除当前用户的配置行，返回 204；之后按环境变量/占位回复工作。账号删除时由账号清理流程一并删除该行。

**POST `/settings/llm/test`**：使用**已保存的**有效配置发一条最小 `chat/completions` 请求（`max_tokens` 上限 32），用于设置页“测试连接”；无请求体。

```json
{ "ok": true, "latencyMs": 812, "model": "deepseek-chat", "error": null }
```

- 连通但上游返回错误时为 `ok=false`，`error` 为截断后的原因（超过 300 字符加省略号）；错误信息与日志不得包含 Key，HTTP 仍为 200；
- 当前有效配置不可用（未启用或缺少 Base URL/模型）时返回 400 `VALIDATION_FAILED`；
- 用户保存了 `enabled=false` 的配置时，测试按该配置判定为不可用并返回 400，不会回退环境变量；
- 测试不会写入配置，也不会改变当前来源。

安全与隔离：

- Key 当前以明文存于 MySQL `user_llm_settings.api_key`，仅服务端读取；接口只暴露 `hasApiKey`，日志与错误体不得包含 Key；
- A 的凭证不能读取、修改或测试 B 的配置，也不存在按 userId 操作的入口；越权访问按 404 处理。

### 3.7.1 语音工作台（`/ai-girl/voice`）

配置驱动的多模型语音生成（docs/16、docs/17）。前端只依赖本节契约，不接触厂商原生协议；模型差异全部来自 `providers` 返回的 descriptor。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/ai-girl/voice/providers` | 模型列表：descriptor（能力、credentialFields、generationFields、上限、enabled）+ 当前用户凭据状态 |
| PUT | `/ai-girl/voice/providers/{providerId}/credential` | 保存凭据（body `{fields:{...}}`）；服务端先校验再落库，失败 400 |
| POST | `/ai-girl/voice/providers/{providerId}/validate` | 用已保存凭据做最小连通性校验，返回 `{valid,message}` |
| DELETE | `/ai-girl/voice/providers/{providerId}/credential` | 删除凭据，204 |
| POST | `/ai-girl/voice/generate` | 批量生成：`{mode, segments[]}`，202 返回 batch；mode ∈ `single`/`single_two`/`dual` |
| GET | `/ai-girl/voice/generate/{batchId}` | 查询 batch 状态与段落结果 |

规则：

- `segments[]` 每项 `{id, providerId, capability, text, params}`；capability ∈ `SPEAK/SING/HUM`；服务端校验 provider 声明了该能力且 `enabled=true`；
- `single_two` 两段必须同一 provider；`dual` 两段必须不同 provider；段数与模式不符返回 400 `VOICE_INVALID_REQUEST`；
- `params` 只接受该 capability 的 generationFields 中声明的 key；文本超过 `maxTextChars` 返回 400；
- 凭据视图只回显非 secret 字段与 `configuredSecrets` 名单；secret 字段留空 = 保留原值；
- batch 状态：`queued/running/succeeded/partial/failed`；段落状态：`queued/generating/succeeded/failed`；失败段带稳定 `errorCode`；
- 生成结果当前保留在内存任务中（7 天窗口，重启丢失）；持久化与对象存储是已知未决项（见 C-12）；
- 错误码：`VOICE_PROVIDER_NOT_FOUND`(404)、`VOICE_PROVIDER_DISABLED`(400)、`VOICE_CAPABILITY_UNSUPPORTED`(400)、`VOICE_CREDENTIAL_MISSING`(400)、`VOICE_CREDENTIAL_INVALID`(400)、`VOICE_CREDENTIAL_REQUIRED`(400)、`VOICE_INVALID_REQUEST`(400)、`VOICE_BATCH_NOT_FOUND`(404)、`VOICE_PROVIDER_UNAVAILABLE`(502)。

### 3.8 搜索

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

### 3.9 错误格式

```json
{
  "code": "TURN_ALREADY_CANCELLED",
  "message": "本轮对话已取消",
  "requestId": "req-...",
  "details": {}
}
```

常用码：`UNAUTHENTICATED`(401)、`FORBIDDEN`(403)、`NOT_FOUND`(404)、`VALIDATION_FAILED`(400)、`CONFLICT`(409)、`RATE_LIMITED`(429)、`UPSTREAM_UNAVAILABLE`(503)、`TURN_ALREADY_CANCELLED`(409)、`RECORDING_NOT_READY`(409)、`REASON_REQUIRED`(400)、`SEARCH_UNAVAILABLE`(503)。越权资源统一返回 404，避免泄露存在性。

主动消息相关码（均为 409，除注明外）：`CHARACTER_EXPRESSION_INVALID`(400)、`PROACTIVE_PRIVACY_DISABLED`、`PROACTIVE_USER_BUSY`、`PROACTIVE_NO_HISTORY`、`PROACTIVE_QUIET_HOURS`、`PROACTIVE_UNANSWERED_LIMIT`、`PROACTIVE_DAILY_LIMIT`、`PROACTIVE_USER_JUST_REPLIED`、`PROACTIVE_COOLDOWN`、`PROACTIVE_SUPPRESSED`、`PROACTIVE_GENERATION_FAILED`(502)。

### 3.10 幂等与重试

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

统一要求：超时、重试、降级、幂等、可观测；模型 ID 与密钥来自用户级配置或服务端环境变量，禁止硬编码；契约测试覆盖正常、超时、取消与错误映射。

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

| 存储 | 账号删除 | 自定义角色彻底删除 | 单条录像删除 | 单条记忆删除 | 会话清空（不删除会话） |
|---|---|---|---|---|---|
| MySQL | 删除/匿名化用户相关行；自定义角色逻辑删除、user_preferences 物理删除 | 物理删除角色及该角色的 conversations/messages/memories/user_character_states；当前角色先回退官方 | 删除 recordings 行 | 删除 memories 行 | 逻辑删除该会话 messages/memories；会话行保留，title/last_message_at 置空 |
| Redis | 删除用户前缀 Key | 清理角色相关临时状态（如有） | 清理相关临时状态 | 清理召回缓存 | 清理会话状态 |
| Milvus | 按 user_id 删除向量 | 删除该角色向量（P2 接入后） | 无 | 删除对应向量 | 删除该会话关联记忆向量（P2 接入后） |
| 对象存储（S3 兼容） | 清理 `users/{userId}/` 前缀 | 无（立绘本机） | 删除对象 | 无 | 无 |
| 异步任务 | 取消/清理待执行任务 | 取消该角色整理任务 | 取消归档任务 | 无 | 取消整理任务 |
| 本机 IndexedDB | 清理该用户全部立绘 | 清理该角色立绘 | 无 | 无 | 无 |
| 日志/审计 | 保留最小删除审计 | 记录 character.purged（ID/名称/计数，不含正文） | 记录删除事件 | 记录删除事件 | 记录 conversation.cleared（计数，不含正文） |

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
11. 每次成功的运营检索都存在 `admin.search.performed` 审计事件，字段完整；
12. A 无法读取、修改或测试 B 的 LLM 配置，A 的“测试连接”只使用 A 的有效配置；
13. A 无法读取/修改/删除 B 的自定义角色，A 无法用 B 的 characterId 创建会话或查询关系状态；
14. 归档角色不出现在切换器/新建会话中，但已有会话仍可继续；彻底删除角色后会话、消息、记忆、状态与本机立绘无残留；
15. 每个 `(user_id, character_id)` 最多一条会话：重复/并发 `POST /conversations` 只产生一条，`DELETE /conversations/{id}` 返回 409，清空聊天记录后会话仍存在。
16. A 无法读取、修改、测试或删除 B 的语音 BYOK 凭据与生成任务；账号删除后 `user_voice_credentials` 行与内存生成任务均无残留。

## 10. 隐私分级

| 级别 | 数据 | 要求 |
|---|---|---|
| 高 | 密码哈希、对话正文、记忆、录像、音频 | 加密传输，最小访问，删除可级联，禁止进日志 |
| 高 | 自定义角色设定（名字、性格、家庭背景、形象参数） | 仅本人可见；不进入用户搜索/运营检索；接口不回显他人角色 |
| 高 | 用户 LLM 配置（含 `api_key`） | 仅服务端可读，接口不回显、禁止进日志；当前明文入库，备份与只读账号同样按高敏感数据保护 |
| 中 | 视觉估计、活动事件、关系状态 | 归属明确，保留期，默认不公开 |
| 低 | 官方角色模板、公开的模型元数据、公开文档 | 可公开 |

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
| C-11 | `VOICE_CREDENTIALS_KEY` 主密钥轮换 | 已知未决：当前密文与单一主密钥绑定，轮换需要“旧钥解密 + 新钥重加密”迁移任务 |
| C-12 | 语音生成 batch 持久化 | 当前为内存任务（7 天窗口、重启丢失）；持久化到 `voice_generation_jobs` + 音频入对象存储是下一迭代项 |
