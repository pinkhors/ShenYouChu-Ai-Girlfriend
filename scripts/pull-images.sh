#!/usr/bin/env bash
# 拉取 ShenYouChu 本地开发所需的全部镜像（Git Bash / WSL）
# 用法：bash scripts/pull-images.sh
set -uo pipefail

images=(
  "mysql:8.0"
  "redis:7-alpine"
  "minio/minio:RELEASE.2023-03-20T20-16-18Z"
  "minio/mc:latest"
  "quay.io/coreos/etcd:v3.5.5"
  "milvusdb/milvus:v2.4.0"
)

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
echo "全部镜像拉取完成。"
