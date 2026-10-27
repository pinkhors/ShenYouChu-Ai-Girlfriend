# 本地对象存储采用冻结的 legacy MinIO，生产使用 OSS

- 状态：accepted（本地开发范围）
- 关联：docker-compose.yaml、ADR-0003、T-16

MinIO 已停止发布免费 Docker 镜像，`minio/minio` 与 `minio/mc` 在 Docker Hub 及 quay.io 均无法拉取（本机镜像源返回 403，属于上游移除而非网络问题）。项目原先依赖 MinIO 保存录像并作为 Milvus 后端存储，需要替代方案。

决定：

1. **本地开发**使用 `bitnamilegacy/minio:latest`（Bitnami 在 MinIO 下架后接管的冻结镜像）作为 S3 兼容对象存储，放在 Compose 的 `full` profile 中；默认 `docker compose up -d` 只启动 M0 必需的 MySQL 与 Redis。
2. **生产环境**首选阿里云 OSS（S3 兼容模式或官方 SDK 适配器），不把冻结镜像带入生产。

约束与影响：

- legacy MinIO 只承担 S3 API 角色，业务与 Milvus 通过标准 S3 接口访问，不绑定专有 API；
- 该镜像版本冻结、不再接收安全更新，**仅限本地开发**；升级或生产必须替换；
- 本地镜像使用 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` / `MINIO_DEFAULT_BUCKETS=shenyouchu`，端口仍为 9000（S3）与 9001（控制台）；
- 对象 Key、私有桶、短期签名 URL、删除级联等契约保持不变（见数据与接口契约 7.3）；
- 阿里云 OSS 提供 S3 兼容 API，但有官方文档化的操作限制，不能假设与 S3 完全等价；接入前必须核验签名 URL、分片上传、列举与删除操作，必要时增加 OSS 官方 SDK 适配器；
- Milvus 使用 OSS 作为后端存储属于风险点，需要单独验证；录像存储与向量存储可以解耦，例如录像走 OSS、Milvus 继续使用本地或自建 S3 存储。

被否决或延后的方案：

- **`minio/minio` 官方镜像**：上游已不再分发，无法作为开发前提；
- **`bitnamicharts/minio`**：这是 Helm Chart（OCI 制品），不是可 `docker run` 的容器镜像，仅适用于 Kubernetes 场景；
- **RustFS**：可拉取且维护活跃，但与 Milvus 的兼容性尚未验证，作为备选保留；
- **LocalStack S3**：更适合 AWS API 测试，Milvus 所需的 S3 语义兼容性风险较高；
- **自建 MinIO 镜像**：需从源码构建并自行维护，当前阶段成本高于收益。

后续：录制功能进入 P1 时，为对象存储实现 `ObjectStoragePort` 薄适配器，先接本地 S3，再接 OSS，并用集成测试覆盖"上传、私有读取、删除级联"。
