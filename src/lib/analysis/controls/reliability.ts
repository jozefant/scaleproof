import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const reliabilityDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "rel.stateless",
    claim: "The request and session state model supports or blocks multi-instance handling.",
    applicability: "Stateful services expected to scale horizontally.",
    requiredSignals: ["External/stateless session evidence or concrete process-local state pattern"],
    disqualifyingSignals: ["Generic scaling prose without a state ownership signal"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation:
      "Pattern evidence cannot prove every runtime state path or deployment topology.",
    remediationCode: "remove-request-state",
  },
  {
    id: "rel.database-foundations",
    claim: "Database migration, indexing, or connection-pooling foundations are visible.",
    applicability: "Repositories with detected durable data.",
    requiredSignals: ["Migration/schema path, index declaration, or pool configuration"],
    disqualifyingSignals: ["Database dependency without growth-related configuration"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static database configuration cannot prove query plans, contention, or production sizing.",
    remediationCode: "add-load-path",
  },
  {
    id: "rel.failure-controls",
    claim: "External work has both time bounds and repeat/overload safety.",
    applicability: "Repositories performing dependency or asynchronous external work.",
    requiredSignals: [
      "Dependency time bound",
      "Retry, idempotency, circuit-breaker, bulkhead, or backpressure control",
    ],
    disqualifyingSignals: ["One timeout occurrence"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static signals do not prove failure policies are tuned or exercised.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "rel.health-lifecycle",
    claim: "Runtime readiness, liveness, or graceful-shutdown controls are present.",
    applicability: "Long-running services deployed behind an orchestrator or proxy.",
    requiredSignals: ["Readiness, liveness, graceful shutdown, or termination-grace configuration"],
    disqualifyingSignals: ["Generic health wording outside runtime configuration or code"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Lifecycle configuration does not prove correct dependency health semantics.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "rel.async-work",
    claim: "A queue, worker, scheduler, or background-job path is visible.",
    applicability: "Applications with long-running or bursty work.",
    requiredSignals: ["Recognized queue, worker, scheduler, or background-job signal"],
    disqualifyingSignals: ["Async language syntax without workload decoupling"],
    strongestEvidenceTier: "inferred",
    confidenceLimitation:
      "A workload path does not prove durability, idempotency, or overload behavior.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "rel.load-tests",
    claim: "A repeatable executable performance or load-testing path is present.",
    applicability: "Applications claiming 10x or 100x user readiness.",
    requiredSignals: ["Executable load test, benchmark, command, or enforced performance budget"],
    disqualifyingSignals: ["Documentation mentioning performance without a repeatable path"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "A test path does not establish current 10x or 100x capacity without results.",
    remediationCode: "add-load-path",
  },
  {
    id: "rel.ha-path",
    claim: "An enforced or documented high-availability path is present.",
    applicability: "Services with 100x or availability ambitions.",
    requiredSignals: ["Replica/failure-domain configuration or explicit HA design"],
    disqualifyingSignals: ["Generic scalability language"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static topology evidence cannot prove availability under failure.",
    remediationCode: "define-ha-path",
  },
  {
    id: "rel.actual-capacity",
    claim: "Production throughput, latency, and headroom require runtime measurement.",
    applicability: "Deployed applications making capacity claims.",
    requiredSignals: ["Current production workload, latency, saturation, and headroom measurements"],
    disqualifyingSignals: ["Repository architecture or load-test presence without current results"],
    strongestEvidenceTier: "runtime_only",
    confidenceLimitation:
      "This detector deliberately cannot establish capacity from repository content.",
    remediationCode: "add-load-path",
  },
] as const);

export function reliabilityControls(): ControlEvaluator[] {
  return [
    (index) => {
      const externalSession = signals.findContent(index, [
        /\b(redis.*session|spring\.session|session.*redis|stateless|jwt|external session)\b/i,
      ]);
      const inMemoryState = signals.findContent(
        index,
        [
          /\b(in-memory session|memorystore|globalThis\..*cache|new Map\(\).*(session|user|job))\b/is,
        ],
        { excludePathPatterns: [/(^|\/)(test|tests|docs)\//] },
      );

      if (inMemoryState.length > 0 && externalSession.length === 0) {
        return helpers.result({
          id: "rel.stateless",
          domain: "reliability",
          title: "Single-instance runtime state",
          summary:
            "Request or session state appears tied to one application process, which blocks safe horizontal scaling.",
          remediationCode: "remove-request-state",
          severity: "high",
          weight: 4,
          outcome: "fail",
          evidenceTier: "inferred",
          evidence: inMemoryState,
        });
      }

      return helpers.positiveControl({
        id: "rel.stateless",
        domain: "reliability",
        title: "Horizontal scaling state model",
        missingSummary:
          "The repository does not explain whether another instance can handle the next request.",
        passSummary:
          "The state model supports or documents multi-instance request handling.",
        remediationCode: "remove-request-state",
        severity: "high",
        weight: 4,
        enforced: externalSession,
        documented: signals.findContent(
          index,
          [/\b(stateless|horizontal scaling|shared session)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "rel.database-foundations",
        domain: "reliability",
        title: "Database growth foundations",
        missingSummary:
          "Migrations, pooling, or indexing evidence is incomplete for durable data growth.",
        passSummary:
          "Database migrations, indexes, or connection pooling are visible.",
        remediationCode: "add-load-path",
        severity: "high",
        weight: 3,
        enforced: signals.mergeEvidence(
          signals.findPaths(index, [
            /(^|\/)migrations?\//,
            /flyway/,
            /liquibase/,
            /schema\.prisma$/,
          ]),
          signals.findContent(
            index,
            [
              /\b(create index|@@index|hikaricp|connection pool|pool_size|maximumpoolsize)\b/i,
            ],
            {
              pathPatterns: [
                /\.sql$/,
                /\.prisma$/,
                /\.properties$/,
                /\.ya?ml$/,
              ],
            },
          ),
        ),
        applicable: signals.hasDurableData(index),
      }),
    (index) => {
      const timeBounds = signals.findContent(
        index,
        [/\b(timeout|abortcontroller|timeLimiter|connecttimeout|readtimeout)\b/i],
        {
          pathPatterns: [
            /\.[cm]?[jt]s$/,
            /\.java$/,
            /\.properties$/,
            /\.ya?ml$/,
          ],
          excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
        },
      );
      const repeatOrOverloadSafety = signals.findContent(
        index,
        [
          /\b(retrytemplate|idempotency|circuit.?breaker|backpressure|bulkhead|resilience4j)\b/i,
        ],
        {
          pathPatterns: [
            /\.[cm]?[jt]s$/,
            /\.java$/,
            /\.properties$/,
            /\.ya?ml$/,
          ],
          excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
        },
      );
      return helpers.positiveControl({
        id: "rel.failure-controls",
        domain: "reliability",
        title: "Bounded dependency failure",
        missingSummary:
          "Timeouts, retry policy, idempotency, or backpressure are not visible around external work.",
        passSummary:
          "The repository contains both time bounds and retry, idempotency, circuit-breaker, or overload controls around dependencies.",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        enforced:
          timeBounds.length > 0 && repeatOrOverloadSafety.length > 0
            ? signals.mergeEvidence(timeBounds, repeatOrOverloadSafety)
            : [],
        partial: signals.mergeEvidence(timeBounds, repeatOrOverloadSafety),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "rel.health-lifecycle",
        domain: "reliability",
        title: "Runtime lifecycle controls",
        missingSummary:
          "Readiness, liveness, and graceful shutdown controls are not visible.",
        passSummary:
          "The runtime exposes lifecycle signals or graceful shutdown behaviour.",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        enforced: signals.findContent(
          index,
          [
            /\b(readiness|liveness|graceful shutdown|server\.shutdown\s*=\s*graceful|terminationgraceperiodseconds)\b/i,
          ],
          {
            pathPatterns: [
              /\.properties$/,
              /\.ya?ml$/,
              /dockerfile/,
              /\.[cm]?[jt]s$/,
              /\.java$/,
            ],
          },
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "rel.async-work",
        domain: "reliability",
        title: "Asynchronous workload path",
        missingSummary:
          "No queue, worker, scheduler, or background-job boundary was found.",
        passSummary:
          "Long-running or bursty work has an asynchronous execution path.",
        remediationCode: "add-failure-controls",
        severity: "medium",
        weight: 2,
        inferred: signals.findContent(
          index,
          [
            /\b(bullmq|rabbitmq|kafka|sqs|celery|sidekiq|@scheduled|job queue|worker thread|background job)\b/i,
          ],
          {
            pathPatterns: [
              /package\.json$/,
              /pom\.xml$/,
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.py$/,
              /\.ya?ml$/,
            ],
          },
        ),
      }),
    (index) => {
      const executablePerformancePath = signals.findPaths(index, [
        /\.jmx$/,
        /k6.*\.[cm]?[jt]s$/,
        /artillery.*\.ya?ml$/,
        /gatling.*\.(scala|java)$/,
        /(^|\/)(performance|load|benchmarks?)\/(?!readme(?:\.md)?$).+\.(?:[cm]?[jt]s|py|java|scala|go|rs|sh|ya?ml|json)$/,
      ]);
      const configuredPerformancePath = signals.findContent(
        index,
        [
          /\b(k6|artillery|gatling|jmeter)\b/i,
          /\b(performance|load|benchmark)(?::|-)?(?:test|run|budget)\b/i,
        ],
        {
          pathPatterns: [
            /package\.json$/,
            /pom\.xml$/,
            /build\.gradle(\.kts)?$/,
            /makefile$/,
            /taskfile\.ya?ml$/,
            /^\.github\/workflows\/.*\.ya?ml$/,
            /^\.circleci\//,
          ],
        },
      );
      return helpers.positiveControl({
        id: "rel.load-tests",
        domain: "reliability",
        title: "Load and performance evidence",
        missingSummary:
          "No representative load test, benchmark, or performance budget was found.",
        passSummary:
          "The repository contains a repeatable performance or load-testing path.",
        remediationCode: "add-load-path",
        severity: "high",
        weight: 3,
        enforced: signals.mergeEvidence(
          executablePerformancePath,
          configuredPerformancePath,
        ),
        documented: signals.findContent(
          index,
          [/\b(performance budget|load test (plan|workload|result))\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "rel.ha-path",
        domain: "reliability",
        title: "100x availability path",
        missingSummary:
          "No HA, failure-domain, capacity, or scale-out path is documented.",
        passSummary:
          "Deployment or architecture evidence describes replication, multiple instances, or failure domains.",
        remediationCode: "define-ha-path",
        severity: "high",
        weight: 3,
        enforced: signals.findContent(
          index,
          [
            /\b(replicas:\s*[2-9]|poddisruptionbudget|autoscal|multi-az|multi-region|horizontalpodautoscaler)\b/i,
          ],
          { pathPatterns: [/\.ya?ml$/, /\.tf$/, /\.json$/] },
        ),
        documented: signals.findContent(
          index,
          [
            /\b(high availability|failure domain|horizontal scaling|capacity plan|multi-region|multi-az)\b/i,
          ],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    () =>
      helpers.result({
        id: "rel.actual-capacity",
        domain: "reliability",
        title: "Production capacity headroom",
        summary:
          "A repository cannot prove current production throughput, latency, or unused capacity.",
        remediationCode: "add-load-path",
        severity: "medium",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
      }),
  ];
}
