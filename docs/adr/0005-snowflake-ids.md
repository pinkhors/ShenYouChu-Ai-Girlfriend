# 主键采用 MyBatis-Plus 雪花 ID（Long + BIGINT）

- 状态：accepted
- 关联：ADR-0003、数据与接口契约 §1.1/§2、开发规范 §3.3、T-17

M0 基线数据库的主键使用 UUID v4 字符串（`VARCHAR(36)`），由应用层 `UUID.randomUUID()` 生成后以 `IdType.INPUT` 写入。该方案带来三个问题：

1. 主键与所有外键都是 36 字节字符串，`messages`、`activity_events` 这类高写入表的索引体积与页分裂代价明显高于整数；
2. 二级索引与聚簇索引的存储放大，使 InnoDB 的插入局部性变差；
3. 主键生成逻辑散落在各 Service（`AuthService`、`ConversationService`、`ActivityService` 各自 `UUID.randomUUID()`），新增实体时容易漏写。

需要一套集中、单调趋势、可由应用生成的整数主键方案，并与 ADR-0003 选定的 MyBatis-Plus 持久化体系一致。

决定：

1. **所有实体主键改为 `Long` + 数据库 `BIGINT`，注解统一为 `@TableId(type = IdType.ASSIGN_ID)`**，由 MyBatis-Plus 雪花算法在 `insert` 前生成并回填实体；Service 层不再手工生成主键；
2. **所有用户归属与资源外键改为 `Long` + `BIGINT`**（`user_id`、`conversation_id`、`character_id`、`source_message_id` 等）；`turn_id`、`trace_id` 是链路标识而非实体主键，保持 `String` / `VARCHAR`；
3. **workerId / datacenterId 通过环境变量注入**：`SNOWFLAKE_WORKER_ID` / `SNOWFLAKE_DATACENTER_ID`，映射到 `shenyouchu.id.worker-id` / `shenyouchu.id.datacenter-id`，本地开发默认 `1/1`；`MybatisPlusConfig` 用这两个值构造 `DefaultIdentifierGenerator(workerId, datacenterId)` 并注册为 `IdentifierGenerator` bean；
4. **API/JSON 中所有 ID 一律以字符串返回**（`UserView`、`ConversationView`、`CharacterController` 等 DTO 层用 `String.valueOf(id)`），Java 内部保持 `Long`，避免 JavaScript `Number` 双精度丢失雪花 ID 的低位；
5. `V1__baseline.sql` 直接重写为 `BIGINT` 基线，不新增增量迁移。当前只有测试数据，由开发者执行 `docker compose down -v` 重置本地库；`V2__seed_character.sql` 的内置角色使用固定数值 ID `1000000000000000001`。

被否决的方案：

- **保留 UUID v4 字符串**：见上，索引与存储代价不划算，且主键生成分散在 Service 层；
- **UUID v7 / ULID**：时间有序、索引局部性优于 v4，但仍是 16 字节二进制、对外仍是字符串，Java/MySQL/MyBatis-Plus 生态支持不如整数主键直接（JDBC 与 Jackson 都需要额外适配），且同样需要应用层生成逻辑；
- **数据库自增 AUTO_INCREMENT**：写扩散与分库分表迁移成本高，且会暴露业务量；与"应用生成、可离线批量写入"的取舍不符；
- **MyBatis-Plus 默认无参雪花生成器**：workerId 由 MAC/IP 推导，容器化后不可控，容易产生重复 ID；显式配置更可控。

后果与代价：

- **JS 精度**：任何 ID 出接口必须转字符串；新增 DTO 时如果直接返回 `Long`，前端会静默丢失精度。该规则写入开发规范 §3.3 与契约 §1.1，评审时检查；
- **分布式必须保证 workerId 唯一**：多实例（或多主机容器）部署时 `worker-id + datacenter-id` 组合必须全局唯一，否则会生成重复主键并触发唯一键冲突；本地默认 `1/1` 仅适用于单实例；
- **V1 重写与本地数据重置**：这是破坏性 schema 变更，已有本地库必须 `docker compose down -v` 重建，不做数据回填；
- 雪花 ID 内含时间戳，对外暴露会近似泄露生成时间；ID 本就不作为授权凭据，归属校验始终以 `user_id` 为准（契约 §1.3）；
- 64 位 ID 超出 JS 安全整数范围（2^53-1），因此"字符串出接口"不是风格选择而是硬约束。
