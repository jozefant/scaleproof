import * as signals from "./signals";
import {
  isNonApplicationPath,
  isServerSurfaceFile,
  staticFrontendProfile,
} from "./static-frontend";
import type { EvidenceReference } from "./types";

/**
 * Direct browser-to-BaaS data boundary.
 *
 * An authenticated browser application can call a backend-as-a-service
 * database, storage bucket, or auth API directly. Client session state and a
 * `user_id` predicate improve the user experience, but they run inside the
 * user's own browser and prove nothing about server-side authorization. The
 * deployed row-level or storage policy that would enforce that boundary
 * frequently lives in the provider console, outside the repository.
 *
 * This module therefore records two separate facts:
 *
 * 1. a categorical description of what the browser bundle touches directly
 *    (auth, table reads, table mutations, storage), and
 * 2. whether the repository contains versioned policy evidence covering the
 *    resources the browser accesses.
 *
 * Absent policy evidence is reported as missing repository evidence. It is
 * never reported as proof that the deployed policy is absent or broken.
 *
 * The module also owns the grammar that separates a real data-client or SQL
 * query from a DOM `select`, a `<Select>` UI component, or generated
 * component-library text, so query-bound checks apply only to real data
 * operations. Nothing here retains or exports source text; callers receive
 * booleans, categorical resource names, and path/kind evidence references.
 */

const BROWSER_SOURCE_PATH = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;

/**
 * A file is only read as a data client when it also carries a recognized BaaS
 * client signal. Without this gate, `Array.from("...")` or an unrelated
 * `.collection(...)` helper would be read as a database query.
 */
