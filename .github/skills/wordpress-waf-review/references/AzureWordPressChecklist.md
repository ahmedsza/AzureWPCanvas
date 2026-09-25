# Azure WordPress on App Service — Definitive Well-Architected Checklist

This is the single, definitive review checklist for a WordPress workload hosted on Azure App Service. It consolidates three earlier checklists that it supersedes and replaces: a pillar-organized, ID-tagged checklist (used here as the structural backbone), a resource-type-organized checklist (whose per-resource depth for networking, NAT Gateway, Application Insights/Log Analytics, Communication Services, and Defender for Cloud is folded in as [Section 7](#7-resource-specific-supplementary-checklist)), and a numbered WordPress/App Service checklist (whose unique items — ARR affinity, auto-heal, wp-cron, DDoS Protection Standard, and similar — are folded into the relevant sections, and whose scoring rollup is reused in [Section 9](#9-scoring-summary)).

It applies to the workload and its supporting services: App Service plans, web apps and slots, Azure Database for MySQL Flexible Server, Azure Front Door and WAF, Blob Storage, Key Vault, Azure Managed Redis or Azure Cache for Redis, virtual networking (VNet/NSG/private endpoints/private DNS/NAT Gateway), Azure Monitor (Application Insights/Log Analytics), Microsoft Defender for Cloud, and optional Azure Communication Services.

## How to use this checklist

1. Record `Pass`, `Fail`, `N/A`, or `Not verified` for every applicable control. Do not use `N/A` without a documented rationale and approver.
2. A failed collection, unavailable API, or missing evidence means `Not verified`; it does not prove a control is absent.
3. Attach collector output (from `Review/PSScripts/Invoke-CollectWordPressPosture.ps1`), Azure Policy, Defender for Cloud, Azure Advisor, Azure Monitor, deployment code, tests, or operational records as evidence.
4. Create a remediation item for each `Fail`, with owner, severity, target date, compensating control, and acceptance criteria.
5. Validate the controls against the workload's business impact, SLOs, RTO/RPO, data classification, compliance obligations, and regional feature availability.
6. Reassess after material changes and on an agreed operational cadence.

### Status and evidence key

| Status | Meaning |
|---|---|
| `Pass` | Evidence proves the control is implemented and operated as intended. |
| `Fail` | Evidence proves the control is not met or is ineffective. |
| `N/A` | The control does not apply; the rationale and approver are recorded. |
| `Not verified` | Evidence is unavailable, incomplete, or requires a manual test. |

## 1. Workload foundations and governance

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| FND-01 | Define workload, business, technical, security, data, and 24x7 incident owners. | Shared ownership or stale escalation contacts. | Ownership register, tags, support rota. | [ ] |
| FND-02 | Document critical user and system flows, dependencies, data flows, trust boundaries, regions, and failure modes. | Reviewing isolated Azure resources without the end-to-end workload. | Architecture and data-flow diagrams, dependency map. | [ ] |
| FND-03 | Rate critical flows and define measurable SLOs, SLIs, RTOs, RPOs, and accepted availability and data-loss risks. | Selecting redundancy or backup settings without business targets. | Business impact analysis, SLO and recovery documentation. | [ ] |
| FND-04 | Maintain a current threat model for the internet edge, origin bypass, supply chain, identities, secrets, data stores, admin paths, and exfiltration. | Treating WAF, private endpoints, or Defender as a substitute for threat modeling. | Threat model, risk register, remediation backlog. | [ ] |
| FND-05 | Classify data and map residency, access, encryption, retention, deletion, backup, and recovery requirements to each store and log. | Applying one protection level to all data or retaining sensitive data indefinitely. | Data inventory, classification policy, compliance assessment. | [ ] |
| FND-06 | Separate production and nonproduction resources where blast radius, policy, identity, data, or billing isolation requires it. | Mixing production data and identities with test environments without explicit controls. | Subscription and resource-group design. | [ ] |
| FND-07 | Use least-privilege Azure RBAC, Microsoft Entra ID, MFA, Conditional Access, PIM/JIT, access reviews, and a protected emergency-access path. | Standing Owner access, shared admins, or broad custom roles. | RBAC export, PIM settings, access-review evidence. | [ ] |
| FND-08 | Separate control-plane and data-plane duties, especially for subscription administration, Key Vault purge, and data-owner permissions. | Giving deployment identities unrestricted data or purge access. | Segregation-of-duties matrix and role assignments. | [ ] |
| FND-09 | Apply the current GA Microsoft cloud security benchmark through Defender for Cloud and Azure Policy, with time-bound, documented exceptions. Review other regulatory standards applicable to the organization and track control evidence separately. | Manual reviews as the only guardrail, permanent blanket exemptions, or treating MCSB compliance as proof of regulatory compliance. | Policy assignments, compliance results, exemption register, Defender regulatory-compliance dashboard. | [ ] |
| FND-10 | Review Defender for Cloud and Azure Advisor recommendations by attack path, exposure, business impact, severity, and cost; track decisions. | Chasing secure score alone or automatically applying every recommendation. | Review record, recommendation backlog, approved exceptions. | [ ] |
| FND-11 | Apply resource locks to critical stateful resources without blocking a documented break-glass recovery path. | No deletion protection or locks that prevent recovery automation. | Locks and emergency-change procedure. | [ ] |
| FND-12 | Enforce ownership, workload, environment, cost-center, and lifecycle tags; reconcile untaggable shared costs. | Untagged resources or tags that are not maintained. | Azure Policy, tag inventory, Cost Management export. | [ ] |
| FND-13 | Use Customer Lockbox (where supported, including App Service and MySQL Flexible Server) to review and approve or reject Microsoft support access requests to workload data. | Assuming Microsoft support never needs data access, or leaving Lockbox unconfigured for services that support it. | Customer Lockbox configuration and request history. | [ ] |

## 2. Reliability

Implements WAF reliability recommendations `RE:01`–`RE:10`.

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| REL-01 | Keep the architecture simple; document and justify every dependency, including Front Door, cache, Key Vault, DNS, and background processing. | Adding components that do not improve a stated business requirement. | Architecture decision records and dependency map. | [ ] |
| REL-02 | Perform failure-mode analysis for critical flows, including zone, region, App Service worker, MySQL, cache, storage, identity, DNS, certificate, Front Door, deployment, and network failures. | Assuming individual Azure SLAs prove workload recovery. | FMA and mitigation backlog. | [ ] |
| REL-03 | Run production on at least two App Service instances; use zone redundancy and sufficient instance count where supported and justified by SLO. Disable ARR affinity (sticky sessions) so requests distribute evenly. | A single-worker production site, a tier incapable of meeting availability targets, or sticky sessions masking a stateless-design gap. | Plan SKU, capacity, zone redundancy, regional capability, ARR-affinity setting. | [ ] |
| REL-04 | Enable Always On and use a fast, dependency-aware Health Check endpoint that removes unhealthy instances without disclosing sensitive data. Configure auto-heal rules for slow requests, memory limits, and HTTP error thresholds, and review the App Service Resiliency Score report. | A health endpoint that always returns 200, is expensive, or performs destructive work; no auto-heal configuration. | App Service configuration, Health Check/auto-heal settings, Resiliency Score report, synthetic test. | [ ] |
| REL-05 | Make WordPress stateless across workers. Put durable state outside the App Service filesystem and design for cache/session loss. | Local session or uploaded-media state required for correctness after scale-out. | Application design, storage and cache configuration, failure test. | [ ] |
| REL-06 | Configure tested autoscale with minimum, maximum, triggers, cooldowns, quotas, and capacity headroom based on measured or forecast demand. | Manual-only scale-out, a minimum of one for critical production, or oscillating rules. | Autoscale profile, load test, quota review. | [ ] |
| REL-07 | Use warm-up (Application Initialization) and deployment health validation so a new instance or slot receives production traffic only when ready. | Sending user traffic to a cold or unhealthy worker. | Startup configuration, deployment logs, traces. | [ ] |
| REL-08 | Configure MySQL HA, backup retention, and geo-redundant backup according to RTO/RPO and regional recovery needs. | Assuming HA replaces backup or accepting default retention without analysis. | MySQL HA and backup configuration. | [ ] |
| REL-09 | Define a consistent recovery set for database, uploads/media, application and configuration, secrets, DNS, certificates, Front Door/WAF, and network policy. Use MySQL's native backup/restore for the database, not App Service's built-in backup feature (deprecated for linked databases). | Restoring the database and uploads from incompatible points in time, or relying on App Service backup for a linked database. | Recovery design and runbook. | [ ] |
| REL-10 | Test point-in-time restore, application/media restore, cache loss, slot rollback, and, where required, regional recovery; measure achieved RTO/RPO and rehearse failover procedures. | Marking a backup compliant solely because it exists. | Dated exercise report and remediation actions. | [ ] |
| REL-11 | Replicate Blob data with an LRS/ZRS/GRS/GZRS/RA option that meets durability and regional recovery requirements. | LRS for critical data without risk acceptance or geo-replication as the only deletion protection. | Storage SKU and recovery requirements. | [ ] |
| REL-12 | Enable data-protection features suitable for WordPress media and backups, such as soft delete, versioning, point-in-time restore, snapshots, or immutability. | Assuming replication protects against accidental or malicious deletion. | Blob service data-protection configuration. | [ ] |
| REL-13 | Configure Front Door origin health probes against a lightweight, dependency-aware endpoint and define deliberate priority, weight, and failover behavior. | Probing `/` or a cached response that hides dependency failure. | Origin-group configuration and failure test. | [ ] |
| REL-14 | Evaluate multi-region App Service, MySQL, storage, and Front Door routing only when required by the workload SLO; test data consistency and failover. | Multiple origins with unsynchronized state or untested failover. | DR architecture, data strategy, game-day record. | [ ] |
| REL-15 | Implement bounded retries, timeouts, idempotency, circuit breaking, and graceful degradation for MySQL, Redis, storage, Key Vault, email, and external APIs. | Unlimited retries or retry storms during dependency failure. | Application configuration, fault-injection tests, traces. | [ ] |
| REL-16 | Queue and control asynchronous work such as email, image processing, and large imports; include dead-letter and reconciliation handling where appropriate. | Running heavy asynchronous work on user request paths. | Queue design, retry policy, operations runbook. | [ ] |
| REL-17 | Monitor availability and reliability indicators for critical flows and dependencies, retain evidence, and use it for post-incident learning. | Resource metrics alone without user-flow health. | Availability tests, SLO dashboard, incident reviews. | [ ] |

Additional network and NAT Gateway reliability items are in [Section 7.6](#76-network-vnet-nsg-private-endpoints-private-dns) and [Section 7.7](#77-nat-gateway).

## 3. Security

Implements WAF security recommendations `SE:01`–`SE:12` and the applicable Microsoft cloud security benchmark controls.

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| SEC-01 | Maintain a security baseline aligned to the current Microsoft cloud security benchmark, the App Service security baseline, data classification, and regulatory requirements. | A one-time hardening exercise with no posture remeasurement. | Baseline, policy assignments, Defender compliance. | [ ] |
| SEC-02 | Run secure development practices for WordPress code, themes, plugins, dependencies, containers/packages, and IaC, including secret and vulnerability scanning with risk-based patch SLAs. | Unsupported or unreviewed components, secret-bearing source, or ignored transitive vulnerabilities. | SBOM, scan results, patch records, CI/CD gates. | [ ] |
| SEC-03 | Use managed identities for Azure dependencies where supported, use Key Vault references for secrets, and grant only required data-plane permissions. | Database passwords, storage keys, or long-lived connection strings in app settings. | App identity, Key Vault references, RBAC and application design. | [ ] |
| SEC-04 | Use Microsoft Entra authentication for MySQL where supported and appropriate; otherwise use a dedicated least-privilege MySQL user, store its credential in Key Vault, and test rotation. | Connecting WordPress as MySQL server administrator or using a shared permanent credential. | Entra setup or MySQL grants, Key Vault, rotation test. | [ ] |
| SEC-05 | Disable App Service basic publishing credentials, SCM basic authentication, remote debugging, and unused deployment endpoints (FTP or FTPS-only); restrict SCM separately. | Long-lived FTP/Git credentials, remote debugging enabled in production, or publicly reachable Kudu administration. | App Service configuration, access restrictions, Azure Policy. | [ ] |
| SEC-06 | Require HTTPS, TLS 1.2 or later (end-to-end TLS on Premium plans where supported), secure FTPS settings or no FTP, and supported PHP and platform versions. | HTTP, legacy TLS, plain FTP, or unsupported runtime versions. | App configuration and runtime inventory. | [ ] |
| SEC-07 | Put Front Door Standard or Premium with WAF in front of the public site; associate the intended WAF policy with every production domain and route and use Prevention mode after tuning. | An unassociated WAF, permanent Detection mode, or disabled protection left unrestored. | Front Door routes, security policies, WAF logs. | [ ] |
| SEC-08 | Use current managed WAF rules, bot protection where supported, targeted rate limits, and narrow, reviewed exclusions. Evaluate Azure DDoS Protection Standard for any workload with public IP resources. | Disabling an entire rule group, keeping permanent broad exclusions, or assuming Front Door alone covers every public IP in the topology. | WAF policy, exclusions, approvals, test evidence, DDoS plan. | [ ] |
| SEC-09 | Prevent origin bypass. Prefer Front Door Premium Private Link; otherwise restrict App Service ingress to Front Door and validate the expected Front Door identifier. | A public origin directly reachable around WAF or trusting a spoofable header without source restrictions. | Private Link or App Service access restrictions and negative bypass test. | [ ] |
| SEC-10 | Restrict WordPress login and administration paths using WAF and application controls; protect exceptions such as required `admin-ajax.php` routes deliberately. | Public password-only administrator access, unlimited login attempts, or blanket `/wp-admin` exclusions. | WAF rules, admin access design, negative tests. | [ ] |
| SEC-11 | Integrate App Service outbound traffic with the intended VNet, DNS, routes, NSGs, and firewall/proxy controls; treat NAT Gateway as address translation, not a firewall. | Assuming VNet integration makes inbound traffic private or leaving uncontrolled egress. | VNet integration, routes, NSGs, firewall, egress test. | [ ] |
| SEC-12 | Use private connectivity and correct private DNS for MySQL, Blob Storage, Key Vault, Redis, and other supporting PaaS services when the risk model requires it; disable public paths after validation. | Private endpoint configured while public access remains unintentionally usable. | Private endpoints, DNS zones, service network settings, connectivity tests. | [ ] |
| SEC-13 | Segment networks and apply least-privilege ingress and egress rules; review effective rules and custom routes. | Flat networks, broad `Internet`/`*` allows, or an untested NVA dependency. | VNet topology, NSGs, effective rules, UDRs. | [ ] |
| SEC-14 | Store WordPress salts, keys, database settings, SMTP credentials, certificates, and other secrets in Key Vault; set expiry, rotation ownership, alerts, and emergency rotation procedures. | Secrets in `wp-config.php`, source control, tickets, logs, or nonexpiring values. | Key Vault inventory, expiration, alerts, rotation test. | [ ] |
| SEC-15 | Harden Key Vault with RBAC, least privilege, purge protection, soft delete, audit diagnostics, and private or restricted network access. | Broad access policies, no purge protection, or unprotected secret audit logs. | Vault configuration, RBAC, diagnostics, private endpoint. | [ ] |
| SEC-16 | Require encryption in transit and at rest for MySQL, Blob Storage, Key Vault, cache, and telemetry; use customer-managed keys only when requirements justify their added operational dependency. | Disabling TLS or deploying CMK without key lifecycle and recovery ownership. | Service encryption settings, Key Vault and recovery design. | [ ] |
| SEC-17 | Disable anonymous Blob access unless explicit public media exposure is approved; use Microsoft Entra ID and managed identity or short-lived least-privilege SAS where possible. | Account keys or nonexpiring broad SAS tokens in settings or URLs. | Storage settings, identity design, SAS governance. | [ ] |
| SEC-18 | Protect WordPress application settings: disable `WP_DEBUG` in production, set `DISALLOW_FILE_EDIT`, remove unused plugins/themes, restrict phpMyAdmin, and block or restrict unused XML-RPC and application-password features. | Dashboard code editing, public backup/debug output, or unused remote interfaces. | WordPress configuration, plugin inventory, WAF and application tests. | [ ] |
| SEC-19 | Apply restrictive CORS, CSP, HSTS, `X-Frame-Options`, and `X-Content-Type-Options` appropriate to the application; validate behavior rather than adding headers blindly. | Overly permissive origins or headers that break legitimate flows and are disabled later. | HTTP-header scan and regression tests. | [ ] |
| SEC-20 | Use least-privilege WordPress roles, individual administrators, strong authentication/MFA where possible, and audited administrator access. | Shared administrator accounts or default administrator names. | WordPress user/role review, identity controls. | [ ] |
| SEC-21 | Enable Defender for Cloud plans justified by deployed services; route Defender security alerts into an owned SIEM or response process and test triage. | Paying for plans without coverage validation or alert ownership. | Defender pricing, coverage, alerts, workflow automation. | [ ] |
| SEC-22 | Enable security-relevant control-plane and data-plane diagnostics, prevent telemetry from collecting secrets or unnecessary PII, and protect the log destination. | No audit trail or sensitive request bodies, tokens, and credentials in logs. | Diagnostic settings, workspace RBAC, redaction tests. | [ ] |
| SEC-23 | Test WAF prevention, direct-origin bypass, authentication, authorization, admin protection, secret rotation, and security-alert response. | Declaring a configured control effective without an end-to-end test. | Security test results, WAF logs, incident exercise. | [ ] |
| SEC-24 | Verify WordPress App Service settings, including database connection settings, unique salts/keys, production debug settings, filesystem permissions, and multisite domain mapping when used. | Default/insecure values, production debugging, or settings copied unreviewed between environments. | App settings, Key Vault references, `wp-config.php` review, multisite tests. | [ ] |

Additional network, NAT Gateway, monitoring, Communication Services, and Defender-specific security items are in [Section 7](#7-resource-specific-supplementary-checklist).

## 4. Cost Optimization

Implements WAF cost recommendations `CO:01`–`CO:14`.

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| CST-01 | Maintain a workload cost model covering normal, peak, failover, security, monitoring, backup, data transfer, and DR costs, with a documented business-value and availability tradeoff. | Budgeting only steady-state App Service and database list prices. | Cost model and approved budget. | [ ] |
| CST-02 | Create budgets, forecast thresholds, daily cost reviews, anomaly alerts, accountable recipients, and spending guardrails at subscription, resource-group, and workload scope. | Reviewing spend after invoice close or using unowned budget alerts. | Budgets, alerts, cost reports, review minutes. | [ ] |
| CST-03 | Right-size App Service plans from CPU, memory, request, latency, queue, and worker utilization while preserving SLO headroom. | Sustained overprovisioning or downsizing that breaks reliability targets. | Metrics, load tests, Advisor and cost analysis. | [ ] |
| CST-04 | Right-size MySQL compute, storage, IOPS, HA, backup, and cross-region transfer from measured demand; use stop/start only for eligible nonproduction servers. | Ignoring HA/backup costs or stopping a required production dependency. | MySQL metrics, schedule, cost model. | [ ] |
| CST-05 | Use autoscale scale-in and planned nonproduction schedules, and remove idle App Service plans, slots, public IPs, private endpoints, caches, test services, snapshots, and logs. | Production-sized dev environments operating continuously. | Inventory, schedules, utilization and cleanup record. | [ ] |
| CST-06 | Evaluate reservations, savings plans, enterprise agreements, and license benefits for stable baseline use; monitor commitment utilization and coverage. | Committing volatile demand or retaining unused commitments. | Reservation analysis and utilization report. | [ ] |
| CST-07 | Select Blob redundancy and access tiers from durability, access, retrieval, and lifecycle requirements; use narrow lifecycle policies for media, backups, logs, versions, and soft-deleted data. | Tiering data too quickly or using broad deletion rules without recovery validation. | Storage policy, inventory, cost analysis. | [ ] |
| CST-08 | Model Front Door tier, WAF, requests, rule processing, data transfer, Private Link, and logging costs; use safe caching and compression to reduce origin transfer. | Enabling edge features without measuring benefit or retaining every request log indefinitely. | Cost model, cache metrics, logging retention. | [ ] |
| CST-09 | Manage Azure Monitor and Log Analytics ingestion, sampling, transformations, table plans, archive, and retention according to actual query needs; keep workspace and Application Insights co-located to avoid cross-region transfer. | A daily cap as the primary cost strategy or perpetual verbose duplicate telemetry. | Workspace configuration, ingestion and retention trend, resource regions. | [ ] |
| CST-10 | Attribute cost across edge, compute, database, cache, storage, monitoring, security, network, backup, and messaging, then optimize the largest measured driver. | Optimizing minor resource costs while compute, database, or logging dominates. | Workload cost allocation and trend. | [ ] |
| CST-11 | Consolidate compatible applications and shared services only when their scaling, security, ownership, and SLO requirements are compatible. | One idle plan per app or co-hosting unrelated critical workloads solely to reduce spend. | Plan/service inventory, ownership and utilization. | [ ] |
| CST-12 | Optimize high-cost flows, media delivery, database queries, cache hit rate, and operational toil before adding capacity. | Scaling to hide inefficient code, database access, or administrative work. | Flow cost analysis, traces, database/cache metrics. | [ ] |
| CST-13 | Keep Defender, availability, security, backup, and DR spending that is required by the risk decision; review removal through formal risk acceptance, and check for duplicate third-party tooling. | Disabling high-value controls only to reduce visible service spend, or running overlapping tools with no use case. | Risk acceptance, control mapping, cost review. | [ ] |
| CST-14 | Train operators to use cost tooling and automate repeatable cost controls, reporting, lifecycle management, and cleanup. | Manual cost reporting with no action owner or automation. | Operating model, automation, review cadence. | [ ] |

Additional NAT Gateway and Communication Services cost items are in [Section 7.7](#77-nat-gateway) and [Section 7.9](#79-azure-communication-services).

## 5. Operational Excellence

Implements WAF operational excellence recommendations `OE:01`–`OE:11`.

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| OPS-01 | Define standard development, security, operations, incident, and change-management practices with clear accountability and continuous improvement. | Undocumented, person-dependent production operations. | Operating model, RACI, review and postmortem records. | [ ] |
| OPS-02 | Use version-controlled declarative IaC for Azure resources, policy, networking, DNS, Front Door/WAF, diagnostics, and configuration; detect drift. | Portal-only changes or unreviewed mutable scripts. | Repository, pull requests, pipeline and drift reports. | [ ] |
| OPS-03 | Drive code, infrastructure, plugin/theme, and configuration changes through automated pipelines with peer review, tests, promotion gates, and traceable artifacts. | Direct production editing or untested WordPress auto-updates. | CI/CD definitions, release records, signed/versioned artifacts. | [ ] |
| OPS-04 | Use deployment slots where supported, slot-specific settings, warm-up and health validation, progressive exposure (swap with preview), and a tested rollback path. | Swapping an unhealthy slot, leaking slot settings, or irreversible database changes first. | Slot configuration, pipeline, swap and rollback test. | [ ] |
| OPS-05 | Keep database schema changes backward compatible with blue/green or slot rollout; plan and test data migration and rollback behavior. | Destructive production schema migration coupled to an unvalidated release. | Migration plan, deployment tests, rollback evidence. | [ ] |
| OPS-06 | Establish configuration baselines for App Service, MySQL parameters, Front Door/WAF, storage, Key Vault, Redis, and diagnostics; alert on drift. | Undocumented portal changes or inconsistent production and staging controls. | Baseline export, policy, drift report. | [ ] |
| OPS-07 | Enable application, web server, platform, WAF, access, health probe, MySQL, storage, Key Vault, cache, and network diagnostics with purposeful retention and centralized analysis. | Missing incident evidence or indefinite high-volume logging with no use case. | Diagnostic settings, workspace design, retention. | [ ] |
| OPS-08 | Instrument requests, dependencies, exceptions, distributed traces, business metrics, deployment markers, availability tests, and user-visible SLO symptoms. | Monitoring CPU alone or missing critical-flow behavior. | Application Insights, dashboards, availability tests. | [ ] |
| OPS-09 | Define actionable alerts with owners, severity, routing, deduplication, runbooks, and regular notification tests for errors, latency, saturation, availability, certificates, secrets, quota, and lifecycle events. | Alert storms, dashboards with no owner, or alerts that no one tests. | Alert rules, action groups, runbooks, test records. | [ ] |
| OPS-10 | Maintain runbooks for failed deployments, WAF false positives, origin bypass, compromised admin or plugin, MySQL failover/restore, cache loss, secret/certificate rotation, and outbound/SNAT failure. | A generic incident plan without Azure and WordPress actions or validation steps. | Runbooks and exercise records. | [ ] |
| OPS-11 | Establish a structured incident process for detection, diagnosis, communications, recovery, post-incident learning, and remediation ownership. | Incident response limited to portal visibility or a single administrator. | Incident plan, on-call rota, postmortems. | [ ] |
| OPS-12 | Perform unit, integration, end-to-end, security, backup/restore, performance, operational, and deployment tests in CI/CD with explicit acceptance criteria. | Resource deployment tests only, without proving the WordPress site and data work. | Test suites, pipeline results, release gates. | [ ] |
| OPS-13 | Track PHP, WordPress core, plugins, themes, MySQL, Azure services, certificates, secrets, domains, quotas, and service-retirement notices (including legacy Azure Cache for Redis retirement). | Unsupported runtimes or discovering expiry and retirement during an incident. | Lifecycle register, Service Health alerts, inventory. | [ ] |
| OPS-14 | Test and govern WordPress automatic updates and approved plugin/theme updates in staging before production. | Uncontrolled automatic production updates or unsupported extensions. | Governance policy, staging test, release record. | [ ] |
| OPS-15 | Create workbooks and dashboards for health, traffic, WAF activity, availability, database, cache, storage, cost, and security posture; review them regularly. | Dashboards without operational decisions or review ownership. | Workbooks, saved queries, review cadence. | [ ] |
| OPS-16 | Automate reliable, secure, and maintainable routine tasks such as validation, configuration export, cleanup, certificate/secret notifications, and recovery checks. | Manual procedures repeated without validation or audit trail. | Automation code, schedules, run history. | [ ] |
| OPS-17 | Use Azure Communication Services or an approved external SMTP relay for WordPress email; validate sender domain, SPF/DKIM/DMARC, delivery, bounce handling, and retry behavior. | Local sendmail, unverified sender domains, or treating send API success as confirmed delivery. | Provider configuration, DNS records, delivery reports, runbook. | [ ] |

Additional network, NAT Gateway, monitoring, and Defender governance items are in [Section 7](#7-resource-specific-supplementary-checklist).

## 6. Performance Efficiency

Implements WAF performance efficiency recommendations `PE:01`–`PE:12`.

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| PRF-01 | Define numerical performance targets for critical flows, including availability, P50/P95/P99 response time, TTFB, throughput, error rate, and cache behavior. | Vague performance goals or optimizing noncritical pages first. | Performance budget, SLO dashboard. | [ ] |
| PRF-02 | Perform capacity planning before anticipated marketing events, seasonal traffic, launches, growth, or regulatory deadlines. | Scaling only after user-visible saturation. | Forecast, load test, capacity plan. | [ ] |
| PRF-03 | Select App Service, MySQL, Redis, storage, and Front Door SKUs/tier features that can meet workload targets and expected capacity changes. | Burstable assumptions for sustained production demand or costly tiers with no measured need. | SKU rationale, metrics, load test. | [ ] |
| PRF-04 | Measure end-to-end latency, throughput, errors, saturation, dependency timing, queueing, cache hit rate, and database performance consistently over time. | Monitoring CPU alone or comparing inconsistent time periods. | Application Insights, Azure Monitor, query dashboards. | [ ] |
| PRF-05 | Implement controlled scale-out and partitioning; validate App Service autoscale, MySQL limits, cache capacity, SNAT capacity, and Front Door origin behavior under load. | Scale thresholds that oscillate or dependency limits ignored by app scaling. | Load test, autoscale and dependency metrics. | [ ] |
| PRF-06 | Load, stress, soak, cache-invalidation, and failure-mode test production-like critical flows at expected peak and growth traffic, using Azure Load Testing or an equivalent tool. | Happy-path average-load testing only. | Versioned test scripts, reports, remediation backlog. | [ ] |
| PRF-07 | Use Front Door caching only for explicitly cache-safe content. Design cache keys, query handling, TTLs, invalidation, and cookie behavior to avoid leaking personalized or authenticated responses. | Caching admin, private, or query-dependent content without validation. | Front Door rules, cache tests, HTTP headers. | [ ] |
| PRF-08 | Cache WordPress static content at Front Door and offload media/uploads to Blob Storage where the workload supports it; use compression (Gzip/Brotli) and HTTP/2. | Serving all media from App Service or compressing already-compressed content blindly. | Front Door route, Blob integration, response headers, metrics. | [ ] |
| PRF-09 | Use object and page caching deliberately, with Azure Managed Redis or Azure Cache for Redis where appropriate; test reconnect, timeouts, cache miss, eviction, and cache-loss behavior. | A new Redis connection per request or application failure when cache is unavailable. | Cache configuration, metrics, fault test. | [ ] |
| PRF-10 | Enable and tune PHP OPcache, optimize images (compression, lazy loading, WebP) and lazy loading, minimize plugins, and document NGINX/startup customizations. | Unbounded plugin overhead, unoptimized uploads, or undocumented web-server changes. | PHP/NGINX configuration, plugin inventory, page test. | [ ] |
| PRF-11 | Replace user-triggered WordPress cron (`wp-cron.php`) behavior with a reliable scheduled mechanism (Azure WebJobs or Linux cron) where workload analysis justifies it; monitor scheduled-job duration and failures. | Heavy cron execution on page requests. | WordPress and scheduler configuration, job logs. | [ ] |
| PRF-12 | Optimize MySQL indexes, queries, connections/connection pooling, storage/IOPS, and slow-query handling before scaling compute; keep app and database appropriately co-located and in the same region to minimize latency. | Treating database scale-up as the only performance remedy. | Slow-query log, Query Store/metrics, query review. | [ ] |
| PRF-13 | Monitor and minimize the performance effects of backup, reindexing, security scans, secret rotation, deployments, and operational tasks. | Running maintenance during critical traffic without capacity or impact planning. | Schedule, telemetry, change records. | [ ] |
| PRF-14 | Define a live performance incident process with clear responsibilities, telemetry, mitigations, and follow-up optimization. | Ad hoc troubleshooting without a recovery or learning path. | Performance runbook and incident records. | [ ] |
| PRF-15 | Continuously optimize components that degrade over time, including WordPress plugins, MySQL tables and indexes, cache behavior, storage lifecycle, and networking; watch for anti-patterns such as Busy Front End, No Caching, and Noisy Neighbor. | Treating a one-time tuning exercise as permanent capacity planning. | Trend reports, optimization backlog. | [ ] |

Additional network, NAT Gateway, and monitoring performance items are in [Section 7.6](#76-network-vnet-nsg-private-endpoints-private-dns), [Section 7.7](#77-nat-gateway), and [Section 7.8](#78-application-insights-and-log-analytics).

## 7. Resource-specific supplementary checklist

These items add resource-level depth for services that a single pillar row cannot fully capture. Use them alongside Sections 2–6, not instead of them.

### 7.1 App Service plan, web app, and slots

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| APP-01 | Protect nonpublic slots with equivalent authentication, network restrictions, TLS, diagnostics, and secret handling as production. | A staging slot that bypasses production WAF/authentication or contains production secrets unnecessarily. | Slot `auth`, `accessRestrictions`, settings and diagnostics. | [ ] |
| APP-02 | Review co-hosted apps on a shared plan for noisy-neighbor and correlated-failure risk; isolate apps with different scaling/security/SLO needs. | Packing unrelated critical apps into one plan only to reduce cost. | Plan `apps`, per-app metrics and ownership. | [ ] |

### 7.2 Azure Database for MySQL Flexible Server

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| SQL-01 | Apply least privilege in Azure RBAC and MySQL roles; separate schema migration, application read/write, reporting, and administration identities. | Application connects as server admin, or wildcard grants are permanent. | Role assignments and MySQL grant review. | [ ] |
| SQL-02 | Set and test a maintenance window; ensure the application reconnects automatically during failover/maintenance. | Maintenance scheduled at peak business time, or clients that require manual restart after failover. | Maintenance config and failover test. | [ ] |
| SQL-03 | Size storage and IOPS with headroom and alerts; account for storage auto-grow behavior and the inability to shrink storage directly. | Waiting for storage saturation, or overallocating permanently without review. | Storage/IO metrics and capacity plan. | [ ] |
| SQL-04 | Add explicit primary keys to every InnoDB table (turn on generated invisible primary keys, GIPK, for tables that lack one). Confirm the Burstable tier is not expected to support HA, read replicas, or accelerated logs. | Missing primary keys, which slow binary-log replication and HA failover and can trigger known replication bugs; assuming the Burstable tier supports HA/replicas. | Schema review, GIPK setting, tier selection rationale. | [ ] |

### 7.3 Key Vault

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| KV-01 | Separate vaults by environment, workload, region, and administrative boundary where blast radius or policy differs. | One organization-wide vault containing unrelated production and development secrets. | Vault inventory and architecture. | [ ] |
| KV-02 | Design applications for Key Vault throttling/transient faults; cache secrets securely for an appropriate period instead of calling Key Vault on every request. | Calling Key Vault repeatedly in hot paths, or caching secrets indefinitely with no refresh. | Traces, retry/cache design and load test. | [ ] |

### 7.4 Azure Managed Redis / Azure Cache for Redis

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| RDS-01 | Identify every legacy Azure Cache for Redis instance and execute a tested migration plan to Azure Managed Redis before the applicable retirement date. | Creating new legacy caches, or waiting until service disablement to migrate. | Resource type/SKU, retirement register and migration test. | [ ] |
| RDS-02 | Choose an eviction policy deliberately, keep cached values appropriately sized, reserve memory where applicable, and scale before saturation. | Scaling only after server load/memory is already critical, or caching very large objects indiscriminately. | Redis config, key sampling and load tests. | [ ] |
| RDS-03 | Keep authentication enabled on every cache; never set the `AuthNotRequired` property (or equivalent access-key-disabled setting) to allow unauthenticated access. | Disabling authentication entirely to simplify client configuration. | Redis access configuration and `AuthNotRequired` setting. | [ ] |

### 7.5 Azure Front Door and WAF

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| FD-01 | Use Front Door Standard/Premium rather than the classic (retiring) offering, and select Premium where managed WAF rules and origin Private Link are required. | Remaining on a retiring classic offering, or selecting tier solely on price. | Profile SKU and lifecycle register. | [ ] |
| FD-02 | Select origin routing and session affinity from application behavior; prefer stateless distribution over sticky sessions. | Sticky sessions used to conceal local session state or unhealthy instance behavior. | Origin-group settings and architecture. | [ ] |
| FD-03 | Preserve the same host name between Front Door and the origin (forward the original host header) and restrict Front Door RBAC to only the identities that need control-plane access. | Rewriting the host header without validating cookie/redirect/session behavior, or leaving Front Door profile RBAC unrestricted. | Front Door host-header/origin configuration, RBAC assignments, regression test. | [ ] |

### 7.6 Network (VNet, NSG, private endpoints, private DNS)

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| NET-01 | Design address space with growth/peering/private-endpoint capacity and avoid overlaps with connected networks. | Nearly exhausted subnets, or overlapping ranges discovered during DR/merger connectivity. | IP address management plan and subnet utilization. | [ ] |
| NET-02 | Test private DNS resolution and routing from every client path, including peered VNets, build agents, and on-premises networks. | A private endpoint declared healthy because it resolves only from one VNet. | DNS/routing tests and topology. | [ ] |
| NET-03 | Review custom routes and network virtual appliance (NVA) dependencies for zone/region failure and asymmetric routing. | A single NVA or an incorrect UDR that silently blackholes production traffic. | Route tables, effective routes and failover test. | [ ] |
| NET-04 | Enable Network Watcher/flow logging where required and protect the logs; evaluate Azure DDoS Network Protection for VNets with public-IP resources. | Logging without retention/analysis, or assuming Front Door alone protects every public endpoint in the VNet. | Flow logs, DDoS plan and public-IP inventory. | [ ] |
| NET-05 | Measure network latency, throughput, connection count, DNS resolution time, packet drops, and route changes; keep dependent services appropriately close. | Assuming Azure backbone placement guarantees application latency. | Network Watcher, Connection Monitor and traces. | [ ] |
| NET-06 | Review idle private endpoints, public IPs, peerings, DNS Resolver instances, firewalls, flow logs, and interregion/egress transfer for removal. | Keeping unused network resources because their individual cost appears small. | Inventory and network cost report. | [ ] |
| NET-07 | Manage network and DNS changes as code with pre/post connectivity tests and a rollback path. | Manual NSG/UDR/DNS edits during incidents without effective-rule validation. | IaC, pipeline and change records. | [ ] |

### 7.7 NAT Gateway

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| NAT-01 | Associate the gateway only with intended private subnets and use predictable public IP prefixes for downstream allowlists. | NAT attached to the wrong subnet, or destination allowlists based on undocumented ephemeral addresses. | `show`, `subnetAssociations`, public IP resources. | [ ] |
| NAT-02 | Use NAT Gateway StandardV2 automatic zone redundancy where supported/appropriate; otherwise understand the Standard SKU's zonal placement and failure implications. | Calling a zonal Standard gateway zone-redundant. | SKU, zone and regional support. | [ ] |
| NAT-03 | Size public IP/SNAT capacity and connection limits; monitor failed/total SNAT connections and datapath availability. | Waiting for intermittent timeouts before assessing port exhaustion. | Metrics, alerts and capacity calculation. | [ ] |
| NAT-04 | Reuse/pool outbound connections, close them correctly, use bounded backoff, and avoid unnecessarily high idle timeouts; use Private Link/service endpoints for Azure PaaS traffic to free SNAT capacity. | New TCP connection per request, aggressive retries, long idle connections, or sending all PaaS traffic through NAT by default. | Application client settings, connection metrics, dependency endpoints. | [ ] |
| NAT-05 | Review gateway hourly/data-processing/public IP costs against actual subnet use; remove unattached or idle gateways and IPs. | A dedicated gateway for an idle environment with no egress requirement. | Association, flow/metric and cost data. | [ ] |
| NAT-06 | Enable supported flow logs/diagnostics and alert on datapath degradation, failed connections, drops, saturation, and resource health. | No telemetry for intermittent outbound failures. | `diagnosticSettings`, metrics, alerts and runbook. | [ ] |

### 7.8 Application Insights and Log Analytics

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| MON-01 | Use workspace-based Application Insights, Microsoft Entra/RBAC, managed identity where supported, and least-privilege query/export access. | Sharing instrumentation/API keys broadly, or granting all engineers unrestricted sensitive-log access. | `show`, workspace link and `roleAssignments`. | [ ] |
| MON-02 | Use Azure Monitor Private Link Scope (AMPLS) when private ingestion/query is required, and configure public access deliberately. | Private application dependencies but unrestricted public monitoring endpoints without review. | Workspace network settings and AMPLS design. | [ ] |
| MON-03 | Separate operational and security workspaces when access, retention, residency, Sentinel billing, or blast-radius requirements differ. | One workspace by habit, or excessive workspace sprawl with no governance. | Workspace strategy and RBAC. | [ ] |
| MON-04 | Create availability tests from multiple relevant locations and alert on user-visible symptoms and critical dependency failure. | Testing only the home page from one location, or relying on platform resource health alone. | Availability tests, action groups and runbooks. | [ ] |
| MON-05 | Use consistent correlation and SDK/OpenTelemetry versions across components; monitor telemetry throttling/drop and ingestion latency. | Mixed correlation schemes or unsupported SDKs that break end-to-end traces. | SDK inventory, telemetry health and trace sample. | [ ] |
| MON-06 | Monitor workspace health, ingestion volume, query performance, data collection rules, retention changes, and diagnostic-setting drift. | Discovering missing logs only after an incident. | Workspace health alerts and policy compliance. | [ ] |
| MON-07 | Use one Application Insights resource per workload per environment (for example, separate resources for dev, staging, and production), and deploy it in the same region as its Log Analytics workspace. | Sharing one Application Insights resource across environments, which mixes telemetry and configuration/security controls across environment boundaries. | Application Insights resource inventory, region placement. | [ ] |

### 7.9 Azure Communication Services

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| ACS-01 | Prefer managed identity/Microsoft Entra for supported operations; protect and rotate access keys/connection strings when keys remain necessary. | Communication Services keys in source code, client-side code, tickets, or unprotected app settings. | `show`, identities, RBAC and secret store. | [ ] |
| ACS-02 | Apply least-privilege RBAC and separate the application's sending identity from resource administrators. | Application identity has Contributor/Owner on the Communication Services resource. | `roleAssignments` and identity design. | [ ] |
| ACS-03 | Validate data residency/privacy requirements and obtain consent for communications; minimize message metadata/content retained in logs. | Sending regulated data without residency/consent review, or logging full message bodies. | Privacy assessment and logging schema. | [ ] |
| ACS-04 | Handle throttling and transient errors with bounded retries, idempotency/deduplication, status callbacks, and a dead-letter/reconciliation workflow. | Blindly retrying sends and producing duplicate email/SMS. | Client policy, message IDs and failure test. | [ ] |
| ACS-05 | Budget and alert by channel, destination, volume, and failed/retried sends to prevent abuse-driven spend. | No spend guardrail for compromised send credentials or retry storms. | Cost analysis, quotas and anomaly alerts. | [ ] |

### 7.10 Defender for Cloud and Azure Policy

| ID | Review control | Avoid | Evidence | Status |
|---|---|---|---|---|
| DEF-01 | Verify Foundational CSPM/Defender CSPM state, MCSB assignment, secure-score controls, recommendations, attack paths, and governance rules at every in-scope subscription. | Assuming Defender is enabled because the portal opens, or because one subscription is covered. | `pricing`, security settings, assessments and compliance. | [ ] |
| DEF-02 | Confirm each paid Defender plan maps to present resource types and intended protections; verify subplans/extensions and coverage status. | Paying for irrelevant plans, or believing a top-level plan name guarantees every resource is protected. | `pricing`, plan settings and coverage workbook. | [ ] |
| DEF-03 | Review recommendation exemptions for scope, justification, compensating controls, owner, expiry, and revalidation. | Permanent subscription-wide exemptions with no expiry. | `exemptions` and exception register. | [ ] |
| DEF-04 | Use continuous export/workflow automation/SIEM integration where required and protect exported data. | Security findings retained only in the portal with no case-management path. | Automation/export settings and incident workflow. | [ ] |
| DEF-05 | Review protected-resource counts, per-resource/per-transaction charges, Defender CSPM benefits, and duplicate third-party tooling. | Disabling high-value detection without risk review, or running overlapping tools with no use case. | Defender cost report and control mapping. | [ ] |
| DEF-06 | Set governance rules, owners, and due dates; review secure-score trend and test incident procedures; monitor plan/configuration changes. | A static quarterly screenshot used as the security program. | Governance rules, secure-score trend and review minutes. | [ ] |

## 8. Mandatory manual-validation register

The collector (`PSScripts/Invoke-CollectWordPressPosture.ps1`) cannot prove the following. Review every applicable item manually and retain dated evidence.

| ID | Manual validation | Required evidence | Status |
|---|---|---|---|
| MAN-01 | Confirm critical flows, dependencies, SLOs/SLIs, RTOs/RPOs, and accepted risks with business owners. | Approved business impact analysis, SLO document, dependency map, risk acceptance. | [ ] |
| MAN-02 | Exercise whole-workload restore and recovery for database, uploads, application/configuration, secrets, DNS, certificates, edge routing, and network policy. | Measured RTO/RPO report, defects, owners, remediation evidence. | [ ] |
| MAN-03 | Test zone, region, dependency, identity, DNS, network, deployment, and cache failure scenarios at an agreed cadence. | Game-day/fault-injection records and updated runbooks. | [ ] |
| MAN-04 | Review Entra tenant controls, Azure RBAC, PIM/JIT, MFA, Conditional Access, break-glass accounts, MySQL roles, and access-review outcomes. | Identity/RBAC exports, PIM settings, access-review records. | [ ] |
| MAN-05 | Verify WordPress core, plugin, theme, package, container, and IaC vulnerability and secret scanning, provenance, patching, and ownership. | SBOM, scan reports, patch SLA, CI/CD configuration. | [ ] |
| MAN-06 | Exercise secret, certificate, key, and credential rotation, including dependent application validation and emergency access. | Rotation policy, expiry alerts, change records, successful test. | [ ] |
| MAN-07 | Test direct-origin bypass, WAF enforcement, authentication, authorization, WordPress admin protection, and security-alert response. | Negative tests, WAF logs, incident/tabletop evidence. | [ ] |
| MAN-08 | Verify IaC, peer review, policy checks, pipeline promotion, safe release, rollback, and drift detection. | Repository, pull requests, pipeline runs, drift reports. | [ ] |
| MAN-09 | Validate alert ownership, SLO/symptom coverage, action groups, dashboards, retention, runbooks, and notification tests. | Alert tests, dashboards, runbooks, on-call rota, postmortems. | [ ] |
| MAN-10 | Load, stress, soak, scalability, cache-invalidation, and failure-mode test critical flows in a production-like environment. | Versioned test scripts, reports, baselines, capacity conclusions. | [ ] |
| MAN-11 | Validate cost allocation, budgets, forecasts, anomaly alerts, cleanup, right-sizing, and commitment utilization. | Cost exports, budget alerts, monthly reviews, utilization reports. | [ ] |
| MAN-12 | Confirm WordPress operational governance for approved plugins/themes, staging validation, administrator access, privacy/consent, PII handling, and email deliverability. | Governance policy, access review, privacy assessment, delivery reports. | [ ] |

## 9. Scoring summary

Count `Pass`/`Fail`/`N/A`/`Not verified` per section and compute a score percentage (`Pass / (Total − N/A)`).

| Section | Total checks | Passed | Failed | N/A | Not verified | Score % |
|---|---|---|---|---|---|---|
| 1. Workload foundations and governance | 13 | | | | | |
| 2. Reliability | 17 | | | | | |
| 3. Security | 24 | | | | | |
| 4. Cost Optimization | 14 | | | | | |
| 5. Operational Excellence | 17 | | | | | |
| 6. Performance Efficiency | 15 | | | | | |
| 7. Resource-specific supplementary checklist | 45 | | | | | |
| 8. Mandatory manual-validation register | 12 | | | | | |
| **TOTAL** | **157** | | | | | |

## 10. Review completion record

| Field | Value |
|---|---|
| Workload/environment | |
| Subscription and resource group | |
| Review date | |
| Reviewers | |
| Business owner | |
| Security owner | |
| Data classification | |
| SLO / RTO / RPO | |
| Pass / Fail / N/A / Not verified totals | |
| Critical and high findings | |
| Accepted risks and approver | |
| Remediation backlog | |
| Next review date | |

## Microsoft guidance used

### Framework and security baseline

- [Azure Well-Architected Framework](https://learn.microsoft.com/azure/well-architected/what-is-well-architected-framework)
- [Azure Well-Architected Framework pillars](https://learn.microsoft.com/azure/well-architected/pillars)
- [Reliability design review checklist](https://learn.microsoft.com/azure/well-architected/reliability/checklist)
- [Security design review checklist](https://learn.microsoft.com/azure/well-architected/security/checklist)
- [Cost Optimization design review checklist](https://learn.microsoft.com/azure/well-architected/cost-optimization/checklist)
- [Operational Excellence design review checklist](https://learn.microsoft.com/azure/well-architected/operational-excellence/checklist)
- [Performance Efficiency design review checklist](https://learn.microsoft.com/azure/well-architected/performance-efficiency/checklist)
- [Introduction to the Microsoft cloud security benchmark](https://learn.microsoft.com/security/benchmark/azure/introduction)
- [Azure security baselines overview](https://learn.microsoft.com/security/benchmark/azure/security-baselines-overview)
- [Security policies and recommendations in Defender for Cloud](https://learn.microsoft.com/azure/defender-for-cloud/security-policy-concept)
- [Microsoft cloud security benchmark in Defender for Cloud](https://learn.microsoft.com/azure/defender-for-cloud/concept-regulatory-compliance)
- [Microsoft Defender for Cloud overview](https://learn.microsoft.com/azure/defender-for-cloud/defender-for-cloud-introduction)

### WordPress, service guidance, and reference architectures

- [WordPress on App Service](https://learn.microsoft.com/azure/app-service/overview-wordpress)
- [WordPress on Azure](https://learn.microsoft.com/azure/architecture/guide/infrastructure/wordpress-overview)
- [WordPress on App Service reference architecture](https://learn.microsoft.com/azure/architecture/example-scenario/infrastructure/wordpress-app-service)
- [Well-Architected best practices for App Service](https://learn.microsoft.com/azure/well-architected/service-guides/app-service-web-apps)
- [Reliability in Azure App Service](https://learn.microsoft.com/azure/reliability/reliability-app-service)
- [App Service language support policy](https://learn.microsoft.com/azure/app-service/language-support-policy)
- [App Service networking features](https://learn.microsoft.com/azure/app-service/networking-features)
- [Well-Architected best practices for Azure Database for MySQL](https://learn.microsoft.com/azure/well-architected/service-guides/azure-database-for-mysql)
- [Secure Azure Database for MySQL](https://learn.microsoft.com/azure/mysql/security/security-overview)
- [Azure Database for MySQL performance best practices](https://learn.microsoft.com/azure/mysql/flexible-server/concept-performance-best-practices)
- [Secure Azure Key Vault](https://learn.microsoft.com/azure/key-vault/general/secure-key-vault)
- [Azure Key Vault security baseline](https://learn.microsoft.com/security/benchmark/azure/baselines/key-vault-security-baseline)
- [Azure Cache for Redis retirement FAQ](https://learn.microsoft.com/azure/azure-cache-for-redis/retirement-faq)
- [Azure Cache for Redis connection resilience](https://learn.microsoft.com/azure/azure-cache-for-redis/cache-best-practices-connection)
- [Well-Architected best practices for Azure Front Door](https://learn.microsoft.com/azure/well-architected/service-guides/azure-front-door)
- [Secure Azure Front Door](https://learn.microsoft.com/azure/frontdoor/secure-front-door)
- [Well-Architected best practices for Blob Storage](https://learn.microsoft.com/azure/well-architected/service-guides/azure-blob-storage)
- [Secure an Azure Storage account](https://learn.microsoft.com/azure/storage/common/secure-storage)
- [Azure Storage security baseline](https://learn.microsoft.com/security/benchmark/azure/baselines/storage-security-baseline)
- [Reliability in Azure NAT Gateway](https://learn.microsoft.com/azure/reliability/reliability-nat-gateway)
- [Design virtual networks with NAT Gateway](https://learn.microsoft.com/azure/nat-gateway/nat-gateway-design)
- [Private Endpoint DNS integration](https://learn.microsoft.com/azure/private-link/private-endpoint-dns-integration)
- [Well-Architected best practices for Application Insights](https://learn.microsoft.com/azure/well-architected/service-guides/application-insights)
- [Well-Architected best practices for Log Analytics](https://learn.microsoft.com/azure/well-architected/service-guides/azure-log-analytics)
- [Azure Monitor Logs best practices](https://learn.microsoft.com/azure/azure-monitor/logs/best-practices-logs)
- [Azure Monitor daily cap guidance](https://learn.microsoft.com/azure/azure-monitor/logs/daily-cap)
- [Azure Communication Services security baseline](https://learn.microsoft.com/security/benchmark/azure/baselines/communication-services-security-baseline)
- [Azure App Service baseline architecture](https://learn.microsoft.com/azure/architecture/web-apps/app-service/architectures/baseline-zone-redundant)
- [Mission-critical App Service](https://learn.microsoft.com/azure/architecture/guide/networking/global-web-applications/mission-critical-app-service)
- [App Service security baseline](https://learn.microsoft.com/security/benchmark/azure/baselines/app-service-security-baseline)
