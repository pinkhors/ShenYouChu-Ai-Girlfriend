# ShenYouChu AI Girlfriend

多人各自与 AI 角色**沈幼楚**进行一对一文本、语音和视频陪伴的桌面应用项目。

当前处于 **M0 地基阶段**：文档基线已完成，核心服务骨架（认证、会话归属、活动事件、数据库迁移）可构建；桌面端尚未创建。

## 快速开始

前置：JDK 17、Maven 3.9+、Docker Desktop。

```bash
# 1. 启动 M0 基础设施（MySQL 43306 / Redis 46379）
docker compose up -d

# 可选：完整栈（追加 Milvus 49530 与 S3 对象存储 49000-49001，本地为 legacy MinIO）
# docker compose --profile full up -d

# 2. 构建并运行核心服务（Flyway 自动建表）
mvn -B spring-boot:run -pl services/core

# 3. 健康检查
curl http://127.0.0.1:8080/actuator/health
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
```

## 文档

- [文档索引](./docs/README.md)
- [产品需求文档（PRD）](./docs/01-product-requirements.md)
- [技术实现路线](./docs/02-technical-roadmap.md)
- [开发规范](./docs/03-development-standards.md)
- [数据与接口契约](./docs/contracts/data-and-interface-contracts.md)
- [架构决策记录（ADR）](./docs/adr/0001-frontend-react.md)（另见 [ADR-0002 运营检索边界](./docs/adr/0002-operator-search-audit.md)、[ADR-0003 MyBatis-Plus 持久化](./docs/adr/0003-mybatis-plus-persistence.md)、[ADR-0004 本地对象存储](./docs/adr/0004-local-object-storage-minio-legacy.md)）
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
scripts/                    # 镜像拉取与 M0 验证脚本
```

## 状态

M0 进行中：

- 核心服务已在本地 MySQL 上完成真实联调：健康检查、注册/登录、会话归属隔离（跨用户 404）、重复注册 409、匿名 401 全部通过，验证脚本见 `scripts/verify-m0.ps1`；
- 基础设施 Compose 支持默认（MySQL/Redis）与 `full`（Milvus + legacy MinIO）两种 profile；
- 桌面端骨架正在搭建，完成后可登录并管理会话。

未决问题见各文档的「待确认项」，均给出默认建议，不阻塞开发。
