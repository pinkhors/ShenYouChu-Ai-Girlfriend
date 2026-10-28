# 项目状态交接（2026-10-27 收工）

## 工作约定

- 只操作 `D:\XiaoChenProject\ShenYouChu-Ai-Girlfriend` 内文件；
- 用户不再写代码，后续实现由 AI 完成，目标：跑通 Demo 并验收；
- 所有变更提交到本地 Git（`main`），远端由用户按需 `git push`。

## 已完成并验证

- 文档基线：PRD、技术路线、开发规范、数据与接口契约、术语表、ADR-0001～0005（`docs/`）。
- 后端 `services/core`：Spring Boot 3.3.5 + Java 17 + MyBatis-Plus 3.5.9；Flyway V1/V2；注册/登录/退出/me、会话 CRUD、活动事件；`userId` 只来自认证上下文。
- **M0 联调已通过**（UUID 时期）：健康 `UP`、注册、越权 404、重复注册 409、匿名 401。脚本：`scripts/verify-m0.ps1`。
- 基础设施：`docker-compose.yaml` 默认 profile（MySQL/Redis）+ `full` profile（etcd/Milvus/legacy MinIO）；本机 5 个容器此前均启动成功。
- 雪花 ID 重构已提交：`BIGINT` + `ASSIGN_ID`，worker/datacenter 走 `SNOWFLAKE_WORKER_ID` / `SNOWFLAKE_DATACENTER_ID`，API ID 输出字符串；V1 已重写，ADR-0005。
- 桌面端 `apps/desktop`：Electron + React + TypeScript 骨架（登录/注册、会话列表/创建/删除），代码已提交。

## 当前阻塞点

1. **桌面端依赖安装**：
   - pnpm 12 会触发 Rust worker 栈溢出，且默认拦截 `electron` / `esbuild` 构建脚本（`ERR_PNPM_IGNORED_BUILDS`）；
   - `node_modules` 由 pnpm 创建后，沙箱无法删除（Permission denied），因此不能就地切 npm；
   - npm 直装曾在 Electron 二进制下载处 `ECONNRESET`，需要镜像；
   - 最后一次尝试 `corepack pnpm@9.15.9` 被中断，未产生结果。
2. **雪花 ID 后尚未重新验收**：本地库已重置，需重启后端让新 V1 建表，再跑 `scripts/verify-m0.ps1`。
3. **Docker 管道在沙箱被拒绝**：AI 无法 `up/down` 容器；容器当前应仍在运行，若停止需人工执行 `docker compose --profile full up -d`。
4. Electron 为 GUI 程序，沙箱内可能无法显示窗口；可先用 `typecheck` + `build` + 后端 HTTP 测试完成等价验收。

## 恢复后的第一步

```cmd
cd /d D:\XiaoChenProject\ShenYouChu-Ai-Girlfriend

:: 1) 确认容器
docker compose ps

:: 2) 重启后端（IDEA 或命令行），确认 Flyway 应用新 V1
mvn -B spring-boot:run -pl services/core

:: 3) 雪花 ID 验收
powershell -ExecutionPolicy Bypass -File scripts\verify-m0.ps1

:: 4) 桌面端依赖：优先 pnpm 9 + 镜像
corepack prepare pnpm@9.15.9 --activate
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm install
pnpm --filter shenyouchu-desktop typecheck
pnpm --filter shenyouchu-desktop build
pnpm --filter shenyouchu-desktop dev
```

若 pnpm 仍拦截构建脚本：先执行一次 `pnpm approve-builds`（勾选 electron、esbuild），或临时用 npm 路径：
删除 `node_modules` 后设置 `ELECTRON_MIRROR` 再 `npm install`（npm workspaces 已配置在根 `package.json`）。

## 下一步路线（M1）

1. 消息与轮次：`messages` 表接口、`POST /conversations/{id}/turns`、`GET /conversations/{id}/messages`；
2. 人设加载（`characters.persona_config` → system prompt）；
3. 流式回复（SSE 或 WebSocket，按契约 `turn.*` 事件）；
4. 基础记忆：对话后异步整理 + 记忆页接口；活动事件查询接口；
5. 扩展 `scripts/verify-m0.ps1` 为端到端验收脚本。

## 待确认项（不阻塞）

