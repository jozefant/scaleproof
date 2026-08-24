import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/repository/types";

import { selectDeterministicActions } from "./actions";
import {
  browserDataBoundary,
  hasRealDataQuery,
  hasUnboundedDataQuery,
} from "./browser-data-boundary";
import { buildControlInventory } from "./control-inventory";
import { evaluateControls } from "./controls";
import { scoreAnalysis } from "./scoring";
import { createRepositoryIndex } from "./signals";
import type { CheckResult, ScanContext } from "./types";

const CONTEXT: ScanContext = {
  stage: "live_early",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

type SyntheticFile = { path: string; content: string };

function snapshot(files: SyntheticFile[]): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/browser-baas",
    sourceUrl: null,
    files: files.map((file) => ({ ...file, size: file.content.length })),
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: files.reduce(
        (total, file) => total + file.content.length,
        0,
      ),
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks: ["Node.js / TypeScript"],
    history: {
      source: "synthetic",
      availability: "available",
      repository: {
        scope: "Repository",
        sampledCommits: 24,
        attributedCommits: 24,
        activeContributors: 3,
        estimatedBusFactor: 2,
        topContributorShare: 45,
        sampleWindowDays: 90,
        band: "Moderate concentration",
      },
      modules: [],
      note: "Synthetic anonymous aggregate.",
    },
  };
}

function checksFor(files: SyntheticFile[]): CheckResult[] {
  return evaluateControls(snapshot(files), CONTEXT);
}

function byId(checks: CheckResult[], id: string): CheckResult {
  const check = checks.find((candidate) => candidate.id === id);
  expect(check, `missing ${id}`).toBeDefined();
  return check!;
}

function paths(check: CheckResult): string[] {
  return check.evidence.map((reference) => reference.path);
}

function replace(
  files: SyntheticFile[],
  path: string,
  content: string,
): SyntheticFile[] {
  return [...files.filter((file) => file.path !== path), { path, content }];
}

/**
 * A generated component-library file. It contains the word `select` many times
 * and no data client at all.
 */
const GENERATED_SELECT_COMPONENT: SyntheticFile = {
  path: "src/shared/ui/select.tsx",
  content: [
    'import * as React from "react";',
    'import * as SelectPrimitive from "@radix-ui/react-select";',
    'import { ChevronDown } from "lucide-react";',
    "",
    "const Select = SelectPrimitive.Root;",
    "const SelectGroup = SelectPrimitive.Group;",
    "const SelectValue = SelectPrimitive.Value;",
    "",
    "const SelectTrigger = React.forwardRef((props, ref) => (",
    "  <SelectPrimitive.Trigger ref={ref} {...props}>",
    "    <ChevronDown />",
    "  </SelectPrimitive.Trigger>",
    "));",
    "SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;",
    "",
    "export { Select, SelectGroup, SelectValue, SelectTrigger };",
  ].join("\n"),
};

const BROWSER_SHELL: SyntheticFile[] = [
  {
    path: "package.json",
    content:
      '{"name":"notes-app","dependencies":{"react":"19.0.0","react-dom":"19.0.0","@supabase/supabase-js":"2.45.0"},"devDependencies":{"vite":"6.0.0"}}',
  },
  {
    path: "vite.config.ts",
    content: "export default { build: { outDir: 'dist' } };",
  },
  {
    path: "index.html",
    content:
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  },
  {
    path: "src/main.tsx",
    content: 'import App from "./App"; export const mount = () => App();',
  },
  {
    path: "src/App.tsx",
    content: [
      'import Notes from "./pages/Notes";',
      'import Avatar from "./pages/Avatar";',
      'import Account from "./pages/Account";',
      'import { Select } from "./shared/ui/select";',
      "export default function App() { return [Notes(), Avatar(), Account(), Select]; }",
    ].join("\n"),
  },
  {
    path: "src/lib/supabase.ts",
    content: [
      'import { createClient } from "@supabase/supabase-js";',
      "export const supabase = createClient(",
      "  import.meta.env.VITE_SUPABASE_URL,",
      "  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,",
      ");",
    ].join("\n"),
  },
  GENERATED_SELECT_COMPONENT,
];

