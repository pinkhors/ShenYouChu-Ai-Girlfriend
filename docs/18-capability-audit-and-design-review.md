# 功能盘点与设计评估

- 版本：v1.0（2026-10-30）
- 性质：只读评估。**未修改任何代码**，本文是唯一新增文件。
- 输入：仓库当前 `main`（`500e995`）的代码、`docs/01–15`、`STATUS.md`、`CONTEXT.md`、`scripts/*.ps1`。
- 读者：产品/技术负责人、后续实现者。
- 结论口径：**已实现 / 半实现（骨架或仅占位） / 缺失**；「缺失」只指文档已承诺或产品链路必需但代码中不存在的能力；「新增」指文档尚未承诺、但值得做的能力。

---

## 0. 判决摘要

一句话：**后端 M1 的基本盘扎实，前端"单角色陪伴"的叙事完整，但这个产品目前还没有变成"能交到别人手上的产品"，而且最近三次迭代投入的方向和产品承诺的方向出现了偏移。**

六条判断：

1. **投入与承诺倒挂。** 最近 6 次提交里有 3 次是记忆星图（2D + 3D 共 1473 行自研渲染），而 PRD 里 M1 的出口项「用户全局搜索」（`docs/01-product-requirements.md:123`、`docs/02-technical-roadmap.md:281`）**一行代码都没有**；M2 的出口项「流式语音 + 打断」（`:85-90`）只有一次性 base64 骨架。P1 的"炫技"跑在了 P0 的"地基"前面。
2. **有三处"承诺大于实现"必须先修**，否则越演示越伤信任：
   - 用户在记忆页点了"删除后她将不再记得"，**她其实还记得**（召回走 `memory_chunks`，删除只动 `memories`，两套存储互不传播）；
   - 所谓"流式回复"是**整段生成完再按 8 字符/20ms 重放**，用户点"停止"时模型其实早就跑完了，取消注册甚至发生在生成结束之后；
   - 聊天页顶栏写死"**在线**"，而主动消息策略里 23:00–08:00 是"她在休息"。
3. **交付链路是断的。** 没有打包（无 electron-builder/签名/安装包）、没有自动更新、没有 CSP、没有错误边界。当前形态是"开发者本机能跑"，不是"可分发"。
4. **数据权利与可观测性缺位。** 无搜索、无导出、无活动开关与保留期（FR-6.5 在 PRD 里标 P0）、无 traceId 全链路、无限流与配额。这些不是"锦上添花"，是上线前会被合规和故障追着打的项。
5. **验收结论不可复核，这比缺功能更危险。** 三个具体证据：① `apps/desktop/package.json:12` 的 `test` 脚本**硬编码 21 个测试文件名**，新增测试不进白名单就永不运行，`npm test` 照样"全绿"；② 同一批冒烟证据里端口有 48080/48081/48082 三种写法，文档之间的测试数有 108/133/111 三种口径；③ 契约写明"流式走 WebSocket、不在 REST 长轮询"（`docs/contracts/data-and-interface-contracts.md:339`），实现是 SSE；契约写"物理删除经 deletion_jobs 级联"，实现是 MyBatis 逻辑删除。**当前"已验收"三个字的可信度低于代码本身。**
6. **代码本身有两笔明确的技术债在复利**：记忆的**双写双读**（`memories` vs `memory_chunks`）和对话状态的**四套并行 store**（`pendingStore` / `turnSessionStore` / `turnSessions` / `messagePages`）+ 1024 行 `App.tsx` 无路由。前者已经在制造正确性缺陷，后者在制造回归风险。

**如果只做三件事**：① 修记忆删除闭环；② 把 SSE 改成真流式并让取消生效；③ 补用户搜索。三件都是"用户能立刻感觉到"的，成本都在 S/M。

---

## 1. 评估范围与依据

### 1.1 页面与交互（前端，逐视图看过）

| 视图 | 载体 | 评估到的交互范围 |
|---|---|---|
| 登录/注册 | `apps/desktop/src/renderer/src/App.tsx:694-799` | 模式切换、提交、错误展示、启动时 token 校验、401 统一登出 |
| 工作区外壳 | `App.tsx:807-1022` | 左栏导航（聊天/角色/记忆/活动/设置）+ 角色切换器 + 会话侧栏 + 主区；**无路由，section 是内存状态** |
| 聊天页 | `ChatView.tsx:449-733` | 顶栏（切换器/心情亲密度条/"让她先开口"/通话）、hero 立绘、流式文本、气泡揭示、停止、加载更早、输入框、错误提示 |
| 聊天空态 | `App.tsx:111-148` | 立绘 + 进入会话（触发后端 ensure） |
| 会话侧栏 | `ConversationSidebar.tsx:84-196` | 角色名搜索、按最近消息排序、切换、清空（confirm）、刷新 |
| 角色中心 | `CharacterHub.tsx:142-600` | 官方卡、我的角色网格、归档区、模板弹窗、使用/编辑/复制/归档/恢复/彻底删除（输名） |
| 角色编辑器 | `CharacterEditor.tsx:436-796` | 四步/四 tab（身份/形象/性格/家庭）、脏态守卫、Ctrl+S、离开确认、创建成功页 |
| 立绘工作室 | `PortraitStudio.tsx:149-314` + `GenerationPanel.tsx` | 7 槽位表情导入、抠图生成 hero、AI 出图（ComfyUI/OpenAI 兼容）、清空 |
| 记忆列表 | `MemoryPanel.tsx:150-219` | 当前/全部角色范围、卡片、删除 |
| 记忆星链 2D | `MemoryGraphPanel.tsx:172-364,549-785` | 缩放、hover 邻居高亮、详情、忘记、重建、星座列表 |
| 记忆星链 3D | `MemoryGraph3DPanel.tsx:425-686` | 拖拽旋转/平移/缩放/双击聚焦/Esc |
| 活动记录 | `ActivityPanel.tsx:91-141` | 只读时间线（≤50）+ 类型筛选 |
| 设置 | `SettingsPanel.tsx:24-93` + `LlmSettingsCard.tsx` + `voice/VoiceSettings.tsx` | 账户/退出、角色入口、连接信息、LLM 卡片、语音卡片、删账号 |
| 通话页 | `CallView.tsx:529-714` | 计时、圆形形象（眨眼/口型/动作）、状态与字幕、表情抽屉、文字模式、录音→ASR→发送→TTS、挂断 |

### 1.2 接口与数据（后端，逐控制器看过）

