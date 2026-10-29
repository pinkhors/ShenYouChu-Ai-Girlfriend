# 08 记忆星图（Memory Graph）

- 状态：已确认，进入实现
- 日期：2026-10-29
- 关联：[01 产品需求](./01-product-requirements.md) §4.4 / §6.4、[02 技术路线](./02-technical-roadmap.md) §5、[数据与接口契约](./contracts/data-and-interface-contracts.md)、[07 角色自定义](./07-character-customization.md)
- 代码位置：`services/core/src/main/java/com/shenyouchu/core/memorygraph/`、`apps/desktop/src/renderer/src/memorygraph/`

## 1. 背景与目标

现有 `memories` 是关键词规则提取的流水，不参与提示、不可检索、无来源。M1 之后需要一套真正的长期记忆管线：原文分块、向量化、按角色隔离、可追溯、可遗忘。

星图不是第二套记忆，而是记忆的**只读投影（read model）**：

- 让人看见“她记住了什么、为什么记得、和什么有关”；
- 让错误记忆可以被发现、纠正、遗忘；
- 不改变给 LLM 的固定预算，不参与检索注入，不写向量库。

目标：

1. 每轮对话落一个 `memory_chunk`（一问一答），带分块文本、摘要、话题、实体、向量；
2. 每轮结束后增量刷新该角色的图快照，新星球尽快可见；
3. 夜间做一次一致性校准：去重、度数限制、幽灵化、布局种子固化；
4. 前端在记忆页提供「列表 / 星链」双视图，星链可下潜到记忆详情与原对话；
5. 所有能力按 `user_id + character_id` 隔离，删除/遗忘可级联。

## 2. 范围与非目标

**本期（P1）**

- V6 表结构与迁移；
- 分块、轻量话题/实体抽取、embedding（含离线哈希兜底）、召回事件表；
- `GraphProjector` 与快照读写；
- 星图 REST 接口；
- 前端星图 v0（星座/星球/边、聚焦、详情、遗忘、刷新、列表切换）；
- 单角色；浅色“纸上星盘”材质。

**非目标（P2/P3）**

- 不接 Milvus / 独立向量库；
- 不做完整实体消歧与关系抽取；
- 不做图驱动检索（沿边扩展召回）；
- 不做多角色星系总览、3D、暗色夜空材质；
- 不做自动纠正/自动事实抽取（先人工纠正）。

## 3. 关键决策

| 决策 | 结论 | 理由 |
|---|---|---|
| Chunk embedding | **P1 必做**，对话入库时同步生成 `embedding_json`；夜间补实体/事实向量 | 没有向量，语义边与星链都不成立 |
| 实体/话题 | P1 轻量规则版（话题词典 + 日期/引号/称谓），P3 再做完整抽取与消歧 | 保证边至少有“关于谁/关于什么”，又不拖慢管线 |
| 快照节奏 | 每轮对话后**增量刷新**；夜间**一致性校准** | 新星球尽快可见，同时避免实时重排导致图跳变 |
| 幽灵星 | 接受；`invalid_at` / `superseded_by` 双时间字段，退出有效视图但保留历史 | 旧事实不物理删除，可回滚、可审计 |
| 布局 | 确定性极坐标：角度=时间/哈希，半径=重要度；不跑力导向 | 用户空间记忆稳定，避免毛线球 |
| 星图与提示 | 星图**不进入** LLM 上下文；检索预算不变 | 星图是 UI 投影，不是 Token 消耗方 |

## 4. 数据模型（V6）

