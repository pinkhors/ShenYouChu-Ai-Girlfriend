# scripts/

跨前后端的开发与验收脚本。这里只放脚本，不放任何包管理文件（`package.json`、锁文件、`node_modules` 一律属于各自的 `apps/*`）。

| 脚本 | 用途 | 依赖 |
|---|---|---|
| `pull-images.ps1` | 拉取本地开发镜像；`-Full` 追加 etcd、Milvus、legacy MinIO | Docker Desktop |
| `pull-images.sh` | 同上，Git Bash / WSL 版本 | Docker Desktop |
| `verify-m0.ps1` | 后端 M0 端到端验收：健康检查、注册、会话越权 404、重复注册 409、匿名 401 | 后端运行在 `http://127.0.0.1:48080` |
| `verify-m1.ps1` | 后端 M1 验收：轮次、消息、记忆、活动事件、越权、SSE 流式 | 同上 |
| `verify-m2.ps1` | 后端 M2 验收：语音占位链路（ASR→轮次→TTS）、非法 Base64、越权 | 同上 |

## 使用

```powershell
# 镜像
powershell -ExecutionPolicy Bypass -File scripts\pull-images.ps1 -Full

# 后端验收（服务需已启动）
powershell -ExecutionPolicy Bypass -File scripts\verify-m0.ps1
```

## 命名约定

- `verify-<里程碑>.ps1`：端到端验收脚本，失败时返回非零退出码；
- `pull-*`、`init-*`、`reset-*`：环境准备类脚本；
- 新增脚本必须在本文件登记用途与前置条件；
- 脚本产生的缓存、日志、数据目录一律写入 `.gitignore`，不得提交。
