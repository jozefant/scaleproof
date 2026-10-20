import * as signals from "./signals";
import type { CheckResult } from "./types";

/**
 * Static-frontend evidence profile.
 *
 * A repository that ships a browser bundle but has no reachable server route,
 * serverless function, persistence client, submitting form, or outbound data
 * call cannot be assessed against server-runtime controls. Treating that
 * absent backend as a production-readiness failure produced founder actions
 * for work the product does not contain, so those controls are reported as
 * `not_applicable` instead.
 *
 * The profile is deliberately conservative: any signal of a server surface,
 * persistence client, or outbound data path removes a repository from the
 * profile and keeps every data-boundary control assessable.
 */

const NON_APPLICATION_PATH =
  /(^|\/)(?:tests?|__tests__|fixtures?|examples?|docs?|\.storybook)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|\.mdx?$/i;

const BUNDLE_MARKER_PATHS = [
  /(^|\/)index\.html$/,
  /(^|\/)vite\.config\.[cm]?[jt]sx?$/,
  /(^|\/)next\.config\.[cm]?[jt]sx?$/,
  /(^|\/)webpack\.config\.[cm]?[jt]sx?$/,
  /(^|\/)rollup\.config\.[cm]?[jt]sx?$/,
  /(^|\/)astro\.config\.[cm]?[jt]sx?$/,
  /(^|\/)svelte\.config\.[cm]?[jt]sx?$/,
  /(^|\/)remix\.config\.[cm]?[jt]sx?$/,
  /(^|\/)gatsby-config\.[cm]?[jt]sx?$/,
  /(^|\/)angular\.json$/,
];
const BROWSER_FRAMEWORK_DEPENDENCY =
  /"(?:react|react-dom|preact|vue|svelte|solid-js|astro|next|nuxt|gatsby|vite|@angular\/core|@vitejs\/plugin-[\w-]+)"\s*:/i;
const BROWSER_VIEW_PATH = /\.(?:[jt]sx|vue|svelte|astro|html?)$/i;
const PACKAGE_MANIFEST_PATH = /(^|\/)package\.json$/;