### 4.1 `memory_chunks`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT PK | 雪花 ID |
| `user_id` / `character_id` / `conversation_id` | BIGINT | 归属，必填 |
| `turn_id` | VARCHAR(36) | 一轮对话的幂等键，`uk_chunk_turn(user_id, turn_id)` |
| `user_message_id` / `assistant_message_id` | BIGINT | 来源消息，可空（历史回填时补） |
| `chunk_text` | TEXT | `用户：…\n她：…` |
| `summary` | VARCHAR(200) | 一句话摘要，节点标签来源 |
| `category` | VARCHAR(32) | `fact` / `promise` / `episode` / `habit` |
| `topics_json` | VARCHAR(500) | 话题标签数组 |
| `entities_json` | VARCHAR(500) | 实体数组 |
| `embedding_model` / `embedding_dim` | VARCHAR(64) / INT | 向量元信息 |
| `embedding_json` | MEDIUMTEXT | 归一化浮点数组；只存 DB，不进快照 |
| `importance` | DECIMAL(4,3) | 0–1，布局半径与节点大小 |
| `valid_from` | DATETIME(3) | 事实生效时间，默认 `now(3)` |
| `invalid_at` | DATETIME(3) | 失效时间；非空即幽灵星 |
| `superseded_by` | BIGINT | 被哪条新记忆取代，可空 |
| `created_at` / `updated_at` / `deleted_at` | DATETIME(3) | 审计与逻辑删除 |

索引：`(user_id, character_id, invalid_at)`、`(user_id, turn_id)` 唯一、`(conversation_id, created_at)`。

### 4.2 `memory_edges`

`id, user_id, character_id, source_chunk_id, target_chunk_id, edge_type(semantic|temporal|recall), weight, created_at, updated_at, deleted_at`；唯一键 `(user_id, source_chunk_id, target_chunk_id, edge_type)`；索引 `(user_id, character_id)`。

### 4.3 `memory_recall_events`

`id, user_id, character_id, chunk_id, turn_id, rank_no, injected, created_at`；索引 `(user_id, character_id, created_at)`、`(chunk_id, created_at)`。本期只建表与写入接口，等检索管线接入后写入。

### 4.4 `memory_graph_snapshots`

`id, user_id, character_id, version, mode(incremental|nightly), payload_json MEDIUMTEXT, generated_at, created_at, updated_at, deleted_at`；唯一键 `(user_id, character_id)`（每角色一份最新快照，版本号自增）。

### 4.5 保留与删除

- 快照只保留最新一份；历史回放靠 chunk 的 `valid_from/invalid_at`，不靠快照；
- 删除矩阵：删除消息/记忆/会话/角色/账号时，级联删除 chunk、edge、recall、snapshot（`deleted_at` 逻辑删除，角色彻底删除时物理删除）；
- 用户“忘记”一条记忆 = `invalid_at = now()`，节点变幽灵，检索排除；不物理删除。

## 5. 写入管线

```
TurnService.persistTurn（短事务，消息落库）
  └─ 事务外：MemoryIngestService.recordTurn(userId, conversation, turnId, userMessage, assistantMessage)
       1. 幂等检查：uk(user_id, turn_id)
       2. chunk_text = "用户：…\n她：…"；summary = 用户句前 40 字
       3. MemorySignals.extract(chunk_text) → topics / entities / category
       4. EmbeddingService.embed(chunk_text) → float[]（失败降级哈希）
       5. 插入 memory_chunks
       6. GraphProjector.project(userId, characterId, "incremental") → 覆盖快照
```

失败策略：任何一步异常只记录日志，不影响本轮回复；下一轮或夜间校准会补。

**分类规则（P1 规则版）**

| 条件 | category |
|---|---|
| 命中“约定/答应/说好/以后/下次/保证/不许” | `promise` |
| 命中偏好词（喜欢/讨厌/最爱/不吃/受不了…） | `fact` |
| 其余 | `episode` |

`habit` 本期保留空星座，等习惯卡上线后写入。

**话题/实体（P1 轻量）**

- 话题：工作、学习、情绪、健康、关系、生活、娱乐、金钱、节日、天气、旅行、宠物，命中词典即打标；
- 实体：日期（`YYYY-MM-DD`、`M月D日`、今天/昨天/明天）、引号内专名、称谓（妈妈/爸爸/朋友/同事/老板/老师/猫…）、数字+单位；
- 全部去重、截断，最多 8 个话题 / 8 个实体。

**Embedding**

- 默认 `HashingEmbeddingClient`：字符 trigram 哈希到 128 维、L2 归一化，离线可用、确定性，测试与降级用；
- 配置 `shenyouchu.memory.embedding.enabled=true` 时走 OpenAI 兼容 `/embeddings`（`base-url` + `api-key` + `model`），失败自动回退哈希；
- 向量只存 DB，快照只存引用。

## 6. GraphProjector

