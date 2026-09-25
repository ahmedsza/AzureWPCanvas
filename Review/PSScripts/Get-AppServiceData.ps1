[CmdletBinding()] param([string]$ResourceName,[string]$ResourceType,[Parameter(Mandatory)][string]$ResourceGroup,[Parameter(Mandatory)][string]$OutputDirectory,[string]$Subscription)
. (Join-Path $PSScriptRoot 'Common-AzureCollector.ps1')
$doc=New-CollectorDocument $ResourceType $ResourceName $ResourceGroup $Subscription
$site=Invoke-AzCommandJson 'webapp.show' @('webapp','show','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription -Required; Add-CollectorSection $doc 'show' $site
$config=Invoke-AzCommandJson 'webapp.config' @('webapp','config','show','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription
Add-CollectorSection $doc 'config' $config
Add-CollectorSection $doc 'logging' $config
foreach($item in @(@('appSettings','webapp','config','appsettings','list'),@('connectionStrings','webapp','config','connection-string','list'),@('auth','webapp','auth','show'),@('identity','webapp','identity','show'),@('accessRestrictions','webapp','config','access-restriction','show'),@('vnetIntegration','webapp','vnet-integration','list'))){$commandArguments=@($item[1..($item.Count-1)])+@('--name',$ResourceName,'--resource-group',$ResourceGroup); Add-CollectorSection $doc $item[0] (Invoke-AzCommandJson ('webapp.'+$item[0]) $commandArguments $Subscription)}
Add-CollectorSection $doc 'hostnames' (Invoke-AzCommandJson 'webapp.hostnames' @('webapp','config','hostname','list','--webapp-name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
$slots=Invoke-AzCommandJson 'webapp.slot.list' @('webapp','deployment','slot','list','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription; Add-CollectorSection $doc 'slots' $slots
if($site.data.id){Add-StandardResourceEvidence $doc $site.data.id $Subscription}; $file=Join-Path $OutputDirectory ('appservice-{0}.json' -f (ConvertTo-CollectorSafeFileName $ResourceName)); Save-CollectorDocument $doc $file
foreach($slot in @($slots.data)){& (Join-Path $PSScriptRoot 'Get-AppServiceSlotData.ps1') -ResourceName $ResourceName -SlotName $slot.name -ResourceGroup $ResourceGroup -OutputDirectory $OutputDirectory -Subscription $Subscription | Out-Null}
[pscustomobject]@{resourceType='appService';name=$ResourceName;outputFile=$file}