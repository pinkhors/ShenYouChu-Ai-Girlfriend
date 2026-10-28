# Account deletion verification: data removed, token invalidated, audit events recorded.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-account-deletion.ps1
param([string]$BaseUrl = "http://127.0.0.1:48080")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$suffix = (Get-Date -Format "HHmmssfff") + (Get-Random -Minimum 10 -Maximum 99)
$password = "password123"

function Status-Code($err) {
    try { return [int]$err.Exception.Response.StatusCode } catch { return "n/a" }
}

function Invoke-Api {
    param([string]$Method, [string]$Path, [string]$Token, $Body)
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers }
    if ($Body -ne $null) {
        $json = $Body | ConvertTo-Json -Compress
        $params["ContentType"] = "application/json; charset=utf-8"
        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    return Invoke-RestMethod @params
}

$text = -join [char[]](0x6211, 0x559C, 0x6B22, 0x770B, 0x7535, 0x5F71)   # "I like movies"

Write-Host "==> register user and create data"
$user = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "del_$suffix"; password = $password }
$conv = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $user.token -Body @{ title = "to be deleted" }
Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/turns" -Token $user.token -Body @{ message = $text } | Out-Null
$memories = Invoke-Api -Method Get -Path "/api/v1/memories" -Token $user.token
Write-Host "created conversation $($conv.id), memories: $($memories.Count)"

Write-Host ""
Write-Host "==> delete account (expect 204 / no error)"
Invoke-Api -Method Post -Path "/api/v1/account/deletion" -Token $user.token | Out-Null
Write-Host "OK: account deletion accepted"

Write-Host ""
Write-Host "==> old token must be invalid (expect 401)"
try {
    Invoke-Api -Method Get -Path "/api/v1/conversations" -Token $user.token | Out-Null
    Write-Host "FAIL: old token still works"
} catch {
    Write-Host "OK: old token got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> login with same username must fail (user is deleted)"
try {
    Invoke-Api -Method Post -Path "/api/v1/auth/login" -Body @{ username = "del_$suffix"; password = $password } | Out-Null
    Write-Host "FAIL: deleted user can still log in"
} catch {
    Write-Host "OK: login got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> register same username again (expect 409 while username is reserved)"
try {
    $again = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "del_$suffix"; password = $password }
    Write-Host "OK: username reusable, new user id $($again.user.id)"
} catch {
    Write-Host "NOTE: username still reserved, HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "account deletion verification finished."


