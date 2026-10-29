# One-to-one conversation verification: auto-create, idempotent POST, clear, no delete.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/verify-character.ps1
param([string]$BaseUrl = "http://127.0.0.1:48080")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$suffix = (Get-Date -Format "HHmmssfff") + (Get-Random -Minimum 10 -Maximum 99)
$password = "password123"
$token1 = $null
$token2 = $null

function Status-Code($err) {
    try { return [int]$err.Exception.Response.StatusCode } catch { return "n/a" }
}

function Invoke-Api {
    param([string]$Method, [string]$Path, [string]$Token, $Body)
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers }
    if ($Body -ne $null) {
        $json = $Body | ConvertTo-Json -Depth 20 -Compress
        $params["ContentType"] = "application/json; charset=utf-8"
        $params["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    return Invoke-RestMethod @params
}

function Assert-True($condition, $message) {
    if (-not $condition) { throw "ASSERT FAILED: $message" }
    Write-Host "PASS $message"
}

function Text-Of($value) {
    if ($null -eq $value) { return 'null' }
    return ($value | ConvertTo-Json -Depth 12 -Compress)
}

function Occurrences($text, $needle) {
    return ([regex]::Matches($text, [regex]::Escape($needle))).Count
}

function Conversation-Id($text, $characterId) {
    if ([string]::IsNullOrWhiteSpace([string]$text)) { return $null }
    $parsed = $text | ConvertFrom-Json
    if ($null -eq $parsed) { return $null }
    $items = @($parsed)
    if ($parsed.items -ne $null) {
        $items = @($parsed.items)
    } elseif ($items.Count -eq 1 -and $items[0].value -ne $null) {
        $items = @($items[0].value)
    }
    $match = $items | Where-Object { $_.characterId -eq $characterId } | Select-Object -First 1
    if ($null -eq $match) { return $null }
    return [string]$match.id
}

# Chinese text built from code points so this script stays ASCII-only.
$likeMovies = -join [char[]](0x6211, 0x559C, 0x6B22, 0x770B, 0x7535, 0x5F71)   # "I like movies"

try {
    Write-Host "==> health"
    $health = Invoke-Api -Method Get -Path "/actuator/health"
    Assert-True ($health.status -eq "UP") "backend health is UP"

    Write-Host ""
    Write-Host "==> register two users"
    $alice = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "alice_char_$suffix"; password = $password }
    $bob = Invoke-Api -Method Post -Path "/api/v1/auth/register" -Body @{ username = "bob_char_$suffix"; password = $password }
    $token1 = $alice.token
    $token2 = $bob.token
    Write-Host "alice: $($alice.user.username)  bob: $($bob.user.username)"

    Write-Host ""
    Write-Host "==> official character and auto conversation"
    $characters = Invoke-Api -Method Get -Path "/api/v1/characters" -Token $token1
    $official = @($characters) | Where-Object { $_.isOfficial -eq $true } | Select-Object -First 1
    Assert-True ($null -ne $official) "official character is listed"
    $conversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations" -Token $token1)
    $officialConversationId = Conversation-Id $conversationText $official.id
    Assert-True ($officialConversationId -ne $null) "official conversation is auto-created on first list"
    Assert-True ((Occurrences $conversationText $official.id) -eq 1) "official character has exactly one conversation"

    $officialAgain = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $token1 -Body @{}
    Assert-True ($officialAgain.id -eq $officialConversationId) "POST /conversations reuses official conversation"
    $conversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations" -Token $token1)
    Assert-True ((Occurrences $conversationText $official.id) -eq 1) "repeated POST does not duplicate official conversation"

    try {
        Invoke-Api -Method Patch -Path "/api/v1/characters/$($official.id)" -Token $token1 -Body @{ displayName = "hacked"; version = 0 } | Out-Null
        throw "official patch should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 403) "official character PATCH returns 403"
    }

    Write-Host ""
    Write-Host "==> duplicate official character"
    $copy = Invoke-Api -Method Post -Path "/api/v1/characters/$($official.id)/duplicate" -Token $token1 -Body @{ displayName = "SmokeCopy" }
    Assert-True ($copy.isOfficial -eq $false) "official copy becomes a custom character"
    $copyConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$($copy.id)" -Token $token1)
    Assert-True ((Conversation-Id $copyConversationText $copy.id) -ne $null) "copy gets one conversation automatically"
    $copyPurged = Invoke-Api -Method Post -Path "/api/v1/characters/$($copy.id)/purge" -Token $token1 -Body @{ confirmName = "SmokeCopy" }
    Assert-True ($copyPurged.conversations -eq 1) "copy purge cascades its one conversation"

    Write-Host ""
    Write-Host "==> create custom character"
    $avatar = @{
        skinTone = "natural"; hairStyle = "long-wave"; hairColor = "chestnut"
        faceShape = 0.6; eyeColor = "amber"; eyeSize = 0.55; eyeSpacing = 0.5
        browStyle = "soft"; lipColor = "coral"; lipFullness = 0.5; blush = 0.4
        outfitStyle = "knit"; outfitColor = "cream"; accessory = "hairpin"
    }
    $personality = @{
        archetype = "tsundere"; modifiers = @("soft-tsundere")
        intensity = "medium"; initiative = "medium"
        addressUser = "you"; selfRef = "name"; jealousy = "low"
    }
    $family = @{ growth = "city"; relations = "polite"; economy = "ordinary"; extraNote = "note" }
    $created = Invoke-Api -Method Post -Path "/api/v1/characters" -Token $token1 -Body @{
        displayName = "SmokeA"; age = 26; intro = "smoke test"
        avatarConfig = $avatar; personality = $personality; family = $family
    }
    $characterId = $created.id
    Assert-True ($created.isOfficial -eq $false) "custom character is not official"

    $customConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    $customConversationId = Conversation-Id $customConversationText $characterId
    Assert-True ($customConversationId -ne $null) "custom character gets one conversation automatically"
    $createdAgain = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $token1 -Body @{ characterId = $characterId }
    Assert-True ($createdAgain.id -eq $customConversationId) "POST /conversations reuses custom conversation"
    $allConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations" -Token $token1)
    Assert-True ((Occurrences $allConversationText $characterId) -eq 1) "custom character has exactly one conversation after repeated POST"

    $fetched = Invoke-Api -Method Get -Path "/api/v1/characters/$characterId" -Token $token1
    $updated = Invoke-Api -Method Patch -Path "/api/v1/characters/$characterId" -Token $token1 -Body @{ displayName = "SmokeA2"; version = $fetched.version }
    Assert-True ($updated.displayName -eq "SmokeA2") "PATCH updates display name"
    try {
        Invoke-Api -Method Patch -Path "/api/v1/characters/$characterId" -Token $token1 -Body @{ displayName = "Stale"; version = $fetched.version } | Out-Null
        throw "stale version should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "stale PATCH returns 409"
    }

    $activate = Invoke-Api -Method Put -Path "/api/v1/preferences/active-character" -Token $token1 -Body @{ characterId = $characterId }
    Assert-True ($activate.activeCharacterId -eq $characterId) "active character switches"
    Assert-True ($activate.conversationId -eq $customConversationId) "switch returns the unique conversationId"

    Write-Host ""
    Write-Host "==> turn / memory / clear"
    $turn = Invoke-Api -Method Post -Path "/api/v1/conversations/$customConversationId/turns" -Token $token1 -Body @{ message = $likeMovies }
    Assert-True ($turn.assistantMessage.content.Length -gt 0) "turn returns assistant reply"
    $memoriesText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/memories?characterId=$characterId" -Token $token1)
    Assert-True ($memoriesText.Contains($characterId)) "memory is written and carries characterId"

    $cleared = Invoke-Api -Method Post -Path "/api/v1/conversations/$customConversationId/clear" -Token $token1
    Assert-True ([string]::IsNullOrEmpty([string]$cleared)) "clear returns 204/no body"
    $messagesText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations/$customConversationId/messages?limit=20" -Token $token1)
    Assert-True ($messagesText.Contains('"items":[]')) "clear removes messages"
    $afterClearConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True ((Conversation-Id $afterClearConversationText $characterId) -eq $customConversationId) "clear keeps the unique conversation"
    $afterClearMemoryText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/memories?characterId=$characterId" -Token $token1)
    Assert-True (-not ($afterClearMemoryText -match [regex]::Escape($characterId))) "clear removes character memories"

    try {
        Invoke-Api -Method Delete -Path "/api/v1/conversations/$customConversationId" -Token $token1 | Out-Null
        throw "conversation delete should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "conversation DELETE returns 409"
    }

    Write-Host ""
    Write-Host "==> archive / restore / purge"
    $archived = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/archive" -Token $token1
    Assert-True ($archived.character.status -eq "archived") "archive changes status"
    Assert-True ($archived.activeCharacterId -eq $official.id) "archiving active character falls back to official"
    $archivedConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True ((Conversation-Id $archivedConversationText $characterId) -eq $customConversationId) "archive keeps the conversation"

    try {
        Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $token1 -Body @{ characterId = $characterId } | Out-Null
        throw "archived conversation ensure should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "archived character ensure returns 409"
    }

    $restored = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/restore" -Token $token1
    Assert-True ($restored.character.status -eq "active") "restore reactivates character"
    $restoredConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True ((Conversation-Id $restoredConversationText $characterId) -eq $customConversationId) "restore keeps the same conversation"

    $purged = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/purge" -Token $token1 -Body @{ confirmName = "SmokeA2" }
    Assert-True ($purged.conversations -eq 1) "purge removes the one conversation"
    $afterPurgeText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True ((Conversation-Id $afterPurgeText $characterId) -eq $null) "purged character has no conversation"

    Write-Host ""
    Write-Host "==> cross-user isolation"
    try {
        Invoke-Api -Method Get -Path "/api/v1/characters/$characterId" -Token $token2 | Out-Null
        throw "cross-user character read should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 404) "other user cannot read custom character (404)"
    }
    $crossConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token2)
    Assert-True (-not $crossConversationText.Contains($characterId)) "other user sees no custom conversation"

    Write-Host ""
    Write-Host "ONE-TO-ONE CONVERSATION SMOKE OK"
} finally {
    Write-Host ""
    Write-Host "==> cleanup"
    if ($token1) {
        try { Invoke-Api -Method Post -Path "/api/v1/account/deletion" -Token $token1 | Out-Null } catch { Write-Host "alice cleanup failed: $(Status-Code $_)" }
    }
    if ($token2) {
        try { Invoke-Api -Method Post -Path "/api/v1/account/deletion" -Token $token2 | Out-Null } catch { Write-Host "bob cleanup failed: $(Status-Code $_)" }
    }
}
