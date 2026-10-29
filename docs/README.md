# 文档索引

本目录是 ShenYouChu AI Girlfriend 的工程文档入口。需求、技术、规范与契约以这里的内容为准；根目录原始产品文档 `ShenYouChu-Ai-Girlfriend-产品需求文档PRD.docx` 作为历史愿景保留，不再作为实现依据。

| 文档 | 内容 | 读者 |
|---|---|---|
| [01 产品需求文档](./01-product-requirements.md) | 范围、功能需求与优先级、页面与交互、验收与里程碑 | 产品、开发、测试 |
| [02 技术实现路线](./02-technical-roadmap.md) | 架构与服务边界、链路、数据概览、难点、测试发布、阶段计划 | 开发、运维 |
| [03 开发规范](./03-development-standards.md) | 目录与命名、风格、分支提交、评审、测试、发布 | 所有贡献者 |
| [数据与接口契约](./contracts/data-and-interface-contracts.md) | 实体字段、REST/WS 接口、视觉信号、存储隔离、删除矩阵 | 服务端、客户端、测试 |
| [04 验收清单](./04-acceptance-checklist.md) | 对照 PRD 的逐条验收状态与复现步骤 | 产品、测试、开发 |
| [05 真实模型接入手册](./05-voice-and-model-integration.md) | LLM/ASR/TTS 接入协议、示例包装服务、延迟测量与排查 | 开发、运维 |
| [06 行为边界测试集](./06-boundary-test-set.md) | 24 条敏感请求用例与期望行为，供接入真实模型后抽检 | 产品、测试 |
| [07 女友角色设定设计](./07-character-customization.md) | 多角色模型、形象/性格/家庭选项、创建与切换流程、契约与迁移；P0 + P1 核心项已实现 | 产品、设计、开发、测试 |
| [08 记忆星图](./08-memory-graph.md) | 记忆分块/向量/话题实体管线、GraphProjector 快照、星图 API 与前端 v0；P1 设计 | 产品、设计、开发、测试 |
| [09 表达温度与主动消息](./09-expression-temperature-and-proactive-message.md) | 角色形象/性格推导 temperature、用户覆盖、主动开口策略与受控端点；P1 实现基线 | 产品、设计、开发、测试 |
| [CONTEXT.md](../CONTEXT.md) | 项目术语表 | 所有人 |
| [docs/adr/](./adr/) | 架构决策记录（ADR-0001 前端 React、ADR-0002 运营检索边界、ADR-0003 MyBatis-Plus 持久化、ADR-0004 本地对象存储、ADR-0005 雪花主键） | 开发、评审 |

## 文档关系

```text
CONTEXT.md（术语）
    ▲
    │ 所有文档遵循
01 PRD ──需求编号 FR-x.y / NFR-x──▶ 02 技术路线
    │                                  │
    └──────────验收标准────────────────┘
                                       ▼
                           contracts/ 数据与接口契约
                                       │
                                       ▼
                              03 开发规范（门禁）
```

## 维护规则

- 行为、接口、数据模型变更必须同步更新对应文档，与代码同一个 PR；
- 每个文档的「待确认项」集中列出未决问题，给出默认建议；确认后原地更新并记录；
- 难以回退的架构决策写入 `docs/adr/`；
- 文档变更需评审。