### 6.1 职责边界

**输入**：`memory_chunks`（有效 + 近期幽灵）、`memory_edges`（可复用）、`memory_recall_events`（P2）、用户遗忘事件。
**输出**：`memory_graph_snapshots.payload_json`（星座、星球、边、幽灵、布局、版本）。
**不做**：不调 LLM、不写向量库、不改记忆真相源、不参与检索注入。

### 6.2 算法（确定性）

1. 取该角色最近 `maxNodes=300` 条 chunk（有效优先，幽灵最多 20 条）；
2. 固定四个星座：`facts`（关于你，-90°）、`promises`（约定，0°）、`episodes`（一起经历，90°）、`habits`（她学到的，180°），半径 150；
3. 每个 chunk 归入星座；角度 = 星座基角 + `hash(id) % 110 - 55`（度）；半径 = `220 + (1 - importance) * 70`；幽灵半径 320；
4. 重要度：基础 0.5 + 分类权重（fact 0.2 / promise 0.25 / episode 0.05）+ 7 天内 +0.15，封顶 0.95；
5. 语义边：对每个 chunk 计算与同角色其它 chunk 的余弦，取 top-2 且 `>= threshold`（默认 0.35），双向去重、单节点度数 ≤5；
6. 时间边：同星座内按 `created_at` 连接前一条（最多 1 条/节点）；
7. 归属边：星座 → 星球，权重 1；
8. 幽灵边：只保留归属边，样式由前端处理；
9. 布局种子 = `hash(userId + characterId)`，写入快照，前端不重算节点位置；
10. 版本号 +1，`mode` 记录 `incremental|nightly`，覆盖保存。

**为什么每轮全量重算**：单角色 ≤300 条，纯 CPU 毫秒级；全量重算保证一致性，配合确定性布局不会跳变。夜间校准额外做去重、度数裁剪、幽灵清理。

### 6.3 快照 JSON

```json
{
  "version": 12,
  "characterId": "123",
  "characterName": "沈幼楚",
  "generatedAt": "2026-10-29T05:20:00Z",
  "mode": "incremental",
  "layoutSeed": "a1b2c3",
  "constellations": [
    { "id": "cat:facts", "label": "关于你", "kind": "facts", "count": 12, "angle": -90, "radius": 150 }
  ],
  "nodes": [
    {
      "id": "chunk:1001",
      "chunkId": "1001",
      "label": "你生日是 10 月 12 日",
      "category": "facts",
      "angle": -72.4,
      "radius": 226.5,
      "importance": 0.85,
      "ghost": false,
      "createdAt": "2026-10-14T12:00:00Z",
      "conversationId": "9001"
    }
  ],
  "edges": [
    { "id": "own:1001", "source": "cat:facts", "target": "chunk:1001", "kind": "ownership", "weight": 1.0 },
    { "id": "sem:1001:1002", "source": "chunk:1001", "target": "chunk:1002", "kind": "semantic", "weight": 0.62 }
  ],
  "stats": { "nodes": 12, "ghosts": 0, "edges": 18 }
}
```

约束：不出现向量、embedding、内部 SQL、原始消息 ID 以外的敏感字段；`label` 最多 24 字。

## 7. API 契约

前缀 `/api/v1`，全部需要 Bearer Token；`characterId` 可选，缺省用当前角色；归属校验失败返回 404。

| 方法 | 路径 | 说明 | 响应 |
|---|---|---|---|
| GET | `/memory-graph?characterId=` | 取最新快照；不存在则现场构建 | `MemoryGraphView` 200 |
| POST | `/memory-graph/rebuild?characterId=` | 强制重建（夜间/手动） | `MemoryGraphView` 200 |
| GET | `/memory-graph/chunks/{chunkId}` | 记忆详情（含原文、话题、实体、来源消息） | `MemoryChunkDetailView` 200 |
| POST | `/memory-graph/chunks/{chunkId}/forget` | 遗忘：写 `invalid_at`，变幽灵，重建 | 204 |
| POST | `/memory-graph/chunks/{chunkId}/restore` | 撤销遗忘（P2，可先实现） | 204 |

`MemoryGraphView` 字段与 §6.3 一致。`MemoryChunkDetailView`：

