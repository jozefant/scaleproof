import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const resilienceDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "res.backup-restore",
    claim: "Both backup and restore paths are present for durable data.",
    applicability: "Repositories with detected durable data.",
    requiredSignals: ["Backup configuration or procedure", "Restore path or test"],
    disqualifyingSignals: ["Backup evidence without a restore path"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Repository evidence cannot prove the latest production restore succeeded.",
    remediationCode: "add-backup-restore",
  },
  {
    id: "res.rpo-rto",
    claim: "Recovery-point or recovery-time objectives are documented.",
    applicability: "Repositories with detected durable data.",
    requiredSignals: ["RPO or RTO term in recovery documentation"],
    disqualifyingSignals: ["Backup procedure without recovery objectives"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Documented objectives do not prove current backups can meet them.",
    remediationCode: "add-backup-restore",
  },
  {
    id: "res.data-lifecycle",
    claim: "Retention, archival, deletion, export, or data-subject handling is visible.",
    applicability: "Repositories with durable personal data or unknown sensitivity.",
    requiredSignals: ["Lifecycle implementation or data-specific retention/deletion policy"],
    disqualifyingSignals: ["Generic privacy prose without a lifecycle path"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Repository evidence cannot prove complete data inventory or production execution.",
    remediationCode: "define-retention",
  },
  {
    id: "res.release-rollback",
    claim: "Release automation or rollback procedures make changes reversible.",
    applicability: "Applications delivered through versioned releases.",
    requiredSignals: ["Release workflow/tooling or documented rollback process"],
    disqualifyingSignals: ["Deployment configuration without a rollback path"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Release artifacts do not prove application and schema rollback compatibility.",
    remediationCode: "add-release-rollback",
  },
  {
    id: "res.breach-response",
    claim: "Incident or personal-data breach responsibilities are documented.",
    applicability: "Applications handling personal data or unknown data sensitivity.",
    requiredSignals: ["Incident response, breach notification, or 72-hour procedure"],
    disqualifyingSignals: ["Security policy without incident responsibilities"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Procedure text cannot prove contact readiness, rehearsal, or legal completeness.",
    remediationCode: "define-retention",
  },
  {
    id: "res.encryption",
    claim: "Encryption or deployment-owned key management is visible.",
    applicability: "Repositories with detected durable data.",
    requiredSignals: ["Encryption implementation/configuration or key-management documentation"],
    disqualifyingSignals: ["TLS-only references without at-rest or key-boundary evidence"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static evidence cannot prove provider settings, key rotation, or full data coverage.",
    remediationCode: "define-retention",
  },
  {
    id: "res.restore-recency",
    claim: "A recent successful production restore requires runtime evidence.",
    applicability: "Repositories with detected durable data.",
    requiredSignals: ["Dated production restore result tied to the current backup path"],
    disqualifyingSignals: ["Restore script or procedure without a recent result"],
    strongestEvidenceTier: "runtime_only",
    confidenceLimitation:
      "This detector deliberately cannot establish restore recency from repository content.",
    remediationCode: "add-backup-restore",
  },
] as const);

export function resilienceControls(): ControlEvaluator[] {
  return [
    (index, context) => {
      const backupAutomation = signals.findContent(
        index,
        [/\b(pg_dump|backup job|scheduled backup|wal-g|velero|backup command)\b/i],
        {
          pathPatterns: [
            /\.sh$/,
            /\.ya?ml$/,
            /^\.github\/workflows\//,
            /^\.circleci\//,
          ],
        },
      );
      const restoreAutomation = signals.findContent(
        index,
        [/\b(pg_restore|restore.*test|restore.*fresh|restore rehearsal)\b/i],
        {
          pathPatterns: [
            /\.sh$/,
            /\.ya?ml$/,
            /^\.github\/workflows\//,
            /^\.circleci\//,
          ],
        },
      );
      const backupDocumentation = signals.mergeEvidence(
        signals.findPaths(index, [/backup.*\.md$/, /operations.*\.md$/]),
        signals.findContent(
          index,
          [/\b(backup policy|backup schedule|point-in-time recovery|pitr)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      );
      const restoreDocumentation = signals.mergeEvidence(
        signals.findPaths(index, [/restore.*\.md$/, /recovery.*\.md$/]),
        signals.findContent(
          index,
          [/\b(restore procedure|restore rehearsal|recovery procedure)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      );
      const anyBackup = signals.mergeEvidence(
        backupAutomation,
        backupDocumentation,
      );
      const anyRestore = signals.mergeEvidence(
        restoreAutomation,
        restoreDocumentation,
      );
      const bothEnforced =
        backupAutomation.length > 0 && restoreAutomation.length > 0;
      const bothPresent = anyBackup.length > 0 && anyRestore.length > 0;
      const missingSummary =
        anyBackup.length > 0
          ? "Backup evidence was found, but no restore procedure or restore test was visible."
          : anyRestore.length > 0
            ? "Restore evidence was found, but no backup configuration or schedule was visible."
            : "No repository evidence established both backup configuration and a restore procedure for durable data.";

      return helpers.positiveControl({
        id: "res.backup-restore",
        domain: "resilience",
        title: "Backup configuration and restore test",
        missingSummary,
        passSummary:
          "Both backup and restore evidence are present; runtime success remains unverified.",
        remediationCode: "add-backup-restore",
        severity:
          context.stage === "scaling_production"
            ? "critical"
            : context.stage === "prototype"
              ? "medium"
              : "high",
        weight: 4,
        enforced: bothEnforced
          ? signals.mergeEvidence(backupAutomation, restoreAutomation)
          : [],
        documented:
          bothPresent && !bothEnforced
            ? signals.mergeEvidence(anyBackup, anyRestore)
            : [],
        partial: signals.mergeEvidence(anyBackup, anyRestore),
        applicable: signals.hasDurableData(index),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "res.rpo-rto",
        domain: "resilience",
        title: "Recovery objectives",
        missingSummary:
          "RPO and RTO assumptions are not documented for durable data.",
        passSummary:
          "Recovery-point or recovery-time objectives are documented.",
        remediationCode: "add-backup-restore",
        severity: "high",
        weight: 3,
        documented: signals.findContent(index, [/\b(RPO|RTO)\b/], {
          pathPatterns: [/\.md$/],
        }),
        applicable: signals.hasDurableData(index),
      }),
    (index, context) =>
      helpers.positiveControl({
        id: "res.data-lifecycle",
        domain: "resilience",
        title: "Data retention and deletion lifecycle",
        missingSummary:
          "Durable personal data lacks visible retention, archival, and deletion rules.",
        passSummary:
          "Retention, archival, deletion, or data-subject procedures are documented or implemented.",
        remediationCode: "define-retention",
        severity:
          context.dataSensitivity === "sensitive_regulated" ? "high" : "medium",
        weight: 3,
        enforced: signals.findContent(
          index,
          [
            /\b(soft.?delete|retention job|purge job|delete account|data export|data subject request)\b/i,
          ],
          { pathPatterns: [/\.[cm]?[jt]s$/, /\.java$/, /\.sql$/] },
        ),
        documented: signals.findContent(
          index,
          [/\b(data retention|deletion policy|right to erasure|archival policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable:
          context.dataSensitivity !== "none" && signals.hasDurableData(index),
        contextUnknown: helpers.isUnknownDataContext(context.dataSensitivity),
      }),
    (index) =>
      helpers.positiveControl({
        id: "res.release-rollback",
        domain: "resilience",
        title: "Release and rollback path",
        missingSummary:
          "No versioned release and rollback procedure was found.",
        passSummary:
          "Release automation or rollback procedures make change reversible.",
        remediationCode: "add-release-rollback",
        severity: "high",
        weight: 3,
        enforced: signals.findPaths(index, [
          /^\.github\/workflows\/.*release.*\.ya?ml$/,
          /semantic-release/,
          /release-please/,
        ]),
        documented: signals.findContent(
          index,
          [/\b(rollback|release process|versioning policy)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
      }),
    (index, context) =>
      helpers.positiveControl({
        id: "res.breach-response",
        domain: "resilience",
        title: "Incident and breach response",
        missingSummary:
          "No personal-data breach or security incident response procedure was found.",
        passSummary:
          "Incident or breach response responsibilities are documented.",
        remediationCode: "define-retention",
        severity: "high",
        weight: 2,
        documented: signals.findContent(
          index,
          [/\b(data breach|breach notification|incident response|72 hours)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable: context.dataSensitivity !== "none",
        contextUnknown: helpers.isUnknownDataContext(context.dataSensitivity),
      }),
    (index) =>
      helpers.positiveControl({
        id: "res.encryption",
        domain: "resilience",
        title: "Encryption and key boundary",
        missingSummary:
          "Encryption-at-rest or key-management responsibility is not visible.",
        passSummary:
          "Encryption or deployment-owned key management is implemented or documented.",
        remediationCode: "define-retention",
        severity: "high",
        weight: 2,
        enforced: signals.findContent(
          index,
          [
            /\b(AES-?256|AES\/GCM|kms|key vault|secret manager|encrypted backup)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.tf$/,
              /\.ya?ml$/,
            ],
          },
        ),
        documented: signals.findContent(
          index,
          [/\b(encryption at rest|key management|encrypted backups?)\b/i],
          { pathPatterns: [/\.md$/] },
        ),
        applicable: signals.hasDurableData(index),
      }),
    (index) =>
      helpers.result({
        id: "res.restore-recency",
        domain: "resilience",
        title: "Recent production restore succeeded",
        summary:
          signals.hasDurableData(index)
            ? "Repository evidence cannot prove when a production backup was last restored successfully."
            : "No durable-data surface was detected.",
        remediationCode: "add-backup-restore",
        severity: "high",
        weight: 1,
        outcome: signals.hasDurableData(index) ? "unknown" : "not_applicable",
        evidenceTier: signals.hasDurableData(index) ? "runtime_only" : "absent",
      }),
  ];
}
