Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Write-CollectorMessage {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('INFO', 'OK', 'WARN', 'ERROR')][string]$Level = 'INFO'
    )

    $color = switch ($Level) {
        'OK' { 'Green' }
        'WARN' { 'Yellow' }
        'ERROR' { 'Red' }
        default { 'Cyan' }
    }
    Write-Host ('[{0}] [{1}] {2}' -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message) -ForegroundColor $color
}

function Test-AzCliPrerequisites {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw 'Azure CLI (az) was not found in PATH. Install Azure CLI and run az login first.'
    }
}

function ConvertTo-CollectorSafeFileName {
    param([Parameter(Mandatory = $true)][string]$Text)
    return ($Text -replace '[^A-Za-z0-9._-]', '-')
}

function Invoke-AzCommandJson {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$Subscription,
        [switch]$Required
    )

    $fullArguments = [System.Collections.Generic.List[string]]::new()
    $fullArguments.AddRange($Arguments)
    if ($Subscription) {
        $fullArguments.Add('--subscription')
        $fullArguments.Add($Subscription)
    }
    $fullArguments.Add('--output')
    $fullArguments.Add('json')
    $fullArguments.Add('--only-show-errors')

    $quotedArguments = foreach ($argument in $fullArguments) {
        if ($argument -match '\s') { '"{0}"' -f $argument.Replace('"', '\"') } else { $argument }
    }
    Write-CollectorMessage -Message ('Collecting {0}' -f $Label)
    $stderrFile = New-TemporaryFile
    try {
        $raw = & az @fullArguments 2> $stderrFile
        $exitCode = $LASTEXITCODE
        $stderrContent = Get-Content -Path $stderrFile -Raw -ErrorAction SilentlyContinue
        $stderrText = if ($null -eq $stderrContent) { '' } else { $stderrContent.Trim() }
    }
    finally {
        Remove-Item -Path $stderrFile -Force -ErrorAction SilentlyContinue
    }
    $rawText = (($raw | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
    $resultText = if ($exitCode -eq 0 -or $rawText) { $rawText } else { $stderrText }
    $data = $null
    if ($resultText) {
        try { $data = $resultText | ConvertFrom-Json -Depth 100 }
        catch { $data = $resultText }
    }
    $success = $exitCode -eq 0
    $errorText = if ($success) { $null } elseif ($stderrText) { $stderrText } else { $rawText }
    if ($Required -and -not $success) {
        throw ('Required command failed for {0}: {1}' -f $Label, $errorText)
    }
    if ($success) { Write-CollectorMessage -Level 'OK' -Message ('Collected {0}' -f $Label) }
    else { Write-CollectorMessage -Level 'WARN' -Message ('Could not collect {0}' -f $Label) }

    return [pscustomobject]@{
        label = $Label
        command = 'az {0}' -f ($quotedArguments -join ' ')
        success = $success
        exitCode = $exitCode
        error = $errorText
        data = $data
    }
}

function Test-SensitiveName {
    param([AllowNull()][string]$Name)
    return -not [string]::IsNullOrWhiteSpace($Name) -and $Name -match '(?i)(password|passwd|pwd|secret|token|connectionstring|accountkey|sharedaccesskey|sharedkey|clientsecret|sas|instrumentationkey|primarykey|secondarykey)'
}

function Test-SensitiveValue {
    param([AllowNull()][string]$Value)
    return -not [string]::IsNullOrWhiteSpace($Value) -and $Value -match '(?i)(password\s*=|pwd\s*=|accountkey\s*=|sharedaccesssignature=|sig=|clientsecret\s*=|://.+:.+@)'
}

function Protect-CollectorObject {
    param($InputObject, [string]$PropertyName = '')
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [string]) {
        if ((Test-SensitiveName $PropertyName) -or (Test-SensitiveValue $InputObject)) { return 'SECRET_FOUND_REDACTED' }
        return $InputObject
    }
    if ($InputObject -is [ValueType]) { return $InputObject }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $copy = [ordered]@{}
        foreach ($key in $InputObject.Keys) { $copy[$key] = Protect-CollectorObject $InputObject[$key] ([string]$key) }
        return [pscustomobject]$copy
    }
    if ($InputObject -is [System.Collections.IEnumerable]) {
        return @($InputObject | ForEach-Object { Protect-CollectorObject $_ $PropertyName })
    }
    $copy = [ordered]@{}
    foreach ($property in @($InputObject.PSObject.Properties)) {
        $copy[$property.Name] = Protect-CollectorObject $property.Value $property.Name
    }
    return [pscustomobject]$copy
}

