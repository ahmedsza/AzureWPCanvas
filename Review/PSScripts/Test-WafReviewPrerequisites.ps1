<#
.SYNOPSIS
Checks local prerequisites for the WordPress WAF review workflow.
#>
[CmdletBinding()]
param()

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$collector = Join-Path $PSScriptRoot 'Invoke-CollectWordPressPosture.ps1'

function Test-CommandAvailable {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    return $null
}

$checks = @()
$checks += [pscustomobject]@{
    id = 'powershell'
    name = 'PowerShell 7+'
    ok = ($PSVersionTable.PSVersion.Major -ge 7)
    detail = $PSVersionTable.PSVersion.ToString()
}

$azPath = Test-CommandAvailable 'az'
$azVersion = $null
if ($azPath) {
    try {
        $azVersionJson = az version --output json 2>$null | ConvertFrom-Json
        $azVersion = $azVersionJson.'azure-cli'
    }
    catch {
        $azVersion = 'installed, version unavailable'
    }
}
$checks += [pscustomobject]@{
    id = 'az'
    name = 'Azure CLI'
    ok = [bool]$azPath
    detail = if ($azPath) { "$azVersion ($azPath)" } else { 'az command not found' }
}

$account = $null
if ($azPath) {
    try {
        $account = az account show --output json 2>$null | ConvertFrom-Json
    }
    catch {
        $account = $null
    }
}
$checks += [pscustomobject]@{
    id = 'az-login'
    name = 'Azure CLI login'
    ok = [bool]$account
    detail = if ($account) { "$($account.name) [$($account.id)]" } else { 'Run az login' }
}

$checks += [pscustomobject]@{
    id = 'collector'
    name = 'Collector script'
    ok = (Test-Path -LiteralPath $collector)
    detail = $collector
}

$nodePath = Test-CommandAvailable 'node'
$checks += [pscustomobject]@{
    id = 'node'
    name = 'Node.js for PowerPoint build'
    ok = [bool]$nodePath
    detail = if ($nodePath) { $nodePath } else { 'node command not found; reports still generate without PPTX if tooling is unavailable' }
}

[pscustomobject]@{
    ok = -not [bool](@($checks | Where-Object { -not $_.ok }))
    repoRoot = $repoRoot.Path
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    checks = $checks
} | ConvertTo-Json -Depth 10
