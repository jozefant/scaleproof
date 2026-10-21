import { describe, expect, it } from "vitest";

import {
  mandatoryRemediationCodes,
  selectDeterministicActions,
} from "./actions";
import { buildControlInventory } from "./control-inventory";
import { evaluateControls } from "./controls";
import {
  edgeFunctionBoundaries,
  providerCallSignals,
  providerSurface,
} from "./external-provider";
import { classifyFileRole, isProductionExecutionFile } from "./file-roles";
import {
  EXPOSED_PROVIDER_FILES,
  HARDENED_PROVIDER_FILES,
  P0_9_CONTEXT,
  RUNTIME_CLAIM_FILES,
  SERVER_ENFORCEMENT_FILES,
  UNRESOLVED_IMPORT_FILES,
  WEAK_ENFORCEMENT_FILES,
  p0_9Snapshot,
} from "./p0-9-fixtures";
import { createRepositoryIndex, sourceReachabilityDiagnostics } from "./signals";
import type { CheckResult, GrowthTarget } from "./types";

/**
 * P0.9 - external-provider evidence and security false positives.
 *
 * The seam under test is a whole synthetic repository through
 * `evaluateControls` and deterministic action selection. Three placements of one
 * product shape carry the argument: the exposed edge function, the same product
 * with a documented runtime-only claim, and the same product hardened. Two
 * further placements isolate authorization and validation enforcement.
 *
 * The provider-call detector is exercised directly with a table of shapes,
 * because the rule under test is *shape, not vendor*: no assertion here names a
 * real provider, and the detector must never need one.
 *
 * The public-report half of the acceptance runs one layer up, in
 * `src/lib/application/p0-9-report.test.ts`.
 */

function analyze(files: Array<{ path: string; content: string }>) {
  const repository = p0_9Snapshot(files);
  const index = createRepositoryIndex(repository);
  const checks = evaluateControls(repository, P0_9_CONTEXT);
  const find = (id: string): CheckResult => {
    const check = checks.find((candidate) => candidate.id === id);
    expect(check, `missing ${id}`).toBeDefined();
    return check!;
  };
  return {
    index,
    checks,
    find,
    actions: selectDeterministicActions(checks, P0_9_CONTEXT.growthTarget),
    mandatory: mandatoryRemediationCodes(checks),
  };
}

const exposed = () => analyze(EXPOSED_PROVIDER_FILES);
const hardened = () => analyze(HARDENED_PROVIDER_FILES);
const runtimeClaim = () => analyze(RUNTIME_CLAIM_FILES);

/* ---------------------------------------------------------------------- */
/* 1. Provider-call detection is a shape, not a vendor list                 */
/* ---------------------------------------------------------------------- */

const PROVIDER_CALL_FORMS: Array<[string, string]> = [
  [
    "npm SDK import with a provider credential",
    'import { Speech } from "npm:@vendor/speech-sdk@2";\nconst c = new Speech(Deno.env.get("VENDOR_API_KEY"));',
  ],
  [
    "jsr SDK import with a provider credential",
    'import { Speech } from "jsr:@vendor/speech";\nconst key = Deno.env.get("VENDOR_API_KEY");',
  ],
  [
    "esm.sh SDK import with a provider credential",
    'import Vendor from "https://esm.sh/vendor-sdk@1";\nconst key = Deno.env.get("VENDOR_TOKEN");',
  ],
  [
    "deno.land/x module with a provider credential",
    'import Vendor from "https://deno.land/x/vendor@1.0.0/mod.ts";\nconst k = Deno.env.get("VENDOR_SECRET");',
  ],
  [
    "unpkg module with a provider credential",
    'import Vendor from "https://unpkg.com/vendor-sdk";\nconst k = Deno.env.get("PARTNER_API_KEY");',
  ],
  [
    "skypack module with a provider credential",
    'import Vendor from "https://cdn.skypack.dev/vendor-sdk";\nconst k = Deno.env.get("PARTNER_KEY");',
  ],
  ["absolute fetch URL", 'await fetch("https://api.vendor.invalid/v1/render");'],
  [
    "absolute fetch URL in a template literal",
    "await fetch(`https://api.vendor.invalid/v1/${id}`);",
  ],
  ["axios post to an absolute URL", 'await axios.post("https://api.vendor.invalid/v1");'],
  ["ky post to an absolute URL", 'await ky.post("https://api.vendor.invalid/v1");'],
  ["got request to an absolute URL", 'await got("https://api.vendor.invalid/v1");'],
  [
    "fetch to a configured Deno endpoint",
    'await fetch(Deno.env.get("PROVIDER_API_URL"));',
  ],
  [
    "fetch to a configured Node endpoint",
    "await fetch(process.env.PROVIDER_ENDPOINT);",
  ],
  [
    "client constructed with a Deno API key",
    'const client = new VendorClient({ apiKey: Deno.env.get("VENDOR_KEY") });',
  ],
  [
    "client constructed with a Node api_key",
    "const client = new Vendor({ api_key: process.env.VENDOR_KEY });",
  ],
  [
    "factory client constructed with an access token",
    'const client = createVendorClient({ accessToken: Deno.env.get("VENDOR_TOKEN") });',
  ],
  [
    "initializer client constructed with a credential",
    "const client = initVendorSdk({ credential: process.env.VENDOR_CREDENTIAL });",
  ],
  [
    "client constructed with an auth token",
    'const client = new Client({ auth_token: Deno.env.get("PARTNER_TOKEN") });',
  ],
  [
    "bearer authorization header built from the environment",
    'const headers = { Authorization: "Bearer " + Deno.env.get("VENDOR_KEY") };',
  ],
  [
    "x-api-key header from the environment",
    'const headers = { "x-api-key": Deno.env.get("VENDOR_KEY") };',
  ],
  [
    "vendor-specific api key header from the environment",
    'const headers = { "xi-api-key": process.env.VOICE_KEY };',
  ],
  [
    "template bearer header from the environment",
    "const headers = { authorization: `Bearer ${process.env.VENDOR_TOKEN}` };",
  ],
];

