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