const SERVER_SURFACE_PATHS = [
  /^(?:src\/)?app\/(?:.*\/)?api\/(?:.*\/)?route\.[cm]?[jt]sx?$/,
  /^(?:src\/)?pages\/api\//,
  /^(?:api|functions|server|backend|workers?)\//,
  /(^|\/)netlify\/functions\//,
  /(^|\/)supabase\/functions\//,
  /(^|\/)middleware\.[cm]?[jt]s$/,
  /(^|\/)server\.[cm]?[jt]s$/,
  /(^|\/)(?:routes?|controllers?)\/[^/]+\.[cm]?[jt]s$/,
  /\.(?:java|py|rb|go|php|cs|rs|kt|scala|ex|exs)$/,
  /(^|\/)dockerfile$/,
  /(^|\/)(?:docker-)?compose\.ya?ml$/,
  /(^|\/)serverless\.ya?ml$/,
  /(^|\/)wrangler\.toml$/,
  /(^|\/)fly\.toml$/,
  /(^|\/)procfile$/,
  /(^|\/)(?:k8s|kubernetes|helm|charts)\//,
];
const SERVER_RUNTIME_CONTENT = [
  /\b(?:express\s*\(|fastify\s*\(|new\s+Hono\s*\(|Deno\.serve\s*\(|http\.createServer\s*\(|createServer\s*\(|app\.listen\s*\()/i,
  /\b(?:@RestController|@SpringBootApplication|FastAPI\s*\(|Flask\s*\(|gin\.Default\s*\()/,
  /"(?:express|fastify|hono|koa|@nestjs\/core|socket\.io)"\s*:/i,
  /\b(?:getServerSideProps|next\/server|NextResponse)\b/,
  /^\s*["']use server["']\s*;?\s*$/m,
];

const PERSISTENCE_CONTENT = [
  /\b(?:createClient\s*\(|@supabase\/supabase-js|new\s+PrismaClient|@prisma\/client|mongoose|firebase\/(?:app|firestore|auth|storage)|initializeApp\s*\(|getFirestore\s*\(|drizzle-orm|\bknex\b|new\s+Pool\s*\(|sequelize|typeorm|dynamodb|@aws-sdk\/client-)/i,
];

const OUTBOUND_DATA_CONTENT = [
  /\bfetch\s*\(/i,
  /\baxios\b/i,
  /\bXMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\s*\(/i,
  /\bnew\s+(?:WebSocket|EventSource)\s*\(/i,
  /\b(?:useQuery|useMutation|useSWR|ApolloClient|graphql-request|emailjs|formspree|getform|web3forms|formcarry|basin)\b/i,
  /\b(?:supabase|firestore|firebase|storage|db)\.[\w.]+\s*\(/i,
];
// Outbound form egress must be bound to an actual form element and target a
// URL or route. A `mailto:` or `tel:` link hands the visitor over to another
// application on their own device; it is not an outbound data write and it is
// not evidence that a backend exists.
const FORM_EGRESS_CONTENT = [
  /<form\b[^>]{0,400}?\baction\s*=\s*(?:\{|["'](?!#|javascript:|mailto:|tel:|sms:|\s*["']))/is,
  /<form\b[^>]{0,400}?\bmethod\s*=\s*["']post["']/is,
  /<form\b[^>]{0,400}?\bdata-netlify\s*=\s*["']?true/is,
];
const SUBMIT_HANDLER_CONTENT = /\b(?:onSubmit\s*[=:]|handleSubmit\b|requestSubmit\s*\(|form\.submit\s*\()/;

/**
 * Server-runtime controls. Each one asks a question about a deployed server
 * process, its dependencies, its logs, or its data boundary. None of them can
 * be answered from a repository that contains no server surface at all.
 */
export const SERVER_ONLY_CONTROL_IDS: ReadonlySet<string> = new Set([
  "rel.stateless",
  "rel.database-foundations",
  "rel.failure-controls",
  "rel.health-lifecycle",
  "rel.async-work",
  "rel.load-tests",
  "rel.ha-path",
  "rel.actual-capacity",
  "ops.structured-logging",
  "ops.log-categories",
  "ops.log-redaction",
  "ops.observability",
  "ops.alerting",
  "ops.runbook",
  "ops.log-retention",
  "ops.alert-delivery",
  "security.authentication",
  "security.authorization",
  "saas.stateless-tier",
  "saas.database-discipline",
  "saas.slow-work",
  "saas.failure-safety",
  "saas.observability",
  "saas.tenant-isolation",
]);

export const STATIC_FRONTEND_NOT_APPLICABLE_SUMMARY =
  "This repository shows a browser bundle with no reachable server route, serverless function, persistence client, submitting form, or outbound data call, so this server-runtime control is outside the observed product shape. Missing server implementation is not scored as a production-readiness failure.";

export interface StaticFrontendProfile {
  browserBundle: boolean;
  serverSurface: boolean;
  persistenceClient: boolean;
  outboundData: boolean;
  submissionPath: boolean;
  staticOnly: boolean;
}

type IndexedFile = signals.RepositoryIndex["files"][number];

const profileCache = new WeakMap<signals.RepositoryIndex, StaticFrontendProfile>();

function applicationFiles(index: signals.RepositoryIndex): IndexedFile[] {
  return index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      !NON_APPLICATION_PATH.test(file.normalizedPath),
  );
}

function hasBrowserBundle(files: IndexedFile[]): boolean {
  const bundleMarker = files.some(
    (file) =>
      BUNDLE_MARKER_PATHS.some((pattern) => pattern.test(file.normalizedPath)) ||
      (PACKAGE_MANIFEST_PATH.test(file.normalizedPath) &&
        BROWSER_FRAMEWORK_DEPENDENCY.test(file.content)),
  );
  const view = files.some((file) => BROWSER_VIEW_PATH.test(file.normalizedPath));
  return bundleMarker && view;
}

/**
 * A single file's server-surface test, shared with the browser-data-boundary
 * profile so both use one definition of "this file is not browser code".
 */
export function isServerSurfaceFile(
  normalizedPath: string,
  content: string,
): boolean {
  return (
    SERVER_SURFACE_PATHS.some((pattern) => pattern.test(normalizedPath)) ||
    SERVER_RUNTIME_CONTENT.some((pattern) => pattern.test(content))
  );
}

/** Tests, fixtures, examples, documentation, and stories are not the product. */
export function isNonApplicationPath(normalizedPath: string): boolean {
  return NON_APPLICATION_PATH.test(normalizedPath);
}

function hasServerSurface(files: IndexedFile[]): boolean {
  return files.some((file) =>
    isServerSurfaceFile(file.normalizedPath, file.content),
  );
}

function hasPersistenceClient(
  index: signals.RepositoryIndex,
  files: IndexedFile[],
): boolean {
  return (
    signals.hasDurableData(index) ||
    files.some((file) =>
      PERSISTENCE_CONTENT.some((pattern) => pattern.test(file.content)),
    )
  );
}

function hasOutboundData(files: IndexedFile[]): boolean {
  return files.some((file) =>
    OUTBOUND_DATA_CONTENT.some((pattern) => pattern.test(file.content)),
  );
}

/**
 * A submission path leaves the browser: a form action or method, a hosted
 * form service, `mailto:`, or a submit handler in a file that also performs an
 * outbound or persistence call. A submit handler that only updates local state
 * is not a submission path; it is reported by the form-completeness control.
 */
function hasSubmissionPath(files: IndexedFile[]): boolean {
  return files.some(
    (file) =>
      FORM_EGRESS_CONTENT.some((pattern) => pattern.test(file.content)) ||
      (SUBMIT_HANDLER_CONTENT.test(file.content) &&
        (OUTBOUND_DATA_CONTENT.some((pattern) => pattern.test(file.content)) ||
          PERSISTENCE_CONTENT.some((pattern) => pattern.test(file.content)))),
  );
}

export function staticFrontendProfile(
  index: signals.RepositoryIndex,
): StaticFrontendProfile {
  const cached = profileCache.get(index);
  if (cached) return cached;

  const files = applicationFiles(index);
  const browserBundle = hasBrowserBundle(files);
  const serverSurface = hasServerSurface(files);
  const persistenceClient = hasPersistenceClient(index, files);
  const outboundData = hasOutboundData(files);
  const submissionPath = hasSubmissionPath(files);
  const profile: StaticFrontendProfile = {
    browserBundle,
    serverSurface,
    persistenceClient,
    outboundData,
    submissionPath,
    // A partial scan cannot prove that no server code exists.
    staticOnly:
      !index.snapshot.coverage.partial &&
      browserBundle &&
      !serverSurface &&
      !persistenceClient &&
      !outboundData &&
      !submissionPath,
  };
  profileCache.set(index, profile);
  return profile;
}

export function isStaticFrontendOnly(index: signals.RepositoryIndex): boolean {
  return staticFrontendProfile(index).staticOnly;
}

/**
 * Rewrites server-runtime controls to `not_applicable` for a static-frontend
 * repository. Control identity, domain, severity, weight, and remediation code
 * stay unchanged so detector metadata reconciliation still holds.
 */
export function applyStaticFrontendApplicability(
  index: signals.RepositoryIndex,
  checks: CheckResult[],
): CheckResult[] {
  if (!isStaticFrontendOnly(index)) return checks;
  return checks.map((check) =>
    SERVER_ONLY_CONTROL_IDS.has(check.id)
      ? {
          ...check,
          outcome: "not_applicable" as const,
          evidenceTier: "absent" as const,
          evidence: [],
          summary: STATIC_FRONTEND_NOT_APPLICABLE_SUMMARY,
        }
      : check,
  );
}
