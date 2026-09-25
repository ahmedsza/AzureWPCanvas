<#
.SYNOPSIS
Lists Azure subscriptions or resource groups for the WAF review workflow.
#>
[CmdletBinding()]
param(
    [switch]$Current,
    [string]$Subscription
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI is not installed or not on PATH.'
}

if ($Current) {
    $account = az account show --output json | ConvertFrom-Json
    [pscustomobject]@{
        kind = 'currentSubscription'
        subscription = [pscustomobject]@{
            id = $account.id
            name = $account.name
            tenantId = $account.tenantId
            state = $account.state
            isDefault = $true
        }
    } | ConvertTo-Json -Depth 10
    return
}

if ([string]::IsNullOrWhiteSpace($Subscription)) {
    $subscriptions = az account list --output json | ConvertFrom-Json
    [pscustomobject]@{
        kind = 'subscriptions'
        subscriptions = @($subscriptions | Sort-Object name | ForEach-Object {
            [pscustomobject]@{
                id = $_.id
                name = $_.name
                tenantId = $_.tenantId
                state = $_.state
                isDefault = [bool]$_.isDefault
            }
        })
    } | ConvertTo-Json -Depth 10
    return
}

$groups = az group list --subscription $Subscription --only-show-errors --output json | ConvertFrom-Json
[pscustomobject]@{
    kind = 'resourceGroups'
    subscription = $Subscription
    resourceGroups = @($groups | Sort-Object name | ForEach-Object {
        [pscustomobject]@{
            name = $_.name
            location = $_.location
            provisioningState = $_.properties.provisioningState
        }
    })
} | ConvertTo-Json -Depth 10
