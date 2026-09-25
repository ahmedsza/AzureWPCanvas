# Collector evidence map

How `Invoke-CollectWordPressPosture.ps1` (schema `4.0`) lays out its output, and which checklist controls each file informs.

## Document shape

Every resource file has the same shape:

```jsonc
{
  "metadata": { "schemaVersion": "4.0", "generatedAtUtc": "...", "resourceType": "...",
                "resourceName": "...", "resourceGroup": "...", "subscription": "..." },
  "sections": {
    "<sectionName>": {
      "success": true,          // false => the az call failed; status is "Not verified"
      "command": "az ...",      // reproduce or cite this in the report
      "exitCode": 0,
      "error": null,            // populate the collection-gaps appendix from this
      "data": { }               // redacted payload
    }
  }
}
```

Cite evidence as `<file> → sections.<section>.data.<path> = <value>`.

## Index files

| File | Use for |
|---|---|
| `collection-manifest.json` | `discovery.resourceTypes`, `outputs[]` (resource → file), `unsupportedResources[]`, `errors[]`. Read first. |
| `resource-group-inventory.json` | `sections.resourceGroup`, `sections.resources`, `sections.locks` (FND-11), `sections.roleAssignments` (FND-07, FND-08). |
| `discovered-resource-ids.json` | Resource IDs used to scope Defender/Advisor findings to this workload. |
| `defender-for-cloud.json` | `sections.pricing` (SEC-21, DEF-02), `sections.contacts`, `sections.assessments` (DEF-01), `sections.recommendations` (FND-10). |

## Resource files

| File pattern | Sections | Primary controls |
|---|---|---|
| `appservice-plan-<name>.json` | `show`, `apps`, `diagnosticSettings`, `locks`, `roleAssignments` | REL-03, REL-06, CST-03, CST-11, PRF-03, APP-02 |
| `appservice-<name>.json` | `show`, `config`, `logging`, `appSettings`, `connectionStrings`, `auth`, `identity`, `accessRestrictions`, `vnetIntegration`, `hostnames`, `slots`, `diagnosticSettings`, `locks`, `roleAssignments` | REL-03, REL-04, REL-07, SEC-03, SEC-05, SEC-06, SEC-09, SEC-11, SEC-14, SEC-18, SEC-24, OPS-04, OPS-07, PRF-10, PRF-11 |
| `appservice-slot-<app>-<slot>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | OPS-04, APP-01 |
| `mysql-flexible-server-<name>.json` | `show`, `databases`, `firewallRules`, `configurations`, `backups`, `diagnosticSettings`, `locks`, `roleAssignments` | REL-08, REL-09, SEC-04, SEC-12, SEC-16, CST-04, SQL-02, SQL-03, SQL-04, PRF-12 |
| `keyvault-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | SEC-14, SEC-15, KV-01 |
| `redis-<name>.json` | `show`, `redisShow` (classic only), `diagnosticSettings`, `locks`, `roleAssignments` | REL-05, SEC-12, RDS-01, RDS-02, RDS-03, PRF-09 |
| `frontdoor-<name>.json` | `show`, `endpoints`, `routes`, `diagnosticSettings`, `locks`, `roleAssignments` | REL-13, SEC-07, SEC-08, SEC-09, CST-08, FD-01, FD-02, FD-03, PRF-07, PRF-08 |
| `storage-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | REL-11, REL-12, SEC-16, SEC-17, CST-07 |
| `nat-gateway-<name>.json` | `show`, `subnetAssociations`, `diagnosticSettings`, `locks`, `roleAssignments` | SEC-11, NAT-01, NAT-02, NAT-03, NAT-05, NAT-06 |
| `network-<type>-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | SEC-11, SEC-12, SEC-13, NET-01, NET-03, NET-04, NET-06 |
| `app-insights-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | OPS-08, MON-01, MON-02, MON-07, CST-09 |
| `log-analytics-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | OPS-07, MON-02, MON-03, MON-06, CST-09 |
| `communication-services-<name>.json` | `show`, `diagnosticSettings`, `locks`, `roleAssignments` | OPS-17, ACS-01, ACS-02, ACS-03 |

Resource names are sanitised with `[^A-Za-z0-9._-] → -`, so a file name may not match the Azure resource name character for character. Resolve files through `collection-manifest.json → outputs[].outputFile`, not by guessing names.

## High-value property paths

App Service (`appservice-<name>.json`):