```json
{
  "id": "1001",
  "characterId": "123",
  "conversationId": "9001",
  "userMessageId": "8001",
  "assistantMessageId": "8002",
  "content": "用户：…\n她：…",
  "summary": "你生日是 10 月 12 日",
  "topics": ["生日"],
  "entities": ["10 月 12 日"],
  "category": "facts",
  "createdAt": "2026-10-14T12:00:00Z",
  "invalidAt": null
}
```

错误沿用 `{code,message,requestId}`；越权统一 404 `MEMORY_NOT_FOUND`。

## 8. 前端规格（v0）

### 8.1 入口与布局

- 记忆页顶部 `列表 | 星链` segmented 切换，选择按用户记忆；默认列表；
- 星链视图：左侧 280–320px 列表栏（当前焦点的详情 + 相邻记忆），右侧 SVG 画布；
- 1280×800 下画布约 840×640；最小 640×520；
- 顶部面包屑：`沈幼楚 › 关于你 › 生日`；右下角图例；右上角「重新整理」。

### 8.2 视觉

- 浅色“纸上星盘”：底 `#FCFAF7`，墨 `#3A3330`，杏 `#B9805A`，线 `#D9CFC4`；
- 星座：标签 13px + 计数 pill；星球：圆 10–24px（按 importance），菱形=habit，双环=promise；
- 幽灵星：40% 透明 + 虚线环，不参与 hover 高亮；
- 边：归属实线 1px 18%，时间虚线 1px 12%，语义点线 1px 16%；
- 不引入新字体；不画装饰星点；不做 3D/自动旋转。

### 8.3 交互

- hover：节点放大 1.08，邻居高亮，其余 25%；tooltip 显示 label + 日期；
- click：选中，左栏显示详情与「查看来源 / 忘记」；
- 双击：聚焦该节点（只保留 1 跳邻居），面包屑追加；`Esc` 返回上一层；
- 滚轮：v0 先做缩放（0.8–1.6），P2 改为“下潜/上浮”；
- 「忘记」：二次确认 → POST → 节点变幽灵；5 秒撤销（P2）；
- 空态：无 chunk 时显示“聊过之后，星链才会连起来”，不渲染空画布；
- 加载：骨架/淡入；错误：内联提示 + 重试；
- 可访问性：SVG `role="img"` + `aria-label`；关键操作走左栏 DOM；键盘 `Tab` 可达左栏按钮。

### 8.4 状态

`idle → loading → ready | empty | error`；刷新/重建时保留旧图并显示顶部细进度条，避免闪白。

## 9. 配置

```yaml
shenyouchu:
  memory:
    embedding:
      enabled: ${MEMORY_EMBEDDING_ENABLED:false}
      base-url: ${MEMORY_EMBEDDING_BASE_URL:}
      api-key: ${MEMORY_EMBEDDING_API_KEY:}
      model: ${MEMORY_EMBEDDING_MODEL:text-embedding-3-small}
      dim: ${MEMORY_EMBEDDING_DIM:128}
      timeout-seconds: 10
    graph:
      max-nodes: 300
      max-ghosts: 20
      semantic-threshold: 0.35
      max-degree: 5
```

## 10. 调度、并发与性能

- 增量：Turn 事务提交后同步重建（≤300 节点，目标 <100ms）；异常只记日志；
- 夜间：`@Scheduled(cron="0 30 3 * * *")` 扫描有 chunk 的 `(user_id, character_id)` 重建；多实例用 `memory_graph_snapshots` 行锁或 Redis 互斥（P2），本期单实例；
- 快照写入用 `(user_id, character_id)` 唯一键 upsert，版本号 +1；
- 读接口优先返回缓存快照；无快照才构建；
- 前端首屏 ≤200KB；节点 ≤300。

## 11. 隐私与删除

- 星图只返回摘要与引用，不返回向量；
- 「忘记」= 失效，不是物理删除；账号/角色彻底删除时物理清理；
- 安静模式（P2）隐藏标签；
- 日志不打印 chunk 全文与向量。

## 12. 测试

