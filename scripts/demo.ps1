# One-shot demo verification: M0 -> M1 -> M2 -> account deletion.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/demo.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/demo.ps1 -BaseUrl http://127.0.0.1:48080
param([string]$BaseUrl = "http://127.0.0.1:48080")

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

function Run-Step {
    param([string]$Name, [string]$Script)
    Write-Host ""
    Write-Host ("=" * 60)
    Write-Host "STEP: $Name"
    Write-Host ("=" * 60)
    $LASTEXITCODE = 0
    & $Script -BaseUrl $BaseUrl
    if ($LASTEXITCODE -ne 0) {
        throw "step failed: $Name (exit $LASTEXITCODE)"
    }
    Write-Host "STEP PASSED: $Name"
}

$root = Split-Path -Parent $PSScriptRoot
$steps = @(
    @{ Name = "M0 health/auth/isolation"; Script = "$root\scripts\verify-m0.ps1" },
    @{ Name = "M1 turns/messages/memory/activity/SSE/cancel/relationship"; Script = "$root\scripts\verify-m1.ps1" },
    @{ Name = "M2 voice placeholder pipeline"; Script = "$root\scripts\verify-m2.ps1" },
    @{ Name = "Account deletion cascade"; Script = "$root\scripts\verify-account-deletion.ps1" }
)

foreach ($step in $steps) {
    Run-Step -Name $step.Name -Script $step.Script
}

Write-Host ""
Write-Host ("=" * 60)
Write-Host "DEMO VERIFICATION PASSED: all $($steps.Count) steps"
Write-Host ("=" * 60)