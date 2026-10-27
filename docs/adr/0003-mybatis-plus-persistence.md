# 持久化采用 MyBatis-Plus 且显式校验用户归属

- 状态：accepted
- 关联：NFR-5、FR-1.2、FR-1.3、数据与接口契约

项目需要 MySQL 持久化，且多用户隔离是发布门禁。候选方案为 Spring Data JDBC、Spring Data JPA 与 MyBatis-Plus。团队更熟悉 MyBatis-Plus，且 M0 就需要 CRUD、条件分页、逻辑删除与乐观锁；表结构由 Flyway 权威管理，不需要 ORM 生成或校验 DDL。

决定：**M0 起统一使用 MyBatis-Plus（Spring Boot 3.x 对应 starter）**，不再引入 JPA 或 Spring Data JDBC 作为并存的仓储风格。

落地约定：

- 实体使用 `@TableName`、`@TableId`；`deleted_at` 用 `@TableLogic`；`state_version` 用 `@Version` 乐观锁；
- `created_at` / `updated_at` 由 `MetaObjectHandler` 在应用层写入 UTC，不依赖数据库隐式行为；
- 分页使用 `PaginationInnerInterceptor`，数据库类型固定 MySQL；
- **每条用户私有数据查询显式写 `user_id` 条件**，并过滤 `deleted_at`；Mapper 不得提供无归属条件的查询方法；
- MyBatis-Plus 的租户插件只作为附加防线，不作为授权依据；自定义 SQL、XML 与 `@InterceptorIgnore` 必须逐个评审并覆盖隔离测试；
- 复杂查询允许使用 Wrapper、XML 或 `JdbcClient`，但同样遵守归属条件与参数绑定，禁止字符串拼接 SQL。

被否决的方案：

- **Spring Data JPA**：懒加载、持久化上下文与异步链路不匹配，且容易依赖 `ddl-auto` 与框架级过滤，隔离边界不够显式。
- **Spring Data JDBC**：本身合适，但团队熟悉度低，CRUD/分页/逻辑删除需要更多手工代码。
- **JDBC 与 MyBatis-Plus 并存**：两套仓储风格增加评审与维护成本，禁止；需要复杂查询时优先在同一套 MyBatis-Plus 体系内解决。

后果：

- 贡献者需要熟悉 MyBatis-Plus 约定；规范写入开发规范与 Mapper 模板；
- 若未来 MyBatis-Plus 不再维护或升级受阻，迁移面集中在 Mapper 接口与实体注解，业务服务层不感知 SQL 实现；
- MyBatis-Plus 当前不支持 Spring Boot 4.x，项目在 M0–M4 锁定 Spring Boot 3.x。