/** Reads and writes a table directly from the browser, filtered client-side. */
const NOTES_PAGE: SyntheticFile = {
  path: "src/pages/Notes.tsx",
  content: [
    'import { supabase } from "../lib/supabase";',
    "export default function Notes() { return null; }",
    "export async function loadNotes(user) {",
    '  const { data } = await supabase.from("notes").select("*").eq("user_id", user.id);',
    "  return data;",
    "}",
    "export async function saveNote(user, body) {",
    '  return supabase.from("notes").insert({ user_id: user.id, body });',
    "}",
    "export async function removeNote(id) {",
    '  return supabase.from("notes").delete().eq("id", id);',
    "}",
  ].join("\n"),
};

const AVATAR_PAGE: SyntheticFile = {
  path: "src/pages/Avatar.tsx",
  content: [
    'import { supabase } from "../lib/supabase";',
    "export default function Avatar() { return null; }",
    "export async function uploadAvatar(user, file) {",
    '  return supabase.storage.from("avatars").upload(user.id + "/avatar.png", file);',
    "}",
  ].join("\n"),
};

/** Generic error logging with no personal value flow. */
const ACCOUNT_PAGE: SyntheticFile = {
  path: "src/pages/Account.tsx",
  content: [
    'import { supabase } from "../lib/supabase";',
    "export default function Account() { return null; }",
    "export async function signOut() {",
    "  const { error } = await supabase.auth.signOut();",
    '  if (error) console.error("Failed to sign the user out of the account", error);',
    "}",
  ].join("\n"),
};

const BROWSER_BAAS_APP: SyntheticFile[] = [
  ...BROWSER_SHELL,
  NOTES_PAGE,
  AVATAR_PAGE,
  ACCOUNT_PAGE,
];

const COVERING_POLICY: SyntheticFile = {
  path: "supabase/migrations/20240101120000_notes_policies.sql",
  content: [
    "alter table public.notes enable row level security;",
    'create policy "notes are owner readable" on public.notes',
    "  for select using (auth.uid() = user_id);",
    'create policy "notes are owner writable" on public.notes',
    "  for insert with check (auth.uid() = user_id);",
    'create policy "avatars are owner writable" on storage.objects',
    "  for insert with check (bucket_id = 'avatars' and auth.uid() = owner);",
  ].join("\n"),
};

const UNRELATED_POLICY: SyntheticFile = {
  path: "supabase/migrations/20240101120000_billing_policies.sql",
  content: [
    "alter table public.invoices enable row level security;",
    'create policy "invoices are owner readable" on public.invoices',
    "  for select using (auth.uid() = user_id);",
  ].join("\n"),
};