- 契约要求 `/conversations` cursor 分页，当前后端返回裸数组，M1 二选一收敛；
- `App.tsx` 461 行，M1 拆分；
- token 仍存 localStorage，M3 换 safeStorage；
- `package.json` 的 `pnpm.onlyBuiltDependencies` 仅 pnpm 9 生效，pnpm 12 需 `pnpm approve-builds`。

---

## Round 1 进展（2026-10-28）

已完成并验证：

- `apps/desktop` 类型检查真实通过：`tsc --noEmit` 退出码 0（用 node 直接调用 `node_modules/.pnpm/typescript@5.9.3`）。
- 依赖包已在 `.pnpm` 中就位（186 个包，含 typescript/electron-vite/vite/@esbuild+win32-x64）。

环境硬边界（非代码问题）：

- esbuild 需要与子进程通过管道通信，沙箱禁止管道，报 `spawn EPERM`；因此 `electron-vite build` 与 Electron GUI 启动无法在沙箱内完成。
- pnpm 9/12 无法修复现有 `node_modules`：沙箱不允许删除或重命名早期安装生成的目录（EPERM / Directory not empty）。
- 结论：桌面端的 `typecheck` 已通过；`build`、`dev` 需在你本机执行一次：
  `npm install`（或 `pnpm install`）后 `npm run build:desktop && npm run dev:desktop`。

下一步（无需等待桌面端构建）：

1. 实现 M1 后端：消息持久化、`POST /conversations/{id}/turns`、`GET /conversations/{id}/messages`；
2. 人设加载（`characters.persona_config` → system prompt）；
3. 活动事件查询接口 `GET /api/v1/activity-events`；
4. 扩展验收脚本覆盖消息与隔离；
5. 流式输出（SSE/WS）随后接入。

## Round 2 进展（2026-10-28）

已实现并验证：

- 消息与轮次：`POST /api/v1/conversations/{id}/turns`、`GET /api/v1/conversations/{id}/messages`，消息按 `userId + conversationId` 归属过滤，越权返回 404；
- 人设加载：`PersonaService` 从 `characters.persona_config` 组装系统提示词；
- 回复生成 seam：`ReplyGenerator` 接口 + `SimplePersonaReplyGenerator` 确定性占位实现（不调用外部模型，保证链路可验收）；
- 活动记录查询：`GET /api/v1/activity-events?type=&limit=`，仅返回本人事件；
- 验证：`mvn -DskipTests package` 通过；`SimplePersonaReplyGeneratorTest` 通过。

下一轮：

1. 基础记忆：`memories` 实体/接口、轮次结束后的异步整理（先确定性实现，后接 LLM）；
2. 流式输出：SSE 或 WebSocket 按契约下发 `turn.*` 事件；
3. 扩展 `scripts/verify-m0.ps1` 覆盖消息、记忆、活动事件与越权。

## Round 3 进展（2026-10-28）

已实现并验证：

- 记忆模块：`memories` 实体/Mapper/Service/Controller，确定性关键词提取（preference / event），`GET /api/v1/memories`、`DELETE /api/v1/memories/{id}`；
- SSE 流式轮次：`POST /api/v1/conversations/{id}/turns/stream`，事件序列 `turn.started` → `assistant.text.delta` → `turn.completed`，与契约事件名一致；
- 轮次内联动：保存用户/AI 消息、按规则写入记忆、记录 `message.sent` / `memory.created` / `turn.completed` 活动事件、更新 `last_message_at`；
- 验收脚本：新增 `scripts/verify-m1.ps1`（消息、记忆、活动事件、越权、SSE）；
- 验证：`mvn -DskipTests package` 通过；`MemoryHeuristicTest`、`SimplePersonaReplyGeneratorTest`、`TokenHasherTest` 全部通过。

已知限制：`ReplyGenerator` 目前是确定性占位实现，未接入真实 LLM；SSE 是"先落库再分片下发"，接入流式 LLM 后改为边生成边下发，客户端协议不变。

下一轮：

1. 扩展 `verify-m1.ps1` 到可本地实际执行（需要 MySQL 运行）；
2. 接入 LLM 适配器（DashScope 或本地 OpenAI 兼容端点），保持 `ReplyGenerator` 接口；
3. 桌面端接入消息列表与流式显示。

## Round 4 进展（2026-10-28）

已实现并验证：

