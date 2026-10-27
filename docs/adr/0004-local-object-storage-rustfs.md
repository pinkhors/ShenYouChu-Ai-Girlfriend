# 本地对象存储暂时改用 RustFS

- 状态：accepted（本地开发范围）
- 关联：docker-compose.yaml、ADR-0003

MinIO 已停止发布免费 Docker 镜像，`minio/minio` 与 `minio/mc` 在 Docker Hub 及 quay.io 均无法拉取（本机镜像源返回 403，属于上游移除而非网络问题）。项目原先依赖 MinIO 保存录像并作为 Milvus 后端存储，需要替代方案。

决定：**本地开发使用 S3 兼容的 RustFS（`rustfs/rustfs:latest`）作为临时对象存储，放在 Compose 的 `full` profile 中**；默认 `docker compose up -d` 只启动 M0 必需的 MySQL 与 Redis，不阻塞核心开发。

约束与影响：

- RustFS 只承担 S3 API 角色，业务与 Milvus 都通过标准 S3 接口访问，不绑定供应商 SDK；
- Milvus 连接 RustFS 的配置尚未实测，启用 `full` profile 时需验证建桶、读写与重启恢复；
- 对象 Key、私有桶、短期签名 URL、删除级联等契约保持不变（见数据与接口契约 7.3）；
- 生产环境不预设 MinIO：可选用自建 MinIO（自行构建镜像）、RustFS、SeaweedFS，或直接使用云对象存储（OSS/S3/COS）；
- 项目自身的录像存储适配器必须通过 S3 接口访问，不允许依赖 MinIO 专有 API。

被否决的方案：

- **自建 MinIO 镜像**：需要从源码构建并自行维护，当前阶段成本高于收益；
- **LocalStack S3**：可拉取，但对 Milvus 所需的 S3 语义兼容性风险更高，更适合做 AWS API 测试；
- **继续等待 MinIO 镜像恢复**：上游已明确不再分发免费镜像，不能作为开发前提。

后续：录制功能进入 P1 时，为对象存储写一层薄适配器，并用集成测试覆盖"上传、私有读取、删除级联"，届时确认 RustFS 或替换为最终选型。