- 39 个端点，覆盖认证（4）、角色（8）、偏好（1）、会话（5）、轮次与流式（4）、主动消息（2）、语音（1）、记忆（2）、记忆星图（5）、关系（1）、活动（1）、账号（1）、LLM 配置（4）。
- 数据：14 张表（`V1` 8 张 + `V3` 1 + `V4` 1 + `V6` 4），Flyway V1–V6 已在本机 MySQL 执行。
- 规模：后端 `services/core/src/main/java` 160 个 Java 文件 / 10,380 行，测试 31 个类 / 3,545 行；前端 `apps/desktop/src` 69 个文件 / 22,876 行（其中 `styles.css` 5,711 行）；文档 22 个 md / 7,530 行。
- 测试：前端 133 个用例（21 个文件，`npm test` 纯逻辑）；后端 186 个 `@Test`（31 个类，全部纯逻辑，无 `@SpringBootTest`）。
- CI：`.github/workflows/ci.yml` 有 `mvn verify` 与前端 `typecheck + test`；**没有** Electron 打包、没有 e2e、没有集成测试。

### 1.3 判定口径

| 判定 | 含义 |
|---|---|
| 已实现 | 有代码、有对应界面，且链路可解释；不等于"有验收证据" |
| 半实现 | 有链路但缺关键环节（占位实现、只有单次调用、只有骨架 UI、只有提示词） |
| 缺失 | 文档承诺或链路必需，代码中不存在 |

"证据"列给 `文件:行号`；跨文件结论给多个锚点。

### 1.4 未覆盖与局限

- **没有运行应用**：Electron 窗口视觉、IndexedDB 真实迁移、麦克风/摄像头权限弹窗均未实测（沙箱限制，与 `STATUS.md` 记录一致）。
- **没有跑真实模型**：LLM/ASR/TTS/embedding 均为静态阅读；性能结论是复杂度推断，不是实测。
- **没有跑 `mvn`/`npm test`**：测试数字来自源码统计（`grep -c "@Test"`、`grep -c "test("`），可能与实际执行数有偏差。
- `styles.css`（5,711 行）与 `GirlfriendAvatar.tsx`（500 行）只做 grep 级检查。
- 语音方案文档 10–15 是**未提交**的工作区文件（`git status` 显示 `??`），我按"设计方案"而非"已定稿实现"对待。

---

## 2. 现状：已经做成了什么

### 2.1 能力矩阵

| 域 | 状态 | 实现要点 | 主要限制 |
|---|---|---|---|
| 认证与多用户隔离 | **已实现（强）** | BCrypt、token 只存 SHA-256 摘要、`CurrentUser` 强制服务端派生、越权统一 404（`SecurityConfig.java:43-49`、`TokenHasher.java:18-31`） | 无改密/重置/设备管理；无失败锁定与限流；每请求 2 次 DB 查 |
| 会话与轮次 | **已实现** | 每 (user, character) 唯一会话，唯一键兜底 + 并发补建（`ConversationProvisioner.java:49-74`）；消息游标分页；清空保留会话 | `GET /conversations` 查询里补建（GET 有写副作用）；`DELETE /conversations` 永远 409（死端点） |
| 流式回复 | **半实现** | SSE 事件名与契约一致，客户端可跨视图保持回合 | **先落库再重放**（`TurnStreamController.java:52-70`）；取消注册在生成之后；断连不感知 |
| 人设与角色 | **已实现（强）** | 结构化字段白名单 + 校验 + 官方/自定义双分支 + 边界文案永远最后（`CharacterPromptCompiler.java:53-153`）；乐观锁、12 上限、归档/恢复/彻底删除 | 列表无分页；`is_public` 是死分支；创建态不能导入立绘 |
| 形象与生图 | **已实现（链路脆弱）** | 矢量头像 + 7 槽位立绘 + 抠图 hero + 三档来源偏好 + AI 出图（主进程） | Key 在 localStorage；生图"停止"不真停；结果直接覆盖旧图 |
| 语音与通话 | **半实现（骨架）** | 系统 TTS / 云端 TTS + AnalyserNode 口型、录音→ASR→自动发送、豆包式通话 UI | 无流式 ASR、无分句 TTS、不能打断、无通话记录、视频仅占位 |
| 记忆（列表） | **半实现** | 关键词启发式抽取（喜欢/讨厌/今天…）+ 按角色筛选 + 删除 | 抽取质量低；与 chunk 双写不传播；无编辑；无分页 |
| 记忆星图 | **已实现（P1）** | 分块/向量/话题/实体、2D 星盘 + 3D 星链、忘记（软失效）、夜间重建、回填 | 每轮全量重算；无向量索引（内存全量余弦）；两视图重复实现 |
| 关系状态 | **已实现（简）** | mood ±、intimacy +1，有界；按角色隔离 | 规则过简；无历史曲线；并发首轮可能 500 |
| 主动消息 | **半实现** | 8 级门槛 + 质量闸门 + 冷却随温度（`ProactivePolicy.java:29-98`） | 只能手动点按钮；无调度/通知/未读；隐私与"忙"两道闸门硬编码 false |
| 活动事件 | **已实现（弱）** | 每轮 4 条元数据事件、可筛选 | 无分页/时间范围；traceId 全部 null；无开关与保留期 |
| LLM 配置（BYOK） | **已实现（中）** | 用户级配置 → ENV → 占位三级回退；Key 不回显；测试连接 | Key 明文入库；baseUrl 可指内网（SSRF）；上游报文回显 |
| 账号删除 | **已实现（中）** | MySQL 级联 + 会话失效 + 派生清理端口 + 审计事件 | 外部清理在事务内且吞异常；无 jobId/重试；Redis 用 `KEYS` |
| 搜索 | **缺失** | — | 仅侧栏按角色名过滤 |
| 录像/媒体会话 | **缺失** | 只有账号删除时的 S3 前缀清理（`S3AccountPurgePort.java`） | 无录制、无播放、无列表 |
| 视频与视觉信号 | **缺失** | 摄像头按钮 disabled 占位 | M3 全部未开始 |

### 2.2 与文档承诺的偏差（挑选会影响判断的）