- LLM 适配器 `HttpLlmReplyGenerator`：OpenAI 兼容 `/chat/completions`，支持 base-url / api-key / model / timeout / max-tokens / temperature；
- 开关与回退：`shenyouchu.llm.enabled=false`（默认）使用 `SimplePersonaReplyGenerator`；开启后调用模型，异常/超时/空回复自动回退，保证对话链路可用；
- 配置：`application.yml` 新增 `shenyouchu.llm.*`，`.env.example` 新增 `LLM_*` 变量（含 DashScope compatible-mode 示例）；
- 验证：`mvn -DskipTests package` **BUILD SUCCESS**；`HttpLlmReplyGeneratorTest` 等 4 个纯逻辑测试全部通过。

接入方式（本机启用真实模型）：

```cmd
set LLM_ENABLED=true
set LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
set LLM_API_KEY=sk-xxx
set LLM_MODEL=qwen3.7-plus
mvn -B spring-boot:run -pl services/core
```

下一轮：桌面端补消息列表与流式显示；`verify-m1.ps1` 实跑（需 MySQL 运行）。

## Round 5 进展（2026-10-28）

已实现并验证：

- 前端 API 客户端扩展：`listMessages`、`sendTurn`，以及 `streamTurn`（fetch + ReadableStream 解析 SSE，事件 `turn.started` / `assistant.text.delta` / `turn.completed`）；
- 新增会话详情组件 [ConversationPanel.tsx](apps/desktop/src/renderer/src/ConversationPanel.tsx)：历史消息、输入发送、流式回复气泡、错误与加载态；
- 会话列表新增「进入」入口，App 根据选中会话切换到详情视图；
- 样式补充消息气泡、流式虚线边框与输入条；
- 依赖修复：在 `apps/desktop` 内用 `npm install --ignore-scripts --cache .npm-cache` 重建依赖（沙箱禁构建脚本，仅影响 Electron 二进制下载）；
- 验证：`node_modules/.bin/tsc --noEmit` **exit 0**。

下一轮：

1. 在桌面端接记忆列表与活动记录视图（对应 `/memories`、`/activity-events`）；
2. 本机补 Electron 二进制（`npm install` 完整版）后 `npm run build:desktop` / `dev:desktop` 联调；
3. 后端 `verify-m1.ps1` 实跑。

## Round 6 进展（2026-10-28）

已实现并验证：

- 前端 API：`listMemories`、`deleteMemory`、`listActivityEvents(type, limit)` 及对应类型；
- 新增 [MemoryPanel.tsx](apps/desktop/src/renderer/src/MemoryPanel.tsx)：记忆列表、逐条删除（含二次确认）、空态与错误态；
- 新增 [ActivityPanel.tsx](apps/desktop/src/renderer/src/ActivityPanel.tsx)：只读活动时间线，支持按事件类型筛选；
- 顶栏新增「会话 / 记忆 / 活动」切换，App 按视图渲染对应面板；
- 验证：`node_modules/.bin/tsc --noEmit` **exit 0**。

下一轮：M1 收尾（README/STATUS 对齐、验收脚本实跑指引），随后进入 M2 语音对话（ASR/TTS 适配器与可取消轮次）。

## Round 7 进展（2026-10-28）

已实现并验证：

- M2 语音 seam：`AsrAdapter` / `TtsAdapter` 接口 + `StubAsrAdapter` / `StubTtsAdapter` 占位实现（音频按 UTF-8 文本解码便于离线验证，TTS 返回 none 格式）；
- 语音轮次接口：`POST /api/v1/conversations/{id}/voice-turns`，链路为音频 → ASR → 文本轮次（复用记忆与活动事件）→ TTS，非法 Base64 与空识别结果返回 400；
- 配置：`shenyouchu.voice.enabled`（默认 false 用占位实现）；
- README 接口清单补齐轮次、SSE、消息、记忆、活动、语音接口；
- 验证：`mvn -DskipTests package` 成功；`StubVoiceAdaptersTest` 等 5 个纯逻辑测试类全部通过。

下一轮：

1. 桌面端加语音输入入口（录音按钮 + 状态，M2 先用 text base64 占位链路验证）；
2. 语音轮次验收脚本与 README 步骤；
3. 继续 M2：真实 ASR/TTS 接入（FunASR/CosyVoice）与可取消轮次。

## Round 8 进展（2026-10-28）

已实现并验证：

