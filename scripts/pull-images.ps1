# Pull all images required by ShenYouChu local development.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/pull-images.ps1
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
    Write-Host "Some images failed to pull. Check network or Docker registry mirror:" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  - $_" }
    exit 1
}
Write-Host "All images pulled successfully." -ForegroundColor Green
