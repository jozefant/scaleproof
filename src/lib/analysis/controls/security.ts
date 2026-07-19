import * as signals from "../signals";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

export const securityDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "security.exposed-secret",
    claim: "Scanned text is checked for high-confidence credential patterns.",
    applicability: "Every processed repository text file outside excluded fixture paths.",
    requiredSignals: ["High-confidence private-key, provider-token, or assigned-secret pattern"],
    disqualifyingSignals: ["Examples, fixtures, documentation, lock files, or partial-scan absence"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Pattern matching can miss encoded secrets and cannot establish revocation status.",
    remediationCode: "remove-exposed-secret",
  },
  {
    id: "security.secret-gate",
    claim: "Automated secret scanning is configured.",
    applicability: "Repositories that can contain credentials or deployment configuration.",
    requiredSignals: ["Recognized secret scanner path or executable workflow command"],
    disqualifyingSignals: ["Security prose without a configured scanning tool"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Tool configuration does not prove current findings are clean or merges are blocked.",
    remediationCode: "add-security-baseline",
  },
  {
    id: "security.authentication",
    claim: "An authentication library and server enforcement point are both present.",
    applicability: "Applications handling personal data or unknown data sensitivity.",
    requiredSignals: ["Authentication framework or dependency", "Server-side enforcement point"],
    disqualifyingSignals: ["Authentication package name alone"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static evidence cannot prove production identity-provider or session configuration.",
    remediationCode: "harden-auth-boundary",
  },
  {
    id: "security.authorization",
    claim: "Server-side authorization or permission checks are present.",
    applicability: "Applications handling personal data or unknown data sensitivity.",
    requiredSignals: ["Authorization, role, authority, RBAC, or permission check in server code"],
    disqualifyingSignals: ["Client-only role display or authorization documentation"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Keyword evidence cannot prove complete object- and endpoint-level authorization.",
    remediationCode: "harden-auth-boundary",
  },
  {
    id: "security.web-baseline",
    claim: "Recognized web security controls are configured.",
    applicability: "Repositories exposing an HTTP or browser-facing application.",
    requiredSignals: ["Security headers, CSRF, CORS, or secure-cookie configuration"],
    disqualifyingSignals: ["Framework dependency without control configuration"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static configuration cannot prove effective production proxy and browser behavior.",
    remediationCode: "add-security-baseline",
  },
  {
    id: "security.validation",
    claim: "Input validation is implemented at an application boundary.",
    applicability: "Repositories accepting external input.",
    requiredSignals: ["Recognized validation API, annotation, or schema in executable code"],
    disqualifyingSignals: ["Validation wording in tests or documentation only"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Validator presence does not prove coverage of every untrusted input path.",
    remediationCode: "add-security-baseline",
  },
  {
    id: "security.policy",
    claim: "A security policy or threat boundary is documented.",
    applicability: "Repositories intended for shared or production operation.",
    requiredSignals: ["SECURITY, threat-model, or security architecture document"],
    disqualifyingSignals: ["Incidental security references without a policy artifact"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "A policy document does not prove ownership, review cadence, or implementation.",
    remediationCode: "add-security-baseline",
  },
  {
    id: "security.privacy",
    claim: "Privacy or GDPR handling evidence is documented.",
    applicability: "Applications handling personal data or unknown data sensitivity.",
    requiredSignals: ["Privacy, GDPR, data-processing, consent, or data-subject procedure evidence"],
    disqualifyingSignals: ["Generic legal wording without operational data handling"],
    strongestEvidenceTier: "documented",
    confidenceLimitation:
      "Repository evidence cannot certify lawful basis, completeness, or operational compliance.",
    remediationCode: "define-retention",
  },
  {
    id: "security.dependency-scan",
    claim: "Dependency vulnerability scanning is configured.",
    applicability: "Repositories using third-party packages.",
    requiredSignals: ["Recognized dependency scanner in CI or build configuration"],
    disqualifyingSignals: ["Dependency update automation without vulnerability scanning"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Scanner configuration does not prove current findings, waiver quality, or merge enforcement.",
    remediationCode: "add-security-baseline",
  },
] as const);

export function securityControls(): ControlEvaluator[] {
  return [
    (index) => {
      const likelySecrets = signals.findContent(
        index,
        [
          /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
          /\bAKIA[0-9A-Z]{16}\b/,
          /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
          /\bsk-[A-Za-z0-9_-]{32,}\b/,
          /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/i,
        ],
        {
          excludePathPatterns: [
            /(^|\/)(test|tests|fixtures|examples?|docs)\//,
            /\.md$/,
            /package-lock\.json$/,
          ],
          maxResults: 6,
        },
      );

      if (likelySecrets.length > 0) {
        return helpers.result({
          id: "security.exposed-secret",
          domain: "security",
          title: "Likely exposed credential",
          summary:
            "A credential-shaped value was found. Its value is redacted and never included in the report or model payload.",
          remediationCode: "remove-exposed-secret",
          severity: "critical",
          weight: 5,
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: likelySecrets,
        });
      }

      return helpers.result({
        id: "security.exposed-secret",
        domain: "security",
        title: "No likely exposed credential found",
        summary:
          "The scanned text did not match the high-confidence credential patterns.",
        remediationCode: "remove-exposed-secret",
        severity: "critical",
        weight: 5,
        outcome: index.snapshot.coverage.partial ? "unknown" : "pass",
        evidenceTier: index.snapshot.coverage.partial ? "runtime_only" : "inferred",
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "security.secret-gate",
        domain: "security",
        title: "Automated secret scanning",
        missingSummary:
          "No repository-level secret scanning gate was found.",
        passSummary:
          "Secret scanning is configured as part of the development or CI workflow.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: signals.mergeEvidence(
          signals.findPaths(index, [/gitleaks/, /trufflehog/, /gitguardian/, /semgrep/]),
          signals.findContent(
            index,
            [/\b(gitleaks|trufflehog|gitguardian|secret scanning)\b/i],
            {
              pathPatterns: [
                /^\.github\/workflows\//,
                /^\.circleci\//,
                /package\.json$/,
                /pom\.xml$/,
              ],
            },
          ),
        ),
      }),
    (index, context) => {
      const libraryEvidence = signals.findContent(
        index,
        [
          /\b(nextauth|authjs|passport|spring security|securityfilterchain|oauth2|oidc|jsonwebtoken|bcrypt|argon2)\b/i,
        ],
        {
          pathPatterns: [
            /\.[cm]?[jt]sx?$/,
            /\.java$/,
            /package\.json$/,
            /pom\.xml$/,
            /\.properties$/,
          ],
        },
      );
      const serverEnforcement = signals.findContent(
        index,
        [
          /\b(securityfilterchain|authorizehttprequests|preauthorize|auth\(\)|getserversession|passport\.authenticate|requireauth|authenticated\(\))\b/i,
        ],
        {
          pathPatterns: [/\.[cm]?[jt]sx?$/, /\.java$/, /\.properties$/],
          excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
        },
      );
      const evidence =
        libraryEvidence.length > 0 && serverEnforcement.length > 0
          ? signals.mergeEvidence(libraryEvidence, serverEnforcement)
          : [];
      const applicable = context.dataSensitivity !== "none";
      return helpers.positiveControl({
        id: "security.authentication",
        domain: "security",
        title: "Authentication boundary",
        missingSummary:
          "No server-side authentication boundary was found for an application handling user data.",
        passSummary:
          "Authentication dependencies and a server-side enforcement point are present.",
        remediationCode: "harden-auth-boundary",
        severity:
          context.dataSensitivity === "sensitive_regulated"
            ? "critical"
            : "high",
        weight: 4,
        enforced: evidence,
        partial: signals.mergeEvidence(libraryEvidence, serverEnforcement),
        applicable,
        contextUnknown: helpers.isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index, context) => {
      const evidence = signals.findContent(
        index,
        [
          /\b(preauthorize|hasrole|hasauthority|authorize|authorization|rbac|permission|accesscontrol)\b/i,
        ],
        {
          pathPatterns: [/\.[cm]?[jt]sx?$/, /\.java$/, /\.rs$/, /\.py$/],
          excludePathPatterns: [/(^|\/)(test|tests|docs)\//],
        },
      );
      return helpers.positiveControl({
        id: "security.authorization",
        domain: "security",
        title: "Server-side authorization",
        missingSummary:
          "No enforceable authorization or permission checks were found.",
        passSummary:
          "Authorization or role checks are present in server-side code.",
        remediationCode: "harden-auth-boundary",
        severity:
          context.dataSensitivity === "sensitive_regulated"
            ? "critical"
            : "high",
        weight: 4,
        enforced: evidence,
        applicable: context.dataSensitivity !== "none",
        contextUnknown: helpers.isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "security.web-baseline",
        domain: "security",
        title: "Web security baseline",
        missingSummary:
          "CORS, CSRF/session policy, or security-header controls are not visible.",
        passSummary:
          "The repository contains web security configuration beyond authentication.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: signals.findContent(
          index,
          [
            /\b(content-security-policy|x-frame-options|permissions-policy|csrf|samesite|allowed-origins|corsconfiguration)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /\.properties$/,
              /\.ya?ml$/,
            ],
          },
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "security.validation",
        domain: "security",
        title: "Input validation",
        missingSummary:
          "No consistent server-side input validation mechanism was found.",
        passSummary:
          "Schema or framework validation is used at input boundaries.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 2,
        enforced: signals.findContent(
          index,
          [
            /\b(zod|yup|joi|class-validator|@valid|@validated|jakarta\.validation|validator\.)\b/i,
          ],
          {
            pathPatterns: [
              /\.[cm]?[jt]s$/,
              /\.java$/,
              /package\.json$/,
              /pom\.xml$/,
            ],
          },
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "security.policy",
        domain: "security",
        title: "Security policy and threat boundary",
        missingSummary:
          "No security policy, threat model, or documented hardening boundary was found.",
        passSummary:
          "Security posture, reporting, or threat boundaries are documented.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 1,
        documented: signals.findPaths(index, [
          /(^|\/)security\.md$/,
          /threat-model.*\.md$/,
          /threat_model.*\.md$/,
        ]),
      }),
    (index, context) => {
      const evidence = signals.mergeEvidence(
        signals.findPaths(index, [/privacy.*\.md$/, /gdpr.*\.md$/, /data-retention/]),
        signals.findContent(
          index,
          [
            /\b(data subject|right to erasure|retention policy|privacy policy|consent|personal data|gdpr)\b/i,
          ],
          { pathPatterns: [/\.md$/, /\.java$/, /\.[cm]?[jt]s$/] },
        ),
      );
      return helpers.positiveControl({
        id: "security.privacy",
        domain: "security",
        title: "Privacy and GDPR readiness evidence",
        missingSummary:
          "Privacy, retention, deletion, and data-subject responsibilities are not visible.",
        passSummary:
          "The repository contains privacy or GDPR readiness evidence.",
        remediationCode: "define-retention",
        severity:
          context.dataSensitivity === "sensitive_regulated" ? "high" : "medium",
        weight: 3,
        enforced: evidence.filter((item) => item.kind !== "documentation"),
        documented: evidence.filter((item) => item.kind === "documentation"),
        applicable: context.dataSensitivity !== "none",
        contextUnknown: helpers.isUnknownDataContext(context.dataSensitivity),
      });
    },
    (index) =>
      helpers.positiveControl({
        id: "security.dependency-scan",
        domain: "security",
        title: "Dependency security scanning",
        missingSummary:
          "No automated dependency vulnerability scan was found.",
        passSummary:
          "Dependency or filesystem security scanning is configured.",
        remediationCode: "add-security-baseline",
        severity: "high",
        weight: 2,
        enforced: signals.mergeEvidence(
          signals.findPaths(index, [/trivy/, /fossa/, /snyk/, /dependency-check/]),
          signals.findContent(
            index,
            [/\b(npm audit|trivy|snyk|fossa|dependency-check|osv-scanner)\b/i],
            {
              pathPatterns: [
                /^\.github\/workflows\//,
                /^\.circleci\//,
                /package\.json$/,
                /pom\.xml$/,
                /\.sh$/,
              ],
            },
          ),
        ),
      }),
  ];
}
