import * as signals from "../signals";
import {
  browserDataBoundary,
  browserPersonalDataLogEvidence,
} from "../browser-data-boundary";
import { edgeFunctionBoundaries, providerSurface } from "../external-provider";
import { credentialScope, isServerExecutionFile } from "../file-roles";
import { staticFrontendProfile } from "../static-frontend";
import type { ControlEvaluator } from "./shared";
import * as helpers from "./shared";

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const DIRECT_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{32,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/i,
];
const ASSIGNED_CREDENTIAL = /\b((?:[A-Za-z][A-Za-z0-9_-]*[_-])?(?:api[_-]?key|secret|password|token|service[_-]?role)[A-Za-z0-9_-]*)\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{20,})/gi;

function decodeJwtPayload(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(
      Math.ceil(payload.length / 4) * 4,
      "=",
    );
    return atob(padded);
  } catch {
    return null;
  }
}

function containsLikelySecret(content: string): boolean {
  if (DIRECT_SECRET_PATTERNS.some((pattern) => pattern.test(content))) return true;

  for (const tokenMatch of content.matchAll(JWT_PATTERN)) {
    const claims = decodeJwtPayload(tokenMatch[0]);
    if (/"role"\s*:\s*"(?:service_role|supabase_admin)"/i.test(claims ?? "")) {
      return true;
    }
  }

  for (const match of content.matchAll(ASSIGNED_CREDENTIAL)) {
    const name = match[1]?.toLowerCase() ?? "";
    if (/(?:^|[_-])(?:anon|publishable)(?:[_-]|$)/.test(name)) continue;
    return true;
  }
  return false;
}

/**
 * Enforceable server-side authorization.
 *
 * Every pattern here is an *operation*: an annotation the framework acts on, a
 * filter chain, an explicit permission decision, or a verified identity used as
 * a decision input. The bare word `authorization` is deliberately absent,
 * because `headers: { Authorization: ... }` is how a request carries a token,
 * not how a server decides who may act.
 */
