# Character Studio verification: CRUD, switch, isolation, archive/restore, purge.
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
    return ($value | ConvertTo-Json -Depth 12 -Compress)
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
    Write-Host "==> official character"
    $characters = Invoke-Api -Method Get -Path "/api/v1/characters" -Token $token1
    $official = @($characters) | Where-Object { $_.isOfficial -eq $true } | Select-Object -First 1
    Assert-True ($null -ne $official) "official character is listed"
    Assert-True ($official.isActive -eq $true) "official is active by default"

    try {
        Invoke-Api -Method Patch -Path "/api/v1/characters/$($official.id)" -Token $token1 -Body @{ displayName = "hacked"; version = $official.version } | Out-Null
        throw "official patch should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 403) "official PATCH returns 403"
    }

    $copy = Invoke-Api -Method Post -Path "/api/v1/characters/$($official.id)/duplicate" -Token $token1 -Body @{ displayName = "SmokeCopy" }
    Assert-True ($copy.isOfficial -eq $false) "official copy becomes a custom character"
    $copyPurged = Invoke-Api -Method Post -Path "/api/v1/characters/$($copy.id)/purge" -Token $token1 -Body @{ confirmName = "SmokeCopy" }
    Assert-True ($null -ne $copyPurged.activeCharacterId) "duplicate can be purged"

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
    Assert-True ($created.personality.addressUser -eq "you") "personality round-trips"
    Assert-True ($created.avatarConfig.outfitStyle -eq "knit") "avatar outfitStyle round-trips"
    Assert-True ($created.family.extraNote -eq "note") "family extraNote round-trips"

    $fetched = Invoke-Api -Method Get -Path "/api/v1/characters/$characterId" -Token $token1
    $updated = Invoke-Api -Method Patch -Path "/api/v1/characters/$characterId" -Token $token1 -Body @{ displayName = "SmokeA2"; version = $fetched.version }
    Assert-True ($updated.displayName -eq "SmokeA2") "PATCH updates display name"
    Assert-True ($updated.version -gt $fetched.version) "PATCH increments version"

    try {
        Invoke-Api -Method Patch -Path "/api/v1/characters/$characterId" -Token $token1 -Body @{ displayName = "Stale"; version = $fetched.version } | Out-Null
        throw "stale version should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "stale PATCH returns 409"
    }

    $activate = Invoke-Api -Method Put -Path "/api/v1/preferences/active-character" -Token $token1 -Body @{ characterId = $characterId }
    Assert-True ($activate.activeCharacterId -eq $characterId) "active character switches"

    $state = Invoke-Api -Method Get -Path "/api/v1/character-state?characterId=$characterId" -Token $token1
    Assert-True ($state.characterId -eq $characterId) "character-state accepts characterId"

    Write-Host ""
    Write-Host "==> conversation / turn / memory"
    $conversation = Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $token1 -Body @{ title = "smoke"; characterId = $characterId }
    Assert-True ($conversation.characterId -eq $characterId) "conversation binds character"

    $turn = Invoke-Api -Method Post -Path "/api/v1/conversations/$($conversation.id)/turns" -Token $token1 -Body @{ message = $likeMovies }
    Assert-True ($turn.assistantMessage.content.Length -gt 0) "turn returns assistant reply"

    $memoriesText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/memories?characterId=$characterId" -Token $token1)
    Assert-True ($memoriesText.Contains($characterId)) "memory is written and carries characterId"

    $conversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True ($conversationText.Contains($characterId)) "conversation list filters by character"

    Write-Host ""
    Write-Host "==> archive / restore / purge"
    $archived = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/archive" -Token $token1
    Assert-True ($archived.character.status -eq "archived") "archive changes status"
    Assert-True ($archived.activeCharacterId -eq $official.id) "archiving active character falls back to official"

    $defaultText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/characters" -Token $token1)
    Assert-True (-not $defaultText.Contains($characterId)) "archived character hidden by default"
    $allText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/characters?includeArchived=true" -Token $token1)
    Assert-True ($allText.Contains($characterId)) "archived character shown with includeArchived"

    try {
        Invoke-Api -Method Post -Path "/api/v1/conversations" -Token $token1 -Body @{ characterId = $characterId } | Out-Null
        throw "archived conversation creation should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "archived character rejects new conversation with 409"
    }

    $restored = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/restore" -Token $token1
    Assert-True ($restored.character.status -eq "active") "restore reactivates character"

    try {
        Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/purge" -Token $token1 -Body @{ confirmName = "wrong name" } | Out-Null
        throw "purge with wrong confirm name should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 409) "purge rejects wrong confirm name with 409"
    }

    $purged = Invoke-Api -Method Post -Path "/api/v1/characters/$characterId/purge" -Token $token1 -Body @{ confirmName = "SmokeA2" }
    Assert-True ($purged.conversations -ge 1) "purge reports conversation count"
    Assert-True ($purged.memories -ge 1) "purge reports memory count"
    $afterPurgeText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/characters?includeArchived=true" -Token $token1)
    Assert-True (-not $afterPurgeText.Contains($characterId)) "purged character is gone"
    $afterPurgeConversationText = Text-Of (Invoke-Api -Method Get -Path "/api/v1/conversations?characterId=$characterId" -Token $token1)
    Assert-True (-not $afterPurgeConversationText.Contains($characterId)) "purge cascades conversations"

    Write-Host ""
    Write-Host "==> cross-user isolation"
    try {
        Invoke-Api -Method Get -Path "/api/v1/characters/$characterId" -Token $token2 | Out-Null
        throw "cross-user character read should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 404) "other user cannot read custom character (404)"
    }
    try {
        Invoke-Api -Method Get -Path "/api/v1/character-state?characterId=$characterId" -Token $token2 | Out-Null
        throw "cross-user state read should fail"
    } catch {
        Assert-True ((Status-Code $_) -eq 404) "other user cannot query character-state (404)"
    }

    Write-Host ""
    Write-Host "CHARACTER SMOKE OK"
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
