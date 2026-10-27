#!/usr/bin/env bash
# 拉取 ShenYouChu 本地开发镜像（Git Bash / WSL）
# 用法：
#   bash scripts/pull-images.sh           # M0: mysql + redis
#   bash scripts/pull-images.sh --full    # 追加 etcd + milvus + rustfs
set -uo pipefail

images=(
  "mysql:8.0"
  "redis:7-alpine"
)

if [ "${1:-}" = "--full" ]; then
  images+=(
    "quay.io/coreos/etcd:v3.5.5"
    "milvusdb/milvus:v2.4.0"
    "rustfs/rustfs:latest"
  )
fi

failed=()
for image in "${images[@]}"; do
  echo
  echo "==> docker pull ${image}"
  if ! docker pull "${image}"; then
    failed+=("${image}")
    echo "FAILED: ${image}"
  fi
done

echo
if [ "${#failed[@]}" -gt 0 ]; then
  echo "以下镜像拉取失败，请检查网络或 Docker 镜像加速器："
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
echo "全部请求的镜像拉取完成。"
