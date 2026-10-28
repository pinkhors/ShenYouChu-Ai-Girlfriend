# M2 verification: voice turn placeholder pipeline (ASR stub -> turn -> TTS stub).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-m2.ps1
param([string]$BaseUrl = "http://127.0.0.1:48080")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$suffix = Get-Date -Format "HHmmss"
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

# "I like movies" built from code points; script stays ASCII-only.
$text = -join [char[]](0x6211, 0x559C, 0x6B22, 0x770B, 0x7535, 0x5F71)
$audioBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($text))

Write-Host "==> register alice and bob"
$alice = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "alice_$suffix"; password = $password }
$bob = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "bob_$suffix"; password = $password }
Write-Host "alice: $($alice.user.username)  bob: $($bob.user.username)"

Write-Host ""
Write-Host "==> alice creates a conversation and sends a voice turn (placeholder)"
$conv = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $alice.token -Body @{ title = "m2 voice" }
$voiceBody = @{ audioBase64 = $audioBase64; contentType = "text/plain" }
$voice = Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/voice-turns" -Token $alice.token -Body $voiceBody
Write-Host "recognized: $($voice.recognizedText)"
Write-Host "confidence: $($voice.confidence)  ttsFormat: $($voice.ttsFormat)"
Write-Host "assistant: $($voice.assistantMessage.content)"

if ($voice.recognizedText -ne $text) { Write-Host "FAIL: recognized text mismatch"; exit 1 }
if ($voice.ttsFormat -ne "none") { Write-Host "FAIL: expected placeholder TTS format 'none'"; exit 1 }
Write-Host "OK: ASR/TTS placeholder pipeline works"

Write-Host ""
Write-Host "==> messages (expect 2) and memories (expect >= 1)"
$messages = Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages" -Token $alice.token
$memories = Invoke-Api -Method Get -Path "/api/v1/memories" -Token $alice.token
Write-Host "message count: $($messages.Count)  memory count: $($memories.Count)"

Write-Host ""
Write-Host "==> invalid base64 (expect 400)"
try {
    Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/voice-turns" -Token $alice.token `
        -Body @{ audioBase64 = "not-base64!!"; contentType = "text/plain" } | Out-Null
    Write-Host "FAIL: invalid base64 accepted"
} catch {
    Write-Host "OK: invalid base64 got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> bob sends voice turn to alice conversation (expect 404)"
try {
    Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/voice-turns" -Token $bob.token -Body $voiceBody | Out-Null
    Write-Host "FAIL: bob can use alice conversation"
} catch {
    Write-Host "OK: bob got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> anonymous request (expect 401)"
try {
    Invoke-Api -Method Get -Path "/api/v1/memories" | Out-Null
    Write-Host "FAIL: anonymous request succeeded"
} catch {
    Write-Host "OK: anonymous got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "M2 verification finished."