function New-CollectorDocument {
    param(
        [Parameter(Mandatory = $true)][string]$ResourceType,
        [Parameter(Mandatory = $true)][string]$ResourceName,
        [Parameter(Mandatory = $true)][string]$ResourceGroup,
        [string]$Subscription
    )
    return [ordered]@{
        metadata = [ordered]@{
            schemaVersion = '4.0'
            generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
            resourceType = $ResourceType
            resourceName = $ResourceName
            resourceGroup = $ResourceGroup
            subscription = $Subscription
            assessmentFocus = @('security', 'reliability')
        }
        sections = [ordered]@{}
    }
}

function Add-CollectorSection {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Document,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]$Result
    )
    $Document.sections[$Name] = [ordered]@{
        success = $Result.success
        command = $Result.command
        exitCode = $Result.exitCode
        error = $Result.error
        data = Protect-CollectorObject $Result.data
    }
}

function Add-StandardResourceEvidence {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Document,
        [Parameter(Mandatory = $true)][string]$ResourceId,
        [string]$Subscription
    )
    Add-CollectorSection $Document 'diagnosticSettings' (Invoke-AzCommandJson 'monitor.diagnostic-settings.list' @('monitor', 'diagnostic-settings', 'list', '--resource', $ResourceId) $Subscription)
    Add-CollectorSection $Document 'locks' (Invoke-AzCommandJson 'lock.list.resource' @('lock', 'list', '--resource', $ResourceId) $Subscription)
    Add-CollectorSection $Document 'roleAssignments' (Invoke-AzCommandJson 'role.assignment.list.resource' @('role', 'assignment', 'list', '--scope', $ResourceId) $Subscription)
}

function Save-CollectorDocument {
    param([Parameter(Mandatory = $true)][hashtable]$Document, [Parameter(Mandatory = $true)][string]$OutputPath)
    $folder = Split-Path -Parent $OutputPath
    if (-not (Test-Path $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    ($Document | ConvertTo-Json -Depth 100) | Set-Content -Path $OutputPath -Encoding utf8
}

function Get-WordPressCollectorScriptName {
    param([Parameter(Mandatory = $true)][string]$ResourceType)
    $collectorMap = @{
        'Microsoft.Web/serverfarms' = 'Get-AppServicePlanData.ps1'
        'Microsoft.Web/sites' = 'Get-AppServiceData.ps1'
        'Microsoft.DBforMySQL/flexibleServers' = 'Get-MySqlFlexibleServerData.ps1'
        'Microsoft.KeyVault/vaults' = 'Get-KeyVaultData.ps1'
        'Microsoft.Cache/Redis' = 'Get-ManagedRedisData.ps1'
        'Microsoft.Cache/redisEnterprise' = 'Get-ManagedRedisData.ps1'
        'Microsoft.Network/natGateways' = 'Get-NatGatewayData.ps1'
        'Microsoft.Cdn/profiles' = 'Get-FrontDoorData.ps1'
        'Microsoft.Cdn/CdnWebApplicationFirewallPolicies' = 'Get-FrontDoorData.ps1'
        'Microsoft.Network/frontDoorWebApplicationFirewallPolicies' = 'Get-FrontDoorData.ps1'
        'Microsoft.Storage/storageAccounts' = 'Get-StorageAccountData.ps1'
        'Microsoft.Communication/communicationServices' = 'Get-AzureCommunicationServicesData.ps1'
        'microsoft.insights/components' = 'Get-AppInsightsData.ps1'
        'Microsoft.OperationalInsights/workspaces' = 'Get-LogAnalyticsWorkspaceData.ps1'
        'Microsoft.Network/virtualNetworks' = 'Get-NetworkTopologyData.ps1'
        'Microsoft.Network/networkSecurityGroups' = 'Get-NetworkTopologyData.ps1'
        'Microsoft.Network/routeTables' = 'Get-NetworkTopologyData.ps1'
        'Microsoft.Network/privateEndpoints' = 'Get-NetworkTopologyData.ps1'
        'Microsoft.Network/privateDnsZones' = 'Get-NetworkTopologyData.ps1'
        'Microsoft.Network/publicIPAddresses' = 'Get-NetworkTopologyData.ps1'
    }
    return $collectorMap[$ResourceType]
}