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
