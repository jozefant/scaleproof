import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const operationsDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "ops.structured-logging",
    claim: "Structured application logging is configured.",
    applicability: "Applications expected to be diagnosed from runtime logs.",
    requiredSignals: ["Structured logger, JSON encoder, or machine-readable log configuration"],
    disqualifyingSignals: ["Console output or generic logging dependency alone"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Logger configuration does not prove production collection, queryability, or redaction.",
    remediationCode: "add-observability",
  },
  {
    id: "ops.log-categories",
    claim: "Operational, security, or audit log categories are distinguished.",
    applicability: "Applications with security, compliance, or operational events.",
    requiredSignals: ["Audit, security-event, or operational log category evidence"],
    disqualifyingSignals: ["One undifferentiated application log stream"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Category terminology does not prove access separation or complete event coverage.",
    remediationCode: "separate-log-types",
  },
  {
    id: "ops.log-redaction",
    claim: "Log redaction or never-log rules are present.",
    applicability: "Applications whose logs could encounter personal or secret data.",
    requiredSignals: ["Redaction, masking, sensitive-field filtering, or never-log rule"],
    disqualifyingSignals: ["Privacy policy without logging-specific handling"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Redaction code or policy cannot prove every log producer is covered.",
    remediationCode: "separate-log-types",
  },
  {
    id: "ops.observability",
    claim: "Lifecycle health and telemetry surfaces are both present.",
    applicability: "Long-running services intended for operated deployment.",
    requiredSignals: ["Health or lifecycle signal", "Metrics or tracing signal"],
    disqualifyingSignals: ["One health endpoint or observability keyword alone"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Repository evidence cannot prove telemetry reaches an operated backend.",
    remediationCode: "add-observability",
  },
  {
    id: "ops.alerting",
    claim: "Alert rules, integrations, or escalation expectations are present.",
    applicability: "Services with production availability expectations.",
    requiredSignals: ["Alert rule/integration configuration or documented escalation policy"],
    disqualifyingSignals: ["Metrics configuration without alert conditions"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Rules or policy cannot prove delivery, signal quality, or response time.",
    remediationCode: "add-observability",
  },
  {
    id: "ops.runbook",
    claim: "Operations or incident procedures are documented.",
    applicability: "Services requiring startup, shutdown, incident, or recovery actions.",
    requiredSignals: ["Operations, incident, runbook, or playbook document"],
    disqualifyingSignals: ["Architecture documentation without operating procedures"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Runbook presence does not prove rehearsal, ownership, or current commands.",
    remediationCode: "add-observability",
  },
  {
    id: "ops.log-retention",
    claim: "Log retention, rotation, or deletion rules are configured or documented.",
    applicability: "Applications producing durable operational, security, or audit logs.",
    requiredSignals: ["Rotation/retention configuration or log-specific retention policy"],
    disqualifyingSignals: ["General data retention without log-class treatment"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Repository rules cannot prove storage-backend enforcement or legal suitability.",
    remediationCode: "separate-log-types",
  },
  {
    id: "ops.alert-delivery",
    claim: "Production alert delivery and acknowledgement require runtime verification.",
    applicability: "Services with alerting expectations.",
    requiredSignals: ["Runtime delivery, acknowledgement, and rehearsal evidence"],
    disqualifyingSignals: ["Repository alert rules without delivery evidence"],
    strongestEvidenceTier: "runtime_only",
    confidenceLimitation:
      "This detector deliberately cannot establish delivery from repository content.",
    remediationCode: "add-observability",
  },
] as const);

export function operationsControls(): ControlEvaluator[] {
  return [
    (index) =>
      helpers.positiveControl({
        id: "ops.structured-logging",
        domain: "operations",
        title: "Structured application logging",
        missingSummary:
          "No structured logging or production logger configuration was found.",
        passSummary:
          "The application configures structured or production-grade logging.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 3,
        enforced: signals.mergeEvidence(
          signals.findPaths(index, [/logback.*\.xml$/, /log4j.*\.xml$/, /pino/, /winston/]),
          signals.findContent(
            index,
            [
              /\b(structured.*log|json.*log|ecs.*log|pino|winston|slf4j|logback)\b/i,
            ],
            {
              pathPatterns: [
                /package\.json$/,
                /pom\.xml$/,
                /\.properties$/,
                /\.ya?ml$/,
                /\.xml$/,
                /\.[cm]?[jt]s$/,
              ],
            },
          ),
        ),
      }),
    (index) => {
      const securityLog = signals.findContent(index, [
        /\b(security[_ .-]?event|login[_ .-]?failure|authentication failure)\b/i,
      ]);
      const auditLog = signals.findContent(index, [
        /\b(audit[_ .-]?(log|event|trail)|access[_ .-]?log)\b/i,
      ]);
      return helpers.positiveControl({
        id: "ops.log-categories",
        domain: "operations",
        title: "Separate log categories",
        missingSummary:
          "Operational, security, audit, and access events are not clearly separated.",
        passSummary:
          "The repository distinguishes security or audit events from ordinary application logs.",
        remediationCode: "separate-log-types",
        severity: "high",
        weight: 3,
        enforced:
          securityLog.length > 0 && auditLog.length > 0
            ? signals.mergeEvidence(securityLog, auditLog)
            : [],
        inferred:
          securityLog.length > 0 || auditLog.length > 0
            ? signals.mergeEvidence(securityLog, auditLog)
            : [],
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "ops.log-redaction",
        domain: "operations",
        title: "Log redaction and never-log rules",
        missingSummary:
          "No enforceable or documented rule prevents secrets and personal data entering logs.",
        passSummary:
          "Log redaction or explicit never-log guidance is present.",
        remediationCode: "separate-log-types",
        severity: "high",
        weight: 3,
        enforced: signals.findContent(
          index,
          [/\b(redact|mask).{0,60}\b(password|token|secret|pii|personal data)\b/is],
          {
            pathPatterns: [/\.[cm]?[jt]s$/, /\.java$/, /\.rs$/, /\.py$/],
          },
        ),
        documented: signals.findContent(
          index,
          [
            /\b(never log|must not log|no pii|no personal data in logs|redact secrets)\b/i,
          ],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index) => {
      const health = signals.findContent(
        index,
        [
          /\b(actuator\/health|healthcheck|readiness|liveness|\/healthz)\b/i,
        ],
        {
          pathPatterns: [
            /\.properties$/,
            /\.ya?ml$/,
            /dockerfile/,
            /package\.json$/,
            /pom\.xml$/,
            /\.[cm]?[jt]s$/,
            /\.java$/,
          ],
        },
      );
      const telemetry = signals.findContent(
        index,
        [/\b(micrometer|prometheus|opentelemetry|metrics endpoint|traceparent)\b/i],
        {
          pathPatterns: [
            /\.properties$/,
            /\.ya?ml$/,
            /package\.json$/,
            /pom\.xml$/,
            /\.[cm]?[jt]s$/,
            /\.java$/,
          ],
        },
      );
      return helpers.positiveControl({
        id: "ops.observability",
        domain: "operations",
        title: "Health and telemetry surface",
        missingSummary:
          "Health, metrics, tracing, or equivalent operational signals are not visible.",
        passSummary:
          "The repository exposes both lifecycle health and telemetry signals for runtime diagnosis.",
        remediationCode: "add-observability",
        severity: "high",
        weight: 4,
        enforced:
          health.length > 0 && telemetry.length > 0
            ? signals.mergeEvidence(health, telemetry)
            : [],
        partial: signals.mergeEvidence(health, telemetry),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "ops.alerting",
        domain: "operations",
        title: "Alerting configuration",
        missingSummary:
          "No alert rules, escalation policy, or alerting integration was found.",
        passSummary:
          "Alerting rules or escalation expectations are present.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 2,
        enforced: signals.findPaths(index, [
          /alertmanager/,
          /prometheus.*rules/,
          /grafana.*alert/,
          /pagerduty/,
        ]),
        documented: signals.findContent(
          index,
          [/\b(alerting|pagerduty|on-call|escalation policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "ops.runbook",
        domain: "operations",
        title: "Operations and incident runbook",
        missingSummary:
          "No start, stop, incident, or recovery runbook was found.",
        passSummary:
          "Operational or incident procedures are documented.",
        remediationCode: "add-observability",
        severity: "high",
        weight: 3,
        documented: signals.findPaths(index, [
          /operations.*\.md$/,
          /runbook.*\.md$/,
          /incident.*\.md$/,
          /playbook.*\.md$/,
        ]),
      }),
    (index) =>
      helpers.positiveControl({
        id: "ops.log-retention",
        domain: "operations",
        title: "Log retention policy",
        missingSummary:
          "Log classes do not have visible retention and deletion rules.",
        passSummary:
          "Log retention, rotation, or deletion rules are configured or documented.",
        remediationCode: "separate-log-types",
        severity: "medium",
        weight: 2,
        enforced: signals.findContent(
          index,
          [/\b(maxhistory|retention|rotate|rotation|max-file|max-size)\b/i],
          {
            pathPatterns: [
              /logback/,
              /log4j/,
              /fluent/,
              /vector/,
              /promtail/,
              /\.ya?ml$/,
            ],
          },
        ),
        documented: signals.findContent(
          index,
          [/\b(log retention|audit retention|security logs?.{0,40}(days|years))\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    () =>
      helpers.result({
        id: "ops.alert-delivery",
        domain: "operations",
        title: "Alerts reach an accountable human",
        summary:
          "Repository evidence cannot prove that production alerts are delivered, acknowledged, or rehearsed.",
        remediationCode: "add-observability",
        severity: "medium",
        weight: 1,
        outcome: "unknown",
        evidenceTier: "runtime_only",
      }),
  ];
}