const NON_PROVIDER_FORMS: Array<[string, string]> = [
  ["npm utility import with no credential", 'import { z } from "npm:zod@3";'],
  [
    "platform data client import and platform credential",
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";\nconst c = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));',
  ],
  [
    "standard library import",
    'import { serve } from "https://deno.land/std@0.168.0/http/server.ts";',
  ],
  ["relative fetch path", 'await fetch("/api/notes");'],
  [
    "fetch to the project's own platform URL",
    "await fetch(`${SUPABASE_URL}/rest/v1/notes`);",
  ],
  [
    "fetch to the project's own platform host",
    'await fetch("https://project.supabase.co/rest/v1/notes");',
  ],
  ["fetch with a bare variable target", "await fetch(endpoint, { method: 'POST' });"],
  [
    "commented-out provider client",
    '// const client = new VendorClient({ apiKey: Deno.env.get("VENDOR_KEY") });',
  ],
  [
    "cors allow-headers listing authorization",
    'const headers = { "Access-Control-Allow-Headers": "authorization, content-type" };',
  ],
  [
    "reading the incoming authorization header",
    'const authorization = request.headers.get("authorization");',
  ],
  ["URL construction", 'const url = new URL("https://docs.vendor.invalid/guide");'],
  ["response construction", "return new Response(JSON.stringify(body), { headers });"],
  ["local map construction", "const cache = new Map();"],
  [
    "documentation prose about an api key",
    "The provider api key is stored in deployment secrets.",
  ],
];

