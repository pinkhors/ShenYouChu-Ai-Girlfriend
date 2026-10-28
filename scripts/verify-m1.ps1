# M1 verification: conversation turns, messages, memories, activity events, isolation, SSE.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-m1.ps1
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

# Chinese text built from code points so this script stays ASCII-only.
$likeMovies = -join [char[]](0x6211, 0x559C, 0x6B22, 0x770B, 0x7535, 0x5F71)   # "I like movies"

Write-Host "==> health"
$health = Invoke-Api -Method Get -Path "/actuator/health"
Write-Host "health: $($health.status)"

Write-Host ""
Write-Host "==> register alice and bob"
$alice = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "alice_$suffix"; password = $password }
$bob = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "bob_$suffix"; password = $password }
Write-Host "alice: $($alice.user.username)  bob: $($bob.user.username)"

Write-Host ""
Write-Host "==> alice creates a conversation and sends a turn"
$conv = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $alice.token -Body @{ title = "m1 chat" }
$turn = Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/turns" -Token $alice.token -Body @{ message = $likeMovies }
Write-Host "turnId: $($turn.turnId)"
Write-Host "assistant: $($turn.assistantMessage.content)"

Write-Host ""
Write-Host "==> alice messages (expect 2 items)"
$page = Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages" -Token $alice.token
$messages = $page.items
Write-Host "message count: $($messages.Count) nextCursor: $($page.nextCursor)"

Write-Host ""
Write-Host "==> message pagination (limit=1 expect 1 item and nextCursor)"
$page1 = Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages?limit=1" -Token $alice.token
Write-Host "page size: $($page1.items.Count) nextCursor: $($page1.nextCursor)"
if ($page1.items.Count -ne 1 -or [string]::IsNullOrEmpty($page1.nextCursor)) {
    Write-Host "FAIL: pagination envelope not working"
    exit 1
}
$page2 = Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages?limit=1&cursor=$($page1.nextCursor)" -Token $alice.token
Write-Host "second page id: $($page2.items[0].id) (expect distinct from first)"
if ($page2.items[0].id -eq $page1.items[0].id) {
    Write-Host "FAIL: cursor did not advance"
    exit 1
}
Write-Host "OK: cursor pagination works"

Write-Host ""
Write-Host "==> idempotency: same Idempotency-Key returns same turn"
$idemKey = [guid]::NewGuid().ToString()
$idemHeaders = @{ Authorization = "Bearer $($alice.token)"; "Idempotency-Key" = $idemKey }
$idemBody = @{ message = "idempotency check" } | ConvertTo-Json -Compress
$first = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/conversations/$($conv.id)/turns" -Headers $idemHeaders -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($idemBody))
$second = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/conversations/$($conv.id)/turns" -Headers $idemHeaders -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($idemBody))
Write-Host "first turnId: $($first.turnId)  second turnId: $($second.turnId)"
if ($first.turnId -ne $second.turnId) {
    Write-Host "FAIL: idempotency key did not deduplicate"
    exit 1
}
Write-Host "OK: idempotent replay returns first turn"

Write-Host ""
Write-Host "==> alice memories (expect >= 1, type preference)"
$memories = Invoke-Api -Method Get -Path "/api/v1/memories" -Token $alice.token
Write-Host "memory count: $($memories.Count) type: $($memories[0].memoryType)"

Write-Host ""
Write-Host "==> alice activity events (expect >= 3)"
$events = Invoke-Api -Method Get -Path "/api/v1/activity-events?limit=20" -Token $alice.token
Write-Host "event count: $($events.Count) first: $($events[0].eventType)"

Write-Host ""
Write-Host "==> bob reads alice messages (expect 404)"
try {
    Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages" -Token $bob.token | Out-Null
    Write-Host "FAIL: bob can read alice messages"
} catch {
    Write-Host "OK: bob got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> bob deletes alice memory (expect 404)"
try {
    Invoke-Api -Method Delete -Path "/api/v1/memories/$($memories[0].id)" -Token $bob.token | Out-Null
    Write-Host "FAIL: bob can delete alice memory"
} catch {
    Write-Host "OK: bob got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> SSE stream (expect turn.completed)"
try {
    $sseBody = @{ message = "hello there" } | ConvertTo-Json -Compress
    $sseResponse = Invoke-WebRequest -Method Post `
        -Uri "$BaseUrl/api/v1/conversations/$($conv.id)/turns/stream" `
        -Headers @{ Authorization = "Bearer $($alice.token)" } `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($sseBody)) `
        -UseBasicParsing
    if ($sseResponse.Content -match "turn.completed") {
        Write-Host "OK: SSE completed"
    } else {
        Write-Host "SSE output: $($sseResponse.Content)"
    }
} catch {
    Write-Host "SSE error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "==> cancel unknown turn (expect 404)"
try {
    Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/turns/not-a-real-turn/cancel" -Token $alice.token | Out-Null
    Write-Host "FAIL: unknown turn cancel succeeded"
} catch {
    Write-Host "OK: unknown turn got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> bob cancels alice turn (expect 404)"
try {
    Invoke-Api -Method Post -Path "/api/v1/conversations/$($conv.id)/turns/$($turn.turnId)/cancel" -Token $bob.token | Out-Null
    Write-Host "FAIL: bob cancelled alice turn"
} catch {
    Write-Host "OK: bob got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "==> character state (expect intimacy >= 1)"
$state = Invoke-Api -Method Get -Path "/api/v1/character-state" -Token $alice.token
Write-Host "mood: $($state.mood)  intimacy: $($state.intimacy)"
if ($state.intimacy -lt 1) { Write-Host "FAIL: intimacy did not increase"; exit 1 }
Write-Host "OK: relationship state updated"

Write-Host ""
Write-Host "==> delete conversation cascades (expect messages 404, no memory left)"
Invoke-Api -Method Delete -Path "/api/v1/conversations/$($conv.id)" -Token $alice.token | Out-Null
try {
    Invoke-Api -Method Get -Path "/api/v1/conversations/$($conv.id)/messages" -Token $alice.token | Out-Null
    Write-Host "FAIL: messages still readable after delete"
} catch {
    Write-Host "OK: messages gone, HTTP $(Status-Code $_)"
}
$remaining = @(Invoke-Api -Method Get -Path "/api/v1/memories" -Token $alice.token | Where-Object { $_.conversationId -eq "$($conv.id)" })
Write-Host "memories left for deleted conversation: $($remaining.Count)"

Write-Host ""
Write-Host "==> anonymous request (expect 401)"
try {
    Invoke-Api -Method Get -Path "/api/v1/memories" | Out-Null
    Write-Host "FAIL: anonymous request succeeded"
} catch {
    Write-Host "OK: anonymous got HTTP $(Status-Code $_)"
}

Write-Host ""
Write-Host "M1 verification finished."