| 文档说法 | 代码事实 | 影响 |
|---|---|---|
| README：前端"108 个单元测试通过" | 实际 133 个用例 / 21 个文件 | 数字过期，验收结论不可复核 |
| 验收清单："21 个纯逻辑测试" | 31 个测试类 / 186 个 `@Test` | 同上；且**零集成测试** |
| 验收清单 FR-2.2"流式回复 已验收" | 是"生成完再重放"的假流式 | 验收项名不副实，NFR-1 无法达成 |
| 验收清单 FR-4.3"记忆删除 已验收" | 删除不影响真实召回 | **验收结论错误**，已构成用户承诺违约 |
| 验收清单 FR-2.4"行为边界 待实现" | 提示词层已实现（边界文案），但无自动抽检 | 状态偏低，实际是"有实现无验证" |
| 验收清单 FR-3.3"流式语音 待实现" | 正确 | — |
| `docs/01:281` M1 出口含"用户全局搜索" | 未实现 | M1 并未真正出口 |
| `docs/02:283` M2 出口"FR-3 全部验收" | 只有单次 base64 链路 | M2 未出口 |
| `docs/07:4` "P1 核心项已实现" | 相符（草稿备份/角色卡统计/复制立绘未做，文档已注明） | — |
| `docs/08:365` "habit/summary 留位未实现" | 相符 | 诚实，保持 |
| `docs/09:512,557` "托盘/通知/未读/自动调度未实现且未伪装" | 相符 | 诚实，保持 |
| `docs/15` BYOK 语音方案（未提交） | 代码里只有 LLM BYOK | 方案与实现距离 1 个模块（凭据库 + 语音网关） |
| 契约：`docs/contracts/...:339`"轮次状态与流式输出通过 WebSocket 下发，不在 REST 中长轮询" | 实现是 SSE（`TurnStreamController.java:44`），无 spring-websocket 依赖 | 契约与实现是两套协议；照契约开发的人会做错 |
| 契约：物理删除经 `deletion_jobs` 级联（`:23-27`） | `AccountDeletionService.java:76-97` 全部走 MyBatis 逻辑删除；无 `deletion_jobs` 表 | "物理删除"承诺与实现相反 |
| `docs/03` 要求 ESLint/Prettier/Spotless、覆盖率 80%、`tests/` 目录、契约测试 | `package.json` 无 lint 依赖；无 jacoco；无 `tests/`；无契约测试 | 门禁写了但没执行，质量靠自觉 |
| `docs/07:4`"P0 已实现" | 同一文件 `:891-934` 的 27 个验收框**全部未勾** | 文档内部自相矛盾 |
| `docs/07:962` 要求补 ADR-0006（角色模型） | `docs/adr/` 仍只有 0001–0005 | 不可回退的决策没有留痕 |
| `docs/06:5` 指向 `PersonaService.boundaries()` | 方法实际在 `CharacterPromptCompiler.java:138-151` | 边界测试执行人找不到落点 |
| `docs/README.md` 已把 10–15 登记为正式文档 | `git status`：10–15 全部 untracked，`docs/README.md` 为 M | "以文档为准"的 6 份文件尚未入库，随时可丢 |
| 同一批冒烟证据 | 端口出现 48080 / 48081 / 48082 三种；测试数出现 108 / 111 / 133 三种 | 证据不可复现 |

---

## 3. 缺失功能（按优先级）

优先级口径见附录 B。成本：S ≤ 2 人日，M ≤ 1 周，L > 1 周。

### P0（不修就不能算"可交付产品"）

#### GAP-01 真流式与可取消的取消（P0 / M）

- **现状**：`TurnStreamController.java:52-56` 先 `turnService.send()`（含完整 LLM 调用与落库），**之后**才 `cancellationRegistry.register(turnId)`，再按 8 字符/20ms 重放（`:60-71`）。取消接口按 404 语义（`TurnController.java:57-64`）在生成期间必然查不到该 turn。
- **为什么是 P0**：这是产品的核心体感（"她在打字"）与唯一的中断手段。现在用户点"停止"只是少看几个字，模型调用与 token 费用照付；首字延迟 = 整段生成时间，NFR-1（P95 < 2s）在结构上不可能达标。
- **建议**：`ReplyGenerator` 增加 `stream(onDelta)`；先注册 turnId 再调用；SSE 增加 15s 心跳与 `onTimeout/onError/onCompletion` 注销；取消时 abort 上游 HTTP。
- **收益**：首字延迟从"整段"降到"首 token"（通常 300–800ms）；取消真正省钱；断连即止损。
- **依赖**：LLM 供应商需支持 `stream:true`（OpenAI 兼容端点普遍支持）。

#### GAP-02 记忆删除闭环（P0 / S–M）

- **现状**：召回只读 `memory_chunks`（`MemoryRecallService.java:149-157`），`memories` 仅在无 chunk 时作降级（`:174-204`）；`DELETE /memories/{id}` 只逻辑删 `memories`（`MemoryService.java:90-99`）；星图"忘记"只写 `invalid_at`（`MemoryGraphService.java:113-127`）。**三条删除路径互不传播。**
- **为什么是 P0**：`MemoryPanel.tsx:58` 明确告知用户"删除后她将不再记得"，这是隐私承诺，不是 UX 文案。当前行为是"删了但还记得"。
- **建议**：以 chunk 为唯一事实源；删除记忆时按 `source_message_id` 反查 chunk 并 `invalid_at`，同步删 `memory_recall_events`；`forget` 反向标记 `memories.status`；补一条集成测试钉住"删除后下一轮 prompt 不含该内容"。
- **收益**：消除承诺违约与合规风险；顺带把两套存储收敛成一套（见 OPT-02）。
- **风险**：若产品希望"记忆可编辑"，应保留 chunk 为底层、把 `memories` 降级为视图，避免继续双写。

#### GAP-03 用户全局搜索（P0 / M）

- **现状**：只有侧栏按角色名过滤（`ConversationSidebar.tsx:74-82`）；后端无 search 端点，`messages` 无 FULLTEXT 索引。
- **为什么是 P0**：PRD M1 出口项（`docs/01:123`、`docs/02:281`）。陪伴产品的核心资产是历史对话，不能检索等于"她说过的话会消失"。
- **建议**：MySQL 8 + `ngram` 全文索引覆盖 `messages.content` / `memories.content` / `activity_events` 摘要；`GET /api/v1/search?q&type&from&to&conversationId`，游标分页；前端全局搜索面板（Ctrl+K）+ 命中跳转；删除/清空时索引同步（同库天然一致）。
- **收益**：M1 真正出口；用户留存与"回忆"场景的入口；为 P2 运营检索打好同构基础。
- **成本提示**：ngram 中文分词对短句效果一般，需准备 30 条样例做验收（PRD FR-8.3 已要求）。

#### GAP-04 打包分发与自动更新（P0 / M）

- **现状**：`package.json` 只有 `dev/build/typecheck/test`，无 electron-builder/签名/发布；无 `electron-updater`；`index.html` 明确没放 CSP（`:6-8`）；无 `ErrorBoundary`。
- **为什么是 P0**：现在任何人都必须装 Node + 能跑 dev 才能用。这是"项目 → 产品"的门槛，且越晚补越贵（签名证书、更新通道、崩溃上报都要提前定）。
- **建议**：electron-builder 出 win nsis 安装包 + 便携版；`electron-updater` 走静态 feed；生产 HTML 注入严格 CSP（`script-src 'self'`）；加全局 ErrorBoundary + 崩溃日志；把安装包纳入 CI 产物。
- **收益**：可交付、可灰度、可回滚；CSP 同时把 P0 级 XSS 的利用面砍掉一半。

#### GAP-05 语音实时链路（P0 / L）

- **现状**：`voice-turns` 是"整段录音 base64 → 一次 ASR → 一次 TTS → base64 回传"（`VoiceTurnController.java:36-62`）；前端 `voiceTurn` 客户端函数**从未被调用**（`api/client.ts:525-530`）；通话页走的是主进程 `/audio/transcriptions` + `/audio/speech`。无 partial 字幕、无分句、无 barge-in。
- **为什么是 P0**：这是产品名的字面承诺（"音视频陪伴"）。现在的通话体验是"说完等 5 秒，她整段说完你不能插嘴"。
- **建议**：分两步。第一步（S/M）：文本轮次已有的 SSE 复用到通话页——LLM 增量 → 按句切分 → 逐句 TTS → 播放队列可清空（打断）。第二步（L）：ASR 改流式（WebSocket 或供应商流式接口）+ 中间稿字幕；`docs/15` 的 BYOK 凭据库落地。
- **收益**：首音延迟与打断是语音体验的两个生死指标；分句播放能把 P95 压到 2s 内（NFR-1）。
- **取舍**：先做"伪流式"（分句 TTS）比为流式 ASR 重构划算，建议按此顺序。

