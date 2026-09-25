[CmdletBinding()] param([string]$ResourceName,[string]$ResourceType,[Parameter(Mandatory)][string]$ResourceGroup,[Parameter(Mandatory)][string]$OutputDirectory,[string]$Subscription)
. (Join-Path $PSScriptRoot 'Common-AzureCollector.ps1')
$doc=New-CollectorDocument $ResourceType $ResourceName $ResourceGroup $Subscription
$plan=Invoke-AzCommandJson 'appservice.plan.show' @('appservice','plan','show','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription -Required; Add-CollectorSection $doc 'show' $plan
Add-CollectorSection $doc 'apps' (Invoke-AzCommandJson 'appservice.plan.list-apps' @('appservice','plan','list-apps','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
if($plan.data.id){Add-StandardResourceEvidence $doc $plan.data.id $Subscription}
$file=Join-Path $OutputDirectory ('appservice-plan-{0}.json' -f (ConvertTo-CollectorSafeFileName $ResourceName)); Save-CollectorDocument $doc $file
[pscustomobject]@{resourceType='appServicePlan';name=$ResourceName;outputFile=$file}