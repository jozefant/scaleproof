import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

// The scanner retains more languages, but these rules have reviewed static
// patterns only for the listed application languages. Add language-specific
// patterns and regressions before widening this boundary.
const SOURCE_PATHS = [/\.[cm]?[jt]sx?$/, /\.java$/, /\.py$/, /\.rb$/, /\.go$/];
const CONFIG_PATHS = [
  /\.(ya?ml|properties|toml|json|conf)$/,
  /(^|\/)dockerfile$/,
  /(^|\/)compose\.ya?ml$/,
];
const TEST_OR_FIXTURE_PATH =
  /(^|\/)(test|tests|__tests__|fixtures?)(\/|$)|\.(spec|test)\.[cm]?[jt]sx?$/;
const REQUEST_PATHS = [
  /(^|\/)(api|routes?|controllers?)\//,
  /route\.[cm]?[jt]s$/,
  /controller.*\.java$/,
  /(?:handler|routes?)\.go$/,
];
const CLIENT_PATTERNS = [
  /\b(fetch|axios(?!\.create\b)(?:\.[a-z]+)?|got|undici|resttemplate|webclient|httpclient|requests)\s*\(/i,
  /\bhttp\.(?:defaultclient\.)?(get|post|do|newrequest)\s*\(/i,
  /\b(javamailsender|nodemailer|smtplib)\b/i,
];
const TIMEOUT_PATTERNS = [
  /\b(abortsignal\.timeout|setconnecttimeout|setreadtimeout|connecttimeout|readtimeout)\b|timeout\s*:/i,
];
const RETRY_SAFETY_PATTERNS = [
  /\b(idempotency[-_ ]?key|idempotent|retry.{0,80}(backoff|exponential)|@retryable.{0,80}backoff|circuit.?breaker|bulkhead|backpressure)\b/is,
];

export const saasAuditDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "saas.stateless-tier",
    claim: "A SaaS request tier does not keep user or job state in one process.",
    applicability: "Repositories exposing a long-running web service.",
    requiredSignals: ["External session store or direct process-local state evidence"],
    disqualifyingSignals: ["Generic scalability wording"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "Static inspection cannot prove every request-state path or deployed topology.",
    remediationCode: "remove-request-state",
  },
  {
    id: "saas.database-discipline",
    claim: "Database-backed request paths show bounded-query and schema-index foundations.",
    applicability: "Repositories with durable-data signals.",
    requiredSignals: ["Pagination or query-limit signal and migration/index evidence"],
    disqualifyingSignals: ["Database dependency alone"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "Static patterns cannot prove query plans, cardinality, or production contention.",
    remediationCode: "add-load-path",
  },
  {
    id: "saas.slow-work",
    claim: "Potentially slow external work is separated from synchronous request handling.",
    applicability: "Repositories with detected HTTP, mail, report, or file-generation work.",
    requiredSignals: ["Queue, worker, scheduler, or explicit asynchronous boundary"],
    disqualifyingSignals: ["Async syntax alone"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "A repository cannot prove runtime latency or that every slow path is decoupled.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "saas.failure-safety",
    claim: "External SaaS work has timeouts and retry or idempotency safety.",
    applicability: "Repositories making external calls or processing webhooks or payments.",
    requiredSignals: ["Configured timeout and retry, idempotency, or overload control"],
    disqualifyingSignals: ["One unconfigured client call or generic reliability prose"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Configuration cannot prove values are tuned or failure paths are exercised.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "saas.config-boundary",
    claim: "Runtime endpoints, secrets, and capacity configuration are not embedded in source.",
    applicability: "Repositories with deployable application code.",
    requiredSignals: ["Environment-owned configuration and explicit pool or capacity setting"],
    disqualifyingSignals: ["Documentation examples and test fixtures"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Static inspection cannot establish the production secret manager or final deployment values.",
    remediationCode: "add-security-baseline",
  },
  {
    id: "saas.tenant-isolation",
    claim: "Detected tenant-owned data has a centrally visible isolation boundary.",
    applicability: "Repositories with tenant, organization, workspace, or account-scoped data signals.",
    requiredSignals: ["RLS, ORM filter, tenant base repository, or central middleware evidence"],
    disqualifyingSignals: ["A tenant field or hand-written query alone"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Static repository evidence cannot prove every table, query, or production policy is covered.",
    remediationCode: "harden-auth-boundary",
  },
  {
    id: "saas.observability",
    claim: "A SaaS service exposes metrics and correlation evidence beyond console logging.",
    applicability: "Long-running services intended for operated deployment.",
    requiredSignals: ["Metrics or tracing signal and correlation propagation or structured logging"],
    disqualifyingSignals: ["Console logging or one health endpoint"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Repository evidence cannot prove collection, dashboards, or alert response.",
    remediationCode: "add-observability",
  },
  {
    id: "saas.feature-flags",
    claim: "A production SaaS release can use a scoped feature flag or kill switch.",
    applicability: "Production or scaling-stage applications.",
    requiredSignals: ["Recognized feature-flag or configuration-gated release signal"],
    disqualifyingSignals: ["Boolean unrelated to release control"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "A flag library does not prove safe ownership, expiry, or operational use.",
    remediationCode: "add-release-rollback",
  },
  {
    id: "saas.ci-test-gate",
    claim: "Visible automated tests are invoked from a CI workflow.",
    applicability: "Repositories with tests or a shared delivery workflow.",
    requiredSignals: ["Recognized CI workflow and test command in that workflow"],
    disqualifyingSignals: ["Test files or CI configuration in isolation"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Repository configuration cannot prove branch protection or a currently passing remote run.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "saas.critical-bus-factor",
    claim: "Recent commit concentration does not leave a critical area dependent on one contributor.",
    applicability: "Repositories with an available recent history sample.",
    requiredSignals: ["Anonymous repository or module concentration aggregate"],
    disqualifyingSignals: ["Identity, email, commit text, or one commit alone"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "A bounded anonymous history sample cannot establish knowledge, review quality, or future availability.",
    remediationCode: "reduce-knowledge-concentration",
  },
  {
    id: "saas.written-decisions",
    claim: "Load-bearing SaaS decisions are recorded outside transient chat or code comments.",
    applicability: "Repositories expected to evolve with multiple engineers.",
    requiredSignals: ["ADR, decision record, or architecture decision document"],
    disqualifyingSignals: ["One generic README"],
    strongestEvidenceTier: "documented",
    confidenceLimitation: "Written decisions cannot prove they are current, accepted, or followed.",
    remediationCode: "add-architecture-decisions",
  },
  {
    id: "saas.dependency-freshness",
    claim: "Dependency EOL requires a dated, maintained compatibility source rather than a guess.",
    applicability: "Repositories with a dependency manifest or lockfile.",
    requiredSignals: ["Versioned dependency catalog and dated upstream support policy"],
    disqualifyingSignals: ["Package version alone"],
    strongestEvidenceTier: "runtime_only",
    confidenceLimitation: "This offline scan deliberately does not claim framework EOL status without a maintained catalog.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "saas.critical-test-distribution",
    claim: "Detected auth, payment, webhook, or tenant source areas have matching test evidence.",
    applicability: "Repositories exposing a recognized critical SaaS source area.",
    requiredSignals: ["Critical-area source path and matching test-path evidence"],
    disqualifyingSignals: ["Generic test count or coverage percentage"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation: "Matching paths do not prove assertion depth, negative cases, or production behaviour.",
    remediationCode: "add-test-layers",
  },
] as const);

function sourceContent(index: Parameters<ControlEvaluator>[0], patterns: RegExp[]) {
  return signals.findContent(index, patterns, {
    pathPatterns: SOURCE_PATHS,
    excludePathPatterns: [TEST_OR_FIXTURE_PATH],
  });
}

function requestContent(index: Parameters<ControlEvaluator>[0], patterns: RegExp[]) {
  return signals.findContent(index, patterns, {
    pathPatterns: REQUEST_PATHS,
    excludePathPatterns: [TEST_OR_FIXTURE_PATH],
  });
}

function sourceFiles(index: Parameters<ControlEvaluator>[0]) {
  return index.files.filter(
    (file) =>
      SOURCE_PATHS.some((pattern) => pattern.test(file.normalizedPath)) &&
      !TEST_OR_FIXTURE_PATH.test(file.normalizedPath),
  );
}

function references(files: ReturnType<typeof sourceFiles>) {
  return files.slice(0, 4).map((file) => ({ path: file.path, kind: "code" as const }));
}

function hasUnboundedSql(content: string): boolean {
  return content
    .split(";")
    .some(
      (statement) =>
        /\bselect\b/i.test(statement) &&
        !/\b(limit|fetch\s+first|top\s*\()\b/i.test(statement),
    );
}

function clientKinds(content: string): string[] {
  return ["fetch", "axios", "got", "undici", "resttemplate", "webclient", "httpclient", "requests", "http"]
    .filter((client) => new RegExp(`\\b${client}\\b`, "i").test(content));
}

type SourceFile = ReturnType<typeof sourceFiles>[number];

interface ClientObservation {
  file: SourceFile;
  timeoutConfigured: boolean;
  safetyConfigured: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function axiosInstanceObservations(
  file: SourceFile,
  globalDefaults: Set<string>,
): ClientObservation[] {
  const instances: ClientObservation[] = [];
  const createPattern =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*axios\.create\s*\(\s*(?:\{([\s\S]{0,500}?)\})?\s*\)/gi;

  for (const definition of file.content.matchAll(createPattern)) {
    const name = definition[1];
    const configuration = definition[2] ?? "";
    const callPattern = new RegExp(
      `\\b${escapeRegex(name)}\\.(?:delete|get|patch|post|put|request)\\s*\\(`,
      "gi",
    );
    const calls = [...file.content.matchAll(callPattern)];
    if (calls.length === 0) continue;

    const safetyAtCall = calls.some((call) => {
      const start = Math.max(0, (call.index ?? 0) - 160);
      const end = Math.min(file.content.length, (call.index ?? 0) + 500);
      return RETRY_SAFETY_PATTERNS.some((pattern) =>
        pattern.test(file.content.slice(start, end)),
      );
    });
    instances.push({
      file,
      timeoutConfigured:
        TIMEOUT_PATTERNS.some((pattern) => pattern.test(configuration)) ||
        globalDefaults.has("axios"),
      safetyConfigured:
        RETRY_SAFETY_PATTERNS.some((pattern) => pattern.test(configuration)) || safetyAtCall,
    });
  }
  return instances;
}

function clientReferences(clients: ClientObservation[]) {
  const uniqueFiles = [...new Map(
    clients.map((client) => [client.file.normalizedPath, client.file]),
  ).values()];
  return references(uniqueFiles);
}

function globalTimeoutKinds(index: Parameters<ControlEvaluator>[0]): Set<string> {
  const kinds = new Set<string>();
  for (const file of sourceFiles(index)) {
    if (/\baxios\.defaults\.timeout\s*=/i.test(file.content)) {
      kinds.add("axios");
    }
    if (/\bhttp\.defaultclient\.timeout\s*=/i.test(file.content)) {
      kinds.add("http");
    }
  }
  return kinds;
}

function isCriticalArea(path: string): boolean {
  return /(^|\/)(auth|authentication|payments?|billing|webhooks?|tenants?)(\/|$)|(?:auth|authentication|payment|billing|webhook|tenant)/i.test(path);
}

function criticalAreaName(path: string): string | null {
  const match = path.toLowerCase().match(/auth(?:entication)?|payments?|billing|webhooks?|tenants?/);
  if (!match) return null;
  if (match[0].startsWith("auth")) return "auth";
  if (match[0].startsWith("payment") || match[0] === "billing") return "payment";
  if (match[0].startsWith("webhook")) return "webhook";
  return "tenant";
}

export function saasAuditControls(): ControlEvaluator[] {
  return [
    (index) => {
      const localState = sourceContent(index, [
        /\b(memorysessionrepository|memorystore|express-session|static\s+(?:final\s+)?(?:map|concurrenthashmap)|new\s+map\(\).{0,100}(?:session|user|tenant|job))\b/is,
      ]);
      const requestFileState = requestContent(index, [
        /\b(fs\.writefile|files\.write|filewriter)\b.{0,160}\b(session|user|tenant|job|request)\b|\b(session|user|tenant|job|request)\b.{0,160}\b(fs\.writefile|files\.write|filewriter)\b/is,
      ]);
      const externalState = sourceContent(index, [
        /\b(redis.{0,80}(?:session|store)|spring\.session|session.{0,80}redis|jwt|external session)\b/i,
      ]);
      const processLocalState = signals.mergeEvidence(localState, requestFileState);
      if (processLocalState.length > 0 && externalState.length === 0) {
        return helpers.result({
          id: "saas.stateless-tier",
          domain: "reliability",
          title: "SaaS request state is process-local",
          summary: "Direct process-local session, user, job, or request-path file state blocks safe multi-instance handling.",
          remediationCode: "remove-request-state",
          severity: "high",
          weight: 3,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: processLocalState,
        });
      }
      return helpers.positiveControl({
        id: "saas.stateless-tier",
        domain: "reliability",
        title: "SaaS request-state boundary",
        missingSummary: "The repository does not establish whether another instance can safely handle the next user request.",
        passSummary: "Repository evidence supports an external or stateless request-state boundary.",
        remediationCode: "remove-request-state",
        severity: "high",
        weight: 3,
        inferred: externalState,
      });
    },
    (index) => {
      const durable = signals.hasDurableData(index);
      const databaseSource = sourceFiles(index);
      const unbounded = references(
        databaseSource.filter(
          (file) =>
            /\bfindall\s*\(\s*\)/i.test(file.content) ||
            hasUnboundedSql(file.content),
        ),
      );
      const nPlusOne = references(
        databaseSource.filter((file) =>
          /\b(for|while)\s*\([^)]*\)\s*\{[\s\S]{0,500}\b(find(?:by|all)|get[A-Z]\w*\s*\()/i.test(file.content),
        ),
      );
      const bounded = sourceContent(index, [
        /\b(pageable|page<|limit\s+\d+|take\s*:|skip\s*:|setmaxresults)\b/i,
      ]);
      const migrations = signals.findPaths(index, [
        /(^|\/)(db\/)?migrations?\//,
        /flyway/,
        /liquibase/,
        /schema\.(sql|prisma)$/,
      ]);
      const indexes = signals.findContent(index, [
        /\b(create\s+index|@index|@@index|index\s*\()\b/i,
      ], {
        pathPatterns: [...SOURCE_PATHS, /\.sql$/],
        excludePathPatterns: [TEST_OR_FIXTURE_PATH],
      });
      const readWriteBoundary = signals.findContent(index, [
        /\b(read[_-]?replica|replica[_-]?(?:host|url|datasource)|routingdatasource|read[_-]?only\s+datasource)\b/i,
      ], { pathPatterns: [...SOURCE_PATHS, ...CONFIG_PATHS], excludePathPatterns: [TEST_OR_FIXTURE_PATH] });
      const queryColumns = databaseSource.flatMap((file) =>
        [...file.content.matchAll(/\bwhere\s+(?:\w+\.)?(\w+)\s*=|\bfindBy([A-Z]\w*)/gi)]
          .map((match) => (match[1] ?? match[2] ?? "").toLowerCase()),
      ).filter(Boolean);
      const indexedColumns = index.files
        .filter((file) => /(^|\/)(migrations?|db)\/|flyway|liquibase|schema\.(sql|prisma)$/i.test(file.normalizedPath))
        .flatMap((file) =>
          [...file.content.matchAll(/\b(?:create\s+index[^\(]*\(|@index\s*\(\s*\[?|@@index\s*\(\s*\[?)(\w+)/gi)]
            .map((match) => match[1].toLowerCase()),
        );
      const queryIndexMismatch =
        queryColumns.length > 0 &&
        indexedColumns.length > 0 &&
        !queryColumns.some((column) => indexedColumns.includes(column));
      const databaseRisk = signals.mergeEvidence(unbounded, nPlusOne);
      if (durable && databaseRisk.length > 0) {
        return helpers.result({
          id: "saas.database-discipline",
          domain: "reliability",
          title: "Potentially unbounded database request",
          summary: nPlusOne.length > 0
            ? "A loop performs a direct data-access or relation lookup in application code; remove the visible N+1 pattern before growth multiplies queries."
            : "A direct unbounded query pattern is visible in application code; paginate or bound the request path before growth multiplies result size.",
          remediationCode: "add-load-path",
          severity: "high",
          weight: 3,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: databaseRisk,
        });
      }
      return helpers.positiveControl({
        id: "saas.database-discipline",
        domain: "reliability",
        title: "Database query and index foundations",
        missingSummary: queryIndexMismatch
          ? "A visible query predicate does not match an indexed migration column; verify the request-path index before growth increases lookup cost."
          : "Durable-data signals were found without enough bounded-query, migration, and index evidence; read/write separation remains a future readiness check unless a replica boundary is visible.",
        passSummary: "Bounded query and schema-index foundations are visible for the detected durable-data path; a replica or read/write boundary is only reported when directly configured.",
        remediationCode: "add-load-path",
        severity: "medium",
        weight: 2,
        enforced:
          bounded.length > 0 && migrations.length > 0 && indexes.length > 0 && !queryIndexMismatch
            ? signals.mergeEvidence(bounded, migrations, indexes)
            : [],
        partial: signals.mergeEvidence(bounded, migrations, indexes, readWriteBoundary),
        applicable: durable,
      });
    },
    (index) => {
      const requestClient = requestContent(index, CLIENT_PATTERNS);
      const asyncPath = sourceContent(index, [
        /\b(bullmq|bull\.queue|sidekiq|celery|rabbitmq|kafka|sqs|@async|quartz|scheduler|job queue|worker)\b/i,
      ]);
      if (requestClient.length > 0 && asyncPath.length === 0) {
        return helpers.result({
          id: "saas.slow-work",
          domain: "reliability",
          title: "External work stays on the request path",
          summary: "A request handler appears to call an external dependency without a visible queue, worker, scheduler, or other workload boundary.",
          remediationCode: "add-failure-controls",
          severity: "high",
          weight: 3,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: requestClient,
        });
      }
      return helpers.positiveControl({
        id: "saas.slow-work",
        domain: "reliability",
        title: "Slow-work boundary",
        missingSummary: "Detected external work has no visible asynchronous or background-work boundary.",
        passSummary: "A queue, worker, scheduler, or other background-work boundary is visible.",
        remediationCode: "add-failure-controls",
        severity: "medium",
        weight: 2,
        inferred: asyncPath,
        applicable: requestClient.length > 0,
      });
    },
    (index) => {
      const globalDefaults = globalTimeoutKinds(index);
      const clientFiles = sourceFiles(index).filter((file) =>
        CLIENT_PATTERNS.some((pattern) => pattern.test(file.content)),
      );
      const clientObservations = [
        ...clientFiles.map((file) => {
          const kinds = clientKinds(file.content);
          return {
            file,
            timeoutConfigured:
              TIMEOUT_PATTERNS.some((pattern) => pattern.test(file.content)) ||
              kinds.some((kind) => globalDefaults.has(kind)),
            safetyConfigured: RETRY_SAFETY_PATTERNS.some((pattern) => pattern.test(file.content)),
          };
        }),
        ...sourceFiles(index).flatMap((file) => axiosInstanceObservations(file, globalDefaults)),
      ];
      const unboundedClients = clientObservations.filter((client) =>
        !client.timeoutConfigured,
      );
      const timeoutClients = clientObservations.filter((client) =>
        client.timeoutConfigured,
      );
      const unsafeCriticalHandlers = timeoutClients.filter(
        (client) =>
          isCriticalArea(client.file.normalizedPath) && !client.safetyConfigured,
      );
      const safeClients = timeoutClients.filter((client) => client.safetyConfigured);
      if (unboundedClients.length > 0) {
        return helpers.result({
          id: "saas.failure-safety",
          domain: "reliability",
          title: "External client has no visible timeout",
          summary: "A recognized external client is visible without a timeout configuration; dependency stalls can exhaust request capacity.",
          remediationCode: "add-failure-controls",
          severity: "critical",
          weight: 4,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: clientReferences(unboundedClients),
        });
      }
      if (unsafeCriticalHandlers.length > 0) {
        return helpers.result({
          id: "saas.failure-safety",
          domain: "reliability",
          title: "Money or webhook handler lacks idempotency evidence",
          summary: "A payment, billing, or webhook handler makes an external call with a timeout but no same-handler idempotency, deduplication, or retry-safety evidence.",
          remediationCode: "add-failure-controls",
          severity: "critical",
          weight: 4,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: clientReferences(unsafeCriticalHandlers),
        });
      }
      return helpers.positiveControl({
        id: "saas.failure-safety",
        domain: "reliability",
        title: "External-work failure safety",
        missingSummary: "External work has timeout evidence but no visible idempotency, backoff, or overload-safety evidence.",
        passSummary: "External work has both a timeout and retry, idempotency, or overload-safety evidence.",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        enforced:
          clientObservations.length > 0 &&
          timeoutClients.length === clientObservations.length &&
          safeClients.length === clientObservations.length
            ? signals.mergeEvidence(clientReferences(timeoutClients), clientReferences(safeClients))
            : [],
        partial: signals.mergeEvidence(clientReferences(timeoutClients), clientReferences(safeClients)),
        applicable: clientObservations.length > 0,
      });
    },
    (index) => {
      const hardcoded = sourceContent(index, [
        /\bhttps?:\/\/(?!localhost|127\.0\.0\.1|example\.com)[\w.-]+/i,
        /\b(password|api[_-]?key|secret)\s*[:=]\s*["'][^"']{8,}/i,
      ]);
      const envConfig = sourceContent(index, [
        /\b(process\.env|system\.getenv|@value\(|configurationproperties)\b/i,
      ]);
      const pool = signals.findContent(index, [
        /\b(maximum-pool-size|maxpoolsize|connectionlimit|poolsize|pool\.max)\b/i,
      ], { pathPatterns: [...SOURCE_PATHS, ...CONFIG_PATHS], excludePathPatterns: [TEST_OR_FIXTURE_PATH] });
      if (hardcoded.length > 0) {
        return helpers.result({
          id: "saas.config-boundary",
          domain: "security",
          title: "Runtime configuration appears embedded in source",
          summary: "A non-local endpoint or credential-shaped runtime value appears in application source; move it to deployment-owned configuration and rotate any secret.",
          remediationCode: "add-security-baseline",
          severity: "medium",
          weight: 2,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: hardcoded,
        });
      }
      return helpers.positiveControl({
        id: "saas.config-boundary",
        domain: "security",
        title: "Runtime configuration boundary",
        missingSummary: "The repository does not show both deployment-owned configuration and explicit pool or capacity readiness.",
        passSummary: "Environment-owned runtime configuration and capacity settings are visible.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 1,
        enforced:
          envConfig.length > 0 && pool.length > 0
            ? signals.mergeEvidence(envConfig, pool)
            : [],
        partial: signals.mergeEvidence(envConfig, pool),
      });
    },
    (index) => {
      const tenantSignals = sourceContent(index, [
        /\b(tenant[_-]?id|organization[_-]?id|workspace[_-]?id|account[_-]?id)\b/i,
      ]);
      const centralBoundary = signals.findContent(index, [
        /\b(@filter|row level security|create policy|tenantcontext|tenantresolver|basetenantrepository|withtenant)\b/i,
      ], {
        pathPatterns: [...SOURCE_PATHS, ...CONFIG_PATHS, /\.sql$/],
        excludePathPatterns: [TEST_OR_FIXTURE_PATH],
      });
      if (tenantSignals.length === 0) {
        return helpers.positiveControl({
          id: "saas.tenant-isolation",
          domain: "security",
          title: "Tenant isolation",
          missingSummary: "No tenant-owned data signal was found.",
          passSummary: "Tenant isolation is centrally visible.",
          remediationCode: "harden-auth-boundary",
          severity: "high",
          weight: 3,
          applicable: false,
        });
      }
      const uncoveredTenantQueries = references(
        sourceFiles(index).filter(
          (file) =>
            (/(^|\/)(tenant|organization|workspace|account)(\/|$)/i.test(file.normalizedPath) ||
              /\b(tenant[_-]?id|organization[_-]?id|workspace[_-]?id|account[_-]?id)\b/i.test(file.content)) &&
            (/\bfindall\s*\(/i.test(file.content) ||
              (/\bselect\b/i.test(file.content) &&
                !/\bwhere\b[^;]{0,200}\b(tenant[_-]?id|organization[_-]?id|workspace[_-]?id|account[_-]?id)\b/i.test(file.content))),
        ),
      );
      if (centralBoundary.length === 0 && uncoveredTenantQueries.length > 0) {
        return helpers.result({
          id: "saas.tenant-isolation",
          domain: "security",
          title: "Tenant query lacks a visible isolation boundary",
          summary: "Tenant-owned data signals and a direct query are visible, but this query has neither a tenant predicate nor a central isolation boundary.",
          remediationCode: "harden-auth-boundary",
          severity: "critical",
          weight: 4,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: uncoveredTenantQueries,
        });
      }
      return helpers.positiveControl({
        id: "saas.tenant-isolation",
        domain: "security",
        title: "Tenant isolation boundary",
        missingSummary: "Tenant-owned data signals are present, but no central RLS, ORM filter, middleware, or tenant repository boundary was found.",
        passSummary: "Tenant-owned data has a centrally visible isolation boundary.",
        remediationCode: "harden-auth-boundary",
        severity: "high",
        weight: 3,
        enforced: centralBoundary,
        partial: tenantSignals,
      });
    },
    (index) => {
      const consoleLogs = sourceContent(index, [/\b(console\.log|system\.out\.print|print\()\b/i]);
      const telemetry = sourceContent(index, [
        /\b(prometheus|micrometer|opentelemetry|metrics|traceparent)\b/i,
      ]);
      const correlation = sourceContent(index, [
        /\b(trace[_-]?id|correlation[_-]?id|mdc|x-request-id)\b/i,
      ]);
      const structuredLogging = sourceContent(index, [
        /\b(pino|winston|structlog|jsonencoder|jsonlayout|structured[_ -]?log(?:ging)?)\b/i,
      ]);
      return helpers.positiveControl({
        id: "saas.observability",
        domain: "operations",
        title: "SaaS metrics and correlation",
        missingSummary: consoleLogs.length > 0
          ? "Console-style logging is visible without enough metrics and correlation evidence for scalable diagnosis."
          : "Metrics and correlation evidence are not both visible for scalable diagnosis.",
        passSummary: "Metrics or tracing and correlation or structured logging evidence are visible.",
        remediationCode: "add-observability",
        severity: "high",
        weight: 3,
        enforced:
          telemetry.length > 0 && (correlation.length > 0 || structuredLogging.length > 0)
            ? signals.mergeEvidence(telemetry, correlation, structuredLogging)
            : [],
        partial: signals.mergeEvidence(consoleLogs, telemetry, correlation, structuredLogging),
      });
    },
    (index, context) =>
      helpers.positiveControl({
        id: "saas.feature-flags",
        domain: "quality",
        title: "Feature flag or kill-switch path",
        missingSummary: "No feature flag or configuration-gated kill-switch path was found for production change control.",
        passSummary: "A feature flag or configuration-gated kill-switch path is visible.",
        remediationCode: "add-release-rollback",
        severity: "medium",
        weight: 1,
        inferred: sourceContent(index, [
          /\b(unleash|launchdarkly|togglz|ff4j|feature[_-]?flag|featureflags|kill[_-]?switch)\b/i,
        ]),
        applicable:
          context.stage === "unknown" || context.stage === "withheld"
            ? undefined
            : context.stage === "live_early" ||
              context.stage === "scaling_production",
        contextUnknown: context.stage === "unknown" || context.stage === "withheld",
      }),
    (index) => {
      const workflowPaths = [/^\.github\/workflows\/.*\.ya?ml$/, /^\.circleci\/config\.ya?ml$/, /gitlab-ci/, /azure-pipelines/];
      const workflows = signals.findContent(index, [/\b(npm(?:\s+run)?\s+test|npm\s+run\s+verify|mvn(?:w)?\s+(?:test|verify)|gradle(?:w)?\s+test|pytest|go\s+test)\b/i], {
        pathPatterns: workflowPaths,
      });
      const mergeCandidateWorkflow = signals.findContent(index, [
        /(^|\n)\s*(pull_request|merge_requests?|build_validation)\s*:/im,
        /\bon\s*:\s*pull_request\b/i,
        /\bon\s*:\s*\[[^\]]*\bpull_request\b[^\]]*\]/i,
      ], { pathPatterns: workflowPaths });
      const tests = signals.findPaths(index, [
        /\.(spec|test)\.[cm]?[jt]sx?$/,
        /src\/test\/.*\.java$/,
        /(^|\/)tests?\//,
      ]);
      return helpers.positiveControl({
        id: "saas.ci-test-gate",
        domain: "quality",
        title: "CI runs the visible tests",
        missingSummary: tests.length > 0
          ? "Test files are visible, but no CI workflow visibly invokes a test command."
          : "No test evidence and no CI test invocation were found.",
        passSummary: "A recognized CI workflow for merge candidates visibly invokes the repository's test suite. Branch protection itself remains a hosting-setting check.",
        remediationCode: "add-quality-gate",
        severity: "high",
        weight: 3,
        enforced:
          workflows.length > 0 && mergeCandidateWorkflow.length > 0 && tests.length > 0
            ? signals.mergeEvidence(workflows, mergeCandidateWorkflow, tests)
            : [],
        partial: signals.mergeEvidence(workflows, mergeCandidateWorkflow, tests),
        applicable: tests.length > 0 || workflows.length > 0,
      });
    },
    (index) => {
      const history = index.snapshot.history;
      const criticalScopes = new Set(
        sourceFiles(index)
          .filter((file) => isCriticalArea(file.normalizedPath))
          .map((file) => file.path.split("/").slice(0, 2).join("/")),
      );
      if (criticalScopes.size === 0) {
        return helpers.result({
          id: "saas.critical-bus-factor",
          domain: "architecture",
          title: "Critical-area ownership concentration",
          summary: "No recognized auth, payment, webhook, or tenant source area was found, so critical-area ownership concentration does not apply.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "info",
          weight: 1,
          outcome: "not_applicable",
          evidenceTier: "absent",
        });
      }
      const high = history.modules.find(
        (entry) =>
          entry.topContributorShare !== null &&
          entry.topContributorShare > 70 &&
          criticalScopes.has(entry.scope),
      );
      if (history.availability !== "available") {
        return helpers.result({
          id: "saas.critical-bus-factor",
          domain: "architecture",
          title: "Critical-area ownership concentration",
          summary: "Recent history is unavailable or incomplete, so the SaaS audit cannot estimate critical-area ownership concentration.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "info",
          weight: 1,
          outcome: "unknown",
          evidenceTier: "runtime_only",
        });
      }
      if (high) {
        return helpers.result({
          id: "saas.critical-bus-factor",
          domain: "architecture",
          title: "Critical-area ownership concentration",
          summary: "An anonymous recent-history aggregate shows more than 70% concentration in a module that also contains a recognized auth, payment, webhook, or tenant source area.",
          remediationCode: "reduce-knowledge-concentration",
          severity: "high",
          weight: 2,
          outcome: "fail",
          evidenceTier: "inferred",
        });
      }
      return helpers.result({
        id: "saas.critical-bus-factor",
        domain: "architecture",
        title: "Critical-area ownership concentration",
        summary: "The available anonymous history sample does not show more than 70% concentration in a recognized critical SaaS module.",
        remediationCode: "reduce-knowledge-concentration",
        severity: "low",
        weight: 1,
        outcome: "pass",
        evidenceTier: "inferred",
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "saas.written-decisions",
        domain: "architecture",
        title: "Written SaaS decisions",
        missingSummary: "No independent architecture decision record was found for future engineers to review.",
        passSummary: "Architecture decisions are recorded outside transient discussion.",
        remediationCode: "add-architecture-decisions",
        severity: "medium",
        weight: 1,
        documented: signals.findPaths(index, [
          /(^|\/)docs\/(adr|decisions?)\//,
          /(^|\/)adr[-_].*\.md$/,
          /architecture.*decision.*\.md$/,
        ]),
      }),
    (index) => {
      const dependencies = signals.findPaths(index, [
        /(^|\/)package\.json$/,
        /package-lock\.json$/,
        /pnpm-lock\.ya?ml$/,
        /yarn\.lock$/,
        /pom\.xml$/,
        /build\.gradle/,
        /requirements\.txt$/,
        /pyproject\.toml$/,
        /(^|\/)go\.mod$/,
        /composer\.json$/,
      ]);
      return helpers.result({
        id: "saas.dependency-freshness",
        domain: "quality",
        title: "Dependency EOL and freshness",
        summary: dependencies.length > 0
          ? "Dependency files are visible, but this offline scan intentionally does not claim framework EOL status without a maintained dated compatibility catalog."
          : "No dependency manifest or lockfile was found for an offline freshness assessment.",
        remediationCode: "add-quality-gate",
        severity: "info",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
        evidence: dependencies,
      });
    },
    (index) => {
      const criticalSourceFiles = sourceFiles(index).filter((file) =>
        isCriticalArea(file.normalizedPath),
      );
      const criticalAreas = new Set(
        criticalSourceFiles
          .map((file) => criticalAreaName(file.normalizedPath))
          .filter((area): area is string => area !== null),
      );
      const coveredAreas = new Set(
        index.files
          .filter((file) => TEST_OR_FIXTURE_PATH.test(file.normalizedPath))
          .map((file) => criticalAreaName(file.normalizedPath))
          .filter((area): area is string => area !== null),
      );
      const uncoveredAreas = [...criticalAreas].filter((area) => !coveredAreas.has(area));
      const criticalSource = references(criticalSourceFiles);
      const criticalTests = signals.findPaths(index, [
        /(^|\/)(auth|authentication|payments?|billing|webhooks?|tenants?).*(spec|test)/,
        /(auth|authentication|payment|billing|webhook|tenant).*(spec|test)\.[cm]?[jt]sx?$/,
        /(auth|payment|webhook|tenant).*test.*\.java$/,
      ]);
      return helpers.positiveControl({
        id: "saas.critical-test-distribution",
        domain: "quality",
        title: "Critical SaaS path tests",
        missingSummary: uncoveredAreas.length > 0
          ? `The ${uncoveredAreas.join(", ")} critical SaaS area has no matching test-path evidence.`
          : "A recognized auth, payment, webhook, or tenant source area has no matching test-path evidence.",
        passSummary: "Every detected critical SaaS source area has matching test-path evidence.",
        remediationCode: "add-test-layers",
        severity: "high",
        weight: 2,
        inferred: uncoveredAreas.length === 0 && criticalAreas.size > 0 ? criticalTests : [],
        partial: criticalSource,
        applicable: criticalSource.length > 0,
      });
    },
  ];
}