#### GAP-06 凭据安全（P0 / M）

- **现状**：token 明文 localStorage（`auth/tokenStore.ts:2-10`）；TTS/ASR/生图三个 Key 明文 localStorage（`voice/voiceConfig.ts:1-6`、`portrait/generationConfig.ts:16-18`）；登出/删账号不清理这三项（`App.tsx:438-457,459-495`）。
- **为什么是 P0**：与 `docs/15` 自己定的"前端永远不直接调厂商、Key 只提交给后端、不回显"原则直接冲突；共享电脑上换账号后旧 Key 仍可读。
- **建议**：token 走主进程 `safeStorage` + 短时内存态；厂商 Key 统一收到服务端 `user_provider_credentials`（AES-GCM，AAD 绑定 userId+provider），桌面端只保留 `configured/last4`；登出时清理本机全部派生凭据。
- **收益**：把"一次 XSS = 三个付费 Key + 登录态"降为"一次 XSS = 一个短时 token"；与 BYOK 文档收敛。

### P1（决定"像不像一个成熟产品"）

| ID | 缺失能力 | 现状证据 | 为什么值得做 | 预期收益 | 成本 |
|---|---|---|---|---|---|
| GAP-07 | 主动触达闭环（托盘/通知/未读/调度） | 只有手动按钮（`ChatView.tsx:480-500`）；全仓无 `Notification`/Tray；除记忆夜间任务外无 scheduler | "她会主动找你"是差异化卖点，现在需要用户自己点"让她先开口" | 留存与日用频次的最大杠杆；把已有 8 级策略真正跑起来 | M |
| GAP-08 | 数据权利：导出 / 活动开关 / 保留期 / 单会话删除 | 只有删账号；`FR-6.5` 未做；`DELETE /conversations` 恒 409 | 合规底线，也是用户信任的抓手。**注：PRD 把 FR-6.5 标为 P0，我这里降为 P1**，理由是当前是单机桌面、追踪数据只在本机，风险与"对外分发"绑定；一旦要分发，立刻升 P0 | 可对外说明的数据承诺；降低"不敢聊"的心理门槛 | M |
| GAP-09 | 消息级操作（复制/重发/重新生成/删除单条/引用） | 消息 `<li>` 内无任何操作（`ChatView.tsx:595-657`）；`Message` 无 `status/editedAt` | 日常对话的高频微操作，缺了会显得"只能看不能用" | 单条返工成本从"重说一遍"降到一次点击 | S–M |
| GAP-10 | 可观测性（traceId 串联、指标、结构化日志） | `activity.trace_id` 19 处调用全传 null；无 micrometer；`X-Request-Id` 只回错误体 | 现在排障只能"看日志猜"；NFR-6 未达 | 故障定位从小时级到分钟级；为限流/容量提供依据 | M |
| GAP-11 | 限流与配额 | 全仓无限流（grep 无命中）；`messages.token_count` 列从不写 | 开放注册 + 平台 Key = 额度被白嫖；语音接口无体积上限 | 直接消掉成本 DoS 与 OOM 面 | S–M |
| GAP-12 | 账号体系（改密/找密/设备管理） | 仅 4 个认证端点；`user_sessions` 支持多行但无列表/吊销 | 用户改不了密码，换机无法踢旧设备 | 账号可信度；为多端做准备 | M |
| GAP-13 | 媒体会话与录像（M3） | 仅有 S3 前缀清理；无 `/recordings`、无播放、无列表 | PRD FR-5.4/5.5 承诺；也是"回忆"资产 | 若做，是强情感钩子；若不做，**应显式从路线图移除并改文案** | L |
| GAP-14 | 内容安全审核（服务端） | 只有提示词边界（`CharacterPromptCompiler.java:147-153`）；主动消息有闸门，普通回合零校验（`TurnService.java:99-103`） | 合规与品牌风险；与主动消息的双标很明显 | 降低越界内容进库与回放的概率 | S–M |

### P2（可以做，但不做也能活）

| ID | 能力 | 说明 |
|---|---|---|
| GAP-15 | 运营跨用户检索 + 审计 | ADR-0002 已定边界，`users.role` 无 `@PreAuthorize` 使用，等于角色形同虚设；先补权限基建再补检索 |
| GAP-16 | 角色分享 / 导入导出 | 只有服务端 duplicate；无 JSON/二维码/角色卡图 |
| GAP-17 | 每角色独立音色 | `docs/07:48` 已明确 P2 |
| GAP-18 | 主题/暗色/字号、i18n、无障碍 | 单一浅色主题；全中文硬编码；星图不可键盘操作；消息区无 live region |
| GAP-19 | 本地模型（Ollama）与成本面板 | LLM 已是 OpenAI 兼容，接 Ollama 只需文档与一键预设；用量面板依赖 GAP-11 的计量 |
| GAP-20 | 备份恢复 | 无 dump/校验/RPO·RTO 文档，上线前置 |

---

## 4. 建议新增的功能（文档尚未承诺）

按"感知价值 / 成本"排序。这些不是补漏，是让产品更像"她"。

| ID | 功能 | 一句话设计 | 为什么是这个产品需要的 | 成本 |
|---|---|---|---|---|
| NEW-01 | **场景模式（睡前/通勤/加班/周末）** | 聊天页一键切换场景，改变人设提示的"当下情境"与气泡节奏 | 已有 `expressionTemperature` 与主动场景（share/follow_up/reminder），再接一层"此刻在做什么"几乎零后端成本，体感提升很大 | S |
| NEW-02 | **语音留言（异步语音消息）** | 她发一条 5–15 秒语音，用户可晚点听；不要求实时通话 | 比实时通话便宜一个量级，且解决"不在电脑前"的陪伴断点；TTS 链路已具备 | M |
| NEW-03 | **回忆卡片 / 周报** | 用记忆星图数据生成"这周她记得的三件事"，可收藏 | 把已经建好的记忆资产变成用户可见的价值，直接提升记忆功能的"被感知度" | S–M |
| NEW-04 | **关系里程碑与心情日历** | mood/intimacy 历史曲线 + 纪念日（第一次聊天、连续 N 天） | 现状只有一个数字，没有"我们在变好"的叙事；数据已在 `user_character_states`，只缺历史表 | M |
| NEW-05 | **桌面常驻小窗 / 悬浮头像** | 缩小到角落的小窗，她会眨眼、偶尔说一句 | 这是"陪伴"产品最自然的形态，也是 GAP-07 主动触达的载体 | M |
| NEW-06 | **"她的一天"日常播报** | 每天一条她自己生活的短记（插画师/猫/天气），不索取回复 | 让角色有"不在你身边时也在生活"的可信度；用低成本模板 + 少量 LLM 即可 | S |
| NEW-07 | **话题卡与破冰建议** | 冷场时给 3 个"接着聊"的选项（现已写死 3 条，`ChatView.tsx:78`） | 把写死建议换成基于最近对话 + 记忆的动态建议 | S |
| NEW-08 | **记忆人工纠正（"记错了"）** | 对单条记忆标记错误并输入更正，走"旧条失效 + 新条写入" | PRD FR-4.5 原定 P2，但它是记忆可信度的关键；与 GAP-02 同一套机制 | M |
| NEW-09 | **多角色群聊/串门** | 两个角色同场（需确认是否越界 PRD 非目标） | 高传播性，但会冲击"一对一唯一会话"的核心模型，**先决策再动手** | L |
| NEW-10 | **可分享的"她的话"卡片** | 选中一段对话生成图片卡片（带 AI 生成标识） | 低成本传播物料，顺带满足导出 AI 标识要求 | S |

