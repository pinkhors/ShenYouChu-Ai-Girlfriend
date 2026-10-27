# 拉取 ShenYouChu 本地开发所需的全部镜像（PowerShell）
# 用法：powershell -ExecutionPolicy Bypass -File scripts/pull-images.ps1
$ErrorActionPreference = "Continue"

$images = @(
    "mysql:8.0",
    "redis:7-alpine",
    "minio/minio:RELEASE.2023-03-20T20-16-18Z",
    "minio/mc:latest",
    "quay.io/coreos/etcd:v3.5.5",
    "milvusdb/milvus:v2.4.0"
)

$failed = @()
foreach ($image in $images) {
    Write-Host ""
    Write-Host "==> docker pull $image" -ForegroundColor Cyan
    docker pull $image
    if ($LASTEXITCODE -ne 0) {
        $failed += $image
        Write-Host "FAILED: $image" -ForegroundColor Red
    }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "以下镜像拉取失败，请检查网络或 Docker 镜像加速器：" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  - $_" }
    exit 1
}
Write-Host "全部镜像拉取完成。" -ForegroundColor Green
