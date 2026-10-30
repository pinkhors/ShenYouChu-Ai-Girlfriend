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
| [10 声音克隆（Genie-TTS）引入方案](./10-voice-cloning-genie-tts.md) | 参考插件评估、引擎/自研取舍、声音档案与接口；**已被 12 取代，仅存档** | 产品、设计、开发、测试 |
| [11 声音克隆：对话与唱歌双模式](./11-voice-clone-dialogue-and-singing.md) | 对话/唱歌场景、TTS+SVC/SVS、音色/音准/节奏/情感；**已被 12 取代，仅存档** | 产品、设计、开发、测试 |
| [12 Breeze TTS 2 重构方案](./12-breeze-tts-2-redesign.md) | Breeze API 能力边界与调用、语音发送/唱一句；Breeze-only 基线，最终方案见 14 | 产品、设计、开发、测试 |
| [13 双云 TTS 方案评估](./13-dual-cloud-tts-evaluation.md) | CosyVoice/Qwen + Breeze 的可行性、成本/易用性、音色一致性与本地化；评估完成，决策见 14 | 产品、设计、开发、测试 |
| [14 语音方案定稿](./14-voice-final-design.md) | CosyVoice 说话 + Breeze 唱句、统一后端 API/WS、克隆/异步唱句；架构基线，BYOK 见 15 | 产品、设计、开发、测试 |
| [15 BYOK 落地决策](./15-byok-launch-decisions.md) | 用户自带 Key/自付费、Breeze 开关默认关、7 天保留、导出 AI 标识、电平口型；待评审 | 产品、设计、开发、测试 |
| [16 语音生成工作台](./16-voice-generation-mode-ui.md) | 双模型卡片、三种生成模式、交互状态与切换逻辑；待评审 | 产品、设计、开发、测试 |
| [17 语音模块化架构](./17-modular-voice-architecture.md) | Provider/能力注册、接口约定、扩展点、当前扩展风险与迁移路径；待评审 | 产品、设计、开发、测试 |
| [18 能力盘点与设计评估](./18-capability-audit-and-design-review.md) | 全项目缺失/新增/优化项按 P0–P2 排序、缺陷清单、替代方案与路线建议；只读评估 | 产品、设计、开发、测试 |
| [19 鲸鱼娘自主浏览与行为面板 PRD](./19-whale-girl-autonomous-watch-prd.md) | 陪看与自主浏览、行为事件与统计面板、内容理解流水线（评论→字幕→OCR）、记忆回流与主动消息；待评审 | 产品、设计、开发、测试 |
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