---

## 5. 值得优化的现有功能

| ID | 现状 → 建议 | 预期收益 | 成本 |
|---|---|---|---|
| OPT-01 | **SSE 假流式**：整段生成后 8 字符/20ms 重放（`TurnStreamController.java:58-71`）→ 真流式 + 心跳 + 取消前置 | 首字延迟、取消费用、断连止损 | M |
| OPT-02 | **记忆双写**：`memories`（关键词启发式）与 `memory_chunks`（每轮全量文本）并行 → 收敛为一套，`memories` 降级为视图或删除 | 消除 GAP-02 的根因；少一条写入路径与一套接口 | M |
| OPT-03 | **星图重复实现**：2D 786 行 + 3D 687 行，各自 `fetch/rebuild/forget/detail` 一份（`MemoryGraphPanel.tsx:391`、`MemoryGraph3DPanel.tsx:191`）→ 抽 `useMemoryGraph` + 共享详情面板；3D 若保留则用 `<g transform>` 近似旋转 + rAF 合并 | 少一半维护面；拖拽掉帧消失 | M |
| OPT-04 | **每轮全量重算星图**：`GraphProjector.java:137-189` 双重循环余弦（≤300 → 45k 次点积），每次重建重新序列化整张快照 → 只写 chunk、图异步/按 N 轮重建；增量写边 | 单轮 CPU 与响应时间显著下降 | M |
| OPT-05 | **召回无索引**：每轮 `LIMIT 300` 拉回 `embedding_json` 全量解析（`MemoryRecallService.java:149-157`）→ 结构化向量列 + 近似索引，或先按关键词/实体预过滤再打分 | 记忆规模上万后仍能守住 300ms 预算 | L |
| OPT-06 | **`App.tsx` 1024 行 / 18 个 useState / 无路由** → 引入路由（或至少 `useAppShell`）+ 请求层（TanStack Query 或自建 `useResource`）收敛 loading/error/refetch | 竞态与"切会话丢草稿"类缺陷从结构上消失 | M |
| OPT-07 | **切会话丢输入**：`App.tsx:886` 用 `key={conversationId}` 重挂载（`ChatView.tsx:51-52` 的"保留输入框"设计失效）→ 草稿按 conversationId 存模块级 store | 用户不再重复打字 | S |
| OPT-08 | **发送中禁止输入**（`ChatView.tsx:708`）→ 输入框保持可用 + 排队 | 连续对话手感，降低等待焦虑 | S |
| OPT-09 | **请求层无超时/取消/重试**（`api/client.ts:142-175`）→ `AbortSignal.timeout` + 卸载 abort + GET 幂等重试一次 + 错误四分类 | 消灭永久 loading | S |
| OPT-10 | **9 处 `window.confirm/prompt`**（`App.tsx:460,519`、`MemoryPanel.tsx:58`、`CharacterHub.tsx:95,107` 等）→ 自绘 ConfirmDialog + 删除后 5s 撤销 | 可访问、可样式化、误删可救 | S |
| OPT-11 | **生图"停止"不真停、结果直接覆盖**（`GenerationPanel.tsx:101-105,358-368`）→ 预览确认 + 上一张可回滚 + 主进程 abort | 不再毁掉调好的表情图 | S |
| OPT-12 | **活动事件同步写 4 条/轮**（`TurnService.java:184-203`）→ outbox 异步落库；加保留期与分区 | 审计不再可能拖垮对话；表不再无界增长 | M |
| OPT-13 | **会话列表预览是硬编码**"还没有消息/最近有回复"（`ConversationSidebar.tsx:162`）→ 存 `lastMessagePreview` | 侧栏信息密度决定"点哪个"的效率 | S |
| OPT-14 | **活动页固定 50 条 + 快速切类型乱序覆盖**（`ActivityPanel.tsx:57-71`）→ 游标分页 + 请求序号 | 数据增长后不静默截断 | S |
| OPT-15 | **手写 REST client 609 行** → springdoc 生成 OpenAPI + `openapi-typescript` 生成 client | 契约漂移从"人肉同步"变成"编译报错" | M |
| OPT-16 | **`styles.css` 5,711 行单文件** → 按 feature 拆分 + design tokens（CSS 变量） | 改一处不牵全身；主题化（GAP-18）的前提 | M |
| OPT-17 | **前端零组件/e2e 测试**：133 个纯逻辑用例，UI 全靠类型检查 → Playwright + Electron 覆盖"登录→发消息→流式→停止→切角色"5 条主路径 | 目前最容易坏的恰恰是没测的部分 | M |
| OPT-18 | **后端零集成测试**（无 `@SpringBootTest`/Testcontainers）→ 补 MySQL 容器的 6 条契约测试：越权 404、幂等重放、乐观锁 409、删账号后 401、SSE 事件序、Flyway 从零迁移 | 钉住最易回归的部分 | M |
| OPT-19 | **验收证据过期**：测试数 108/111/133 三种口径、"已验收"与事实不符 → 验收清单每条挂可执行的证据命令与结果，数字由脚本生成而非手写 | 接手成本与判断准确性 | S |
| OPT-20 | **prompt 硬编码在 Java** → 迁到 `resources/prompts/*.md` 带版本号 | 人设迭代无需改代码、可 A/B | S–M |
| OPT-21 | **验收与门禁治理**：`test` 脚本改成 glob（`tests/**/*.test.ts`）→ 自动发现；补 ESLint/Prettier；CI 加 MySQL service + `@SpringBootTest`；验收清单每条挂证据链接；端口与测试数统一到一个常量 | "全绿"恢复可信；这是后续所有排期决策的前提 | S–M |
| OPT-22 | **文档收敛**：`STATUS.md` 732 行拆 `CHANGELOG.md`；把 10–15 提交或明确标"草稿"；契约从 WebSocket 改为 SSE（或反之）并同步删除矩阵；补 ADR-0006/0007（角色模型、记忆模型） | 接手成本；避免按错文档开发 | S |