- 前端语音入口：`client.voiceTurn`、`textToBase64`，会话详情新增「语音（占位）」按钮，展示识别文本、置信度与 TTS 格式说明；
- 验收脚本：新增 [scripts/verify-m2.ps1](scripts/verify-m2.ps1)，覆盖语音占位链路、非法 Base64 400、消息/记忆落库、越权 404、匿名 401；
- 验证：前端 `tsc --noEmit` exit 0；`verify-m2.ps1` PowerShell 解析通过。

说明：占位链路用 UTF-8 文本 Base64 代替真实音频，仅用于在无麦克风/无模型环境下验证协议与归属校验；真实 ASR/TTS 接入后同一接口不变。

下一轮：真实 ASR/TTS 适配器（FunASR/CosyVoice）与可取消轮次；桌面端录音授权与状态机骨架。

## Round 9 进展（2026-10-28，真实端到端验收）

本轮在真实环境（本机 MySQL 8 + 运行中的后端）完成 M0/M1/M2 验收，并修复了 4 个真实缺陷：

1. **SSE 500**：SseEmitter 完成后的 ASYNC 二次派发没有 SecurityContext，被 Spring Security 拒绝；
   修复：`SecurityConfig` 放行 `DispatcherType.ASYNC/ERROR`（REQUEST 仍鉴权）；
2. **SSE 失败无日志**：`GlobalExceptionHandler` 吞异常不记录；已加 `log.error` 并补
   `NoResourceFoundException → 404`；
3. **脚本编码**：Windows PowerShell 默认非 UTF-8 发送 JSON 导致中文变问号、记忆不命中；
   修复：`[Console]::OutputEncoding` + UTF-8 bytes + `charset=utf-8`；
4. **SSE 脚本**：`curl.exe` 在 Windows 下引号被剥离导致 JSON 非法；改用 `Invoke-WebRequest -UseBasicParsing`。
   另外响应统一加 `server.servlet.encoding.force=true`，修掉控制台乱码。

验收结果（真实执行）：

- `verify-m0.ps1`：health UP、注册、会话隔离 404、重复注册 409、匿名 401，会话 ID 为雪花 ID 字符串；
- `verify-m1.ps1`：轮次/消息（2 条）、记忆（preference）、活动事件（5 条）、越权 404、
  **SSE `turn.completed` 通过**、匿名 401；
- `verify-m2.ps1`：语音占位链路（识别 `我喜欢看电影`、confidence 1.0、ttsFormat none）、
  非法 Base64 400、越权 404、匿名 401；
- 纯单元测试 5 个类全部通过；`mvn package` BUILD SUCCESS。

下一轮：桌面端本机完整安装 Electron 后联调；M2 真实 ASR/TTS 适配器；可取消轮次。

## Round 10 进展（2026-10-28）

已实现并验证：

- 可取消轮次：`TurnCancellationRegistry`（活动轮次 + 归属校验）、
  `POST /api/v1/conversations/{id}/turns/{turnId}/cancel`；
- SSE 在分片间检查取消状态，命中后下发 `turn.cancelled` 并立即结束，finally 清理注册表；
- 未知轮次、已完成轮次或非归属者取消统一返回 404；
- 测试：`TurnCancellationRegistryTest`（归属者可取消、他人不可取消、未知轮次、清理）通过；
  全部 6 个纯逻辑测试类通过；`mvn package` BUILD SUCCESS；
- 回归：真实环境 `verify-m1.ps1` 再次全部通过（含 SSE `turn.completed`）。

说明：M1 为单实例内存实现；多实例部署时替换为 Redis 并保留同一接口（技术路线中的取消广播）。

下一轮：桌面端取消按钮接入 `streamTurn` 中断；M2 真实 ASR/TTS 适配器。

## Round 11 进展（2026-10-28）

已实现并验证：

- 后端 M2 真实适配器骨架：`HttpAsrAdapter` / `HttpTtsAdapter`（OpenAI 风格的简单 JSON 协议，
  `VOICE_ENABLED=true` 时启用），任何异常/超时/空结果自动回退占位实现；
- 配置：`VOICE_ASR_URL` / `VOICE_TTS_URL` / `VOICE_TIMEOUT_SECONDS` 写入 `application.yml` 与 `.env.example`；
- 桌面端：`cancelTurn` 客户端 + 会话详情新增「停止生成」按钮，
  点击后同时中断本地 SSE（AbortController）并通知后端取消（`POST .../turns/{turnId}/cancel`）；
