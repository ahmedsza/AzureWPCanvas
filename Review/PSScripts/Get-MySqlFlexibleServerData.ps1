[CmdletBinding()] param([string]$ResourceName,[string]$ResourceType,[Parameter(Mandatory)][string]$ResourceGroup,[Parameter(Mandatory)][string]$OutputDirectory,[string]$Subscription)
. (Join-Path $PSScriptRoot 'Common-AzureCollector.ps1')
$doc=New-CollectorDocument $ResourceType $ResourceName $ResourceGroup $Subscription
$server=Invoke-AzCommandJson 'mysql.flexible-server.show' @('mysql','flexible-server','show','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription -Required; Add-CollectorSection $doc 'show' $server
Add-CollectorSection $doc 'databases' (Invoke-AzCommandJson 'mysql.databases' @('mysql','flexible-server','db','list','--server-name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
Add-CollectorSection $doc 'firewallRules' (Invoke-AzCommandJson 'mysql.firewallRules' @('mysql','flexible-server','firewall-rule','list','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
Add-CollectorSection $doc 'configurations' (Invoke-AzCommandJson 'mysql.configurations' @('mysql','flexible-server','parameter','list','--server-name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
Add-CollectorSection $doc 'backups' (Invoke-AzCommandJson 'mysql.backups' @('mysql','flexible-server','backup','list','--name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription)
if($server.data.id){Add-StandardResourceEvidence $doc $server.data.id $Subscription}; $file=Join-Path $OutputDirectory ('mysql-flexible-server-{0}.json' -f (ConvertTo-CollectorSafeFileName $ResourceName)); Save-CollectorDocument $doc $file
[pscustomobject]@{resourceType='mysqlFlexibleServer';name=$ResourceName;outputFile=$file}