---

## 6. 明显问题（缺陷清单）

### P0

| ID | 问题 | 证据 | 影响 |
|---|---|---|---|
| ISS-01 | **记忆删除不传播**（与 GAP-02 同一根因） | `MemoryService.java:90-99`、`MemoryRecallService.java:149-157` | 隐私承诺违约；用户信任受损 |
| ISS-02 | **取消链路失效**：注册晚于生成；SSE 无 `onCompletion/onError` | `TurnStreamController.java:52-56,49-91` | "停止"无效；白跑算力 |
| ISS-03 | **凭据明文 + 登出不清理第三方 Key** | `tokenStore.ts:2-10`、`voiceConfig.ts:1-6`、`App.tsx:438-457` | 共享电脑/XSS 直接拿走 token 与 3 个付费 Key |
| ISS-04 | **用户可配 baseUrl 造成 SSRF，且回显上游响应** | `UserLlmSettingsService.java:158-191`（只校验 scheme/host）、`LlmHttpClient.java:68-78` | 任意登录用户探测内网并读回片段；多租户部署时为高危 |
| ISS-05 | **无限流/配额 + 平台 ENV Key 兜底 + 开放注册** | 全仓无限流；`LlmDefaults.java:38-49` | 注册脚本即可白嫖模型额度；Hikari 10 连接被打满 |
| ISS-06 | **无 CSP + 无导航白名单** | `index.html:6-8`；`main/index.ts` 只有 `setWindowOpenHandler`（`:125-128`），无 `will-navigate` | 窗口被导航到外部页面后 preload 仍注入，等于把"任意出网 + 带 Key"交给外部页面 |

### P1

| ID | 问题 | 证据 | 影响 |
|---|---|---|---|
| ISS-07 | **流式无幂等，重试即重复消息/重复记忆** | `TurnController.java:43-54` 有幂等，`TurnStreamController.java:44-91` 无 | 弱网重试后关系 +2、记忆重复 |
| ISS-08 | **每轮同步做 embedding + 全量图重建，且在事务外无补偿** | `TurnService.java:108-114`、`MemoryChunkService.java:74,99-101` | 单轮 p95 被拉长；失败只 `log.warn`，记忆永久缺失 |
| ISS-09 | **星图每帧全量重投影**（3D 拖拽 `setCamera` → 全量重算） | `MemoryGraph3DPanel.tsx:316-329,371-391` | 节点上百后拖拽掉帧 |
| ISS-10 | **星图不可键盘操作、消息区无 live region** | `MemoryGraphPanel.tsx:338-357`；`ChatView.tsx:644-645` 仅 typing 有 `role=status` | 键盘/读屏用户无法使用核心功能 |
| ISS-11 | **会话列表/消息错误处理不一致**：200 响应直接 `JSON.parse`，网关返回 HTML 时把 `Unexpected token '<'` 展示给用户 | `api/client.ts:173-174` | 线上故障时错误文案不可读 |
| ISS-12 | **删账号的外部清理在 DB 事务内且吞异常** | `AccountDeletionService.java:72-107`、`S3AccountPurgePort.java:59-61`、`RedisAccountPurgePort.java:35`（`KEYS`） | S3 对象未删仍返回 204；Redis 大 keyspace 阻塞 |
| ISS-13 | **关系状态并发首轮 500**：select-then-insert，唯一键冲突未捕获 | `RelationshipService.java:23-33` | 首轮双击即可能报错 |
| ISS-14 | **健康检查误杀**：Redis 健康指示器恒生效，未使用 Redis 时不可用即 DOWN | `application.yml:24-29`；无 `readiness.include` 配置 | 部署后 Pod 反复重启 |
| ISS-15 | **"在线"写死**、主动消息"她在休息"与之矛盾 | `ChatView.tsx:457`；`ProactivePolicy.java:44-46` | 世界观穿帮 |
| ISS-16 | **无错误边界**，任一渲染异常白屏 | 全仓无 `ErrorBoundary` | 只能重启应用 |
| ISS-17 | **彻底删除角色不清理本机立绘**（删账号会清，删角色不会） | `App.tsx:670-683` vs `:476-483` | IndexedDB 残留；隔离承诺打折 |
| ISS-18 | **"查看原对话"死代码**：记忆→来源消息闭环断开 | `MemoryPanel.tsx:140-149` 未传 `onOpenConversation` | 记忆不可溯源 |
| ISS-19 | **语音接口无体积上限 + Base64 双向放大** | `VoiceTurnRequest.java:5-8`、`VoiceTurnController.java:42,60` | 单请求可致 OOM |
| ISS-20 | **GET 有写副作用**（会话补建、星图重建） | `ConversationService.java:71`、`MemoryGraphService.java:56-67` | 语义错误；N+1；缓存/重试不可靠 |
| ISS-21 | **`memories.status`、`token_count`、`memory_edges` 等死列/死表** | `Memory.java:26`、`Message.java:32`、`MemoryGraphPurgeService.java:37,49` | 误导后续开发者；schema 熵增 |
| ISS-22 | **`PRIVACY_DISABLED`/`USER_BUSY` 永不触发**（硬编码 false） | `ProactiveService.java:234-235` | 用户无法关闭主动消息；两个错误码是死代码 |
| ISS-23 | **验收门禁失真：`npm test` 只跑白名单里的 21 个文件** | `apps/desktop/package.json:12`（硬编码文件名列表） | 新增测试永不运行，"全绿"不代表覆盖；当前 `memorygraph` 与全部组件都无心测试 |
| ISS-24 | **契约与实现两套协议**（WebSocket vs SSE）、删除语义相反（物理 vs 逻辑） | 契约 `:339`、`:23-27` vs `TurnStreamController.java:44`、`AccountDeletionService.java:76-97` | 按契约开发即错误；后续补 WebSocket 时还要再迁移一次 |
| ISS-25 | **23 项"已实现"里混着"只有编译通过"**：验收清单的组件项证据几乎都是 `tsc --noEmit` | `docs/04-acceptance-checklist.md:68-80`；`07:891-934` 27 个验收框全未勾 | 状态判断失真，排期与风险都会偏 |
| ISS-26 | **事件类型未登记**：`character.*`、`proactive.sent`、`conversation.cleared` 等 8 个类型不在契约基线里 | 契约 `:263` 要求登记；`CharacterService.java:178-384` 等已写 | 按契约枚举做的审计/索引会漏事件 |

### P2