- 验证：桌面端 `tsc --noEmit` exit 0；6 个纯逻辑测试类通过；`mvn package` BUILD SUCCESS；
  真实环境 `verify-m2.ps1` 全部通过（占位链路未回退，说明默认配置仍离线可用）。

适配器协议（自定义包装服务，便于对接 FunASR/CosyVoice）：

- ASR：`POST {VOICE_ASR_URL}` JSON `{audioBase64, contentType}` → `{text, confidence}`
- TTS：`POST {VOICE_TTS_URL}` JSON `{text, emotion}` → `{audioBase64, format}`

下一轮：把桌面端「停止生成」纳入验收脚本可自动化验证；M0 桌面端本机完整安装指引；准备里程碑收尾。

## Round 12 进展（2026-10-28）

已实现并验证：

- 验收清单：[docs/04-acceptance-checklist.md](docs/04-acceptance-checklist.md)，对照 PRD 逐条标注
  已验收 / 已实现 / 待实现，并给出复现命令；
- `verify-m1.ps1` 新增取消校验：未知轮次取消 404、他人取消 404；真实环境全部通过；
- 桌面端 README 增加「本机联调步骤与故障排查」（Electron 镜像、乱码、SSE 缓冲、token 失效等）；
- 文档索引加入验收清单。

真实环境验收（本轮再次执行，全部通过）：

```text
health UP；消息 2；记忆 preference；活动事件 5；
bob 读 alice 消息 404；bob 删 alice 记忆 404；
SSE turn.completed；取消未知轮次 404；bob 取消 alice 轮次 404；匿名 401
```

下一轮：里程碑收尾核对（README 状态、STATUS 汇总），并尝试在本机条件下验证桌面端构建的替代方案。

## Round 13 进展（2026-10-28）

已实现并验证：

- 情绪/关系状态机（FR-2.3）：`UserCharacterState` + `RelationshipRules`（心情有界增减、亲密度每轮 +1 上限 100、
  `@Version` 乐观锁），`GET /api/v1/character-state`；每轮记录 `relationship.updated` 活动事件；
- 会话删除级联（FR-7.3 最小闭环）：删除会话时逻辑删除其消息与记忆，事件 payload 记录删除数量；
- 契约与验收清单同步更新（新接口、新事件类型、FR-2.3 状态改为已验收）。

真实环境验收（`verify-m1.ps1`，本轮全部通过）：

```text
消息 2；记忆 preference；活动事件 6（含 relationship.updated）
bob 读消息/删记忆 404；SSE turn.completed；取消未知轮次 404；bob 取消 404
character-state：mood 53、intimacy 2
删除会话后消息 404、该会话记忆残留 0
匿名 401
```

测试：`RelationshipRulesTest` 等 7 个纯逻辑测试类通过；`mvn package` BUILD SUCCESS。

下一轮：桌面端展示心情/亲密度；删除账号的全存储级联设计（Redis/Milvus/MinIO 抽象）。

## Round 14 进展（2026-10-28）

已实现并验证：

- 账号删除（FR-7.3）：`POST /api/v1/account/deletion`，MySQL 内用户/会话/消息/记忆/关系状态逻辑删除，
  会话立即失效，写入 `data.deletion_requested` / `data.deletion_completed` 审计事件；
- 派生存储清理 seam：`AccountPurgePort` + `NoOpAccountPurgePort`（Redis/Milvus/对象存储接入时替换）；
- 桌面端展示关系状态：顶栏显示「心情 / 亲密」，登录后加载、从会话详情返回时刷新；
- 新验收脚本 `scripts/verify-account-deletion.ps1`；契约与验收清单同步。

真实环境验收：

```text
账号删除 → 204；旧 token → 401；删除后同账号登录 → 401
用户名因唯一索引仍被保留（同用户名注册 409）—— 已记入验收清单待确认项
```

回归：`verify-m1.ps1` 全绿（消息/记忆/活动/SSE/取消/关系状态/级联删除/匿名）。

已知限制：用户名保留是逻辑删除 + 唯一索引的必然结果；如需复用用户名，可改为物理删除用户行
或唯一索引改为 `(username, deleted_at)`，列入待确认项。

下一轮：桌面端「删除账号」入口与二次确认；派生存储清理端口的真实实现（Redis 会话清理优先）。

