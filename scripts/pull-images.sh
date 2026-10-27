#!/usr/bin/env bash
# 拉取 ShenYouChu 本地开发镜像（Git Bash / WSL）
# 本地已存在的镜像会自动跳过。
# 用法：
#   bash scripts/pull-images.sh           # M0: mysql + redis
#   bash scripts/pull-images.sh --full    # 完整栈：追加 etcd + milvus + minio
set -uo pipefail

images=(
  "mysql:8.0"
  "redis:7-alpine"
)

if [ "${1:-}" = "--full" ]; then
  images+=(
    "quay.io/coreos/etcd:v3.5.5"
    "milvusdb/milvus:v2.4.0"
    "bitnamilegacy/minio:latest"
  )
fi

pulled=()
skipped=()
failed=()

for image in "${images[@]}"; do
  if docker image inspect "${image}" >/dev/null 2>&1; then
    echo "SKIP  ${image} (already present)"
    skipped+=("${image}")
    continue
  fi

  echo
  echo "PULL  ${image}"
  if docker pull "${image}"; then
    pulled+=("${image}")
  else
    failed+=("${image}")
    echo "FAILED: ${image}"
  fi
done

echo
echo "Summary: pulled=${#pulled[@]} skipped=${#skipped[@]} failed=${#failed[@]}"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "以下镜像拉取失败，请检查网络或 Docker 镜像加速器："
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
echo "全部所需镜像已就绪。"