- 单元：`MemorySignals` 分类/话题/实体；`HashingEmbeddingClient` 归一化与确定性；`GraphProjector` 星座归属、边去重、度数上限、幽灵过滤、布局稳定；
- 集成：GET 快照 → 发一轮 turn → 快照版本 +1 且出现新节点 → forget 后节点变 ghost；
- 删除矩阵：删角色/账号后 chunk/edge/snapshot 不可见；
- 前端：`tsc --noEmit`；组件测试（v0 可手测）。

## 13. 分期

| 阶段 | 内容 |
|---|---|
| P1（本设计） | 表、分块、embedding、投影、API、星图 v0、列表切换 |
| P2 | 召回事件与轨迹、纠正、撤销遗忘、滚轮下潜、安静模式、夜间锁 |
| P3 | 完整实体/关系抽取、图驱动检索实验、多角色星系、暗色材质 |

## 14. 必须保留 / 禁止项

**必须保留**

- 列表视图永远是默认与等价路径；
- 每条记忆可追溯来源（角色、日期、原对话）；
- 逐条遗忘、二次确认、即时生效；
- 「仅自己可见」；按 `user_id + character_id` 隔离；
- 现有暖色体系、杏色记忆语义色、24px/1.7 图标规范、1280×800 / 125% 适配；
- 星图不进入 LLM 上下文，不改变检索预算。

**禁止项**

- 力导向毛线球、随机漂移、每次布局不同；
- 3D、视差、自动旋转、装饰星点、霓虹/玻璃拟态；
- 把每条消息做成节点；
- 星图作为唯一入口；
- 删除做成“星球爆炸/黑洞”；任何“她会难过”的文案；
- 跨角色连线；
- 快照携带向量或内部 ID 以外的敏感数据。

## 15. 风险与开放问题

| 风险 | 处理 |
|---|---|
| 规则抽取质量有限 | P1 只做话题/实体，P3 升级；星图先小范围 |
| 哈希兜底语义弱 | 生产开 `embedding.enabled`；阈值可配 |
| 每轮重建与 Turn 延迟耦合 | 目标 <100ms；超时降级为“标记脏”，夜间补 |
| 快照与真相不一致 | 版本号 + 每次写入后重建；夜间校准 |
| 前端图过密 | 节点上限 300、每环 8 个、LOD 标签 |
| 多实例重复重建 | P2 加锁；本期单实例 |

**开放问题**

1. 夜间调度是否需要分布式锁（当前部署是否多实例）？
2. 生产 embedding 供应商与维度（决定阈值与存储）？
3. 「忘记」是否需要 5 秒撤销（涉及软删除窗口）？
4. 图驱动检索是否进入实验（沿边扩展，替换而非追加检索预算）？

## 16. 实现状态（P1，2026-10-29）

已落地：

- 迁移：`services/core/src/main/resources/db/migration/V6__memory_graph.sql`（4 张表 + 索引 + 级联外键）；
- 后端：`com.shenyouchu.core.memorygraph` 下的实体、Mapper、`MemorySignals`、`HashingEmbeddingClient` / `EmbeddingService`、`MemoryChunkService`、`GraphProjector`、`MemoryGraphService`、`MemoryGraphController`、`MemoryGraphScheduler`；
- 对话接入：`TurnService` 在消息事务提交后写 chunk 并增量刷新快照，失败只记日志；清空聊天记录会同步清理 chunk/边/快照；账号删除通过 `MemoryGraphAccountPurgePort` 清理；
- 前端：`MemoryPanel` 增加「列表 / 星链」切换，`memorygraph/MemoryGraphPanel.tsx` + `.css` 渲染星座/星球/边、详情、遗忘、重建、滚轮缩放；
- 测试：`GraphProjectorTest`、`MemorySignalsTest`（9 个用例）。

已知偏差（按 P1 范围）：

- 星图滚轮 v0 是缩放，不是「下潜/上浮」；下潜与面包屑在 P2；
- `habit` 星座保留但暂无写入源，等习惯卡上线；
- `memory_recall_events` 已建表，检索管线接入后才写入，当前快照没有 recall 边；
- 增量刷新为“每轮全量重算 + 确定性布局”，夜间校准为同一算法 + 幽灵清理；真实 delta 投影留到规模变大后；
- 手动「重新整理」当前写入 `mode=nightly`，与夜间任务同路径。
