# M0 verification: register, login token, conversation isolation.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-m0.ps1
param([string]$BaseUrl = "http://127.0.0.1:48080")

$ErrorActionPreference = "Stop"
$suffix = (Get-Date -Format "HHmmssfff") + (Get-Random -Minimum 10 -Maximum 99)
$password = "password123"

function Status-Code($err) {
    try { return [int]$err.Exception.Response.StatusCode } catch { return "n/a" }
}

Write-Host "==> health"
try {
    $health = Invoke-RestMethod -Method Get "$BaseUrl/actuator/health"
    Write-Host "health: $($health.status)"
} catch {
    Write-Host "health check failed: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "==> register alice and bob"
$aliceBody = @{ username = "alice_$suffix"; password = $password } | ConvertTo-Json -Compress
$bobBody = @{ username = "bob_$suffix"; password = $password } | ConvertTo-Json -Compress
$alice = Invoke-RestMethod -Method Post "$BaseUrl/api/v1/auth/register" -ContentType "application/json" -Body $aliceBody
$bob = Invoke-RestMethod -Method Post "$BaseUrl/api/v1/auth/register" -ContentType "application/json" -Body $bobBody
Write-Host "alice: $($alice.user.username) token length $($alice.token.Length)"
Write-Host "bob:   $($bob.user.username) token length $($bob.token.Length)"

Write-Host ""
Write-Host "==> alice creates a conversation"
$convBody = @{ title = "first chat" } | ConvertTo-Json -Compress
$conv = Invoke-RestMethod -Method Post "$BaseUrl/api/v1/conversations" `
    -ContentType "application/json" `
    -Headers @{ Authorization = "Bearer $($alice.token)" } `
    -Body $convBody
Write-Host "conversation id: $($conv.id)"

Write-Host ""
Write-Host "==> bob tries to read alice's conversation (expect 404)"
try {
    Invoke-RestMethod -Method Get "$BaseUrl/api/v1/conversations/$($conv.id)" `
        -Headers @{ Authorization = "Bearer $($bob.token)" } | Out-Null
    Write-Host "FAIL: bob can read alice's conversation"
} catch {
    Write-Host "OK: bob got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> alice lists her conversations (expect 1 item)"
$list = Invoke-RestMethod -Method Get "$BaseUrl/api/v1/conversations" `
    -Headers @{ Authorization = "Bearer $($alice.token)" }
Write-Host "alice conversation count: $($list.items.Count) nextCursor: $($list.nextCursor)"

Write-Host ""
Write-Host "==> conversation pagination envelope (limit=1)"
$listOne = Invoke-RestMethod -Method Get "$BaseUrl/api/v1/conversations?limit=1" `
    -Headers @{ Authorization = "Bearer $($alice.token)" }
Write-Host "page size: $($listOne.items.Count) nextCursor: $($listOne.nextCursor)"
if ($listOne.items.Count -ne 1) { Write-Host "FAIL: conversations envelope not working"; exit 1 }
Write-Host "OK: conversations cursor pagination envelope works"

Write-Host ""
Write-Host "==> duplicate register (expect 409)"
try {
    Invoke-RestMethod -Method Post "$BaseUrl/api/v1/auth/register" -ContentType "application/json" -Body $aliceBody | Out-Null
    Write-Host "FAIL: duplicate register succeeded"
} catch {
    Write-Host "OK: duplicate register got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> anonymous request (expect 401)"
try {
    Invoke-RestMethod -Method Get "$BaseUrl/api/v1/conversations" | Out-Null
    Write-Host "FAIL: anonymous request succeeded"
} catch {
    Write-Host "OK: anonymous got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "verification finished."

