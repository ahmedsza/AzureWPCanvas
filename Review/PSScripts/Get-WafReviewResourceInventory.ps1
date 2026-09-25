<#
.SYNOPSIS
Pre-assesses an Azure resource group by listing resources before evidence collection.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Subscription,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [string]$OutputDirectory = (Join-Path (Get-Location).Path 'pre-assessment')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is not installed or not on PATH.'
}

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

az account set --subscription $Subscription | Out-Null
$group = az group show --name $ResourceGroup --output json | ConvertFrom-Json
$resources = @(az resource list --resource-group $ResourceGroup --output json | ConvertFrom-Json)
$summary = $resources | Group-Object type | Sort-Object Count -Descending | ForEach-Object {
    [pscustomobject]@{ type = $_.Name; count = $_.Count }
}

$result = [pscustomobject]@{
    subscription = $Subscription
    resourceGroup = $ResourceGroup
    location = $group.location
    resourceCount = $resources.Count
    resourceTypes = @($summary)
    resources = @($resources | Sort-Object type, name | ForEach-Object {
        [pscustomobject]@{
            name = $_.name
            type = $_.type
            location = $_.location
            kind = $_.kind
            id = $_.id
        }
    })
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
}

$file = Join-Path $OutputDirectory ('pre-assessment-{0}.json' -f ($ResourceGroup -replace '[^A-Za-z0-9_.-]', '-'))
($result | ConvertTo-Json -Depth 100) | Set-Content -Path $file -Encoding utf8

[pscustomobject]@{
    outputFile = (Resolve-Path $file).Path
    inventory = $result
} | ConvertTo-Json -Depth 100