describe("direct browser-to-BaaS data boundary", () => {
  it("records the categorical client-data boundary from reachable browser code", () => {
    const boundary = browserDataBoundary(
      createRepositoryIndex(snapshot(BROWSER_BAAS_APP)),
    );

    expect(boundary).toMatchObject({
      browserBundle: true,
      directDataAccess: true,
      authClient: true,
      tableRead: true,
      tableMutation: true,
      storageMutation: true,
      clientIdentityPredicate: true,
      accessedResources: ["bucket:avatars", "table:notes"],
      policyResources: [],
      policyCoversAccessedResources: false,
    });
    expect(paths({ evidence: boundary.clientEvidence } as CheckResult)).toEqual(
      expect.arrayContaining(["src/pages/Notes.tsx", "src/pages/Avatar.tsx"]),
    );
    expect(boundary.clientEvidence.map((item) => item.path)).not.toContain(
      GENERATED_SELECT_COMPONENT.path,
    );
  });

  it("treats a client identity predicate as an evidence gap, not server-side authorization", () => {
    const checks = checksFor(BROWSER_BAAS_APP);
    const boundary = byId(checks, "security.client-data-boundary");

    expect(boundary).toMatchObject({
      domain: "security",
      outcome: "unknown",
      evidenceTier: "absent",
      severity: "high",
      remediationCode: "harden-auth-boundary",
    });
    expect(paths(boundary)).toContain("src/pages/Notes.tsx");
    expect(boundary.summary).toContain("not server-side authorization");
    expect(boundary.summary).toContain("missing repository evidence");
    // The only permitted mention of deployment state is the explicit denial.
    expect(boundary.summary).toContain(
      "not a finding that the deployed policy is absent or broken",
    );
    expect(boundary.summary).not.toMatch(
      /(?<!not a finding that the )deployed policy is (?:absent|missing|broken)|\bno row-level security is enforced\b|\brow-level security is disabled\b/i,
    );
    // Client session and role state must never be read as an enforcement point.
    expect(byId(checks, "security.authorization").outcome).not.toBe("pass");
    expect(buildControlInventory(checks).length).toBe(checks.length);
  });

  it("attributes matching versioned policy evidence safely", () => {
    const checks = checksFor([...BROWSER_BAAS_APP, COVERING_POLICY]);
    const boundary = byId(checks, "security.client-data-boundary");

    expect(boundary).toMatchObject({
      outcome: "pass",
      evidenceTier: "enforced",
    });
    expect(paths(boundary)).toContain(COVERING_POLICY.path);
    expect(boundary.summary).toContain(
      "does not prove that the deployed project applies it",
    );
  });

  it("keeps the gap when versioned policy evidence covers a different resource", () => {
    const checks = checksFor([...BROWSER_BAAS_APP, UNRELATED_POLICY]);
    const boundary = byId(checks, "security.client-data-boundary");

    expect(boundary).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
    expect(boundary.summary).toContain(
      "none of them covers every accessed resource",
    );
    expect(paths(boundary)).toContain(UNRELATED_POLICY.path);
  });

  it("is not applicable without a direct browser data call", () => {
    const authOnly = replace(
      BROWSER_BAAS_APP.filter(
        (file) =>
          file.path !== NOTES_PAGE.path && file.path !== AVATAR_PAGE.path,
      ),
      "src/App.tsx",
      [
        'import Account from "./pages/Account";',
        'import { Select } from "./shared/ui/select";',
        "export default function App() { return [Account(), Select]; }",
      ].join("\n"),
    );
    const boundary = byId(
      checksFor(authOnly),
      "security.client-data-boundary",
    );

    expect(boundary).toMatchObject({
      outcome: "not_applicable",
      evidenceTier: "absent",
      evidence: [],
    });
    expect(boundary.summary).toContain("authentication client");
  });
});

describe("browser logging of session and personal data", () => {
  it("reports a session log in reachable browser code as a privacy finding", () => {
    const files = replace(
      BROWSER_BAAS_APP,
      "src/pages/Account.tsx",
      [
        'import { supabase } from "../lib/supabase";',
        "export default function Account() { return null; }",
        "export async function restore() {",
        "  const { data } = await supabase.auth.getSession();",
        '  console.log("restored session", data.session);',
        "  return data;",
        "}",
      ].join("\n"),
    );
    const logging = byId(checksFor(files), "security.browser-data-logging");

    expect(logging).toMatchObject({
      domain: "security",
      outcome: "fail",
      evidenceTier: "enforced",
      severity: "medium",
      remediationCode: "separate-log-types",
    });
    expect(paths(logging)).toEqual(["src/pages/Account.tsx"]);
  });

  it("reports an interpolated email value in a browser log", () => {
    const files = replace(
      BROWSER_BAAS_APP,
      "src/pages/Account.tsx",
      [
        'import { supabase } from "../lib/supabase";',
        "export default function Account() { return null; }",
        "export async function greet(session) {",
        "  console.info(`signed in as ${session.user.email}`);",
        "}",
      ].join("\n"),
    );

    expect(
      byId(checksFor(files), "security.browser-data-logging").outcome,
    ).toBe("fail");
  });

  it("does not treat generic error logging or UI components as personal-data leakage", () => {
    const files = replace(
      BROWSER_BAAS_APP,
      "src/pages/Notes.tsx",
      [
        'import { supabase } from "../lib/supabase";',
        "export default function Notes() { return null; }",
        "export async function loadNotes(user) {",
        '  const { data, error } = await supabase.from("notes").select("*").eq("user_id", user.id).limit(50);',
        '  if (error) console.error("Failed to load the user profile and session", error);',
        "  console.debug(`loaded ${data.length} rows`);",
        "  return data;",
        "}",
      ].join("\n"),
    );
    const logging = byId(checksFor(files), "security.browser-data-logging");

    expect(logging).toMatchObject({
      outcome: "pass",
      evidenceTier: "inferred",
      evidence: [],
    });
    expect(logging.summary).toContain("without a matching value flow");
  });

  it("is not applicable to a repository with no browser bundle", () => {
    const serverOnly = [
      {
        path: "package.json",
        content: '{"name":"api","dependencies":{"express":"4.19.0"}}',
      },
      {
        path: "src/server.ts",
        content: [
          'import express from "express";',
          "const app = express();",
          "app.get('/health', (_request, response) => {",
          "  console.log('health check for user session', request.user);",
          "  response.json({ ok: true });",
          "});",
          "app.listen(3000);",
        ].join("\n"),
      },
    ];

    expect(
      byId(checksFor(serverOnly), "security.browser-data-logging"),
    ).toMatchObject({ outcome: "not_applicable", evidenceTier: "absent" });
  });
});