const BAAS_CLIENT_SIGNAL =
  /@supabase\/(?:supabase-js|ssr|auth-helpers[\w-]*)|\bsupabase\b|\bcreateClient\s*\(|firebase\/(?:app|firestore|auth|storage|database)|\bgetFirestore\s*\(|\binitializeApp\s*\(|\bfirebase\b|\bappwrite\b|\bnew\s+PocketBase\s*\(|\bpocketbase\b|aws-amplify|@aws-amplify\//i;

// PostgREST-style table handle: `.from("profiles")`. The bucket form
// `.storage.from("avatars")` is separated by inspecting the preceding text.
const TABLE_HANDLE = /\.\s*from\s*\(\s*(['"`])([A-Za-z_][\w.$-]*)\1\s*\)/g;
const STORAGE_HANDLE_PREFIX = /\.\s*storage\s*$/i;

const TABLE_READ_OPERATION = /\.\s*(?:select)\s*\(/i;
const TABLE_MUTATION_OPERATION = /\.\s*(?:insert|upsert|update|delete)\s*\(/i;
const STORAGE_READ_OPERATION =
  /\.\s*(?:download|list|getPublicUrl|createSignedUrls?)\s*\(/i;
const STORAGE_MUTATION_OPERATION =
  /\.\s*(?:upload|remove|move|copy|createSignedUploadUrl)\s*\(/i;

// Firestore, Appwrite, and PocketBase equivalents.
const FIRESTORE_COLLECTION =
  /\bcollection\s*\(\s*(?:[\w$]+\s*,\s*)?(['"`])([\w./$-]+)\1/g;
const FIRESTORE_READ = /\b(?:getDocs|getDoc|onSnapshot)\s*\(/;
const FIRESTORE_MUTATION =
  /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/;
const FIRESTORE_STORAGE_MUTATION =
  /\b(?:uploadBytes(?:Resumable)?|uploadString|deleteObject)\s*\(/;
const FIRESTORE_STORAGE_READ = /\b(?:getDownloadURL|listAll)\s*\(/;
const DOCUMENT_API_READ = /\b(?:listDocuments|getDocument)\s*\(/;
const DOCUMENT_API_MUTATION =
  /\b(?:createDocument|updateDocument|deleteDocument)\s*\(/;
const DOCUMENT_API_STORAGE_MUTATION = /\b(?:createFile|deleteFile)\s*\(/;
// Appwrite passes the collection as the second argument:
// `databases.listDocuments(DATABASE_ID, "notes", queries)`.
const DOCUMENT_API_COLLECTION =
  /\b(?:listDocuments|getDocument|createDocument|updateDocument|deleteDocument)\s*\(\s*(?:[^,()]{0,80},\s*)?(['"`])([\w.$-]+)\1/g;
const DOCUMENT_API_BUCKET =
  /\b(?:createFile|deleteFile|getFileView|getFileDownload)\s*\(\s*(['"`])([\w.$-]+)\1/g;
const POCKETBASE_COLLECTION =
  /\.\s*collection\s*\(\s*(['"`])([\w./$-]+)\1\s*\)\s*\.\s*(getList|getOne|getFullList|getFirstListItem|create|update|delete)\s*\(/g;
const POCKETBASE_MUTATION = /^(?:create|update|delete)$/;

const BAAS_AUTH_OPERATION =
  /\.\s*auth\s*\.\s*(?:signIn[A-Za-z]*|signUp|signOut|getUser|getSession|getClaims|onAuthStateChange|updateUser|refreshSession|exchangeCodeForSession|resetPasswordForEmail)\s*\(|\b(?:onAuthStateChanged|signInWithEmailAndPassword|createUserWithEmailAndPassword|signInWithPopup|getAuth)\s*\(/;

const BOUNDED_QUERY =
  /\.\s*(?:limit|range|single|maybeSingle|maybe_single)\s*\(|\blimit\s*:\s*\d+|\bcount\s*:\s*['"]/i;

/**
 * A client-side identity predicate such as `.eq("user_id", user.id)`. It is a
 * user-experience filter evaluated by code the user controls, not a
 * server-side authorization decision.
 */
const CLIENT_IDENTITY_PREDICATE = [
  /\.\s*(?:eq|neq|match|filter|in|is)\s*\(\s*(['"`])(?:user|owner|profile|author|creator|account|created_by|auth)_?id\1\s*,/i,
  /\.\s*match\s*\(\s*\{\s*(['"`])?(?:user|owner|profile|author|creator|account|created_by|auth)_?id\1?\s*:/i,
  /\bwhere\s*\(\s*(['"`])?(?:user|owner|profile|account)_?id\1?\s*(?:,|:|==)/i,
];

/**
 * Versioned policy evidence. These are repository artifacts that define the
 * server-enforced boundary: SQL migrations that create row-level-security
 * policies, and provider rule files.
 */
const POLICY_EVIDENCE_PATH = [
  /(^|\/)supabase\/(?:migrations\/)?[^/]*\.sql$/,
  /(^|\/)migrations?\/[^/]+\.sql$/,
  /(^|\/)db\/(?:.*\/)?[^/]+\.sql$/,
  /(^|\/)(?:policies|policy|rls)\/[^/]+\.sql$/,
  /(^|\/)firestore\.rules$/,
  /(^|\/)storage\.rules$/,
  /(^|\/)database\.rules\.json$/,
];
const SQL_POLICY_CONTENT =
  /\bcreate\s+policy\b|\balter\s+policy\b|\benable\s+row\s+level\s+security\b/i;
const RULES_POLICY_CONTENT =
  /\bmatch\s+\/[^\s{]*\s*\{|\ballow\s+(?:read|write|create|update|delete|get|list)\b/i;
const SQL_POLICY_TARGET =
  /\bcreate\s+policy\b[\s\S]{0,240}?\bon\s+(?:only\s+)?([\w".`]+)/gi;
const SQL_RLS_TARGET =
  /\balter\s+table\s+(?:only\s+)?([\w".`]+)[\s\S]{0,120}?\benable\s+row\s+level\s+security\b/gi;
const SQL_BUCKET_TARGET = /\bbucket_id\s*(?:=|in)\s*\(?\s*'([^']+)'/gi;
const RULES_MATCH_TARGET = /\bmatch\s+\/(?:databases\/[^/]+\/documents\/)?([\w-]+)/gi;

/**
 * High-confidence SQL. A bare `select` keyword also appears in DOM markup,
 * `<Select>` component libraries, `react-select` import specifiers, and
 * ordinary prose, so the statement must show a SQL select list followed by a
 * `from` target before it is treated as a database query.
 *
 * The select list accepts what real SQL writes there: `*`, qualified and
 * quoted names, function calls such as `count(*)` or `coalesce(a, b)`,
 * parenthesised expressions, `CASE ... END`, arithmetic, casts, and explicit
 * `AS` aliases. It deliberately rejects an *implicit* alias — two bare words
 * separated only by whitespace — because that is the shape of English prose
 * ("select an option from the list") and of JSX attributes, and it is the one
 * rule that keeps UI text out of the database controls.
 */
const SQL_NAME = '[\\w$."`]{1,80}';
// `${table}` in a template-literal query. Braces are confined to this form so
// that `import { Select } from "./ui/select"` cannot present `}` as a select
// list and the module specifier as a table.
const SQL_INTERPOLATION = "\\$\\{[^{}]{0,80}\\}";
const SQL_PAREN = "\\((?:[^()]{0,160})(?:\\([^()]{0,80}\\)[^()]{0,80}){0,3}\\)";
const SQL_CASE = "case\\b[\\s\\S]{0,240}?\\bend\\b";
const SQL_VALUE = `(?:${SQL_NAME}\\s*${SQL_PAREN}|${SQL_PAREN}|${SQL_INTERPOLATION}|${SQL_NAME})`;
const SQL_TERM =
  `(?:\\*|${SQL_CASE}|${SQL_VALUE})` +
  `(?:\\s*(?:::|\\|\\||[-+*/%])\\s*${SQL_VALUE}){0,6}` +
  '(?:\\s+as\\s+[\\w$"`]{1,60})?';
// English determiners after `from` mark prose, never a table reference.
const PROSE_FROM_TARGET =
  "(?:the|a|an|this|that|these|those|your|our|my|its|their|it|them|here|there|which|what|when|now|each|every|any|both)\\b";
const SQL_SELECT_STATEMENT = new RegExp(
  "\\bselect\\s+(?:(?:distinct|all|top\\s+\\d+)\\s+)?" +
    `${SQL_TERM}(?:\\s*,\\s*${SQL_TERM}){0,40}` +
    `\\s+from\\s+(?!${PROSE_FROM_TARGET})(?:${SQL_PAREN}|${SQL_INTERPOLATION}|${SQL_NAME})`,
  "i",
);
const SQL_BOUND = /\b(?:limit|fetch\s+first|top\s*\()\b/i;
/**
 * SQL is routinely embedded in a single-line JavaScript, Python, or Java
 * string as `"SELECT *\nFROM users"`. A literal backslash escape is not
 * whitespace, so it is normalized before the statement grammar runs.
 */
const EMBEDDED_WHITESPACE_ESCAPE = /\\+[nrt]/g;

function normalizeEmbeddedWhitespace(content: string): string {
  return content.replace(EMBEDDED_WHITESPACE_ESCAPE, " ");
}

function sqlStatements(content: string): string[] {
  return normalizeEmbeddedWhitespace(content).split(";");
}

export interface DataClientOperations {
  /** Any real table, document, or storage operation was recognized. */
  present: boolean;
  auth: boolean;
  tableRead: boolean;
  tableMutation: boolean;
  storageRead: boolean;
  storageMutation: boolean;
  /** A recognized query was not bounded by limit, range, or single-row form. */
  unbounded: boolean;
  /** A client-evaluated identity predicate such as `.eq("user_id", user.id)`. */
  clientIdentityPredicate: boolean;
  /** Accessed table, collection, or bucket names, normalized and lowercased. */
  resources: string[];
}

const EMPTY_OPERATIONS: DataClientOperations = {
  present: false,
  auth: false,
  tableRead: false,
  tableMutation: false,
  storageRead: false,
  storageMutation: false,
  unbounded: false,
  clientIdentityPredicate: false,
  resources: [],
};

/**
 * Resource identity. Table/collection names and storage bucket names live in
 * separate provider namespaces, so they are kept in separate namespaces here:
 * a bucket called `notes` is not covered by the row-level-security policy on a
 * table called `notes`.
 */
export type ResourceKind = "table" | "bucket";

function normalizeResource(kind: ResourceKind, value: string): string {
  const cleaned = value.replaceAll('"', "").replaceAll("`", "").trim();
  const segments = cleaned.split(".").filter(Boolean);
  const name = (segments[segments.length - 1] ?? cleaned).toLowerCase();
  return name ? `${kind}:${name}` : "";
}

/** The provider table that owns storage-object policies, not a user table. */
const STORAGE_POLICY_TABLE = /^storage\.|^objects$/i;

/**
 * Chain window after a table or bucket handle. The window stops at the first
 * statement terminator so an unrelated later call is not read as part of this
 * query.
 */
function chainWindow(content: string, from: number): string {
  return content.slice(from, from + 320).split(/;|\n\s*\n/, 1)[0] ?? "";
}

/**
 * Recognizes real data-client operations in one file's text. Returns
 * categorical facts only; no source text is retained.
 */
export function dataClientOperations(content: string): DataClientOperations {
  if (!BAAS_CLIENT_SIGNAL.test(content)) return EMPTY_OPERATIONS;

  const resources = new Set<string>();
  let tableRead = false;
  let tableMutation = false;
  let storageRead = false;
  let storageMutation = false;
  let unbounded = false;
  let clientIdentityPredicate = false;

  for (const match of content.matchAll(TABLE_HANDLE)) {
    const start = match.index ?? 0;
    const window = chainWindow(content, start + match[0].length);
    const isStorage = STORAGE_HANDLE_PREFIX.test(
      content.slice(Math.max(0, start - 24), start),
    );
    if (isStorage) {
      const read = STORAGE_READ_OPERATION.test(window);
      const mutate = STORAGE_MUTATION_OPERATION.test(window);
      if (!read && !mutate) continue;
      storageRead ||= read;
      storageMutation ||= mutate;
      const bucket = normalizeResource("bucket", match[2] ?? "");
      if (bucket) resources.add(bucket);
      continue;
    }
    const read = TABLE_READ_OPERATION.test(window);
    const mutate = TABLE_MUTATION_OPERATION.test(window);
    if (!read && !mutate) continue;
    tableRead ||= read;
    tableMutation ||= mutate;
    const name = normalizeResource("table", match[2] ?? "");
    if (name) resources.add(name);
    if (read && !BOUNDED_QUERY.test(window)) unbounded = true;
    if (CLIENT_IDENTITY_PREDICATE.some((pattern) => pattern.test(window))) {
      clientIdentityPredicate = true;
    }
  }

  const firestoreRead = FIRESTORE_READ.test(content);
  const firestoreMutation = FIRESTORE_MUTATION.test(content);
  if (firestoreRead || firestoreMutation) {
    tableRead ||= firestoreRead;
    tableMutation ||= firestoreMutation;
    for (const match of content.matchAll(FIRESTORE_COLLECTION)) {
      const name = normalizeResource(
        "table",
        (match[2] ?? "").split("/").filter(Boolean)[0] ?? "",
      );
      if (name) resources.add(name);
    }
    if (firestoreRead && !BOUNDED_QUERY.test(content)) unbounded = true;
  }
  const documentRead = DOCUMENT_API_READ.test(content);
  const documentMutation = DOCUMENT_API_MUTATION.test(content);
  tableRead ||= documentRead;
  tableMutation ||= documentMutation;
  if (documentRead && !BOUNDED_QUERY.test(content)) unbounded = true;
  if (documentRead || documentMutation) {
    for (const match of content.matchAll(DOCUMENT_API_COLLECTION)) {
      const name = normalizeResource("table", match[2] ?? "");
      if (name) resources.add(name);
    }
  }
  for (const match of content.matchAll(DOCUMENT_API_BUCKET)) {
    const bucket = normalizeResource("bucket", match[2] ?? "");
    if (bucket) resources.add(bucket);
  }

  for (const match of content.matchAll(POCKETBASE_COLLECTION)) {
    const name = normalizeResource("table", match[2] ?? "");
    if (name) resources.add(name);
    if (POCKETBASE_MUTATION.test(match[3] ?? "")) tableMutation = true;
    else {
      tableRead = true;
      if (!BOUNDED_QUERY.test(chainWindow(content, (match.index ?? 0) + match[0].length))) {
        unbounded = true;
      }
    }
  }

  storageRead ||= FIRESTORE_STORAGE_READ.test(content);
  storageMutation ||=
    FIRESTORE_STORAGE_MUTATION.test(content) ||
    DOCUMENT_API_STORAGE_MUTATION.test(content);

  if (
    !clientIdentityPredicate &&
    (tableRead || tableMutation) &&
    CLIENT_IDENTITY_PREDICATE.some((pattern) => pattern.test(content))
  ) {
    clientIdentityPredicate = true;
  }

  const present =
    tableRead || tableMutation || storageRead || storageMutation;
  return {
    present,
    auth: BAAS_AUTH_OPERATION.test(content),
    tableRead,
    tableMutation,
    storageRead,
    storageMutation,
    unbounded,
    clientIdentityPredicate,
    resources: [...resources].sort(),
  };
}

/**
 * True when the text contains a real SQL select statement or a real data-client
 * query. A DOM `select`, a `<Select>` component, a `react-select` import, or
 * prose containing the word "select" is not a data query.
 */
export function hasRealDataQuery(content: string): boolean {
  const operations = dataClientOperations(content);
  if (operations.tableRead || operations.tableMutation) return true;
  return sqlStatements(content).some((statement) =>
    SQL_SELECT_STATEMENT.test(statement),
  );
}

/** True when a real query is visible and nothing bounds its result size. */
export function hasUnboundedDataQuery(content: string): boolean {
  if (dataClientOperations(content).unbounded) return true;
  return sqlStatements(content).some(
    (statement) =>
      SQL_SELECT_STATEMENT.test(statement) && !SQL_BOUND.test(statement),
  );
}

export interface BrowserDataBoundary {
  /** A browser bundle is visible, so browser-side facts are assessable. */
  browserBundle: boolean;
  /** Direct table, document, or storage access from reachable browser code. */
  directDataAccess: boolean;
  authClient: boolean;
  tableRead: boolean;
  tableMutation: boolean;
  storageRead: boolean;
  storageMutation: boolean;
  clientIdentityPredicate: boolean;
  accessedResources: string[];
  clientEvidence: EvidenceReference[];
  policyEvidence: EvidenceReference[];
  policyResources: string[];
  /** Accessed resources with no matching versioned policy definition. */
  uncoveredResources: string[];
  policyCoversAccessedResources: boolean;
}

type IndexedFile = signals.RepositoryIndex["files"][number];

const boundaryCache = new WeakMap<
  signals.RepositoryIndex,
  BrowserDataBoundary
>();

/**
 * Reachable browser source: application source that ships to the browser and
 * is not a server surface. Server-side BaaS usage is a different boundary and
 * is assessed by the server-runtime controls.
 */
export function reachableBrowserFiles(
  index: signals.RepositoryIndex,
): IndexedFile[] {
  return index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      BROWSER_SOURCE_PATH.test(file.normalizedPath) &&
      !isNonApplicationPath(file.normalizedPath) &&
      !isServerSurfaceFile(file.normalizedPath, file.content) &&
      signals.isReachableImplementationEvidenceFile(index, file),
  );
}

function policyFiles(index: signals.RepositoryIndex): IndexedFile[] {
  return index.files.filter(
    (file) =>
      signals.isImplementationEvidencePath(file.path) &&
      POLICY_EVIDENCE_PATH.some((pattern) => pattern.test(file.normalizedPath)) &&
      (SQL_POLICY_CONTENT.test(file.content) ||
        RULES_POLICY_CONTENT.test(file.content)),
  );
}

/**
 * Policy targets, in the same two namespaces as accessed resources. A
 * `storage.objects` policy target is the provider's own storage table, so it
 * never covers a user table; the bucket it covers comes from its `bucket_id`
 * predicate. A `storage.rules` file describes buckets, a `firestore.rules`
 * file describes collections.
 */
function policyTargets(normalizedPath: string, content: string): string[] {
  const rulesKind: ResourceKind = /storage\.rules$/i.test(normalizedPath)
    ? "bucket"
    : "table";
  const targets = new Set<string>();
  for (const pattern of [SQL_POLICY_TARGET, SQL_RLS_TARGET]) {
    for (const match of content.matchAll(pattern)) {
      const raw = (match[1] ?? "").replaceAll('"', "").replaceAll("`", "").trim();
      if (STORAGE_POLICY_TABLE.test(raw)) continue;
      const name = normalizeResource("table", raw);
      if (name) targets.add(name);
    }
  }
  for (const match of content.matchAll(RULES_MATCH_TARGET)) {
    const name = normalizeResource(rulesKind, match[1] ?? "");
    if (name) targets.add(name);
  }
  for (const match of content.matchAll(SQL_BUCKET_TARGET)) {
    const name = normalizeResource("bucket", match[1] ?? "");
    if (name) targets.add(name);
  }
  return [...targets];
}

export function browserDataBoundary(
  index: signals.RepositoryIndex,
): BrowserDataBoundary {
  const cached = boundaryCache.get(index);
  if (cached) return cached;

  const browserBundle = staticFrontendProfile(index).browserBundle;
  const clients: IndexedFile[] = [];
  const resources = new Set<string>();
  let authClient = false;
  let tableRead = false;
  let tableMutation = false;
  let storageRead = false;
  let storageMutation = false;
  let clientIdentityPredicate = false;

  if (browserBundle) {
    for (const file of reachableBrowserFiles(index)) {
      const operations = dataClientOperations(file.content);
      authClient ||= operations.auth;
      if (!operations.present) continue;
      clients.push(file);
      tableRead ||= operations.tableRead;
      tableMutation ||= operations.tableMutation;
      storageRead ||= operations.storageRead;
      storageMutation ||= operations.storageMutation;
      clientIdentityPredicate ||= operations.clientIdentityPredicate;
      for (const resource of operations.resources) resources.add(resource);
    }
  }

  const policies = policyFiles(index);
  const policyResources = new Set<string>();
  for (const file of policies) {
    for (const target of policyTargets(file.normalizedPath, file.content)) {
      policyResources.add(target);
    }
  }
  const accessedResources = [...resources].sort();
  const uncoveredResources = accessedResources.filter(
    (resource) => !policyResources.has(resource),
  );
  const directDataAccess =
    tableRead || tableMutation || storageRead || storageMutation;

  const boundary: BrowserDataBoundary = {
    browserBundle,
    directDataAccess,
    authClient,
    tableRead,
    tableMutation,
    storageRead,
    storageMutation,
    clientIdentityPredicate,
    accessedResources,
    clientEvidence: clients
      .slice(0, 4)
      .map((file) => ({ path: file.path, kind: "code" as const })),
    policyEvidence: policies
      .slice(0, 4)
      .map((file) => ({ path: file.path, kind: "configuration" as const })),
    policyResources: [...policyResources].sort(),
    uncoveredResources,
    policyCoversAccessedResources:
      directDataAccess &&
      accessedResources.length > 0 &&
      uncoveredResources.length === 0,
  };
  boundaryCache.set(index, boundary);
  return boundary;
}

/**
 * Browser logging of personal or session data.
 *
 * A finding requires a matching value flow: after string and template literals
 * are removed, the remaining argument expression must reference a session,
 * user, email, token, or profile value. `console.error("Failed to load", error)`
 * carries no such value and is generic error logging, not personal-data
 * leakage.
 */
const BROWSER_LOG_CALL =
  /\b(?:console\s*\.\s*(?:log|info|warn|error|debug|trace|table|dir)|window\s*\.\s*alert|alert)\s*\(/g;
const CARDINALITY_ACCESS = /[\w$.]+\.(?:length|size|count)\b/g;
const EXPRESSION_IDENTIFIER = /[A-Za-z_$][\w$]*/g;
const PERSONAL_DATA_SEGMENTS = new Set([
  "user",
  "users",
  "userid",
  "username",
  "session",
  "sessions",
  "email",
  "emails",
  "profile",
  "profiles",
  "token",
  "tokens",
  "jwt",
  "password",
  "credential",
  "credentials",
  "account",
  "accounts",
  "customer",
  "customers",
  "phone",
  "fullname",
  "firstname",
  "lastname",
  "identity",
  "claims",
]);

function callArgumentText(content: string, openParen: number): string {
  let depth = 0;
  const limit = Math.min(content.length, openParen + 600);
  for (let cursor = openParen; cursor < limit; cursor += 1) {
    const character = content[cursor];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return content.slice(openParen + 1, cursor);
    }
  }
  return content.slice(openParen + 1, limit);
}

/**
 * Removes string literals, and reduces template literals to their interpolated
 * expressions, so that a log message mentioning "user" without carrying a user
 * value cannot create a finding.
 */
function literalFreeExpression(text: string): string {
  return text
    .replace(/`(?:\\.|[^`\\])*`/g, (literal) =>
      [...literal.matchAll(/\$\{([^{}]*)\}/g)]
        .map((interpolation) => ` ${interpolation[1] ?? ""} `)
        .join(""),
    )
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ")
    .replace(CARDINALITY_ACCESS, " ");
}

function nameSegments(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

function isPersonalDataReference(name: string): boolean {
  // PascalCase names are components, types, and classes in browser source,
  // not personal-data values.
  if (/^[A-Z]/.test(name)) return false;
  const segments = nameSegments(name);
  return (
    PERSONAL_DATA_SEGMENTS.has(segments.join("")) ||
    segments.some((segment) => PERSONAL_DATA_SEGMENTS.has(segment))
  );
}

export function logsPersonalBrowserData(content: string): boolean {
  for (const call of content.matchAll(BROWSER_LOG_CALL)) {
    const openParen = (call.index ?? 0) + call[0].length - 1;
    const expression = literalFreeExpression(
      callArgumentText(content, openParen),
    );
    for (const identifier of expression.matchAll(EXPRESSION_IDENTIFIER)) {
      if (isPersonalDataReference(identifier[0])) return true;
    }
  }
  return false;
}

export function browserPersonalDataLogEvidence(
  index: signals.RepositoryIndex,
): EvidenceReference[] {
  return reachableBrowserFiles(index)
    .filter((file) => logsPersonalBrowserData(file.content))
    .slice(0, 4)
    .map((file) => ({ path: file.path, kind: "code" as const }));
}