const SERVER_AUTHORIZATION_ENFORCEMENT = [
  /@(?:PreAuthorize|PostAuthorize|PreFilter|PostFilter|Secured|RolesAllowed|DenyAll|Authorize)\s*[(\r\n]/,
  /\bauthorizeHttpRequests\s*\(|\bauthorizeRequests\s*\(|\bSecurityFilterChain\b|\bAuthorizationFilter\b/,
  /\b(?:hasRole|hasAnyRole|hasAuthority|hasAnyAuthority|hasPermission|checkPermission|checkAccess|requirePermission|requireRole|requireAdmin|requireOwner|assertPermission|ensurePermission|authorizeRequest|isAuthorized|canAccess)\s*\(/i,
  /\b(?:ability|abilities|acl|casbin|enforcer|policy|policies|guard)\s*\.\s*(?:can|cannot|enforce|check|authorize|allows?)\s*\(/i,
  /\b(?:permission_required|user_passes_test|has_perm|require_permissions?)\s*\(/i,
  // A role-shaped property counts only inside an access decision. A read that
  // is returned, logged, or copied decides nothing.
  // An admin flag anywhere inside a condition, also a compound one.
  /\b(?:if|while)\s*\((?:[^()\n]|\([^()\n]*\))*?\b(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\??\.(?:isAdmin|is_admin)\b/,
  /^\s*(?:if|elif|while)\s+[^\n(][^\n]*?\b(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\.(?:isAdmin|is_admin)\b[^\n]*:\s*$/m,
  /!\s*(?:[\w$]+\??\.)*(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\??\.(?:isAdmin|is_admin)\b/,
  /\b(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\??\.(?:app_metadata\??\.)?(?:role|roles|permissions|scopes|isAdmin|is_admin)\s*(?:===|!==|==|!=)/,
  /\b(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\??\.(?:isAdmin|is_admin)\s*(?:&&|\|\||\?(?![.?]))/,
  /\b(?:user|session|claims|principal|payload|profile|member|actor|caller|token)\??\.(?:roles|permissions|scopes)\??\.(?:includes|some|has|indexOf)\s*\(/,
  /\b(?:role|roles|permissions|scope|scopes)\s*(?:===|!==|==|!=)\s*['"`]/,
  /\b(?:role|roles|permissions|scopes)\s*\.\s*includes\s*\(/,
];

/**
 * Versioned policy evidence: a row-level-security policy or provider rule whose
 * predicate references the verified caller. A policy file without an identity
 * predicate defines a rule, not an authorization boundary.
 */
const VERSIONED_POLICY_PATHS = [
  /\.sql$/,
  /(^|\/)firestore\.rules$/,
  /(^|\/)storage\.rules$/,
  /(^|\/)database\.rules\.json$/,
];
const VERSIONED_POLICY_ENFORCEMENT = [
  /\bcreate\s+policy\b[\s\S]{0,400}?(?:auth\.uid\s*\(|auth\.jwt\s*\(|current_setting\s*\(\s*'request\.jwt|current_user\b|\bhas_role\s*\(|\bis_admin\b)/i,
  /\ballow\s+(?:read|write|create|update|delete|get|list)[^\n]{0,160}\brequest\.auth\b/i,
];

/**
 * Server-side input validation: a parse or an equivalent framework binding that
 * actually runs on the request, not a schema library sitting in a manifest.
 *
 * These patterns recognize a validation *API* by name. They deliberately do not
 * carry the whole rule: `const s = z.object(...); s.parse(req.body)` is a bound
 * parse whatever the author called the variable, and requiring a schema-shaped
 * identifier would make the control depend on spelling. `bindsRequestParse`
 * below covers that form.
 */
const SERVER_SCHEMA_PARSE = [
  /\b(?:safeParse|safeParseAsync|parseAsync)\s*\(/,
  /\b[\w$.]*(?:schema|validator|dto|body|payload|params|query|input|request)\s*\.\s*parse\s*\(/i,
  /\bz\.[\w$]+\s*\([\s\S]{0,600}?\)\s*\.\s*parse\s*\(/,
  /\b(?:validateSync|validateAsync|validateOrReject)\s*\(/,
  /\b[\w$.]*(?:yup|joi|schema|validator|ajv)\s*\.\s*validate(?:Sync|Async)?\s*\(/i,
  /@(?:Valid|Validated)\b/,
  /\b(?:jakarta|javax)\.validation\b/,
  /\bValidationPipe\b/,
  /\bvalidationResult\s*\(/,
  /\b(?:model_validate|parse_obj|parse_raw)\s*\(/,
  /\bBaseModel\b/,
];

/**
 * A parse call and the value it parses.
 *
 * The binding that matters is *a parse call applied to a request-derived value
 * inside a reachable server handler*, so the receiver is only used to exclude
 * calls that are not validation at all: `JSON.parse`, `Date.parse`,
 * `path.parse`, and the other standard parsers that share the method name.
 */
const PARSE_CALL =
  /(?:^|[^\w$.])(?:[\w$]+\s*\.\s*)*([\w$]+)\s*\.\s*(?:parse|parseAsync|safeParse|safeParseAsync)\s*\(([^;]{0,200})/g;
const NON_VALIDATION_RECEIVER =
  /^(?:JSON|Date|Number|Math|Boolean|path|url|querystring|qs|yaml|yml|toml|ini|csv|semver|Intl|dotenv|marked|cookie)$/i;
const REQUEST_DERIVED_VALUE =
  /\b(?:req|request|ctx|context|event|body|payload|input|params|searchParams|query|formData|args|dto|command|message)\b/i;

/** True when a recognized parse call is applied to a request-derived value. */
function bindsRequestParse(content: string): boolean {
  for (const match of content.matchAll(PARSE_CALL)) {
    if (NON_VALIDATION_RECEIVER.test(match[1] ?? "")) continue;
    if (REQUEST_DERIVED_VALUE.test(match[2] ?? "")) return true;
  }
  return false;
}

/**
 * A file that can carry server-side enforcement: any file in the reachable
 * production call graph of the server, which is rooted at server surfaces and
 * followed through their imports. A permission check in `src/lib/authz.ts` or
 * `src/middleware/auth.ts` is enforcement; the file names say nothing about it,
 * the import edge from the route does.
 *
 * Browser-only code stays excluded by construction, because no server root
 * reaches it - a check the browser performs on itself is not a boundary the
 * network respects.
 */
function isReachableServerHandler(
  index: signals.RepositoryIndex,
  file: signals.RepositoryIndex["files"][number],
): boolean {
  return isServerExecutionFile(index, file);
}

function normalizeApiRoute(route: string): string[] {
  return route.replace(/[?#].*$/, "").replace(/^\/api\/?/, "").split("/").filter(Boolean);
}

function routeSegmentsMatch(route: string[], handler: string[]): boolean {
  let routeIndex = 0;
  for (let handlerIndex = 0; handlerIndex < handler.length; handlerIndex += 1) {
    const segment = handler[handlerIndex]!;
    if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return true;
    if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return routeIndex < route.length;
    if (routeIndex >= route.length) return false;
    if (!/^\[[^\]]+\]$/.test(segment) && segment !== route[routeIndex]) return false;
    routeIndex += 1;
  }
  return routeIndex === route.length;
}

function apiHandlerMatchesRoute(path: string, route: string[]): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const nextMatch = normalized.match(/^(?:src\/)?app\/api\/(.+)\/route\.[cm]?[jt]s$/i);
  if (nextMatch?.[1]) return routeSegmentsMatch(route, nextMatch[1].split("/"));

  const pagesMatch = normalized.match(/^(?:src\/)?pages\/api\/(.+)\.[cm]?[jt]sx?$/i);
  if (pagesMatch?.[1]) return routeSegmentsMatch(route, pagesMatch[1].split("/"));

  const serverlessMatch = normalized.match(/^(?:functions|api)\/(.+)\.[cm]?[jt]s$/i);
  return serverlessMatch?.[1] ? routeSegmentsMatch(route, serverlessMatch[1].split("/")) : false;
}

function isSpaDocumentDestination(value: string): boolean {
  return /^\/index\.html(?:\?.*)?$/i.test(value.trim());
}

function isCatchAllRoute(value: string): boolean {
  return /^\/(?:\(\.\*\)|:[A-Za-z][A-Za-z0-9_]*\*|\*)$/.test(value.trim());
}

function netlifyRuleMatchesRoute(source: string, route: string): boolean {
  if (source === route) return true;
  if (source.endsWith("/*")) return route.startsWith(source.slice(0, -1));
  return /^\/:?[A-Za-z][A-Za-z0-9_]*\*$/.test(source);
}

function hasSpaCatchAllRewrite(path: string, content: string, route: string): boolean {
  if (/_redirects$/i.test(path)) {
    for (const line of content.split(/\r?\n/)) {
      const [source, destination] = line.trim().split(/\s+/);
      if (!source || !destination || !netlifyRuleMatchesRoute(source, route)) continue;
      return isCatchAllRoute(source) && isSpaDocumentDestination(destination);
    }
    return false;
  }

  const rewrite = /["']?(?:source|from)["']?\s*:\s*["']([^"']+)["'][\s\S]{0,240}?["']?(?:destination|to)["']?\s*:\s*["']([^"']+)["']/gi;
  for (const match of content.matchAll(rewrite)) {
    if (isCatchAllRoute(match[1] ?? "") && isSpaDocumentDestination(match[2] ?? "")) return true;
  }
  return false;
}

export const securityDetectorMetadata = helpers.defineDetectorMetadata([
  {
    id: "security.exposed-secret",
    claim:
      "Scanned text is checked for high-confidence credential patterns, and a match is only reported as a production credential when it sits in production or deployment-configuration scope.",
    applicability:
      "Every processed repository text file outside Markdown and dependency lock files.",
    requiredSignals: [
      "High-confidence private-key, provider-token, or assigned-secret pattern",
      "Production or deployment-configuration scope, including continuous-integration definitions",
    ],
    disqualifyingSignals: [
      "Test source sets, fixtures, examples, generated artifacts, documentation, and offline migration or seed scripts, which are reported as a non-critical review signal instead",
      "Public client keys such as anon or publishable values",
      "Partial-scan absence",
    ],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Pattern matching can miss encoded secrets, cannot establish revocation status, and cannot prove that a value declared non-production is not also deployed.",
    remediationCode: "remove-exposed-secret",
  },
  {
    id: "security.edge-function-boundary",
    claim: "Supabase Edge Functions that call paid providers enforce authentication, bounded input, CORS, and timeout-safe handling.",
    applicability: "Repositories containing Supabase Edge Functions.",
    requiredSignals: ["Function authentication", "Restricted CORS", "Input limit", "Timeout evidence"],
    disqualifyingSignals: ["Disabled JWT requirement", "Wildcard CORS", "Request or response logging beside a paid-provider call"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Static evidence cannot prove deployed function configuration, provider billing limits, or log retention.",
    remediationCode: "harden-auth-boundary",
  },
  {
    id: "security.provider-abuse-guard",
    claim:
      "A reachable external-provider call is fronted by a server-side rate, quota, or cost guard defined in this repository.",
    applicability:
      "Repositories whose reachable production server code or Supabase Edge Functions call an external provider.",
    requiredSignals: [
      "Server-side rate limit, throttle, quota, credit, or spend guard in reachable server code, versioned SQL, or deployment configuration",
    ],
    disqualifyingSignals: [
      "A rate-limiting package named only in a dependency manifest",
      "A browser-side limit, which the network can skip",
      "A documented claim that the deployed provider or dashboard enforces the limit, which is reported as runtime-only",
    ],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "A repository cannot show deployed rate-limit state, provider billing state, or a platform limit configured outside version control. Absence of this evidence is a repository evidence gap, not proof that no limit exists.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "security.provider-io-bounds",
    claim:
      "Input sent to an external provider and output requested from it are bounded in this repository.",
    applicability:
      "Repositories whose reachable production server code or Supabase Edge Functions call an external provider.",
    requiredSignals: [
      "A declared maximum request size, length, or parsed shape",
      "A declared ceiling on provider output such as a token, duration, or result limit",
    ],
    disqualifyingSignals: [
      "A schema library named only in a dependency manifest",
      "A documented claim that the provider plan bounds the request, which is reported as runtime-only",
    ],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static bounds cannot prove the deployed provider plan, its per-request ceiling, or that every call path applies the bound.",
    remediationCode: "add-failure-controls",
  },
  {
    id: "security.client-route-reachability",
    claim: "Browser API calls resolve to a visible backend handler and are not rewritten to a single-page application document.",
    applicability: "Repositories with browser fetch paths.",
    requiredSignals: ["Client API path", "Matching framework handler or serverless function"],
    disqualifyingSignals: ["Missing handler", "Deployment rewrite from API path to SPA document"],
    strongestEvidenceTier: "enforced",
    confidenceLimitation: "Static matching cannot prove proxy behavior, runtime path construction, or deployed rewrite precedence.",
    remediationCode: "add-quality-gate",
  },
  {
    id: "security.client-data-boundary",
    claim:
      "Direct browser access to a backend-as-a-service table, document collection, or storage bucket is matched against versioned row-level-security or storage policy definitions in this repository.",
    applicability:
      "Repositories whose reachable browser code calls a BaaS data or storage API directly.",
    requiredSignals: [
      "Direct BaaS table, document, or storage operation in reachable browser code",
      "Versioned RLS, policy, or provider rule definition covering each accessed resource",
    ],
    disqualifyingSignals: [
      "Client-side identity predicate such as .eq(\"user_id\", user.id)",
      "Browser session or role state",
      "Policy definitions that do not cover the accessed resource",
    ],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Repository policy files cannot prove the deployed project applies them, and their absence is missing repository evidence rather than proof that the deployed policy is absent or broken.",
    remediationCode: "harden-auth-boundary",
  },
  {
    id: "security.browser-data-logging",
    claim:
      "Reachable browser code does not log session, user, email, token, or profile values.",
    applicability: "Repositories that ship a browser bundle.",
    requiredSignals: [
      "Browser log or alert call whose argument expression, after string and template literals are removed, references a session, user, email, token, or profile value",
    ],
    disqualifyingSignals: [
      "Generic error or status logging with no personal value flow",
      "Message text that only mentions a personal-data word",
      "Server-side logging, which is assessed by ops.log-redaction",
    ],
    strongestEvidenceTier: "enforced",
    confidenceLimitation:
      "Static argument analysis cannot follow indirect assignment, and a clean result does not prove that no browser log producer ever emits personal data.",
    remediationCode: "separate-log-types",
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
    applicability:
      "Applications handling personal data or unknown data sensitivity. Not applicable to a static-frontend repository with no server surface.",
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
    applicability:
      "Applications handling personal data or unknown data sensitivity. Not applicable to a static-frontend repository with no server surface.",
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
      // A credential-shaped value is only a production credential leak when it
      // sits in production or deployment-configuration scope. The same value in
      // a test source set, a fixture, a generated artifact, or an offline
      // migration or seed script is a review signal: it is still reported, but
      // it cannot assert a deployed secret or drive a mandatory action.
      const scanExclusions = [/\.md$/, /package-lock\.json$/];
      const productionSecrets = signals.findContentMatching(
        index,
        containsLikelySecret,
        {
          excludePathPatterns: scanExclusions,
          matchesFile: (file) =>
            credentialScope(file.normalizedPath, file.content) === "production",
          maxResults: 6,
        },
      );
      const nonProductionSecrets = signals.findContentMatching(
        index,
        containsLikelySecret,
        {
          excludePathPatterns: scanExclusions,
          matchesFile: (file) =>
            credentialScope(file.normalizedPath, file.content) ===
            "non_production",
          maxResults: 6,
        },
      );

      if (productionSecrets.length > 0) {
        return helpers.result({
          id: "security.exposed-secret",
          domain: "security",
          title: "Likely exposed credential",
          summary:
            "A credential-shaped value was found in production or deployment-configuration scope. Its value is redacted and never included in the report or model payload.",
          remediationCode: "remove-exposed-secret",
          severity: "critical",
          weight: 5,
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: signals.mergeEvidence(
            productionSecrets,
            nonProductionSecrets,
          ),
        });
      }

      if (nonProductionSecrets.length > 0) {
        return helpers.result({
          id: "security.exposed-secret",
          domain: "security",
          title: "Credential-shaped value in non-production scope",
          summary:
            "A credential-shaped value was found only in explicitly non-production scope such as test code, a fixture, a generated artifact, or an offline script. Its value is redacted. This is a review signal, not evidence of a deployed credential, so it does not create a critical production-secret finding or a mandatory removal action.",
          remediationCode: "remove-exposed-secret",
          severity: "medium",
          weight: 5,
          outcome: "unknown",
          evidenceTier: "inferred",
          evidence: nonProductionSecrets,
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
    (index) => {
      const clientCalls = signals.findContent(
        index,
        [/\bfetch\s*\(\s*['"]\/api\/[^'"?`]+/i],
        {
          pathPatterns: [/\.[cm]?[jt]sx?$/],
          excludePathPatterns: [/(^|\/)(api|routes?|tests?|__tests__)\//],
          maxResults: 6,
          reachableSourceOnly: true,
        },
      );
      const clientRoutes = new Set<string>();
      for (const file of index.files) {
        if (
          !/\.[cm]?[jt]sx?$/i.test(file.normalizedPath) ||
          !signals.isReachableImplementationEvidenceFile(index, file) ||
          /(^|\/)(api|routes?|tests?|__tests__|docs?)\//i.test(file.path)
        ) continue;
        for (const match of file.content.matchAll(/\bfetch\s*\(\s*['"](\/api\/[^'"?`]+)/gi)) {
          clientRoutes.add(match[1]);
        }
      }
      if (clientRoutes.size === 0) {
        return helpers.positiveControl({
          id: "security.client-route-reachability",
          domain: "security",
          title: "Client API route reachability",
          missingSummary: "No literal browser API path was found.",
          passSummary: "Browser API paths resolve to visible handlers.",
          remediationCode: "add-quality-gate",
          severity: "high",
          weight: 3,
          applicable: false,
        });
      }

      const missingOrShadowed = [...clientRoutes].filter((route) => {
        const routeSegments = normalizeApiRoute(route);
        const routePart = routeSegments.join("/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hasHandler = index.files.some(
          (file) => signals.isImplementationEvidencePath(file.path) && apiHandlerMatchesRoute(file.path, routeSegments),
        );
        const shadowed = index.files.some(
          (file) =>
            /(?:vercel|netlify)\.json$|firebase\.json$|_redirects$/i.test(file.path) &&
            (new RegExp(`(?:source|from)[^\\n]{0,120}${routePart}[^\\n]{0,180}(?:index\\.html|spa|destination[\\s\\S]{0,80}['"]\\/['"])`, "i").test(file.content) ||
              hasSpaCatchAllRewrite(file.path, file.content, `/api/${routeSegments.join("/")}`)),
        );
        return !hasHandler || shadowed;
      });
      if (missingOrShadowed.length > 0) {
        return helpers.result({
          id: "security.client-route-reachability",
          domain: "security",
          title: "Client API path has no reachable backend handler",
          summary: "A browser API path has no visible backend handler or is rewritten to the single-page application, so the integration will fail outside a mocked client flow.",
          remediationCode: "add-quality-gate",
          severity: "high",
          weight: 3,
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: clientCalls,
        });
      }
      return helpers.positiveControl({
        id: "security.client-route-reachability",
        domain: "security",
        title: "Client API route reachability",
        missingSummary: "Browser API paths need a visible backend handler.",
        passSummary: "Browser API paths have matching repository handlers.",
        remediationCode: "add-quality-gate",
        severity: "high",
        weight: 3,
        enforced: clientCalls,
      });
    },
    (index) => {
      // The boundary question is whether a *reachable external provider call*
      // sits behind a disabled or open edge boundary. Provider calls are
      // recognized by shape - a Deno `npm:` import, an outbound HTTP request,
      // a credentialed client, or a credentialed request header - so the
      // control does not depend on a list of vendor names.
      const boundaries = edgeFunctionBoundaries(index);
      if (boundaries.length === 0) {
        return helpers.positiveControl({
          id: "security.edge-function-boundary",
          domain: "security",
          title: "Supabase Edge Function boundary",
          missingSummary: "No Supabase Edge Function was found.",
          passSummary: "Supabase Edge Function controls are present.",
          remediationCode: "harden-auth-boundary",
          severity: "critical",
          weight: 5,
          applicable: false,
        });
      }

      const providerBoundaries = boundaries.filter((boundary) => boundary.providerCall);
      const exposed = providerBoundaries.filter((boundary) => boundary.exposedProviderCall);
      if (exposed.length > 0) {
        return helpers.result({
          id: "security.edge-function-boundary",
          domain: "security",
          title: "Supabase Edge Function exposes AI request data",
          summary: "A Supabase Edge Function calls an external provider behind a disabled or open boundary: JWT verification is switched off, cross-origin access is unrestricted, or request and response bodies are logged. Require JWT validation, restrict CORS, bound input, avoid request or response logging, and set a timeout.",
          remediationCode: "harden-auth-boundary",
          severity: "critical",
          weight: 5,
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: signals.mergeEvidence(
            ...exposed.map((boundary) => boundary.boundaryEvidence),
            ...exposed.map((boundary) => boundary.providerEvidence),
          ),
        });
      }

      const secure =
        providerBoundaries.length > 0 &&
        providerBoundaries.every(
          (boundary) =>
            !boundary.jwtDisabled &&
            !boundary.wildcardCors &&
            boundary.restrictedCors &&
            (boundary.jwtVerified || boundary.tokenValidated) &&
            boundary.inputBounded &&
            boundary.timeoutBounded,
        );

      return helpers.positiveControl({
        id: "security.edge-function-boundary",
        domain: "security",
        title: "Supabase Edge Function boundary",
        missingSummary: "Supabase Edge Functions do not show the complete authentication, CORS, input-limit, and timeout boundary.",
        passSummary: "Supabase Edge Function evidence shows authentication, restricted CORS, bounded input, and timeout handling.",
        remediationCode: "harden-auth-boundary",
        severity: "critical",
        weight: 5,
        enforced: secure
          ? signals.mergeEvidence(...providerBoundaries.map((boundary) => boundary.boundaryEvidence))
          : [],
        partial: signals.mergeEvidence(...boundaries.map((boundary) => boundary.boundaryEvidence)),
      });
    },
    (index) => {
      // Cost and abuse are repository-evidence questions with three honest
      // answers: the guard is in the repository, the repository only claims the
      // deployed provider enforces it, or there is no evidence either way.
      const surface = providerSurface(index);
      return helpers.repositoryEvidenceControl({
        id: "security.provider-abuse-guard",
        domain: "security",
        title: "External-provider abuse and cost guard",
        remediationCode: "add-failure-controls",
        severity: "high",
        weight: 3,
        applicable: surface.providerCall,
        notApplicableSummary:
          "No reachable production call to an external provider was found, so there is no paid-provider abuse surface to assess.",
        verified: surface.abuseGuard.verified,
        runtimeClaim: surface.abuseGuard.runtimeClaim,
        missingEvidence: surface.providerEvidence,
        passSummary:
          "A server-side rate, quota, or cost guard is defined in this repository for the reachable external-provider call.",
        runtimeClaimSummary:
          "The repository documents a rate limit, quota, or spend cap that the deployed provider or platform holds. That deployed state cannot be verified from a repository, so it earns no enforcement credit and is not reported as a failure.",
        missingSummary:
          "A reachable external-provider call has no server-side rate, quota, or cost guard in this repository. Deployed rate-limit and provider billing state are outside repository evidence, so this is missing evidence rather than proof that no limit exists.",
      });
    },
    (index) => {
      const surface = providerSurface(index);
      return helpers.repositoryEvidenceControl({
        id: "security.provider-io-bounds",
        domain: "security",
        title: "Bounded provider input and output",
        remediationCode: "add-failure-controls",
        severity: "medium",
        weight: 2,
        applicable: surface.providerCall,
        notApplicableSummary:
          "No reachable production call to an external provider was found, so there is no provider request to bound.",
        verified:
          surface.inputBounds.verified.length > 0 && surface.outputBounds.verified.length > 0
            ? signals.mergeEvidence(surface.inputBounds.verified, surface.outputBounds.verified)
            : [],
        runtimeClaim: signals.mergeEvidence(
          surface.inputBounds.runtimeClaim,
          surface.outputBounds.runtimeClaim,
        ),
        missingEvidence: surface.providerEvidence,
        passSummary:
          "Request input and requested provider output both carry a declared bound in this repository.",
        runtimeClaimSummary:
          "The repository documents a provider-side request or output ceiling. A provider plan limit is deployed state, so it earns no enforcement credit here.",
        missingSummary:
          "A reachable external-provider call does not show both a bounded request input and a bounded requested output in this repository. Unbounded input multiplies provider cost and processing time per request.",
      });
    },
    (index) => {
      const boundary = browserDataBoundary(index);
      const control = {
        id: "security.client-data-boundary",
        domain: "security" as const,
        remediationCode: "harden-auth-boundary",
        severity: "high" as const,
        weight: 3,
      };
      if (!boundary.directDataAccess) {
        return helpers.result({
          ...control,
          title: "Direct browser data boundary",
          summary: boundary.authClient
            ? "Reachable browser code uses a backend-as-a-service authentication client but makes no direct table, document, or storage call, so there is no direct client-data boundary to assess."
            : "No direct browser call to a backend-as-a-service table, document collection, or storage bucket was found in reachable browser code.",
          outcome: "not_applicable",
          evidenceTier: "absent",
        });
      }

      const operations = [
        boundary.tableRead ? "table reads" : "",
        boundary.tableMutation ? "table writes" : "",
        boundary.storageRead ? "storage reads" : "",
        boundary.storageMutation ? "storage writes" : "",
      ].filter(Boolean);
      const clientPredicateNote = boundary.clientIdentityPredicate
        ? " A client-side identity predicate narrows the request inside the user's own browser; it is a user-experience filter, not server-side authorization."
        : " Browser session and role state run inside the user's own browser and are not server-side authorization.";

      if (boundary.policyCoversAccessedResources) {
        return helpers.result({
          ...control,
          title: "Direct browser data access has versioned policy evidence",
          summary:
            `Reachable browser code performs ${operations.join(", ")} directly against the data service, and versioned row-level-security or storage policy definitions in this repository cover every accessed resource.` +
            clientPredicateNote +
            " Repository policy evidence does not prove that the deployed project applies it.",
          outcome: "pass",
          evidenceTier: "enforced",
          evidence: signals.mergeEvidence(
            boundary.policyEvidence,
            boundary.clientEvidence,
          ),
        });
      }

      return helpers.result({
        ...control,
        title: "Server-side policy evidence is missing for direct browser data access",
        summary:
          `Reachable browser code performs ${operations.join(", ")} directly against the data service.` +
          clientPredicateNote +
          (boundary.policyEvidence.length > 0
            ? " This repository contains versioned policy definitions, but none of them covers every accessed resource."
            : " This repository contains no versioned row-level-security, storage-policy, or provider-rule definition for the accessed resource.") +
          " That is missing repository evidence, not a finding that the deployed policy is absent or broken; confirm the deployed policy and commit it so the boundary is reviewable.",
        outcome: "unknown",
        evidenceTier: "absent",
        evidence: signals.mergeEvidence(
          boundary.clientEvidence,
          boundary.policyEvidence,
        ),
      });
    },
    (index) => {
      const control = {
        id: "security.browser-data-logging",
        domain: "security" as const,
        title: "Browser logging of personal and session data",
        remediationCode: "separate-log-types",
        severity: "medium" as const,
        weight: 2,
      };
      if (!staticFrontendProfile(index).browserBundle) {
        return helpers.result({
          ...control,
          summary:
            "No browser bundle was found, so browser-side logging of personal data is outside the observed product shape. Server-side logging is assessed by the log-redaction control.",
          outcome: "not_applicable",
          evidenceTier: "absent",
        });
      }
      const leaks = browserPersonalDataLogEvidence(index);
      if (leaks.length > 0) {
        return helpers.result({
          ...control,
          title: "Browser code logs session or personal data",
          summary:
            "Reachable browser code passes a session, user, email, token, or profile value to a browser log or alert call. Browser consoles are readable by the visitor and are frequently captured by session-replay and error-reporting tools, so remove or redact the value before release.",
          outcome: "fail",
          evidenceTier: "enforced",
          evidence: leaks,
        });
      }
      return helpers.result({
        ...control,
        summary:
          index.snapshot.coverage.partial
            ? "The scan was partial, so browser logging of session or personal data could not be assessed across the whole repository."
            : "No browser log or alert call carrying a session, user, email, token, or profile value was found. Message text mentioning personal data without a matching value flow is not treated as leakage.",
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
          reachableSourceOnly: true,
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
      // An `Authorization` request header is a transport detail, a comment is
      // an intention, and a package name is a dependency. None of them decides
      // whether this caller may perform this operation, so the control requires
      // an enforceable server-side operation: a framework annotation or filter
      // chain, an explicit role/permission decision, a verified identity used as
      // a decision input, or a versioned policy that carries an identity
      // predicate.
      const handlerEnforcement = signals.findContentMatching(
        index,
        (content) =>
          SERVER_AUTHORIZATION_ENFORCEMENT.some((pattern) =>
            pattern.test(signals.withoutComments(content)),
          ),
        {
          matchesFile: (file) => isReachableServerHandler(index, file),
          maxResults: 4,
        },
      );
      const policyEnforcement = signals.findContentMatching(
        index,
        (content) =>
          VERSIONED_POLICY_ENFORCEMENT.some((pattern) => pattern.test(content)),
        {
          pathPatterns: VERSIONED_POLICY_PATHS,
          maxResults: 4,
        },
      );
      return helpers.positiveControl({
        id: "security.authorization",
        domain: "security",
        title: "Server-side authorization",
        missingSummary:
          "No enforceable server-side authorization operation was found. An authorization request header, a comment, an authorization package, and browser-side role display are not enforcement.",
        passSummary:
          "An enforceable authorization decision is present in server-side code or a versioned policy.",
        remediationCode: "harden-auth-boundary",
        severity:
          context.dataSensitivity === "sensitive_regulated"
            ? "critical"
            : "high",
        weight: 4,
        enforced: handlerEnforcement,
        inferred: policyEnforcement,
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
              /\.[cm]?[jt]sx?$/,
              /\.java$/,
              /\.properties$/,
              /\.ya?ml$/,
            ],
            reachableSourceOnly: true,
          },
        ),
      }),
    (index) =>
      helpers.positiveControl({
        id: "security.validation",
        domain: "security",
        title: "Input validation",
        missingSummary:
          "No schema parse or equivalent validation binding was found in a reachable server handler. A validation package declaration and browser-only form validation are not server-side input validation.",
        passSummary:
          "A schema parse or equivalent framework validation is bound in a reachable server handler.",
        remediationCode: "add-security-baseline",
        severity: "medium",
        weight: 2,
        // A validation package in `package.json` is a dependency, and a browser
        // form check is a user-experience affordance that the network can skip.
        // Passing requires a schema parse or an equivalent framework binding
        // inside a reachable server handler.
        enforced: signals.findContentMatching(
          index,
          (content) => {
            const source = signals.withoutComments(content);
            return (
              SERVER_SCHEMA_PARSE.some((pattern) => pattern.test(source)) ||
              bindsRequestParse(source)
            );
          },
          {
            matchesFile: (file) => isReachableServerHandler(index, file),
            maxResults: 4,
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