describe("real data queries versus generated select components", () => {
  it("keeps a real unbounded client SDK query eligible for a bounded-query finding", () => {
    const database = byId(
      checksFor(BROWSER_BAAS_APP),
      "saas.database-discipline",
    );

    expect(database.outcome).toBe("fail");
    expect(paths(database)).toContain("src/pages/Notes.tsx");
    expect(paths(database)).not.toContain(GENERATED_SELECT_COMPONENT.path);
  });

  it("clears the bounded-query finding when the client SDK query is bounded", () => {
    const files = replace(
      BROWSER_BAAS_APP,
      "src/pages/Notes.tsx",
      [
        'import { supabase } from "../lib/supabase";',
        "export default function Notes() { return null; }",
        "export async function loadNotes(user) {",
        '  const { data } = await supabase.from("notes").select("*").eq("user_id", user.id).range(0, 49);',
        "  return data;",
        "}",
      ].join("\n"),
    );

    expect(
      byId(checksFor(files), "saas.database-discipline").outcome,
    ).not.toBe("fail");
  });

  it("does not let a generated select component create a database or tenant finding", () => {
    const files = [
      ...BROWSER_SHELL.filter((file) => file.path !== "src/App.tsx"),
      {
        path: "src/App.tsx",
        content: [
          'import { Select } from "./shared/ui/select";',
          'import Filters from "./pages/Filters";',
          "export default function App() { return [Select, Filters()]; }",
        ].join("\n"),
      },
      {
        path: "src/pages/Filters.tsx",
        content: [
          'import { Select } from "../shared/ui/select";',
          "export default function Filters() {",
          "  const account_id = window.location.hash;",
          "  return [Select, account_id];",
          "}",
        ].join("\n"),
      },
      {
        path: "db/migrations/001_init.sql",
        content:
          "create table notes(id uuid, account_id uuid); create index notes_account on notes(account_id);",
      },
    ];
    const checks = checksFor(files);

    expect(byId(checks, "saas.database-discipline").outcome).not.toBe("fail");
    expect(byId(checks, "saas.tenant-isolation").outcome).not.toBe("fail");
    for (const check of checks) {
      expect(paths(check), check.id).not.toContain(
        GENERATED_SELECT_COMPONENT.path,
      );
    }
  });

  it("still recognizes a real unbounded SQL statement", () => {
    const files = [
      ...BROWSER_SHELL.filter((file) => file.path !== "src/App.tsx"),
      {
        path: "src/App.tsx",
        content: [
          'import Report from "./pages/Report";',
          "export default function App() { return Report(); }",
        ].join("\n"),
      },
      {
        path: "src/pages/Report.tsx",
        content: [
          "export default function Report() { return null; }",
          "export const everyNote = 'SELECT id, body FROM notes';",
          "export const label = 'Please select an option from the list';",
        ].join("\n"),
      },
      {
        path: "db/migrations/001_init.sql",
        content: "create table notes(id uuid); create index notes_id on notes(id);",
      },
    ];

    const database = byId(checksFor(files), "saas.database-discipline");
    expect(database.outcome).toBe("fail");
    expect(paths(database)).toContain("src/pages/Report.tsx");
  });
});

/**
 * The query grammar must separate real SQL and real data-client calls from UI
 * noise WITHOUT losing real SQL. Each row below is pinned: the positive forms
 * were all detected by the previous bare-keyword detector and must stay
 * detected; the negative forms are the reason the grammar exists.
 */
