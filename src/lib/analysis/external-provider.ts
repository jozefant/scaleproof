import * as signals from "./signals";
import { isProductionExecutionFile } from "./file-roles";
import { isServerSurfaceFile } from "./static-frontend";
import type { EvidenceReference } from "./types";

/**
 * External-provider exposure.
 *
 * A serverless edge handler that calls a paid external provider is the shape
 * that turns an unauthenticated endpoint into somebody else's invoice. The
 * scanner has to recognize that call **by shape**, not by vendor name: a fixed
 * list of provider names is a list of the providers somebody happened to think
 * of, and the next repository uses the one that is missing from it.
 *
 * Four shapes are recognized, each of which is a fact about the code rather
 * than a claim about a company:
 *
 * | Signal | What it observes |
 * | --- | --- |
 * | `runtime_package_import` | A Deno `npm:`, `jsr:`, or CDN module import in a file that also reads a non-platform credential |
 * | `outbound_http_request` | A `fetch`/`axios`/`ky` call to an absolute external URL or a configured endpoint |
 * | `credentialed_client` | A client constructed with an API credential read from the environment |
 * | `credentialed_request_header` | An outbound request carrying an API credential header |
 *
 * The platform's own data client is deliberately excluded. Inside a Supabase
 * Edge Function, `@supabase/supabase-js` against `SUPABASE_URL` is the project's
 * own database handle, assessed by the data-boundary controls; treating it as an
 * external provider would make every function look like a paid integration.
 * That exclusion is a narrowing of the shape, not a vendor allowlist standing in
 * for the security boundary.
 *
 * Nothing here retains source text. Callers receive categorical signal names,
 * booleans, and `{path, kind}` evidence references.
 */

type IndexedFile = signals.RepositoryIndex["files"][number];

export type ProviderCallSignal =
  | "runtime_package_import"
  | "outbound_http_request"
  | "credentialed_client"
  | "credentialed_request_header";

/* ---------------------------------------------------------------------- */
/* Provider-call shapes                                                    */
/* ---------------------------------------------------------------------- */

/** Remote module specifiers that only the server-side edge runtime resolves. */
const RUNTIME_MODULE_SPECIFIER =
  /\bfrom\s*["'](npm:|jsr:|https:\/\/esm\.sh\/|https:\/\/cdn\.skypack\.dev\/|https:\/\/deno\.land\/x\/|https:\/\/unpkg\.com\/)([^"']+)["']/g;
/**
 * Platform runtime and data modules. These are the edge runtime itself and the
 * project's own database client, not an external paid provider.
 */
const PLATFORM_MODULE =
  /^(?:@?supabase(?:[/@]|$)|@?std(?:[/@]|$)|deno(?:[/@]|$)|xhr(?:[/@]|$))/i;