| ID | 问题 | 影响 |
|---|---|---|
| ISS-27 | 活动事件与业务同事务，审计故障会拖垮对话（`TurnService.java:184-203`） | 审计反噬主链路 |
| ISS-28 | 分页缺失：`/memories` 无 limit、`/characters` 无分页、`/activity-events` 无 cursor 与时间范围 | 数据增长后不可用 |
| ISS-29 | 索引错配：消息查询 `ORDER BY id` 但只有 `(conversation_id, created_at)` 索引 | 大会话 filesort |
| ISS-30 | 多实例不可用：取消注册表/幂等 Map 在进程内、夜间任务无锁、雪花 ID 需手工注入 | 只能单机 |
| ISS-31 | SQL 日志打开后会把 `api_key`/`password_hash` 带进日志 | 日志泄敏 |
| ISS-32 | 时区/文案硬编码（`ZoneId.systemDefault()`、全中文） | 跨时区"安静时段"错位；无法出海 |
| ISS-33 | 错误码不统一（404 有 `NOT_FOUND`/`MEMORY_NOT_FOUND`；SSE 抹平业务码） | 前端无法稳定分支 |
| ISS-34 | 独立实现重复：`requireOwned` 三份、消息落库+审计两份 | 改一处漏三处 |

---

## 7. 更好的替代方案（设计取舍）

这一节只列"我认为现在的做法不是最优、且有明确更优解"的地方。

### 7.1 记忆：双写 → 单一事实源

- **现方案**：`memories`（关键词启发式，用于列表与降级）+ `memory_chunks`（每轮全文，用于召回与星图）。
- **问题**：两套语义不同的"记忆"，删除不传播，列表里看到的和实际影响回复的不是同一批数据。这是当前最严重的架构债。
- **替代**：`memory_chunks` 作为唯一事实源（它信息更全）；`memories` 降级为"从 chunk 投影出的可读条目视图"，或直接删除该表与 `/memories` 端点，把"记忆列表"改成"chunk 摘要列表"。删除 = 对 chunk 写 `invalid_at` + 删召回日志，一处生效。
- **代价**：需要一次数据迁移（可接受，用户量小）；前端记忆页文案要改。
- **建议**：与 GAP-02 一起做，不要分两次。

### 7.2 对话状态：4 套 store → 1 个 reducer + 1 个查询层

- **现方案**：`pendingStore`（乐观消息）、`turnSessionStore`（回合）、`turnSessions`（组合根）、`messagePages`（分页去重）+ `App.tsx` 18 个 `useState` 手工编排刷新。
- **问题**：`refreshConversations()` 与 `chatVersion` 强刷（`App.tsx:358-365`）本质是"手动失效"；这类代码最容易在并发下选择旧值（`App.tsx:368-393` 的自动选会话与 `handleSwitchCharacter` 竞争）。
- **替代**：一个 `chatReducer`（消息列表/分页游标/在途回合/草稿/错误）放在模块级 store，UI 用 `useSyncExternalStore` 订阅；服务端状态交给 TanStack Query（`staleTime` + `invalidateQueries`），把"轮次结束后强刷整页"换成"失效指定 query"。
- **代价**：一次性重构 ~800 行；现有纯逻辑测试大多可复用（`turnSessionStore.test.ts` 19 例）。
- **建议**：在 GAP-09（消息级操作）之前做，否则消息操作会再长出第五套状态。

### 7.3 星图：双视图自研 → 一个视图 + 可选 3D

- **现方案**：2D 极坐标 SVG（786 行）+ 3D 透视投影 SVG（687 行），各自实现取数、重建、忘记、详情。
- **问题**：P1 功能吃掉的时间已经超过搜索。且 3D 用 SVG 手写投影，节点一多就掉帧，还得自己实现相机、命中测试、可访问性。
- **替代**：保留 2D 作为唯一主视图（信息表达更清楚）；3D 若要保留，用成熟渲染（three.js points / cosmos.gl）或直接砍掉，改成"时间轴 + 星座分组"的 2D 变体。
- **代价**：损失一点"惊艳感"；节省约 1000 行与后续所有交互维护。
- **建议**：除非有明确的用户需求证据，**建议砍 3D**，把时间投到 GAP-03/07。

### 7.4 活动事件：同事务写入 → outbox

- **现方案**：每轮 4 条 `activity_events` 与消息同事务插入（`TurnService.java:184-203`）。
- **问题**：审计是旁路数据，不该有权力让对话失败；表无保留期也会无界增长。
- **替代**：写 `activity_outbox`（同事务、单行、payload 小），后台批量消费入 `activity_events`；加 90 天分区/清理任务。
- **代价**：多一张表与一个消费者；事件延迟秒级（可接受）。
- **建议**：与 GAP-10（可观测性）一起做。

### 7.5 前端请求：手写 client → 契约生成

- **现方案**：`api/client.ts` 609 行手写类型与调用，后端无 OpenAPI。
- **问题**：契约漂移只能靠人眼；已有先例（`MemoryChunkDetail.conversationId` 声明 `string` 但后端可能给 null，前端按"空串"判断，`MemoryGraphPanel.tsx:545`）。
- **替代**：springdoc 输出 `/v3/api-docs` → CI 生成 `api-types.ts`；请求层只写"错误分类 + 超时 + 鉴权"。
- **代价**：需要给 DTO 补注解；生成产物需纳入 lint。
- **建议**：在契约冻结前做（现在正是时候）。

### 7.6 九处确认框：原生弹窗 → 自绘 + 撤销

- **现方案**：9 处 `window.confirm/prompt`，包括"彻底删除角色"要求输入名字。
- **问题**：Electron 里是操作系统原生弹窗（样式突兀、不可本地化、不可访问），且"删了无法恢复"没有退路。
- **替代**：统一 `ConfirmDialog`（危险色、需输入名、焦点陷阱）+ 删除类操作 5 秒撤销（软删除窗口，正好 `memories` 已是逻辑删除）。
- **代价**：S 级；但要注意撤销窗口与"物理删除"承诺的边界（撤销期内不真删）。
- **建议**：与 GAP-08（数据权利）一起做，撤销是"删除"体验的一半。

### 7.7 语音：先做"分句伪流式"，而不是等流式 ASR

- **现方案**：整段 ASR + 整段 TTS。
- **问题**：真正卡住体验的是"她说完你才能说"和"等整段生成"。这两个都可以在不改 ASR 的前提下解决。
- **替代**：LLM 增量（GAP-01）→ 按句切分 → 逐句 TTS → 播放队列可清空；用户一开口立即清空队列（barge-in）。流式 ASR 放到第二步。
- **代价**：句子边界的 TTS 拼接会有轻微不自然（可用 30ms 淡入淡出缓解）。
- **建议**：这是投入产出比最高的一条语音路径。

---

## 8. 建议路线

### 批次一（1 周，修承诺 + 补地基）

`ISS-01/GAP-02` 记忆删除闭环 → `GAP-01/ISS-02` 真流式 + 取消 → `ISS-03` 凭据清理 → `OPT-09` 请求超时 → `ISS-15` "在线"文案 → `OPT-21` 测试脚本改 glob（顺手，10 分钟）。

出口判据：删除一条记忆后，下一轮 prompt 里搜不到该内容（有集成测试）；点"停止"能中断上游请求；登出后 `localStorage` 无任何 Key；新增测试文件不改脚本也会被执行。