describe("P0.9 external-provider calls are recognized by shape", () => {
  it.each(PROVIDER_CALL_FORMS)("recognizes %s", (_name, source) => {
    expect(providerCallSignals(source).length).toBeGreaterThan(0);
  });

  it.each(NON_PROVIDER_FORMS)("does not recognize %s", (_name, source) => {
    expect(providerCallSignals(source)).toEqual([]);
  });

  it("does not read a remote module import in browser code as a provider call", () => {
    const source =
      'import Vendor from "https://esm.sh/vendor-sdk@1";\nconst k = Deno.env.get("VENDOR_TOKEN");';
    expect(providerCallSignals(source, { runtimeModules: false })).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- */
/* 2. The exposed Edge Function boundary                                   */
/* ---------------------------------------------------------------------- */

describe("P0.9 exposed Edge Function provider call", () => {
  it("classifies an Edge Function as reachable production execution", () => {
    const { index } = exposed();
    const entry = index.files.find(
      (file) => file.normalizedPath === "supabase/functions/voice-note/index.ts",
    )!;

    expect(classifyFileRole(entry.normalizedPath, entry.content)).toBe("production");
    expect(isProductionExecutionFile(index, entry)).toBe(true);
  });

  it("recognizes the SDK import and credentialed client without a vendor list", () => {
    const { index } = exposed();
    const [boundary] = edgeFunctionBoundaries(index);

    expect(boundary?.providerSignals.sort()).toEqual([
      "credentialed_client",
      "runtime_package_import",
    ]);
    // The wildcard CORS header lives in the shared module the function imports.
    expect(boundary?.files.map((file) => file.path)).toEqual([
      "supabase/functions/voice-note/index.ts",
      "supabase/functions/_shared/cors.ts",
    ]);
    expect(boundary?.wildcardCors).toBe(true);
    expect(boundary?.jwtDisabled).toBe(true);
    expect(boundary?.requestLogging).toBe(true);
  });

  it("reports a concrete critical boundary failure with the existing evidence locations", () => {
    const { find } = exposed();
    const boundary = find("security.edge-function-boundary");

    expect(boundary).toMatchObject({
      outcome: "fail",
      evidenceTier: "enforced",
      severity: "critical",
      remediationCode: "harden-auth-boundary",
    });
    expect(boundary.evidence).toEqual([
      { path: "supabase/functions/voice-note/index.ts", kind: "code" },
      { path: "supabase/config.toml", kind: "configuration" },
    ]);
    // No source text reaches the finding.
    expect(JSON.stringify(boundary)).not.toContain("VOICE_API_KEY");
    expect(JSON.stringify(boundary)).not.toContain("Access-Control-Allow-Origin");
  });

  it("makes harden-auth-boundary mandatory and first, ahead of every growth-target preference", () => {
    const { checks, mandatory } = exposed();
    expect(mandatory.has("harden-auth-boundary")).toBe(true);

    const targets: GrowthTarget[] = [
      "users_10x",
      "users_100x",
      "engineering_team",
      "users_and_team",
      "unknown",
      "withheld",
    ];
    for (const target of targets) {
      const actions = selectDeterministicActions(checks, target);
      expect(actions[0]?.remediationCode, target).toBe("harden-auth-boundary");
    }
  });

  it("keeps each disabling condition sufficient on its own", () => {
    const withoutLoggingOrWildcard = EXPOSED_PROVIDER_FILES.map((file) =>
      file.path === "supabase/functions/_shared/cors.ts"
        ? { ...file, content: file.content.replace('"*"', '"https://app.example.invalid"') }
        : file.path === "supabase/functions/voice-note/index.ts"
          ? {
              ...file,
              content: file.content.replace(
                '  console.log("voice-note request", request.body);\n',
                "",
              ),
            }
          : file,
    );
    // Only `verify_jwt = false` remains.
    expect(analyze(withoutLoggingOrWildcard).find("security.edge-function-boundary")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });

    const wildcardOnly = withoutLoggingOrWildcard.map((file) =>
      file.path === "supabase/config.toml"
        ? { ...file, content: file.content.replace("verify_jwt = false", "verify_jwt = true") }
        : file.path === "supabase/functions/_shared/cors.ts"
          ? { ...file, content: file.content.replace('"https://app.example.invalid"', '"*"') }
          : file,
    );
    expect(analyze(wildcardOnly).find("security.edge-function-boundary")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });

    const loggingOnly = withoutLoggingOrWildcard.map((file) =>
      file.path === "supabase/config.toml"
        ? { ...file, content: file.content.replace("verify_jwt = false", "verify_jwt = true") }
        : file.path === "supabase/functions/voice-note/index.ts"
          ? {
              ...file,
              content: file.content.replace(
                "Deno.serve(async (request) => {",
                'Deno.serve(async (request) => {\n  console.log("voice-note request", request.body);',
              ),
            }
          : file,
    );
    expect(analyze(loggingOnly).find("security.edge-function-boundary")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });
  });

  it("passes the boundary for the hardened placement", () => {
    const { find, mandatory } = hardened();

    expect(find("security.edge-function-boundary")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
    expect(mandatory.has("harden-auth-boundary")).toBe(false);
  });

  it("stays not applicable when no Edge Function exists", () => {
    expect(analyze(SERVER_ENFORCEMENT_FILES).find("security.edge-function-boundary")).toMatchObject({
      outcome: "not_applicable",
    });
  });
});

/* ---------------------------------------------------------------------- */
/* 3. Authorization and validation require server-side enforcement         */
/* ---------------------------------------------------------------------- */

function handlerSnapshot(body: string, extra: Array<{ path: string; content: string }> = []) {
  return analyze([
    { path: "package.json", content: '{"name":"items"}' },
    {
      path: "src/app/api/items/route.ts",
      content: [
        'import { NextResponse } from "next/server";',
        "",
        "export async function POST(request) {",
        body,
        "  return NextResponse.json({ ok: true });",
        "}",
      ].join("\n"),
    },
    ...extra,
  ]);
}

/**
 * An Express application whose handler body is supplied by the caller, plus any
 * modules it imports. The placement of the check is the variable under test:
 * the same enforcement must be recognized inline, in a route module, in a
 * helper module, and in a middleware module.
 */
function expressSnapshot(
  handlerBody: string,
  imports = "",
  modules: Array<{ path: string; content: string }> = [],
) {
  return analyze([
    {
      path: "package.json",
      content:
        '{"name":"items","dependencies":{"express":"4.21.0","zod":"3.23.8","casbin":"5.0.0","accesscontrol":"2.2.1"}}',
    },
    {
      path: "src/server.ts",
      content: [
        'import express from "express";',
        imports,
        "",
        "const app = express();",
        'app.post("/items", async (req, res) => {',
        handlerBody,
        "  res.json({ ok: true });",
        "});",
        "app.listen(3000);",
      ].join("\n"),
    },
    ...modules,
  ]);
}

const PERMISSION_GUARD_MODULE = [
  "export function guard(req) {",
  '  if (!hasRole(req.user, "admin")) throw new Error("forbidden");',
  "}",
].join("\n");

/**
 * Where a genuine permission check may live. Every one of these is the reachable
 * production call graph of the same Express entry point; only the file that
 * holds the check moves. A filename-shaped server-surface test dropped the last
 * two, which are two of the most common Express layouts.
 */
const AUTHORIZATION_PLACEMENTS: Array<[string, string, Array<{ path: string; content: string }>]> = [
  ["inline in the server entry", "", []],
  [
    "a route module",
    'import { guard } from "./routes/items";',
    [{ path: "src/routes/items.ts", content: PERMISSION_GUARD_MODULE }],
  ],
  [
    "a helper module",
    'import { guard } from "./lib/authz";',
    [{ path: "src/lib/authz.ts", content: PERMISSION_GUARD_MODULE }],
  ],
  [
    "a middleware module",
    'import { guard } from "./middleware/auth";',
    [{ path: "src/middleware/auth.ts", content: PERMISSION_GUARD_MODULE }],
  ],
];

const AUTHORIZATION_ENFORCEMENT: Array<[string, string]> = [
  ["a role helper", '  if (!hasRole(user, "admin")) return NextResponse.json({}, { status: 403 });'],
  ["a permission requirement", '  await requirePermission(session, "items:write");'],
  ["a session role comparison", '  if (session.user.role !== "editor") throw new Error("forbidden");'],
  ["an ability check", '  if (!ability.can("update", "Item")) return NextResponse.json({}, { status: 403 });'],
  ["a claims permission list", '  const allowed = claims.permissions.includes("items:write");'],
  ["a principal role list", '  if (!principal.roles.includes("admin")) return null;'],
  ["a policy enforcer", '  await enforcer.enforce(user.id, "items", "write");'],
  ["an explicit permission check", '  const decision = await checkPermission(actor, "items");'],
  ["provider app metadata", '  if (user.app_metadata.role === "owner") { }'],
  ["a scope list", '  if (scopes.includes("items.write")) { }'],
  ["an authority check", '  if (!hasAuthority("ITEMS_WRITE")) return null;'],
  ["an ownership assertion", '  assertPermission(caller, "items", record.owner);'],
  ["an admin flag condition", "  if (!user.isAdmin) return NextResponse.json({}, { status: 403 });"],
  ["a session admin flag condition", "  if (!session.user.isAdmin) return NextResponse.json({}, { status: 403 });"],
  ["a request admin flag condition", "  if (!req.user.isAdmin) return NextResponse.json({}, { status: 403 });"],
  ["a role compared with a constant", '  if (session.user.role !== Role.Editor) throw new Error("forbidden");'],
  ["an admin flag guard expression", "  const allowed = user.isAdmin && record.ownerId === user.id;"],
  ["a permission set lookup", '  if (!token.permissions.has("items:write")) return null;'],
];

const NON_AUTHORIZATION_FORMS: Array<[string, string]> = [
  ["a forwarded authorization header", '  const authorization = request.headers.get("authorization");'],
  ["a comment promising a check", "  // authorization: only admins may call this endpoint"],
  ["a log line mentioning authorization", '  logger.info("authorization complete");'],
  ["a role-shaped string constant", '  const roles = "admin,editor";'],
  ["a documentation path", '  const permissionsDoc = "docs/permissions.md";'],
  ["an rbac word in a variable name", "  const rbacMigrationPending = true;"],
  ["a role returned in a response", "  return NextResponse.json({ role: user.role });"],
  ["a role written to a log", '  console.log("caller role", session.role);'],
  ["permissions copied into a variable", "  const permissions = claims.permissions;"],
  ["an admin flag serialized", "  const body = { isAdmin: user.isAdmin, scopes: token.scopes };"],
];

describe("P0.9 security.authorization requires an enforceable server operation", () => {
  it.each(AUTHORIZATION_ENFORCEMENT)("passes on %s", (_name, body) => {
    expect(handlerSnapshot(body).find("security.authorization")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it.each(NON_AUTHORIZATION_FORMS)("does not pass on %s", (_name, body) => {
    expect(handlerSnapshot(body).find("security.authorization")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it.each(AUTHORIZATION_PLACEMENTS)(
    "recognizes the same permission check in %s",
    (_name, imports, modules) => {
      const body = modules.length === 0
        ? '  if (!hasRole(req.user, "admin")) return res.status(403).json({});'
        : "  guard(req);";
      const authorization = expressSnapshot(body, imports, modules).find(
        "security.authorization",
      );

      expect(authorization).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });
      const evidencePath = modules[0]?.path ?? "src/server.ts";
      expect(authorization.evidence.map((reference) => reference.path)).toContain(
        evidencePath,
      );
    },
  );

  it("does not reach a helper module that no server root imports", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"items","dependencies":{"express":"4.21.0"}}' },
      {
        path: "src/server.ts",
        content: 'import express from "express";\nconst app = express();\napp.listen(3000);',
      },
      { path: "src/lib/authz.ts", content: PERMISSION_GUARD_MODULE },
    ]);

    expect(find("security.authorization")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("keeps every weak form failing in the same Express shape", () => {
    const weakForms: Array<[string, string]> = [
      ["a forwarded authorization header", "  const authorization = req.headers.authorization;"],
      ["a comment", "  // authorization: only admins may call this endpoint"],
      ["a log line", '  logger.info("authorization complete");'],
    ];
    for (const [name, body] of weakForms) {
      expect(expressSnapshot(body).find("security.authorization"), name).toMatchObject({
        outcome: "unknown",
        evidenceTier: "absent",
      });
    }
    // Authorization packages are declared in the manifest of every case above;
    // a dependency manifest is never a server-graph root.
    expect(expressSnapshot("  res.set('x-checked', '1');").find("security.authorization")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("passes on a framework annotation in server code", () => {
    const { find } = analyze([
      { path: "pom.xml", content: "<project><artifactId>items</artifactId></project>" },
      {
        path: "src/main/java/com/acme/ItemController.java",
        content:
          '@RestController public class ItemController {\n  @PreAuthorize("hasRole(\'ADMIN\')")\n  public void create() { }\n}',
      },
    ]);
    expect(find("security.authorization")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it("accepts a versioned policy with an identity predicate as inferred evidence", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"items"}' },
      {
        path: "supabase/migrations/20240101_policies.sql",
        content:
          "alter table items enable row level security;\ncreate policy items_owner on items for select using (auth.uid() = owner);",
      },
    ]);
    expect(find("security.authorization")).toMatchObject({
      outcome: "pass",
      evidenceTier: "inferred",
    });
  });

  it("does not accept a policy without an identity predicate", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"items"}' },
      {
        path: "supabase/migrations/20240101_policies.sql",
        content: "create policy items_all on items for select using (true);",
      },
    ]);
    expect(find("security.authorization")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not pass from dependency names or browser-only role display", () => {
    const { find } = analyze(WEAK_ENFORCEMENT_FILES);
    expect(find("security.authorization")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("passes for a handler-level identity and permission check", () => {
    const { find } = analyze(SERVER_ENFORCEMENT_FILES);
    const authorization = find("security.authorization");

    expect(authorization).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });
    expect(authorization.evidence.map((reference) => reference.path)).toEqual([
      "src/app/api/documents/route.ts",
    ]);
  });
});

const VALIDATION_BINDING: Array<[string, string]> = [
  ["a schema parse", "  const body = itemSchema.parse(await request.json());"],
  ["a safe parse", "  const parsed = itemSchema.safeParse(await request.json());"],
  ["an async parse", "  const body = await itemSchema.parseAsync(await request.json());"],
  ["a validator call", "  const value = payloadValidator.validate(await request.json());"],
  ["a class-validator rejection", "  await validateOrReject(dto);"],
  ["a validation pipe", "  const pipe = new ValidationPipe({ whitelist: true });"],
  ["an express-validator result", "  const errors = validationResult(request);"],
  ["a body parse binding", "  const body = requestBody.parse(await request.json());"],
];

const NON_VALIDATION_FORMS: Array<[string, string]> = [
  ["a plain JSON parse", "  const body = JSON.parse(raw);"],
  ["a comment promising validation", "  // validate the body with the shared zod schema"],
  ["a search-parameter read", "  const query = request.nextUrl.searchParams;"],
  ["a schema import with no parse", '  const schema = "documented in docs/schema.md";'],
];

/**
 * A bound parse is a parse call on a request-derived value. The receiver's
 * *name* is not part of the rule: `const s = z.object(...); s.parse(req.body)`
 * validates the request whatever the author called the schema.
 */
const REQUEST_BOUND_PARSE_FORMS: Array<[string, string]> = [
  [
    "a single-letter schema variable",
    "  const s = z.object({ title: z.string() });\n  const value = s.parse(req.body);",
  ],
  [
    "a capitalized schema variable",
    "  const Item = z.object({ title: z.string() });\n  const value = Item.parse(req.body);",
  ],
  [
    "a schema-named variable",
    "  const itemSchema = z.object({ title: z.string() });\n  const value = itemSchema.parse(req.body);",
  ],
  [
    "a safe parse",
    "  const s = z.object({ title: z.string() });\n  const value = s.safeParse(req.body);",
  ],
  [
    "a parse of the awaited request body",
    "  const s = z.object({ title: z.string() });\n  const value = s.parse(await req.json());",
  ],
];

const NON_VALIDATION_PARSE_FORMS: Array<[string, string]> = [
  ["a JSON parse of the request body", "  const value = JSON.parse(req.body);"],
  ["a JSON parse of a local string", "  const value = JSON.parse(raw);"],
  ["a YAML parse of a file", "  const value = yaml.parse(fileText);"],
  ["a date parse", "  const when = Date.parse(stamp);"],
  ["a path parse", "  const parts = path.parse(fileName);"],
];

describe("P0.9 security.validation requires a bound parse in a reachable server handler", () => {
  it.each(REQUEST_BOUND_PARSE_FORMS)(
    "passes on %s regardless of the variable name",
    (_name, body) => {
      expect(expressSnapshot(body).find("security.validation")).toMatchObject({
        outcome: "pass",
        evidenceTier: "enforced",
      });
    },
  );

  it.each(NON_VALIDATION_PARSE_FORMS)("does not pass on %s", (_name, body) => {
    expect(expressSnapshot(body).find("security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not pass from a validation package declared in the manifest alone", () => {
    expect(
      expressSnapshot("  res.set('x-checked', '1');").find("security.validation"),
    ).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });
  });

  it.each(VALIDATION_BINDING)("passes on %s", (_name, body) => {
    expect(handlerSnapshot(body).find("security.validation")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it.each(NON_VALIDATION_FORMS)("does not pass on %s", (_name, body) => {
    expect(handlerSnapshot(body).find("security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("passes on a Java annotation and a Python model binding", () => {
    expect(
      analyze([
        { path: "pom.xml", content: "<project><artifactId>items</artifactId></project>" },
        {
          path: "src/main/java/com/acme/ItemController.java",
          content:
            "@RestController public class ItemController {\n  public void create(@Valid ItemRequest request) { }\n}",
        },
      ]).find("security.validation"),
    ).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });

    expect(
      analyze([
        { path: "pyproject.toml", content: "[project]\nname = 'items'" },
        {
          path: "api/items.py",
          content: "class ItemIn(BaseModel):\n    title: str\n",
        },
      ]).find("security.validation"),
    ).toMatchObject({ outcome: "pass", evidenceTier: "enforced" });
  });

  it("does not pass from a declared package or browser-only form validation", () => {
    const { find } = analyze(WEAK_ENFORCEMENT_FILES);
    expect(find("security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not pass from a schema module that no reachable handler parses", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"items"}' },
      { path: "src/main.ts", content: 'import "./schema"; export const app = true;' },
      {
        path: "src/schema.ts",
        content: 'import { z } from "zod";\nexport const itemSchema = z.object({ title: z.string() });',
      },
    ]);
    expect(find("security.validation")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("passes for a bounded handler parse", () => {
    const { find } = analyze(SERVER_ENFORCEMENT_FILES);
    expect(find("security.validation")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });
});

/* ---------------------------------------------------------------------- */
/* 4. Slow work and failure safety cover Edge Function provider calls      */
/* ---------------------------------------------------------------------- */

describe("P0.9 Edge Function provider calls reach the request-path controls", () => {
  it("never classifies missing timeout, limit, or abuse evidence as not applicable", () => {
    const { find } = exposed();

    for (const id of [
      "saas.slow-work",
      "saas.failure-safety",
      "security.provider-abuse-guard",
      "security.provider-io-bounds",
      "res.generated-object-lifecycle",
    ]) {
      expect(find(id).outcome, id).not.toBe("not_applicable");
    }
  });

  it("reports the synchronous provider call and the missing timeout", () => {
    const { find } = exposed();

    expect(find("saas.slow-work")).toMatchObject({ outcome: "fail" });
    expect(find("saas.slow-work").evidence.map((reference) => reference.path)).toContain(
      "supabase/functions/voice-note/index.ts",
    );
    expect(find("saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });
    expect(find("saas.failure-safety").evidence.map((reference) => reference.path)).toContain(
      "supabase/functions/voice-note/index.ts",
    );
  });

  it("passes both controls when the provider call is deferred, bounded, and retry-safe", () => {
    const { find } = hardened();

    expect(find("saas.slow-work")).toMatchObject({ outcome: "pass" });
    expect(find("saas.failure-safety")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it("stays not applicable when the repository has no external work at all", () => {
    const { find } = analyze(SERVER_ENFORCEMENT_FILES);
    expect(find("saas.slow-work")).toMatchObject({ outcome: "not_applicable" });
    expect(find("saas.failure-safety")).toMatchObject({ outcome: "not_applicable" });
  });
});

/* ---------------------------------------------------------------------- */
/* 5. Repository evidence for abuse and public generated objects           */
/* ---------------------------------------------------------------------- */

describe("P0.9 provider abuse and public-object lifecycle evidence", () => {
  it("reports missing repository evidence without asserting deployed state", () => {
    const { find } = exposed();
    const abuse = find("security.provider-abuse-guard");
    const bounds = find("security.provider-io-bounds");
    const lifecycle = find("res.generated-object-lifecycle");

    for (const check of [abuse, bounds, lifecycle]) {
      expect(check, check.id).toMatchObject({ outcome: "unknown", evidenceTier: "absent" });
      // Missing evidence is never a concrete failure.
      expect(check.outcome, check.id).not.toBe("fail");
    }
    // The summaries say what the repository cannot see, and claim nothing else.
    expect(abuse.summary).toContain("outside repository evidence");
    expect(lifecycle.summary).toContain("outside repository evidence");
    for (const check of [abuse, bounds, lifecycle]) {
      expect(check.summary, check.id).not.toMatch(
        /\b(?:no rate limit is deployed|row-level security is disabled|billing is unlimited|throughput)\b/i,
      );
    }
    // The evidence that establishes applicability is a safe path.
    expect(abuse.evidence.map((reference) => reference.path)).toEqual([
      "supabase/functions/voice-note/index.ts",
    ]);
    expect(lifecycle.evidence.map((reference) => reference.path)).toEqual([
      "supabase/functions/voice-note/index.ts",
      "supabase/migrations/20240101_voice_notes.sql",
    ]);
  });

  it("separates a documented deployed-state claim as runtime-only", () => {
    const { find } = runtimeClaim();

    expect(find("security.provider-abuse-guard")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
    expect(find("res.generated-object-lifecycle")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "runtime_only",
    });
    expect(
      find("security.provider-abuse-guard").evidence.map((reference) => reference.path),
    ).toEqual(["docs/operations.md"]);
    // A dashboard note is not enforcement, so it earns no positive credit.
    expect(find("security.provider-abuse-guard").outcome).not.toBe("pass");
  });

  it("verifies repository-defined guards, bounds, and retention", () => {
    const { find } = hardened();

    expect(find("security.provider-abuse-guard")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
    expect(find("security.provider-io-bounds")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
    expect(find("res.generated-object-lifecycle")).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
  });

  it("stays not applicable without a provider call or a public generated object", () => {
    const { find } = analyze(SERVER_ENFORCEMENT_FILES);

    expect(find("security.provider-abuse-guard")).toMatchObject({ outcome: "not_applicable" });
    expect(find("security.provider-io-bounds")).toMatchObject({ outcome: "not_applicable" });
    expect(find("res.generated-object-lifecycle")).toMatchObject({ outcome: "not_applicable" });
  });

  it("requires both object creation and credential-free exposure", () => {
    const privateBucket = EXPOSED_PROVIDER_FILES.map((file) =>
      file.path === "supabase/functions/voice-note/index.ts"
        ? {
            ...file,
            content: file.content
              .replace("bucket.getPublicUrl(name)", "bucket.createSignedUrl(name, 600)")
              .replace("data.publicUrl", "data.signedUrl"),
          }
        : file.path === "supabase/migrations/20240101_voice_notes.sql"
          ? { ...file, content: file.content.split("insert into storage.buckets")[0]! }
          : file,
    );
    expect(analyze(privateBucket).find("res.generated-object-lifecycle")).toMatchObject({
      outcome: "not_applicable",
    });
  });

  it("reconciles control metadata for every placement", () => {
    for (const files of [
      EXPOSED_PROVIDER_FILES,
      RUNTIME_CLAIM_FILES,
      HARDENED_PROVIDER_FILES,
      WEAK_ENFORCEMENT_FILES,
      SERVER_ENFORCEMENT_FILES,
    ]) {
      expect(() => buildControlInventory(analyze(files).checks)).not.toThrow();
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 6. Reachability diagnostics                                             */
/* ---------------------------------------------------------------------- */

describe("P0.9 stack and reachability diagnostics", () => {
  it("resolves a bundler alias declared outside tsconfig", () => {
    const { index } = exposed();
    const diagnostics = sourceReachabilityDiagnostics(index);

    expect(diagnostics.entryPoints).toEqual([
      "src/main.tsx",
      "supabase/functions/voice-note/index.ts",
    ]);
    expect(diagnostics.reachablePaths).toContain("src/features/recorder.tsx");
    expect(diagnostics.unresolvedLocalImports).toEqual([]);
    expect(diagnostics.incomplete).toBe(false);
  });

  it("names an unresolved local import in internal diagnostics only", () => {
    const index = createRepositoryIndex(p0_9Snapshot(UNRESOLVED_IMPORT_FILES));
    const diagnostics = sourceReachabilityDiagnostics(index);

    expect(diagnostics.unresolvedLocalImports).toEqual([
      { from: "src/main.tsx", specifier: "./widgets/waveform-preview" },
    ]);
    expect(diagnostics.incomplete).toBe(true);
    // The alias still resolves beside the unresolved relative import.
    expect(diagnostics.reachablePaths).toContain("src/features/recorder.tsx");

    // The unresolved specifier never reaches a check result.
    const checks = evaluateControls(p0_9Snapshot(UNRESOLVED_IMPORT_FILES), P0_9_CONTEXT);
    expect(JSON.stringify(checks)).not.toContain("waveform-preview");
  });

  it("keeps the Edge Function inside the reachable production surface", () => {
    const { index } = exposed();
    const surface = providerSurface(index);

    expect(surface.providerCall).toBe(true);
    expect(surface.providerFiles.map((file) => file.path)).toEqual([
      "supabase/functions/voice-note/index.ts",
    ]);
    expect(surface.publicObject).toBe(true);
  });
});

describe("shared edge-function module names", () => {
  it("does not abort the scan for a shared module name with regular-expression characters", () => {
    const files = [
      ...EXPOSED_PROVIDER_FILES,
      { path: "supabase/functions/_shared/cors(v2.ts", content: "export const x = 1;\n" },
    ];
    expect(() => analyze(files)).not.toThrow();
  });

  it("matches a dot in a shared module name as a literal dot", () => {
    const files = EXPOSED_PROVIDER_FILES.map((file) =>
      file.path === "supabase/functions/_shared/cors.ts"
        ? { ...file, path: "supabase/functions/_shared/cors.v2.ts" }
        : file.path === "supabase/functions/voice-note/index.ts"
          ? { ...file, content: file.content.replace(/_shared\/cors(\.ts)?/, "_shared/corsXv2.ts") }
          : file,
    );
    const [boundary] = edgeFunctionBoundaries(createRepositoryIndex(p0_9Snapshot(files)));
    expect(boundary?.files.map((file) => file.path)).toEqual([
      "supabase/functions/voice-note/index.ts",
    ]);
  });
});
