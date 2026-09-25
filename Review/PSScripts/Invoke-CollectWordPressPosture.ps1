<#
.SYNOPSIS
Collects security and reliability evidence for WordPress on Azure App Service.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [string]$OutputDirectory = (Join-Path (Get-Location).Path ('wordpress-posture-{0}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))),
    [string]$Subscription
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'Common-AzureCollector.ps1')
Test-AzCliPrerequisites

if (-not $Subscription) {
    $account = Invoke-AzCommandJson 'account.show' @('account', 'show') $null -Required
    $Subscription = [string]$account.data.id
}
if (-not (Test-Path $OutputDirectory)) { New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null }

$resourceResult = Invoke-AzCommandJson 'resource.list' @('resource', 'list', '--resource-group', $ResourceGroup) $Subscription -Required
$resources = @($resourceResult.data)
$inventory = New-CollectorDocument 'Microsoft.Resources/resourceGroups' $ResourceGroup $ResourceGroup $Subscription
Add-CollectorSection $inventory 'resourceGroup' (Invoke-AzCommandJson 'group.show' @('group', 'show', '--name', $ResourceGroup) $Subscription)
Add-CollectorSection $inventory 'resources' $resourceResult
Add-CollectorSection $inventory 'locks' (Invoke-AzCommandJson 'lock.list.resourceGroup' @('lock', 'list', '--resource-group', $ResourceGroup) $Subscription)
Add-CollectorSection $inventory 'roleAssignments' (Invoke-AzCommandJson 'role.assignment.list.resourceGroup' @('role', 'assignment', 'list', '--resource-group', $ResourceGroup) $Subscription)

$manifest = [ordered]@{
    metadata = [ordered]@{ schemaVersion = '4.0'; generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o'); resourceGroup = $ResourceGroup; subscription = $Subscription }
    discovery = [ordered]@{ totalResourcesInGroup = $resources.Count; resourceTypes = @($resources.type | Sort-Object -Unique) }
    outputs = @()
    unsupportedResources = @()
    errors = @()
}

function Invoke-WordPressCollector {
    param([string]$ScriptName, [hashtable]$Parameters)
    $scriptPath = Join-Path $PSScriptRoot $ScriptName
    if (-not (Test-Path $scriptPath)) {
        $manifest.errors += [ordered]@{ script = $ScriptName; message = 'Collector script is not present.' }
        return
    }
    try {
        $result = & $scriptPath @Parameters
        if ($result) { $manifest.outputs += @($result) }
    }
    catch {
        $manifest.errors += [ordered]@{ script = $ScriptName; message = $_.Exception.Message }
        Write-CollectorMessage -Level 'WARN' -Message ('Collector failed: {0} ({1})' -f $ScriptName, $_.Exception.Message)
    }
}

foreach ($resource in $resources) {
    $scriptName = Get-WordPressCollectorScriptName $resource.type
    if (-not $scriptName) {
        $manifest.unsupportedResources += [ordered]@{ name = $resource.name; type = $resource.type; id = $resource.id; kind = $resource.kind }
        continue
    }
    $parameters = @{ ResourceGroup = $ResourceGroup; OutputDirectory = $OutputDirectory; Subscription = $Subscription; ResourceName = $resource.name; ResourceType = $resource.type }
    Invoke-WordPressCollector $scriptName $parameters
}

$inventoryFile = Join-Path $OutputDirectory 'resource-group-inventory.json'
Save-CollectorDocument $inventory $inventoryFile
$manifest.outputs += [pscustomobject]@{ resourceType = 'resourceGroupInventory'; name = $ResourceGroup; outputFile = $inventoryFile }

$resourceIdsFile = Join-Path $OutputDirectory 'discovered-resource-ids.json'
@($resources.id) | ConvertTo-Json | Set-Content -Path $resourceIdsFile -Encoding utf8
Invoke-WordPressCollector 'Get-DefenderForCloudData.ps1' @{ ResourceGroup = $ResourceGroup; OutputDirectory = $OutputDirectory; Subscription = $Subscription; ResourceIdsFile = $resourceIdsFile }

$manifestFile = Join-Path $OutputDirectory 'collection-manifest.json'
($manifest | ConvertTo-Json -Depth 100) | Set-Content -Path $manifestFile -Encoding utf8
Write-CollectorMessage -Level 'OK' -Message ('Collection completed. Manifest: {0}' -f $manifestFile)

$outputDirectoryInfo = Get-Item -LiteralPath $OutputDirectory
$archiveName = '{0}-{1}-{2}.zip' -f $outputDirectoryInfo.Name, (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssfffZ'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$archiveFile = Join-Path $outputDirectoryInfo.Parent.FullName $archiveName
Compress-Archive -LiteralPath $outputDirectoryInfo.FullName -DestinationPath $archiveFile -CompressionLevel Optimal -ErrorAction Stop
Write-CollectorMessage -Level 'OK' -Message ('Collection archive: {0}' -f $archiveFile)

[pscustomobject]@{ outputDirectory = $outputDirectoryInfo.FullName; manifest = $manifestFile; zipFile = $archiveFile; discoveredResources = $resources.Count }