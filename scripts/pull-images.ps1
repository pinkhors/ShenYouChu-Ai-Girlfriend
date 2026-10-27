# Pull images required by ShenYouChu local development.
# Images already present locally are skipped.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/pull-images.ps1          # M0: mysql + redis
#   powershell -ExecutionPolicy Bypass -File scripts/pull-images.ps1 -Full    # full stack: + etcd + milvus + minio
param([switch]$Full)

$ErrorActionPreference = "Continue"

$images = @(
    "mysql:8.0",
    "redis:7-alpine"
)

if ($Full) {
    $images += @(
        "quay.io/coreos/etcd:v3.5.5",
        "milvusdb/milvus:v2.4.0",
        "bitnamilegacy/minio:latest"
    )
}

$pulled = @()
$skipped = @()
$failed = @()

foreach ($image in $images) {
    docker image inspect $image *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SKIP  $image (already present)" -ForegroundColor DarkGray
        $skipped += $image
        continue
    }

    Write-Host ""
    Write-Host "PULL  $image" -ForegroundColor Cyan
    docker pull $image
    if ($LASTEXITCODE -eq 0) {
        $pulled += $image
    } else {
        $failed += $image
        Write-Host "FAILED: $image" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Summary: pulled=$($pulled.Count) skipped=$($skipped.Count) failed=$($failed.Count)"
if ($failed.Count -gt 0) {
    Write-Host "Failed images (check network or Docker registry mirror):" -ForegroundColor Yellow
    $failed | ForEach-Object { Write-Host "  - $_" }
    exit 1
}
Write-Host "All required images are available." -ForegroundColor Green