## Round 15 进展（2026-10-28）

新增并落地：

- 用户新增规则：**所有 Markdown 文档必须使用 UTF-8 编码写入**；
  - 写入 [AGENTS.md](AGENTS.md)（面向代理与贡献者的协作规则，含编码、工作区边界、验证要求、沙箱限制）；
  - 同步到 `docs/03-development-standards.md` §1 目录约束；
- 桌面端「删除账号」：顶栏新增红色按钮 + 二次确认，调用 `POST /api/v1/account/deletion`，
  成功后清除本地 token、关系状态与会话列表并回到登录页；
- 验证：`apps/desktop` 下 `tsc --noEmit` exit 0。

下一轮：`AccountPurgePort` 的 Redis 会话清理实现（需引入 spring-boot-starter-data-redis），
以及 README 里程碑状态收尾。

## Round 16 进展（2026-10-28）

已实现并验证：

- Redis 会话清理：引入 `spring-boot-starter-data-redis`，`RedisAccountPurgePort`
  按契约键约定删除 `sess/turn/rate/media:{userId}:*`，受 `REDIS_ENABLED` 控制；
- 配置：`spring.data.redis.*`（host/port/password/timeout，默认对齐 Compose 的 46379）；
- 一键演示脚本 `scripts/demo.ps1`：串联 M0 → M1 → M2 → 账号删除，任一步失败立即中断；
- 本轮后端以 `REDIS_ENABLED=true` 启动，账号删除流程同时清理 Redis。

真实环境一键演示结果（全部通过）：

```text
STEP M0：health UP / 注册 / 隔离 404 / 重复注册 409 / 匿名 401         PASSED
STEP M1：消息 2 / 记忆 preference / 活动事件 6 / SSE completed /
         取消 404 / 关系状态 mood 53 intimacy 2 / 会话级联删除 0 残留   PASSED
STEP M2：语音占位识别 / 非法 Base64 400 / 越权 404 / 匿名 401         PASSED
STEP 账号删除：204 / 旧 token 401 / 删除后登录 401                    PASSED
DEMO VERIFICATION PASSED: all 4 steps
```

测试：7 个纯逻辑测试类通过；`mvn package` BUILD SUCCESS。

下一轮：README 里程碑收尾；可选的对象存储/Milvus 清理端口实现。

## Round 17 进展（2026-10-28）

修复与收尾：

- **编码事故修复**：此前用 PowerShell `Get-Content`（按 ANSI 读取 UTF-8 文件）再 `Set-Content`
  重写了 5 个 Markdown，导致中文乱码。已从各自最后一个正常版本恢复，再用文件工具（UTF-8 安全）
  重新应用后续改动：
  - `README.md`（当前状态、端口 48080、取消/账号删除/关系状态接口、ADR-0005、验收清单链接）
  - `docs/04-acceptance-checklist.md`（版本 v0.2，状态与证据更新）
  - `docs/README.md`（验收清单索引）
  - `scripts/README.md`（verify-account-deletion、demo 登记与用法）
  - `docs/contracts/data-and-interface-contracts.md`（取消接口、`relationship.updated`、
    `/character-state`、`/account/deletion`）
- 全仓库 `*.md` 已无乱码残留（grep 校验通过）；
- 规则固化：`AGENTS.md` 与 `docs/03-development-standards.md` 均要求 Markdown 使用 UTF-8，
  并禁止用 PowerShell 默认编码整篇重写文档。

下一轮：M2 真实模型接入手册（FunASR/CosyVoice 包装服务协议 + 延迟测量步骤）。

## Round 19 进展（2026-10-28）

已实现并验证：

- 行为边界（FR-2.4）写入系统提示词：`PersonaService.boundaries()` 覆盖专业建议转介、隐私索取拒绝、
  不诱导情感依赖、违规内容拒绝、极端情绪引导专业援助；`PersonaServiceTest` 增加边界关键词断言；
- 新增 [docs/05-voice-and-model-integration.md](docs/05-voice-and-model-integration.md)：
  LLM/ASR/TTS 接入协议、Python 包装服务示例、延迟测量口径（用户说完 → 客户端可听首音）、
  派生存储清理状态、故障排查表；
- 新增 [docs/06-boundary-test-set.md](docs/06-boundary-test-set.md)：24 条敏感请求用例与期望行为，
  供接入真实模型后抽检；