describe("real-query grammar", () => {
  it.each([
    ["a count aggregate", "select count(*) from users"],
    ["an uppercase aggregate", "SELECT MAX(created_at) FROM events"],
    [
      "a grouped aggregate beside a column",
      "select tenant_id, count(*) from rows group by tenant_id",
    ],
    ["a multi-argument function", "select coalesce(a, b), c from t"],
    ["an array aggregate", "select array_agg(id) from t"],
    ["a nested aggregate", "select count(distinct user_id) from sessions"],
    ["a parenthesised expression", "select (a + b) as s from t"],
    ["unparenthesised arithmetic", "select a + b from t"],
    ["a CASE term", "select case when a then 1 else 2 end as v from t"],
    ["a cast", "SELECT a::text FROM t"],
    [
      "an escaped newline inside a single-line string",
      'const query = "SELECT *\\nFROM users";',
    ],
    ["a template-literal table name", "const q = `select * from ${table}`;"],
    [
      "multi-line template SQL",
      "const q = `\n  SELECT id, email\n  FROM users\n  WHERE tenant_id = $1\n`;",
    ],
    ["a join", "SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id"],
    ["qualified columns with an alias", "select u.id, u.name from users u"],
    ["distinct", "SELECT DISTINCT email FROM users"],
    ["JPQL", '@Query("select o from Order o where o.tenantId = :t")'],
    ["a subquery", "select * from (select id from t) x"],
    ["explicit AS aliases", "select a as x, b as y from t"],
    [
      "a Python driver call",
      'cur.execute("SELECT * FROM users WHERE tenant_id = %s")',
    ],
    ["SQL after a comment line", "-- daily rollup\nselect id from events"],
  ])("recognizes %s", (_name, form) => {
    expect(hasRealDataQuery(form), form).toBe(true);
    expect(hasUnboundedDataQuery(form), form).toBe(true);
  });

  it.each([
    ["a generated select component", GENERATED_SELECT_COMPONENT.content],
    [
      "a DOM select element",
      '<select name="country" className="w-full"><option>SK</option></select>',
    ],
    [
      "a DOM select with a mapped option list",
      "<select multiple>{items.map((i) => <option key={i}>{i}</option>)}</select>",
    ],
    ["prose", "Please select an option from the list"],
    ["placeholder copy", 'const label = "Select a fruit from the menu";'],
    [
      "a UI component with handlers",
      "<Select onValueChange={(value) => field.onChange(value)} defaultValue={field.value}>",
    ],
    [
      "a placeholder mentioning an account",
      '<SelectValue placeholder="Select a workspace from your account" />',
    ],
    ["a comment", "// select the record from the cache before the API call"],
    [
      "a component-library import",
      'import { Select, SelectContent } from "@/ui/select";',
    ],
    [
      "a multi-line component-library import",
      'import {\n  Select,\n  SelectTrigger,\n} from "@/ui/select";',
    ],
    ["a default component import", 'import Select from "react-select";'],
    ["a re-export", 'export { Select as Root } from "./select";'],
    ["a component prop type", "export type SelectProps = { onSelect: (v: string) => void };"],
  ])("does not treat %s as a query", (_name, form) => {
    expect(hasRealDataQuery(form), form).toBe(false);
    expect(hasUnboundedDataQuery(form), form).toBe(false);
  });

  it("still distinguishes bounded from unbounded SQL", () => {
    expect(hasUnboundedDataQuery("SELECT * FROM users LIMIT 20")).toBe(false);
    expect(hasRealDataQuery("SELECT * FROM users LIMIT 20")).toBe(true);
    expect(hasUnboundedDataQuery("select count(*) from users")).toBe(true);
  });

  it("recognizes a bounded and an unbounded client SDK query", () => {
    const client = 'import { createClient } from "@supabase/supabase-js";';
    expect(
      hasUnboundedDataQuery(`${client} supabase.from("notes").select("*")`),
    ).toBe(true);
    expect(
      hasUnboundedDataQuery(
        `${client} supabase.from("notes").select("*").limit(10)`,
      ),
    ).toBe(false);
    expect(
      hasUnboundedDataQuery(
        `${client} supabase.from("notes").select("*").range(0, 49)`,
      ),
    ).toBe(false);
  });
});