const OUTBOUND_CALL = /\b(?:fetch|axios(?:\.[a-z]+)?|ky(?:\.[a-z]+)?|got(?:\.[a-z]+)?)\s*\(/gi;
const OUTBOUND_CALL_WINDOW = 320;
const ABSOLUTE_URL = /https?:\/\/[^\s"'`]+/i;
const CONFIGURED_ENDPOINT =
  /(?:Deno\.env\.get\s*\(\s*["'][^"']*(?:_URL|_ENDPOINT|_HOST|_API|_BASE)["']|process\.env\.[A-Z0-9_]*(?:_URL|_ENDPOINT|_HOST|_API|_BASE))/i;
/**
 * The project's own platform endpoint. A function calling its own project URL
 * is using the platform data plane, which is a different boundary.
 */
const PLATFORM_ENDPOINT = /supabase_url|supabase\.co|\/rest\/v1\/|\/auth\/v1\//i;

const CLIENT_CONSTRUCTION =
  /\bnew\s+[A-Z][\w$]*\s*\(|\b(?:create|init|make|build)[A-Z][\w$]*\s*\(|\bcreateClient\s*\(/g;
const CLIENT_CONSTRUCTION_WINDOW = 320;
const CREDENTIAL_OPTION =
  /\b(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|bearer|client[_-]?secret|secret[_-]?key|credential)\b/i;
const ENVIRONMENT_LOOKUP = /Deno\.env\.get\s*\(|process\.env\b|Netlify\.env\.get\s*\(/;
/** Environment names that identify the project's own platform credentials. */
const PLATFORM_CREDENTIAL =
  /^(?:SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL)$/i;
const ENVIRONMENT_NAME = /(?:Deno\.env\.get|Netlify\.env\.get)\s*\(\s*["']([^"']+)["']|process\.env\.([A-Z0-9_]+)/g;

const CREDENTIAL_REQUEST_HEADER =
  /["']?(?:authorization|x-api-key|api-key|xi-api-key|x-goog-api-key|anthropic-version)["']?\s*:\s*[^,\n}]{0,160}(?:Deno\.env\.get|process\.env|Bearer\s)/i;

function environmentNames(window: string): string[] {
  return [...window.matchAll(ENVIRONMENT_NAME)].map(
    (match) => match[1] ?? match[2] ?? "",
  );
}

const CREDENTIAL_ENVIRONMENT_NAME = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i;

/** True when the file reads a credential that is not the platform's own. */
function readsExternalCredential(source: string): boolean {
  return environmentNames(source).some(
    (name) =>
      CREDENTIAL_ENVIRONMENT_NAME.test(name) && !PLATFORM_CREDENTIAL.test(name),
  );
}

function callWindows(content: string, pattern: RegExp, size: number): string[] {
  const windows: string[] = [];
  for (const match of content.matchAll(pattern)) {
    const start = match.index ?? 0;
    windows.push(content.slice(start, start + size));
  }
  return windows;
}

/**
 * Categorical provider-call signals for one file's text.
 *
 * `runtimeModules` is only meaningful for a server-side runtime that resolves
 * remote specifiers, so callers that inspect browser code leave it off.
 */
export function providerCallSignals(
  content: string,
  options: { runtimeModules?: boolean } = {},
): ProviderCallSignal[] {
  const source = signals.withoutComments(content);
  const found = new Set<ProviderCallSignal>();

  // A remote module import alone is not a provider call: `npm:zod` is a
  // utility. The signal is an SDK you have to authenticate to, so the same file
  // must also read a credential that is not the platform's own.
  if (options.runtimeModules !== false && readsExternalCredential(source)) {
    for (const match of source.matchAll(RUNTIME_MODULE_SPECIFIER)) {
      const specifier = match[2] ?? "";
      if (PLATFORM_MODULE.test(specifier)) continue;
      found.add("runtime_package_import");
      break;
    }
  }

  for (const window of callWindows(source, OUTBOUND_CALL, OUTBOUND_CALL_WINDOW)) {
    const absolute = ABSOLUTE_URL.exec(window)?.[0] ?? "";
    const configured = CONFIGURED_ENDPOINT.test(window);
    if (!absolute && !configured) continue;
    if (absolute && PLATFORM_ENDPOINT.test(absolute)) continue;
    if (!absolute && configured && PLATFORM_ENDPOINT.test(window)) continue;
    found.add("outbound_http_request");
    break;
  }

  for (const window of callWindows(source, CLIENT_CONSTRUCTION, CLIENT_CONSTRUCTION_WINDOW)) {
    if (!CREDENTIAL_OPTION.test(window) || !ENVIRONMENT_LOOKUP.test(window)) continue;
    const names = environmentNames(window);
    if (names.length > 0 && names.every((name) => PLATFORM_CREDENTIAL.test(name))) continue;
    found.add("credentialed_client");
    break;
  }

  if (CREDENTIAL_REQUEST_HEADER.test(source)) {
    found.add("credentialed_request_header");
  }

  return [...found];
}

export function hasProviderCall(
  content: string,
  options?: { runtimeModules?: boolean },
): boolean {
  return providerCallSignals(content, options).length > 0;
}

/* ---------------------------------------------------------------------- */
/* Boundary, bounds, abuse-guard, and lifecycle evidence                   */
/* ---------------------------------------------------------------------- */

const WILDCARD_CORS = /access-control-allow-origin[^\n]{0,80}['"`]\*['"`]/i;
const RESTRICTED_CORS = /access-control-allow-origin[^\n]{0,80}['"`](?!\*)/i;
const REQUEST_LOGGING =
  /\b(console\.(?:log|info|debug)|logger\.(?:info|debug))\s*\([^)]*\b(request|body|response)\b/i;
const TOKEN_VALIDATION = /\b(?:auth\.)?(?:getuser|getclaims)\s*\(|\bjwtverify\s*\(/i;
const TIMEOUT_BOUND =
  /\b(?:abortsignal\.timeout|abortcontroller|settimeout\s*\(|connecttimeout|readtimeout)\b|\btimeout\s*[:=]|\bsignal\s*:/i;

/**
 * Bounded request input: a declared maximum size, length, or parsed shape.
 *
 * The first four entries are the P0.8 edge-function input-limit tokens, kept
 * verbatim so this change tightens nothing that P0.8 already accepted. The rest
 * recognize an explicit numeric ceiling.
 */
const INPUT_BOUND = [
  /\bcontent-length\b/i,
  /\bmax(?:imum)?(?:input|body|tokens?)\b/i,
  /\blimit\s*[:=]/i,
  /\b(?:zod|safeparse)\b/i,
  /\bmax(?:imum)?[_-](?:length|size|bytes|chars?|characters|input|body|words?)\b/i,
  /\bbody(?:size)?limit\b/i,
  /\.\s*length\s*[<>]=?\s*\d+/,
  /\.\s*(?:slice|substring|substr)\s*\(\s*0\s*,\s*\d{2,}\s*\)/,
  /\.\s*max\s*\(\s*\d+\s*\)/,
];
/** Bounded provider output: a declared ceiling on what the provider returns. */
const OUTPUT_BOUND = [
  /\bmax[\s_-]?(?:new[\s_-]?)?(?:output[\s_-]?)?(?:tokens?|chars?|characters?|duration|seconds?|results?|items?|length|size|completion(?:[\s_-]?tokens?)?|output)\b/i,
  /\b(?:limit|top_k|top_p|n)\s*[:=]\s*\d+/i,
  /\.\s*limit\s*\(\s*\d+\s*\)/,
  /\bstop\s*[:=]/i,
];

/**
 * A server-side guard on how often or how expensively a caller may reach the
 * paid provider. Configuration counts; a wish does not.
 */
const ABUSE_GUARD = [
  /\brate[\s_-]?limit(?:er|ing|s|ed)?\b/i,
  /\bthrottl(?:e|ed|ing|er)\b/i,
  /\b(?:token|leaky)[_-]?bucket\b/i,
  /\bquota[s]?\b/i,
  /\b(?:spend|budget|cost|credit|credits|usage)[_-]?(?:cap|caps|limit|limits|guard|remaining|balance|check)\b/i,
  /\bmax[_-]?requests?[_-]?per\b/i,
  /\b(?:p-limit|bottleneck|express-rate-limit|@upstash\/ratelimit)\b/i,
  /\bconcurrency\s*[:=]\s*\d+/i,
];

/** Retention, deletion, or expiration of stored objects. */
const LIFECYCLE_EVIDENCE = [
  /\bcreate[_-]?signed[_-]?url\b/i,
  /\bexpires?(?:in|at|_in|_at)?\s*[:=]/i,
  /\bexpiry\b|\bexpiration\b/i,
  /\bttl\b|\btime[_-]?to[_-]?live\b/i,
  /\bretention\b/i,
  /\blifecycle[_-]?(?:rule|rules|policy|configuration)\b/i,
  /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*remove\s*\(/i,
  /\b(?:delete|remove|purge|prune|cleanup)[_-]?(?:object|objects|file|files|old|expired|stale)\b/i,
  /\bpg_cron\b|\bcron\.schedule\s*\(/i,
  /\bdelete\s+from\s+storage\.objects\b/i,
];

/** An object the application creates in provider storage. */
const OBJECT_CREATION = [
  /\bstorage\s*\.\s*from\s*\([^)]*\)\s*\.\s*upload\s*\(/i,
  /\.\s*(?:upload|putObject|uploadFile|createFile)\s*\(/,
  /\binsert\s+into\s+storage\.objects\b/i,
];
/** Evidence that such an object is readable without a credential. */
const PUBLIC_EXPOSURE = [
  /\bgetpublicurl\s*\(/i,
  /\bpublic\s*:\s*true\b/i,
  /\bpublic[_-]?url\b/i,
  /\binsert\s+into\s+storage\.buckets\b[\s\S]{0,240}?\btrue\b/i,
  /\bcreate\s+policy\b[\s\S]{0,240}?\bto\s+(?:public|anon)\b/i,
];

/**
 * A claim about deployed state that the repository cannot verify: a note that
 * the provider dashboard holds the rate limit, the spend cap, or the bucket
 * lifecycle rule. It is real information and it is reported as such, but it is
 * `runtime_only`, never positive enforcement evidence.
 */
const RUNTIME_STATE_SUBJECT =
  /rate[- ]?limit|quota|spend(?:ing)? cap|budget|billing|usage limit|retention|lifecycle rule|expiration|expiry|storage policy|row[- ]level security/i;
const RUNTIME_STATE_LOCATION =
  /dashboard|console|provider settings|project settings|platform settings|deployed|deployment settings|configured in the provider|managed outside/i;

function claimsRuntimeState(content: string): boolean {
  return content
    .split(/(?<=[.!?])\s+|\n/)
    .some(
      (sentence) =>
        RUNTIME_STATE_SUBJECT.test(sentence) && RUNTIME_STATE_LOCATION.test(sentence),
    );
}

function matchesAny(patterns: RegExp[], content: string): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

function reference(file: IndexedFile, kind: EvidenceReference["kind"]): EvidenceReference {
  return { path: file.path, kind };
}

/* ---------------------------------------------------------------------- */
/* Edge functions                                                          */
/* ---------------------------------------------------------------------- */

const EDGE_FUNCTION_ENTRY = /^supabase\/functions\/([^/_][^/]*)\/index\.[cm]?[jt]s$/i;
const EDGE_FUNCTION_MODULE = /^supabase\/functions\/([^/]+)\/(.+)\.[cm]?[jt]sx?$/i;
const EDGE_SHARED_MODULE = /^supabase\/functions\/_shared\//i;
const EDGE_CONFIG = /^supabase\/config\.toml$/i;

export interface EdgeFunctionBoundary {
  /** Function directory name, used only to select its configuration section. */
  name: string;
  /** Every file that contributes to this function: entry, siblings, shared. */
  files: IndexedFile[];
  providerSignals: ProviderCallSignal[];
  providerCall: boolean;
  /** Files where a provider-call signal was observed. */
  providerEvidence: EvidenceReference[];
  /** Entry file and matching configuration section, as before. */
  boundaryEvidence: EvidenceReference[];
  jwtDisabled: boolean;
  jwtVerified: boolean;
  wildcardCors: boolean;
  restrictedCors: boolean;
  requestLogging: boolean;
  tokenValidated: boolean;
  inputBounded: boolean;
  outputBounded: boolean;
  timeoutBounded: boolean;
  abuseGuarded: boolean;
  retrySafe: boolean;
  /** A reachable provider call with a visibly disabled or open boundary. */
  exposedProviderCall: boolean;
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function edgeConfigSection(content: string, functionName: string): string | null {
  const header = new RegExp(`^\\s*\\[functions\\.${escapedPattern(functionName)}\\]\\s*$`, "im");
  const match = header.exec(content);
  if (!match || match.index === undefined) return null;
  const rest = content.slice(match.index + match[0].length);
  return rest.split(/^\s*\[/m, 1)[0] ?? "";
}

const RETRY_SAFETY =
  /\b(?:idempotency[-_ ]?key|idempotent|retry[\s\S]{0,80}(?:backoff|exponential)|circuit[-_ ]?breaker|backpressure|dead[-_ ]?letter)\b/i;

export function edgeFunctionBoundaries(
  index: signals.RepositoryIndex,
): EdgeFunctionBoundary[] {
  const config = index.files.find((file) => EDGE_CONFIG.test(file.normalizedPath));
  const shared = index.files.filter((file) => EDGE_SHARED_MODULE.test(file.normalizedPath));

  return index.files.flatMap((entry) => {
    const name = EDGE_FUNCTION_ENTRY.exec(entry.normalizedPath)?.[1];
    if (!name) return [];
    const siblings = index.files.filter((file) => {
      const match = EDGE_FUNCTION_MODULE.exec(file.normalizedPath);
      return (
        match?.[1]?.toLowerCase() === name.toLowerCase() &&
        file.normalizedPath !== entry.normalizedPath
      );
    });
    // Shared modules count for a function only when that function references
    // them. A wildcard CORS header defined in `_shared/cors.ts` is part of the
    // boundary of every function that imports it - and of no other.
    const ownContent = [entry, ...siblings].map((file) => file.content).join("\n");
    const usedShared = shared.filter((file) => {
      const name = file.normalizedPath.split("/").pop() ?? "";
      const base = name.replace(/\.[cm]?[jt]sx?$/i, "");
      return base.length > 0 && new RegExp(`_shared/${escapedPattern(base)}(?:\\.[cm]?[jt]sx?)?["'\`]`).test(ownContent);
    });
    const files = [entry, ...siblings, ...usedShared];
    const joined = files.map((file) => file.content).join("\n");
    const configSection = config ? edgeConfigSection(config.content, name) : null;

    const providerSignals = new Set<ProviderCallSignal>();
    const providerEvidence: EvidenceReference[] = [];
    for (const file of files) {
      const fileSignals = providerCallSignals(file.content);
      if (fileSignals.length === 0) continue;
      for (const item of fileSignals) providerSignals.add(item);
      providerEvidence.push(reference(file, "code"));
    }

    const jwtDisabled = /verify_jwt\s*=\s*false/i.test(configSection ?? "");
    const wildcardCors = WILDCARD_CORS.test(joined);
    const requestLogging = REQUEST_LOGGING.test(joined);
    const providerCall = providerSignals.size > 0;

    return [{
      name,
      files,
      providerSignals: [...providerSignals],
      providerCall,
      providerEvidence,
      boundaryEvidence: [
        reference(entry, "code"),
        ...(configSection !== null && config
          ? [reference(config, "configuration")]
          : []),
      ],
      jwtDisabled,
      jwtVerified: /verify_jwt\s*=\s*true/i.test(configSection ?? ""),
      wildcardCors,
      restrictedCors: RESTRICTED_CORS.test(joined),
      requestLogging,
      tokenValidated: TOKEN_VALIDATION.test(joined),
      inputBounded: matchesAny(INPUT_BOUND, joined),
      outputBounded: matchesAny(OUTPUT_BOUND, joined),
      timeoutBounded: TIMEOUT_BOUND.test(joined),
      abuseGuarded: matchesAny(ABUSE_GUARD, joined),
      retrySafe: RETRY_SAFETY.test(joined),
      exposedProviderCall:
        providerCall && (jwtDisabled || wildcardCors || requestLogging),
    }];
  });
}

/* ---------------------------------------------------------------------- */
/* Repository-level provider surface                                       */
/* ---------------------------------------------------------------------- */

/**
 * Three states for one repository-evidence question.
 *
 * `verified` is repository evidence that the control exists. `runtimeClaim` is a
 * documented statement that the deployed provider or platform enforces it,
 * which the repository cannot verify. Neither present means the evidence is
 * missing — which is not the same as proof that the control is absent.
 */
export interface ProviderEvidenceState {
  verified: EvidenceReference[];
  runtimeClaim: EvidenceReference[];
}

export interface ProviderSurface {
  edgeFunctions: EdgeFunctionBoundary[];
  /** Reachable production files, edge or otherwise, that call a provider. */
  providerFiles: IndexedFile[];
  providerEvidence: EvidenceReference[];
  providerCall: boolean;
  /** Publicly readable objects that the application itself creates. */
  publicObjectEvidence: EvidenceReference[];
  publicObject: boolean;
  abuseGuard: ProviderEvidenceState;
  inputBounds: ProviderEvidenceState;
  outputBounds: ProviderEvidenceState;
  lifecycle: ProviderEvidenceState;
}

const surfaceCache = new WeakMap<signals.RepositoryIndex, ProviderSurface>();

const SERVER_CONFIGURATION_PATH =
  /\.(?:sql|toml|ya?ml|json|tf|conf)$/i;
const DOCUMENTATION_PATH = /\.(?:md|mdx|txt|rst|adoc)$/i;
/**
 * Dependency manifests. A package name is not a control: declaring a rate
 * limiter is not rate limiting, exactly as a validation package is not
 * validation.
 */
const DEPENDENCY_MANIFEST_PATH =
  /(^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|composer\.(?:json|lock)|pom\.xml|build\.gradle(?:\.kts)?|requirements\.txt|pyproject\.toml|cargo\.toml|go\.mod|deno\.jsonc?)$/i;

/**
 * Files that may carry a server-side guard: reachable production server code,
 * versioned SQL, and deployment configuration. Browser code is excluded, since
 * a limit a browser applies to itself is not a guard.
 */
function guardFiles(index: signals.RepositoryIndex): IndexedFile[] {
  return index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      !DEPENDENCY_MANIFEST_PATH.test(file.normalizedPath) &&
      (SERVER_CONFIGURATION_PATH.test(file.normalizedPath) ||
        (isProductionExecutionFile(index, file) &&
          isServerSurfaceFile(file.normalizedPath, file.content))),
  );
}

function documentationFiles(index: signals.RepositoryIndex): IndexedFile[] {
  return index.files.filter((file) => DOCUMENTATION_PATH.test(file.normalizedPath));
}

function evidenceState(
  guards: IndexedFile[],
  documents: IndexedFile[],
  patterns: RegExp[],
): ProviderEvidenceState {
  return {
    verified: guards
      .filter((file) => matchesAny(patterns, signals.withoutComments(file.content)))
      .slice(0, 4)
      .map((file) => reference(file, SERVER_CONFIGURATION_PATH.test(file.normalizedPath) ? "configuration" : "code")),
    runtimeClaim: documents
      .filter((file) => matchesAny(patterns, file.content) && claimsRuntimeState(file.content))
      .slice(0, 2)
      .map((file) => reference(file, "documentation")),
  };
}

/**
 * Every reachable production file whose text shows an external provider call.
 * Edge functions are included through their own boundaries; other server code
 * is included when it is reachable production execution.
 */
export function providerSurface(index: signals.RepositoryIndex): ProviderSurface {
  const cached = surfaceCache.get(index);
  if (cached) return cached;

  const edgeFunctions = edgeFunctionBoundaries(index);
  const edgePaths = new Set(
    edgeFunctions.flatMap((boundary) => boundary.files.map((file) => file.normalizedPath)),
  );
  const serverProviderFiles = index.files.filter(
    (file) =>
      !edgePaths.has(file.normalizedPath) &&
      isProductionExecutionFile(index, file) &&
      isServerSurfaceFile(file.normalizedPath, file.content) &&
      hasProviderCall(file.content, { runtimeModules: false }),
  );
  const edgeProviderFiles = edgeFunctions
    .filter((boundary) => boundary.providerCall)
    .flatMap((boundary) =>
      boundary.files.filter((file) => hasProviderCall(file.content)),
    );
  const providerFiles = [...edgeProviderFiles, ...serverProviderFiles];

  const guards = guardFiles(index);
  const documents = documentationFiles(index);

  const objectFiles = index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      !DOCUMENTATION_PATH.test(file.normalizedPath) &&
      matchesAny(OBJECT_CREATION, file.content),
  );
  const exposureFiles = index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      !DOCUMENTATION_PATH.test(file.normalizedPath) &&
      matchesAny(PUBLIC_EXPOSURE, file.content),
  );
  const publicObject = objectFiles.length > 0 && exposureFiles.length > 0;

  const surface: ProviderSurface = {
    edgeFunctions,
    providerFiles,
    providerEvidence: providerFiles
      .slice(0, 4)
      .map((file) => reference(file, "code")),
    providerCall: providerFiles.length > 0,
    publicObjectEvidence: publicObject
      ? [...new Map(
          [...objectFiles, ...exposureFiles].map((file) => [file.path, file]),
        ).values()]
          .slice(0, 4)
          .map((file) =>
            reference(file, SERVER_CONFIGURATION_PATH.test(file.normalizedPath) ? "configuration" : "code"),
          )
      : [],
    publicObject,
    abuseGuard: evidenceState(guards, documents, ABUSE_GUARD),
    inputBounds: evidenceState(guards, documents, INPUT_BOUND),
    outputBounds: evidenceState(guards, documents, OUTPUT_BOUND),
    lifecycle: evidenceState(guards, documents, LIFECYCLE_EVIDENCE),
  };
  surfaceCache.set(index, surface);
  return surface;
}
