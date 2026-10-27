# ShenYouChu AI Girlfriend

多人各自与 AI 角色**沈幼楚**进行一对一文本、语音和视频陪伴的桌面应用项目。

当前仓库处于**需求与设计阶段**，尚未创建工程代码。请从文档入口开始阅读。

## 文档

- [文档索引](./docs/README.md)
- [产品需求文档（PRD）](./docs/01-product-requirements.md)
- [技术实现路线](./docs/02-technical-roadmap.md)
- [开发规范](./docs/03-development-standards.md)
- [数据与接口契约](./docs/contracts/data-and-interface-contracts.md)
- [架构决策记录（ADR）](./docs/adr/0001-frontend-react.md)（另见 [ADR-0002 运营检索边界](./docs/adr/0002-operator-search-audit.md)）
- [术语表](./CONTEXT.md)

原始愿景文档：[ShenYouChu-Ai-Girlfriend-产品需求文档PRD.docx](./ShenYouChu-Ai-Girlfriend-产品需求文档PRD.docx)（历史参考，不作为实现依据）。

## 已确定的方向

- 桌面端 Electron + React + TypeScript；
- 核心对话服务 Spring Boot + Java，Gateway/Identity 初期同进程分模块；
- 媒体与视觉独立部署：WebRTC + Python MediaPipe；
- 模型先使用云 API，接口可替换，后续支持自托管；
- 本地 Docker 启动 MySQL、Redis、Milvus、MinIO，后续迁移云服务器；
- 面向开源与多人使用，数据从第一版开始严格隔离；
- 录像经授权保存到私有 MinIO，实时链路与归档分离；
- 全局搜索分两类：用户搜索自己的记录（P1，先 MySQL 全文），运营跨用户检索（P2，受控、脱敏、必须审计），后续可切换 OpenSearch。

## 状态

需求与技术文档已形成可执行基线；下一步是评审文档并初始化工程骨架。未决问题见各文档的「待确认项」，均给出默认建议，不阻塞开发。
