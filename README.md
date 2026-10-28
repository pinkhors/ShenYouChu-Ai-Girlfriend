# ShenYouChu AI Girlfriend

多人各自与 AI 角色**沈幼楚**进行一对一文本、语音和视频陪伴的桌面应用项目。

当前状态：**M0 后端、M1 文本伴侣、M2 语音占位链路均已通过真实环境端到端验收**；桌面端（Electron + React + TS）功能完成并通过类型检查，Electron 二进制安装需在本机执行。

一条命令复现全部验收：

```cmd
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
```

## 快速开始

前置：JDK 17、Maven 3.9+、Docker Desktop。

```bash
# 1. 启动 M0 基础设施（MySQL 43306 / Redis 46379）
docker compose up -d

# 可选：完整栈（追加 Milvus 49530 与 S3 对象存储 49000-49001，本地为 legacy MinIO）
# docker compose --profile full up -d

# 2. 构建并运行核心服务（Flyway 自动建表）
mvn -B spring-boot:run -pl services/core

# 3. 健康检查（默认端口 48080）
curl http://127.0.0.1:48080/actuator/health
```

核心接口（前缀 `/api/v1`）：

```text
POST /auth/register   注册并返回会话 token
POST /auth/login      登录
POST /auth/logout     退出（Bearer token）
GET  /auth/me         当前用户
GET  /characters      内置角色（沈幼楚）
GET/POST /conversations           会话列表/创建
GET/DELETE /conversations/{id}    会话详情/删除（归属校验）
POST /conversations/{id}/turns         文本轮次（人设回复 + 记忆 + 活动事件）
POST /conversations/{id}/turns/stream  SSE 流式轮次（turn.started / assistant.text.delta / turn.completed）
POST /conversations/{id}/turns/{turnId}/cancel  取消进行中的流式轮次（仅归属者）
POST /account/deletion                 删除账号（MySQL 级联 + Redis 清理 + 审计事件）
GET  /character-state                  当前用户的心情 / 亲密度
GET  /conversations/{id}/messages      会话消息
POST /conversations/{id}/voice-turns   语音轮次（M2 骨架：ASR → 轮次 → TTS）
GET/DELETE /memories                   记忆列表 / 删除
GET  /activity-events                  活动记录（可按类型筛选）
```

## 文档

- [文档索引](./docs/README.md)
- [产品需求文档（PRD）](./docs/01-product-requirements.md)
- [技术实现路线](./docs/02-technical-roadmap.md)
- [开发规范](./docs/03-development-standards.md)
- [数据与接口契约](./docs/contracts/data-and-interface-contracts.md)
- [验收清单](./docs/04-acceptance-checklist.md)
- [真实模型接入手册](./docs/05-voice-and-model-integration.md)
- [架构决策记录（ADR）](./docs/adr/0001-frontend-react.md)（另见 [ADR-0002 运营检索边界](./docs/adr/0002-operator-search-audit.md)、[ADR-0003 MyBatis-Plus 持久化](./docs/adr/0003-mybatis-plus-persistence.md)、[ADR-0004 本地对象存储](./docs/adr/0004-local-object-storage-minio-legacy.md)、[ADR-0005 雪花 ID](./docs/adr/0005-snowflake-ids.md)）
- [协作规则（AGENTS.md）](./AGENTS.md)
- [术语表](./CONTEXT.md)

原始愿景文档：[ShenYouChu-Ai-Girlfriend-产品需求文档PRD.docx](./ShenYouChu-Ai-Girlfriend-产品需求文档PRD.docx)（历史参考，不作为实现依据）。

## 已确定的方向

- 桌面端 Electron + React + TypeScript；
- 核心对话服务 Spring Boot 3.x + Java 17，持久化统一使用 MyBatis-Plus，Gateway/Identity 初期同进程分模块；
- 媒体与视觉独立部署：WebRTC + Python MediaPipe；
- 模型先使用云 API，接口可替换，后续支持自托管；
- 本地 Docker 启动 MySQL、Redis；Milvus 与 S3 兼容对象存储（本地 legacy MinIO）放在 `full` profile，后续迁移云服务器；
- 面向开源与多人使用，数据从第一版开始严格隔离；
- 录像经授权保存到私有 S3 对象存储，实时链路与归档分离；
- 全局搜索分两类：用户搜索自己的记录（P1，先 MySQL 全文），运营跨用户检索（P2，受控、脱敏、必须审计），后续可切换 OpenSearch。

## 仓库结构

```text
pom.xml                     # 父 POM，聚合 Java 模块
docker-compose.yaml         # 本地基础设施（默认 MySQL/Redis，full profile 含 Milvus/MinIO）
services/core/              # Spring Boot 核心服务
apps/desktop/               # Electron + React + TypeScript 桌面端
docs/                       # PRD、技术路线、开发规范、契约、ADR
scripts/                    # 镜像拉取、验收与一键 demo 脚本
```

## 状态

M0–M2 已完成真实环境验收：

- 后端：认证与多用户隔离、会话与消息、SSE 流式对话、记忆、活动事件、关系状态、取消轮次、账号删除级联（MySQL + Redis）全部通过 `scripts/demo.ps1` 一键验收；
- 基础设施：Compose 支持默认（MySQL/Redis）与 `full`（Milvus + legacy MinIO）两种 profile；
- 桌面端：登录/会话/流式消息/记忆/活动/关系状态/停止生成/删除账号均已实现并通过 `tsc --noEmit`；界面为微信式三栏，含本机捏脸编辑器（半写实 SVG 预览，参数存本机）；
- 待本机验证：Electron 二进制安装与窗口联调（需在 `apps/desktop` 执行完整 `npm install`）。

未决问题见各文档的「待确认项」，均给出默认建议，不阻塞开发。