### 批次二（2 周，补功能 + 降风险）

`GAP-03` 搜索 → `GAP-04` 打包分发 + CSP → `ISS-04/ISS-05/GAP-11` SSRF 收敛 + 限流 → `OPT-07/OPT-08` 切会话保草稿 + 发送中可输入 → `OPT-10` 自绘确认框 → `OPT-22` 契约与文档收敛。

出口判据：能给别人一个安装包；能搜到三个月前的一句话；注册脚本无法白嫖模型额度；契约里的协议与实现一致。

### 批次三（3–4 周，产品化）

`GAP-07` 主动触达（托盘/通知/未读/调度）→ `GAP-08` 导出与活动开关 → `GAP-05` 语音分句流式 → `OPT-06/OPT-02` 状态与记忆收敛 → `GAP-10` 可观测性。

出口判据：关掉窗口也能收到她的消息；能导出全部对话；通话能在 2 秒内出声且可打断；线上问题能从 traceId 追到 SQL。

### 暂缓（明确不做，或等决策）

`GAP-13` 录像/视频、`GAP-15` 运营检索、`NEW-09` 多角色同场、3D 星图后续增强。

---

## 9. 需要你补充的信息

按"影响多大"排序。每条给了我的默认建议，你不回我就按默认走。

| # | 问题 | 为什么影响评估 | 我的默认建议 |
|---|---|---|---|
| Q1 | **产品定位**：自用 Demo / 小圈子分发 / 公开开源产品？ | 决定"分发、合规、密钥、限流"是不是 P0 | 按"小圈子分发"排期（即 GAP-04/06 是 P0，运营能力 P2） |
| Q2 | **语音供应商与预算**：百炼 CosyVoice、Breeze 是否已开通？谁付费？ | 决定 GAP-05 是"两周"还是"两个月" | 先接一家（CosyVoice），Breeze 唱句按 `docs/15` 默认关闭 |
| Q3 | **视频/录像到底做不做？** | 直接影响 M3 是否从路线图移除、文案怎么改 | 短期不做，路由图标注"已移除"，通话页摄像头按钮删除或明确"即将上线" |
| Q4 | **目标平台**：仅 Windows，还是 Windows + macOS？ | 决定打包与签名工作量（差 1–2 周） | 先 Windows，架构保留 macOS |
| Q5 | **单机还是多实例部署？** | 决定雪花 ID、夜间任务锁、取消/幂等是否必须外置 | 单机（桌面自带），但把取消/幂等改 Redis 以留后路 |
| Q6 | **"记得"的目标程度**：是"能引用三个月前的一句话"还是"大概记得偏好"？ | 决定 OPT-05（向量索引）的优先级 | 先做到"能搜到 + 能引用最近记忆"，索引延后 |
| Q7 | **主动消息希望到什么程度**：只在打开应用时？还是要系统通知？ | 决定 GAP-07 是否需要后台常驻/开机自启 | 先做"应用内未读 + 托盘红点"，系统通知随后 |
| Q8 | **数据保留与删除承诺**：对话永久保留？记忆 7 天？ | 决定 GAP-08 与 `docs/15` 的 7 天 TTL 是否统一 | 对话永久（用户可删），语音/唱句 7 天 |
| Q9 | **是否能由你本机跑一次 `scripts/demo.ps1` 与 `npm test` 并回传结果？** | 我的验收结论全部来自静态阅读 | 需要；否则"已验收"只能按文档采信 |
| Q10 | **是否接受引入新依赖**：react-router / TanStack Query / three.js / electron-builder / springdoc / Testcontainers？ | 决定 OPT-06/03/15/17 的路线 | 接受前四项（都是省时间的），three.js 与 Testcontainers 可选 |
| Q11 | **视觉基准**：`docs` 里的豆包参考之外，是否有 Figma/截图？ | 影响 UI 优化项的判断标准 | 无则沿用当前粉色主题，只做一致性打磨 |
| Q12 | **合规要求**：AI 生成标识、未成年人保护、内容边界、是否需要备案？ | 决定 GAP-14 与文案是否要改 | 保留页脚"内容由 AI 生成"，补服务端输出审核 |

---

## 附录 A：本次实际读过的文件

**前端（renderer/main/preload）**：`App.tsx`、`ChatView.tsx`、`ConversationSidebar.tsx`、`MemoryPanel.tsx`、`ActivityPanel.tsx`、`SettingsPanel.tsx`、`LlmSettingsCard.tsx`、`character/{CharacterHub,CharacterEditor,IdentityPanel,AppearancePanel,PersonalityPanel,FamilyPanel,CharacterSwitcher,characterTypes,useCharacters,expressionTemperature}.tsx/ts`、`portrait/{CallView,PortraitStudio,GenerationPanel,AvatarPortrait,cutout,expression}.tsx/ts`、`memorygraph/{MemoryGraphPanel,MemoryGraph3DPanel}`、`voice/{VoiceSettings,voiceConfig,audio,tts}`、`avatar/*`、`chat/*`、`api/{client,sse,turnStream}`、`auth/tokenStore.ts`、`main/{index,tts,asr,imagegen}.ts`、`preload/index.ts`、`renderer/index.html`、`package.json`、`README.md`。

**后端**：全部 15 个 Controller、`TurnService`/`TurnStreamController`/`TurnCancellationRegistry`、`MemoryService`/`MemoryRecallService`/`MemoryChunkService`/`MemoryGraphService`/`GraphProjector`、`ProactiveService`/`ProactivePolicy`/`ProactiveQualityGate`、`RelationshipService`、`UserLlmSettingsService`/`LlmHttpClient`、`AccountDeletionService`/`S3AccountPurgePort`/`RedisAccountPurgePort`、`CharacterPromptCompiler`、`SecurityConfig`/`TokenAuthenticationFilter`/`CurrentUser`、`application.yml`、V1–V6 迁移、31 个测试类清单。

**文档**：`README.md`、`CONTEXT.md`、`STATUS.md`、`docs/README.md`、`01`、`02`、`03`、`04`、`06`、`07`、`08`、`09`、`14`、`15`、`contracts/`、`.github/workflows/ci.yml`、`scripts/demo.ps1`。

## 附录 B：优先级口径

| 级别 | 判据 |
|---|---|
| **P0** | 满足任一：① 已对外承诺但行为不符（信任/合规）；② 核心链路（对话/语音）的结构性缺陷；③ 阻碍"交付给他人使用"；④ 安全面（凭据/SSRF/无 CSP） |
| **P1** | 决定产品成熟度与留存：缺失会让用户明显感到"不完整"，或让故障无法定位与止损 |
| **P2** | 增强与打磨：有更好，不做也能正常使用 |

成本：**S** ≤ 2 人日；**M** ≤ 1 周；**L** > 1 周（含联调与验收）。

评分为三维加权（此处不展开公式）：`用户可感知价值 × 0.5 + 承诺缺口/风险 × 0.35 + 依赖阻塞度 × 0.15`，成本作为分母做性价比排序。