- README 状态更新为 M0–M2 已验收，并补文档索引。

真实验收（`scripts/demo.ps1` 四步全部通过，后端启用 Redis 清理）：

```text
M0 / M1 / M2 / 账号删除  PASSED
DEMO VERIFICATION PASSED: all 4 steps
```

纯逻辑测试 7 个类通过；`mvn package` BUILD SUCCESS。

下一轮：可选实现对象存储/Milvus 清理端口；或补 M1 消息分页与 `Idempotency-Key`（契约已定义）。

## Round 20 进展（2026-10-28）

已实现并验证：

- 消息 cursor 分页：`GET /api/v1/conversations/{id}/messages?limit=&cursor=` 返回
  `{items, nextCursor}`（limit 默认 20、最大 100）；桌面端 `listMessages` 改为分页信封；
- 幂等：`IdempotencyService`（单实例内存，TTL 10 分钟，按用户隔离），
  `POST /conversations/{id}/turns` 携带 `Idempotency-Key` 时重复请求返回首次结果；
- 契约更新：消息接口注明分页参数；
- 验收脚本扩展：`verify-m1.ps1` 新增分页（limit=1 两页 id 不同）与幂等（同 key 同 turnId）检查；
  `verify-m2.ps1` 适配分页信封。

真实环境验收（`scripts/demo.ps1` 四步全部通过）：

```text
M1：message count 2 / 分页 limit=1 两页 id 不同 / 幂等同 turnId /
    记忆 preference / 活动 9 条 / SSE / 取消 404 / 关系 mood 53 intimacy 3 / 级联删除 0 残留
M0 / M2 / 账号删除 全部 PASSED
DEMO VERIFICATION PASSED: all 4 steps
```

测试：7 个纯逻辑测试类通过；`mvn package` BUILD SUCCESS；桌面端 `tsc --noEmit` exit 0。

下一轮：可选实现对象存储清理端口（S3 前缀删除），或补 README 的 M1 完整接口说明。

## Round 21 进展（2026-10-28）

已实现并验证：

- 对象存储清理端口：`S3AccountPurgePort`（`STORAGE_ENABLED=true`），按 `users/{userId}/` 前缀删除，
  使用 MinIO 客户端；`STORAGE_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET` 配置化；
- 集成测试 `S3AccountPurgePortTest`：在本地 MinIO 上真实执行（非跳过），
  验证只删除目标用户前缀、邻居用户对象保留；MinIO 不可用时自动跳过；
- 桌面端消息分页 UI：会话详情新增「加载更多消息」，按 nextCursor 翻页并去重追加；
- 账号删除真实运行时日志确认三个端口依次执行：
  `NoOpAccountPurgePort`（Milvus 待接入）→ `RedisAccountPurgePort` → `S3AccountPurgePort`。

真实验收：`scripts/demo.ps1` 四步全部通过（含分页、幂等、SSE、取消、关系状态、级联删除）；
8 个测试类通过（含 S3 集成测试）；`mvn package` BUILD SUCCESS；桌面端 `tsc --noEmit` exit 0。

下一轮：Milvus 向量清理端口（P2 依赖 Milvus 接入后）；或 README/验收清单最终收尾。

## Round 22 进展（2026-10-28）

已实现并验证：

- 前端可测试性重构：把 SSE 帧解析抽到 `api/sse.ts`、Base64 编解码抽到 `api/encoding.ts`，
  `client.ts` 只保留请求封装；
- **前端自动化测试**（不依赖 Electron/esbuild）：`apps/desktop/tests/*.test.ts`，
  用 `tsc -p tsconfig.test.json` 编译到 `out-tsc/`，写入 `{"type":"commonjs"}` 标记后用
  `node --test` 运行；
- 覆盖 9 个用例：SSE 事件/多行 data/无 data 帧/JSON 字段/非法 JSON 容错、
  UTF-8 Base64 中文与 emoji 往返、空串；
- `npm test` 脚本与 `apps/desktop/README.md`、验收清单同步说明；`out-tsc/` 加入 .gitignore。

验证：`tsc --noEmit` exit 0；`tsc -p tsconfig.test.json` exit 0；`node --test` **9 passed / 0 failed**。

下一轮：Milvus 向量清理端口（P2）或 README 最终收尾核对。