| Property | Control |
|---|---|
| `sections.show.data.httpsOnly` | SEC-06 |
| `sections.config.data.minTlsVersion`, `.ftpsState`, `.remoteDebuggingEnabled` | SEC-05, SEC-06 |
| `sections.config.data.linuxFxVersion` | SEC-06, OPS-13 (PHP/WordPress image version) |
| `sections.config.data.alwaysOn`, `.healthCheckPath`, `.autoHealEnabled` | REL-04 |
| `sections.config.data.numberOfWorkers`, `.clientAffinityEnabled` (on `show`) | REL-03 |
| `sections.show.data.publicNetworkAccess` | SEC-09 |
| `sections.show.data.identity.type` | SEC-03 |
| `sections.appSettings.data[]` — values shaped `@Microsoft.KeyVault(...)` | SEC-03, SEC-14 |
| `sections.appSettings.data[]` — `WP_DEBUG`, `DISALLOW_FILE_EDIT` | SEC-18, SEC-24 |
| `sections.accessRestrictions.data.ipSecurityRestrictions`, `.scmIpSecurityRestrictions` | SEC-05, SEC-09 |
| `sections.auth.data.platform.enabled` | APP-01 |
| `sections.vnetIntegration.data[]` | SEC-11 |
| `sections.diagnosticSettings.data[]` | OPS-07, SEC-22 |

MySQL Flexible Server (`mysql-flexible-server-<name>.json`):

| Property | Control |
|---|---|
| `sections.show.data.highAvailability.mode`, `.standbyAvailabilityZone` | REL-08 |
| `sections.show.data.backup.backupRetentionDays`, `.geoRedundantBackup` | REL-08, REL-09 |
| `sections.show.data.network.publicNetworkAccess`, `.delegatedSubnetResourceId`, `.privateDnsZoneResourceId` | SEC-12 |
| `sections.show.data.sku.tier` | SQL-04, CST-04, PRF-03 |
| `sections.show.data.maintenanceWindow` | SQL-02 |
| `sections.show.data.storage.autoGrow`, `.iops`, `.storageSizeGB` | SQL-03 |
| `sections.firewallRules.data[]` — `0.0.0.0` or wide ranges | SEC-12, SEC-13 |
| `sections.configurations.data[]` — `require_secure_transport`, `sql_generate_invisible_primary_key`, `slow_query_log` | SEC-16, SQL-04, PRF-12 |

Storage (`storage-<name>.json`): `sections.show.data.allowBlobPublicAccess` (SEC-17), `.allowSharedKeyAccess` (SEC-17), `.minimumTlsVersion` (SEC-16), `.publicNetworkAccess` and `.networkRuleSet.defaultAction` (SEC-12), `.sku.name` (REL-11), `.accessTier` (CST-07).

Key Vault (`keyvault-<name>.json`): `sections.show.data.properties.enableRbacAuthorization` (SEC-15), `.enableSoftDelete`, `.enablePurgeProtection` (SEC-15), `.publicNetworkAccess`, `.networkAcls` (SEC-12), `.accessPolicies` (SEC-15).

Front Door (`frontdoor-<name>.json`): `sections.show.data.sku.name` (FD-01), `sections.routes.data[].cacheConfiguration` (PRF-07, PRF-08), `.forwardingProtocol`, `.originGroup` (SEC-09), `sections.show.data.properties.policySettings.mode` on WAF policy resources (SEC-07), `.managedRules`, `.customRules` (SEC-08, SEC-10).

Redis (`redis-<name>.json`): `sections.show.data.type` — `Microsoft.Cache/Redis` is the retiring classic service (RDS-01); `sections.redisShow.data.enableNonSslPort` (SEC-16), `.redisConfiguration.maxmemory-policy` (RDS-02), `.publicNetworkAccess` (SEC-12).

NAT Gateway (`nat-gateway-<name>.json`): `sections.show.data.sku.name` (NAT-02), `.publicIpAddresses`, `.publicIpPrefixes` (NAT-01, NAT-03), `sections.subnetAssociations.data[]` (NAT-01).

## Controls the collector cannot decide

These are always `Not verified` unless the user supplies external evidence: all of Section 8 (`MAN-01`–`MAN-12`); anything requiring a live test (SEC-23, REL-10, MAN-07, PRF-06); anything about process, ownership, or cost governance (FND-01 to FND-06, CST-01, CST-02, CST-06, CST-10 to CST-14, OPS-01, OPS-03, OPS-05, OPS-09 to OPS-16); WordPress application internals not exposed through app settings (SEC-19, SEC-20, PRF-10, PRF-11).

Group these under "Not verified — requires manual validation" rather than scattering them through the pillar tables, so leadership can see coverage honestly.