describe("resource identity across providers", () => {
  it("keeps storage buckets and tables in separate namespaces", () => {
    const files = [
      ...BROWSER_SHELL.filter((file) => file.path !== "src/App.tsx"),
      {
        path: "src/App.tsx",
        content:
          'import Docs from "./pages/Docs"; export default function App() { return Docs(); }',
      },
      {
        path: "src/pages/Docs.tsx",
        content: [
          'import { supabase } from "../lib/supabase";',
          "export default function Docs() { return null; }",
          "export async function upload(file) {",
          '  return supabase.storage.from("notes").upload("a.png", file);',
          "}",
        ].join("\n"),
      },
      {
        // A row-level-security policy on a TABLE called `notes` must not be
        // read as coverage for a BUCKET called `notes`.
        path: "supabase/migrations/20240101120000_notes.sql",
        content: [
          "alter table public.notes enable row level security;",
          'create policy "notes are owner readable" on public.notes',
          "  for select using (auth.uid() = user_id);",
        ].join("\n"),
      },
    ];
    const boundary = browserDataBoundary(createRepositoryIndex(snapshot(files)));

    expect(boundary.accessedResources).toEqual(["bucket:notes"]);
    expect(boundary.policyResources).toEqual(["table:notes"]);
    expect(boundary.uncoveredResources).toEqual(["bucket:notes"]);
    expect(
      byId(checksFor(files), "security.client-data-boundary").outcome,
    ).toBe("unknown");
  });

  it("collects document-API collection names so policy coverage can be reached", () => {
    const files = [
      ...BROWSER_SHELL.filter(
        (file) =>
          file.path !== "src/App.tsx" && file.path !== "src/lib/supabase.ts",
      ),
      {
        path: "package.json",
        content:
          '{"name":"docs-app","dependencies":{"react":"19.0.0","appwrite":"14.0.0"},"devDependencies":{"vite":"6.0.0"}}',
      },
      {
        path: "src/App.tsx",
        content:
          'import Docs from "./pages/Docs"; export default function App() { return Docs(); }',
      },
      {
        path: "src/pages/Docs.tsx",
        content: [
          'import { Client, Databases } from "appwrite";',
          "const databases = new Databases(new Client());",
          "export default function Docs() { return null; }",
          "export async function list() {",
          '  return databases.listDocuments(DATABASE_ID, "notes");',
          "}",
          "export async function add(body) {",
          '  return databases.createDocument(DATABASE_ID, "notes", "unique()", { body });',
          "}",
        ].join("\n"),
      },
    ];
    const withoutPolicy = browserDataBoundary(
      createRepositoryIndex(snapshot(files)),
    );

    expect(withoutPolicy.accessedResources).toEqual(["table:notes"]);
    expect(withoutPolicy.policyCoversAccessedResources).toBe(false);

    const covered = [
      ...files,
      {
        path: "firestore.rules",
        content: [
          "service cloud.firestore {",
          "  match /databases/{database}/documents {",
          "    match /notes/{noteId} {",
          "      allow read, write: if request.auth.uid == resource.data.userId;",
          "    }",
          "  }",
          "}",
        ].join("\n"),
      },
    ];
    const boundary = browserDataBoundary(
      createRepositoryIndex(snapshot(covered)),
    );

    expect(boundary.policyResources).toContain("table:notes");
    expect(boundary.policyCoversAccessedResources).toBe(true);
    expect(
      byId(checksFor(covered), "security.client-data-boundary").outcome,
    ).toBe("pass");
  });
});

describe("public evidence surface for browser data findings", () => {
  it("keeps every new finding to path, kind, and deterministic summary", () => {
    const files = replace(
      BROWSER_BAAS_APP,
      "src/pages/Account.tsx",
      [
        'import { supabase } from "../lib/supabase";',
        "export default function Account() { return null; }",
        "export async function restore() {",
        "  const { data } = await supabase.auth.getSession();",
        '  console.log("restored session", data.session);',
        "  return data;",
        "}",
      ].join("\n"),
    );
    const checks = checksFor(files);

    for (const id of [
      "security.client-data-boundary",
      "security.browser-data-logging",
      "saas.database-discipline",
    ]) {
      const check = byId(checks, id);
      for (const reference of check.evidence) {
        expect(Object.keys(reference).sort(), id).toEqual(["kind", "path"]);
      }
      // No source text, snippet, or repository identifier in the summary.
      expect(check.summary, id).not.toMatch(
        /supabase\.|console\.|\.eq\(|user_id|synthetic\/browser-baas|src\//,
      );
    }
    const score = scoreAnalysis(checks, snapshot(files));
    expect(score.verdict).toBeTruthy();
    expect(
      selectDeterministicActions(checks, CONTEXT.growthTarget).length,
    ).toBeGreaterThan(0);
  });
});
