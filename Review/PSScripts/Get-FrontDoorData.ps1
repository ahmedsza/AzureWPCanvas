[CmdletBinding()] param([string]$ResourceName,[string]$ResourceType,[Parameter(Mandatory)][string]$ResourceGroup,[Parameter(Mandatory)][string]$OutputDirectory,[string]$Subscription)
. (Join-Path $PSScriptRoot 'Common-AzureCollector.ps1');$doc=New-CollectorDocument $ResourceType $ResourceName $ResourceGroup $Subscription
$resource=Invoke-AzCommandJson 'resource.show' @('resource','show','--resource-group',$ResourceGroup,'--name',$ResourceName,'--resource-type',$ResourceType) $Subscription -Required;Add-CollectorSection $doc 'show' $resource
if($ResourceType -ieq 'Microsoft.Cdn/profiles'){
	$endpoints=Invoke-AzCommandJson 'afd.endpoints' @('afd','endpoint','list','--profile-name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription
	Add-CollectorSection $doc 'endpoints' $endpoints
	foreach($item in @(@('originGroups','afd','origin-group','list'),@('customDomains','afd','custom-domain','list'),@('securityPolicies','afd','security-policy','list'))){Add-CollectorSection $doc $item[0] (Invoke-AzCommandJson ('afd.'+$item[0]) (@($item[1..($item.Count-1)])+@('--profile-name',$ResourceName,'--resource-group',$ResourceGroup)) $Subscription)}
	$routeResults=@(foreach($endpoint in @($endpoints.data)){Invoke-AzCommandJson ('afd.routes.'+$endpoint.name) @('afd','route','list','--endpoint-name',$endpoint.name,'--profile-name',$ResourceName,'--resource-group',$ResourceGroup) $Subscription})
	$routeFailures=@($routeResults | Where-Object {-not $_.success})
	$routeResult=[pscustomobject]@{
		success=$endpoints.success -and $routeFailures.Count -eq 0
		command=@($routeResults.command)
		exitCode=if(-not $endpoints.success){$endpoints.exitCode}elseif($routeFailures.Count){$routeFailures[0].exitCode}else{0}
		error=if(-not $endpoints.success){'Routes could not be enumerated because endpoint collection failed.'}elseif($routeFailures.Count){@($routeFailures.error)}else{$null}
		data=@($routeResults | ForEach-Object {@($_.data)})
	}
	Add-CollectorSection $doc 'routes' $routeResult
}
if($resource.data.id){Add-StandardResourceEvidence $doc $resource.data.id $Subscription};$file=Join-Path $OutputDirectory ('frontdoor-{0}.json' -f (ConvertTo-CollectorSafeFileName $ResourceName));Save-CollectorDocument $doc $file;[pscustomobject]@{resourceType='frontDoorOrWaf';name=$ResourceName;outputFile=$file}