## Round 23–24 进展（2026-10-28）

已实现并验证：

- 可测试性重构：
  - 新增 `api/turnStream.ts`：`TurnStreamParser` 负责增量拼帧与事件分发，可处理一帧跨多次 push、
    一次 push 多帧、结尾残留半帧；
  - `client.ts` 的 `streamTurn` 改为使用该解析器；
  - `auth/tokenStore.ts` 拆出 `createTokenStore(storage)`，并声明结构相同的 `TokenUser`
    （不再依赖 api/client 类型），从而可在 Node 中独立测试；
- 前端测试扩展到 **18 个用例**：SSE 帧解析、流式拼帧、UTF-8 Base64、token 存储（含损坏数据与存储禁用降级）；
- `tsconfig.test.json` 纳入新模块；`npm test` 脚本更新；README 测试章节同步。

验证：

```text
tsc --noEmit          exit 0
tsc -p tsconfig.test  exit 0
node --test           18 passed / 0 failed
```

下一轮：Milvus 向量清理端口（P2）或最终收尾核对（README/验收清单/待确认项汇总）。

## Round 25 进展（2026-10-28）

已实现并验证：

- CI 增加桌面端 job：Node 20 + `npm ci --ignore-scripts` → `npm run typecheck` → `npm test`
  （前端测试不需要 Electron 二进制，CI 可稳定运行；Java job 仍跑 `mvn verify`，全部 Java 测试含 Mockito）；
- 一致性核对与修正：`apps/desktop/README.md` 更新为“消息已 cursor 分页、会话列表仍为数组”，
  遗留项同步（语音为 M2 占位链路，真实模型见 docs/05）；
- STATUS 历史待确认项说明：会话列表分页仍未收敛（消息分页已完成），保留为待确认项。

验证：`tsc --noEmit` exit 0；`npm test` 18 passed / 0 failed；`mvn package` 此前 BUILD SUCCESS。

下一轮：最后核对 README/验收清单与待确认项，准备里程碑收尾总结。

## Round 26 进展（2026-10-28）

已实现并验证：

- 会话列表 cursor 分页：`GET /api/v1/conversations?limit=&cursor=` 返回 `{items, nextCursor}`，
  按 id 降序（最新在前），契约与实现彻底收敛（此前是唯一剩余的接口不一致项）；
- 桌面端 `listConversations` 改为分页信封，App 取 `items`；
- 验收脚本：`verify-m0.ps1` 增加会话分页信封检查；4 个脚本的用户名后缀改为
  毫秒+随机数，修复同一秒连续执行导致的重复注册 409；
- 脚本改为按 UTF-8 正确读写（此前 PS5.1 默认 ANSI 读取）。

真实验收：`scripts/demo.ps1` 四步全部通过：

```text
M0：health / 隔离 404 / 会话分页信封 / 重复注册 409 / 匿名 401
M1：消息分页（两页 id 不同）/ 幂等同 turnId / 记忆 / 活动 9 条 /
    SSE completed / 取消 404 / 关系 mood 53 intimacy 3 / 级联删除 0 残留
M2：语音占位 / 非法 Base64 400 / 越权 404 / 匿名 401
账号删除：204 / 旧 token 401 / 删除后登录 401
DEMO VERIFICATION PASSED: all 4 steps
```

前端：`tsc --noEmit` exit 0；`npm test` 18 passed / 0 failed。后端：8 个测试类通过；`mvn package` BUILD SUCCESS。

按用户要求：本轮结束后停止 AI 启动的所有服务，由用户自行启动前后端进行手动测试。

## 修复：开发服务器 IPv4/IPv6 不一致导致 ERR_CONNECTION_REFUSED（2026-10-28）

现象：`npm run dev` 正常输出 Vite 地址，但 Electron 窗口/浏览器显示 localhost 拒绝连接。

原因：Windows 上 `localhost` 可能优先解析为 IPv6 `::1`，而 Vite 默认只监听 `127.0.0.1`（IPv4）。

修复：

- `electron.vite.config.ts`：renderer server 显式 `host: '127.0.0.1'`、`port: 5173`、`strictPort: true`；
- `src/main/index.ts`：加载 `ELECTRON_RENDERER_URL` 时把 `://localhost` 归一化为 `://127.0.0.1`。

验证：`tsc --noEmit` exit 0。（本机需重启 `npm run dev` 生效）
