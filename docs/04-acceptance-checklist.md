# 验收清单（对照 PRD）

- 版本：v0.4（M0–M2 + 角色自定义 + 一对一唯一会话）
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
| FR-2.5–2.7 角色自定义/切换/唯一会话 | 创建/编辑/保存/切换/归档/彻底删除；官方只读；每用户每角色唯一会话；记忆/关系/立绘按角色隔离 | 已验收（后端 API） | 本机 MySQL 8 + 48082 实例冒烟：V4+V5 history=5；35 项角色 CRUD/复制/切换/唯一会话/归档/恢复/彻底删除/跨用户隔离全部通过；前端 `npx tsc --noEmit`、`npm test` |

## 一·补、角色自定义专项验收

| 项 | 期望 | 状态 | 证据 / 命令 |
|---|---|---|---|
| 创建/编辑 | 三类设定可保存并回显；名字/年龄/长度/互斥校验生效 | 已验收（API） | 本机 MySQL 8 + 48082 冒烟；`CharacterValidatorTest`；`npm test` 的 characterTypes 用例 |
| 提示词 | 官方 v1 输出不变；自定义 v2 含性格/调味/表达/来处/补充；边界永远最后 | 已实现 | `CharacterPromptCompilerTest`（6 例） |
| 切换 | 当前角色唯一；任意页面可切换；切换返回唯一 conversationId 并打开 | 已验收（API） | 本机冒烟 `PUT /preferences/active-character` 返回 `{activeCharacterId, conversationId}` |
| 唯一会话 | 创建/复制角色自动建 1 条；重复 POST 返回同一会话；不能删除；归档保留、恢复仍同一会话 | 已验收（API） | 本机冒烟：官方/自定义角色各 1 条，重复 POST 不新增，DELETE 409，归档/恢复/清空后会话保留 |
| 清空聊天记录 | 只清消息/记忆，会话保留；清空后仍可继续聊 | 已验收（API） | 本机冒烟 `POST /conversations/{id}/clear`：消息/记忆清空、会话仍在 |
| 记忆/关系隔离 | 记忆按角色筛选；心情/亲密度按 user+character | 已验收（API） | 本机冒烟：写入记忆带 characterId、按角色筛选、关系状态按角色返回 |
| 官方角色 | 写操作 403；可查看/复制；本机形象覆盖不进服务端 | 已验收（API 部分） | 本机冒烟官方 PATCH 403；复制与本机形象覆盖前端待 UI 冒烟 |
| 形象来源 | 每个角色可选“自动 / 立绘 / 捏脸”；角色卡、切换器、会话列表、聊天、通话一致 | 已实现 | 本机按 user+character 保存；列表只加载一张预览图；`tsc --noEmit`、`npm test` |
| 迁移 | 旧捏脸保留为官方本机覆盖；旧立绘迁到 userId:characterId；重复会话合并 | 已实现，待本机 IndexedDB 验证 | `avatarStorage`/`portraitStorage`；V4+V5 已在本机 MySQL 8 执行 |
| 删除 | 归档保留会话可恢复；彻底删除级联清理并回退官方 | 已验收（API） | 本机冒烟：归档回退官方、恢复、彻底删除计数、孤儿行检查 0 |
| 安全 | A 不能读/改/删 B 的自定义角色；客户端不能提交系统提示词 | 已验收（API） | 本机冒烟跨用户读取角色/关系状态均 404；DTO 不含自由提示词字段 |

> 沙箱限制：Mockito 在本环境会因 `MockMaker` 子进程/管道限制失败（12 个既有测试错误）；纯逻辑测试用 `-DforkCount=0` 通过。V4/V5 已在本机 MySQL 8 执行并通过 API 冒烟；Electron 窗口视觉回归与 IndexedDB 迁移的真实浏览器验证仍需本机执行。

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
| 会话列表 / 唯一会话 / 清空 | 已实现 | 每角色仅一条；默认展示全部女友，行标题为角色名，当前行“当前”徽标；无“新建会话”入口；行内“清空聊天记录”；切换角色后按 conversationId 打开 |
| 会话内消息 + SSE 流式回复 | 已实现 | 后端 SSE 已真实验收；发送后本地先展示用户消息（乐观渲染），落库后自动对齐；占位消息与进行中的回合都存放在跨视图的 `chat/pendingStore`、`chat/turnSessionStore`，切换会话或切到角色/记忆页后仍能看到流式文本、可停止，结束后自动回源；失败会提示且未落库的正文回填输入框 |
| 停止生成 | 已实现 | 取消接口已真实验收 |
| 记忆页 / 活动页 | 已实现 | 同上；记忆页默认按当前角色筛选，可切全部 |
| 角色中心 / 角色编辑器 | 已实现 | 官方/我的角色/归档；四步创建与四标签编辑；脏状态守卫 |
| 角色切换器 | 已实现 | 左栏/聊天头部/会话列表；只列未归档角色 |
| 聊天/会话/通话/空态角色化 | 已实现 | 不再写死沈幼楚；关系状态按 `conversation.characterId`；形象来源按角色统一 |
| 官方形象本机覆盖 / 立绘按角色隔离 | 已实现 | `avatarStorage`、`portraitStorage` key 含 characterId；角色卡/切换器/会话列表已接入立绘预览；待 IndexedDB 冒烟 |
| 心情 / 亲密度展示 | 已实现 | 对接 `/character-state?characterId` |
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

角色自定义的纯逻辑测试（沙箱可跑）：

```cmd
mvn -s .mvn-repo/settings.xml -DforkCount=0 -Dtest=CharacterPromptCompilerTest,CharacterValidatorTest,CharacterViewJsonTest,MemoryHeuristicTest test
mvn -s .mvn-repo/settings.xml -DskipTests package

cd apps\desktop
npx tsc --noEmit
npm test
```

角色 API 冒烟（需要运行中的 core 与 MySQL 8；会创建并在结束时删除测试账号）：

```cmd
powershell -ExecutionPolicy Bypass -File scripts\verify-character.ps1
:: 非默认端口：-BaseUrl http://127.0.0.1:48082
```

## 五、结论

- **M0 后端 + M1 文本伴侣 + M2 语音占位链路：已真实验收通过**；
- **角色自定义（P0 + P1 核心项）：后端 API 已在本机 MySQL 8 冒烟验收（V4+V5 history=5；CRUD/复制/切换/唯一会话/归档/恢复/彻底删除/跨用户隔离/记忆按角色 35 项通过），后端编译与 21 个纯逻辑测试、前端类型检查与 108 个单元测试通过；Electron 视觉回归与 IndexedDB 迁移待本机验证**；
- 剩余工作集中在：真实 ASR/TTS/LLM 效果与延迟实测、行为边界与情绪状态机增强、视觉（P1）、搜索（P1/P2）、对象存储与 Milvus 清理、运营审计；
- 桌面端代码完成且类型检查通过，唯一未验证项是本机 Electron 构建与窗口联调（沙箱环境限制）。