# 验收清单（对照 PRD）

- 版本：v0.2（M0–M2 阶段）
- 对照：[PRD](./01-product-requirements.md) 的功能需求与验收标准
- 状态含义：**已验收**＝有真实环境证据；**已实现**＝代码完成、类型/编译通过，但缺少端到端证据；**待实现**＝尚未开始

## 一、后端验收（真实环境，MySQL 8 + Redis + 运行中的 core）

| 需求 | 验收点 | 状态 | 证据 |
|---|---|---|---|
| FR-1.1/1.2 账户与身份派生 | 注册、登录、退出、`/auth/me`；身份不来自客户端 | 已验收 | `scripts/verify-m0.ps1` |
| FR-1.3 多用户隔离 | A 读不到 B 的会话/消息/记忆/轮次 | 已验收 | `verify-m0.ps1`、`verify-m1.ps1`、`verify-m2.ps1` |
| FR-2.1 人设加载 | `persona_config` → system prompt | 已验收 | `verify-m1.ps1` 回复体现人设；`PersonaServiceTest` |
| FR-2.2 流式回复 | SSE `turn.started` / `assistant.text.delta` / `turn.completed` | 已验收 | `verify-m1.ps1` SSE 段 |
| FR-2.3 情绪/关系状态 | 心情/亲密度有界更新、单轮一次 | 已验收 | `character-state` mood 53 / intimacy 2；`RelationshipRulesTest` |
| FR-2.4 行为边界 | 拒答医疗/法律/金融等 | 待实现 | 需系统提示词与边界测试集 |
| FR-3.1/3.2 语音输入与最终稿 | 语音轮次落库；非法输入 400 | 已验收（占位链路） | `verify-m2.ps1` |
| FR-3.3 流式语音回答 | TTS 流式 | 待实现 | `HttpTtsAdapter` 已就绪，缺外部服务 |
| FR-3.4 打断与取消 | 取消接口；非归属者/未知轮次 404 | 已验收 | `verify-m1.ps1` 取消段 + `TurnCancellationRegistryTest` |
| FR-3.5 降级 | LLM/ASR/TTS 失败回退 | 已实现 | 适配器回退逻辑；离线默认路径已验收 |
| FR-4.1/4.2 最近对话与异步整理 | 消息持久化 + 记忆写入 | 已验收 | `verify-m1.ps1` 记忆 `preference` |
| FR-4.3 记忆查看与删除 | 列表、删除、越权 404 | 已验收 | `verify-m1.ps1` |
| FR-4.4/4.5 语义召回与纠正（P2） | Milvus 召回、纠正流程 | 待实现 | P2 |
| FR-5.x 视频与视觉（P1） | WebRTC、MediaPipe、录像 | 待实现 | P1 |
| FR-6.1–6.4 活动事件 | 写入与查询、按类型筛选 | 已验收 | `verify-m1.ps1` 事件 6 条（含 relationship.updated） |
| FR-6.5 活动追踪开关 | 开关与保留期 | 待实现 | 设置接口未做 |
| FR-7.1–7.3 设备控制与数据权利 | 设备开关、数据查看、级联删除 | 部分实现 | 会话级联删除、账号删除（MySQL + Redis + 对象存储前缀清理）已真实验收；Milvus 向量清理为占位端口；用户名因唯一索引仍被保留 |
| FR-8.x 搜索（P1/P2） | SearchPort + 用户搜索 + 运营检索 | 待实现 | 契约已定义 |

## 二、非功能验收

| 需求 | 状态 | 说明 |
|---|---|---|
| NFR-1 首音延迟 P95 < 2s | 待实测 | 需要真实 ASR/TTS 后测量 |
| NFR-2 视觉 ≥15 FPS | 待实现 | P1 |
| NFR-3 表情估计准确率 | 待实现 | P1 |
| NFR-4 可用性/降级 | 已实现 | LLM/ASR/TTS 均带回退 |
| NFR-5 隐私（私有存储、级联删除） | 部分实现 | 账号/会话级联、Redis 清理、对象存储前缀清理均已实现并测试；Milvus 向量清理待接入 |
| NFR-6 可观测（traceId 串联） | 部分实现 | 活动事件含 traceId 字段，全链路埋点未做 |
| NFR-7 可移植（Compose 一键、模型可替换） | 已验收 | 双 profile；模型/语音适配器可替换 |
| NFR-8 并发 | 待压测 | 单机可跑，容量未测 |
| NFR-9 搜索性能 | 待实现 | P1 |
| NFR-10 运营审计 | 待实现 | P2 |

## 三、桌面端验收

| 项 | 状态 | 说明 |
|---|---|---|
| 登录/注册 | 已实现 | `tsc --noEmit` 通过 |
| 会话列表/创建/删除 | 已实现 | 同上 |
| 会话内消息 + SSE 流式回复 | 已实现 | 后端 SSE 已真实验收；发送后本地先展示用户消息（乐观渲染），落库后自动对齐；回复期间切走会话，返回后仍会看到该轮消息 |
| 停止生成 | 已实现 | 取消接口已真实验收 |
| 记忆页 / 活动页 | 已实现 | 同上 |
| 心情 / 亲密度展示 | 已实现 | 对接 `/character-state` |
| 删除账号 | 已实现 | 二次确认 + 后端级联已真实验收 |
| 语音占位 | 已实现 | 后端链路已真实验收 |
| 每账号 LLM 配置 | 已实现 | `GET/PUT/DELETE /api/v1/settings/llm`、`POST /test`；Key 不回显；待真实模型端到端 |
| 生产构建 / 运行 | 待本机验证 | 沙箱禁止构建脚本 spawn，需本机 `npm install` 补 Electron 二进制 |

## 四、如何复现验收

```cmd
:: 1) 基础设施
docker compose --profile full up -d

:: 2) 后端（默认端口 48080）
mvn -B spring-boot:run -pl services/core

:: 3) 一键验收（M0 → M1 → M2 → 账号删除）
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1

:: 4) 桌面端（本机）
cd apps\desktop
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

> `npm test` 使用 tsc + Node 内置测试运行器，不需要 Electron 二进制；`build`/`dev` 需要完整安装。

## 五、结论

- **M0 后端 + M1 文本伴侣 + M2 语音占位链路：已真实验收通过**；
- 剩余工作集中在：真实 ASR/TTS/LLM 效果与延迟实测、行为边界与情绪状态机增强、视觉（P1）、搜索（P1/P2）、对象存储与 Milvus 清理、运营审计；
- 桌面端代码完成且类型检查通过，唯一未验证项是本机 Electron 构建与窗口联调（沙箱环境限制）。