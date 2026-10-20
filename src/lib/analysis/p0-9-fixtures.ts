import type { RepositorySnapshot } from "@/lib/repository/types";

import type { ScanContext } from "./types";

/**
 * P0.9 synthetic external-provider fixtures.
 *
 * Two placements of the same product shape - a React/Vite browser client in
 * front of Supabase Edge Functions that turn text into an audio file:
 *
 * - `EXPOSED_PROVIDER_FILES`: the blind spot. A provider SDK imported with
 *   `npm:`, a client built from an environment credential, `verify_jwt = false`,
 *   wildcard CORS from a shared module, request-body logging, a public storage
 *   bucket, and no bound on anything.
 * - `HARDENED_PROVIDER_FILES`: the same product with the boundary closed. The
 *   request handler verifies identity, checks a quota, parses a bounded schema
 *   and enqueues work; a scheduled worker makes the provider call with a
 *   timeout, an idempotency key, and an output ceiling; generated objects have
 *   an expiry and a retention job.
 *
 * `RUNTIME_CLAIM_FILES` is the exposed placement plus an operations note saying
 * the rate limit and retention rule live in the provider dashboard. It exists to
 * prove the third state: a runtime-only claim is neither enforcement evidence
 * nor a finding that the control fails.
 *
 * Nothing here is copied from a real repository. No fixture contains a real
 * credential, host, or vendor endpoint.
 */
export const P0_9_CONTEXT: ScanContext = {
  stage: "scaling_production",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

/* ---------------------------------------------------------------------- */
/* Shared browser client                                                   */
/* ---------------------------------------------------------------------- */

const BROWSER_CLIENT: Array<{ path: string; content: string }> = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "voice-notes",
        private: true,
        scripts: { build: "vite build" },
        dependencies: { react: "19.0.0", "react-dom": "19.0.0", zod: "3.23.8" },
        devDependencies: { vite: "5.4.0" },
      },
      null,
      2,
    ),
  },
  {
    // The alias lives in the bundler configuration, not in `tsconfig.json`,
    // which is how a Vite application is normally wired.
    path: "vite.config.ts",
    content: [
      'import path from "node:path";',
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      '  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },',
      "});",
    ].join("\n"),
  },
  {
    path: "tsconfig.json",
    content: [
      "{",
      "  // Vite owns the alias; this file only sets compiler options.",
      '  "compilerOptions": { "target": "ES2022", "jsx": "react-jsx" },',
      "}",
    ].join("\n"),
  },
  {
    path: "src/main.tsx",
    content: [
      'import { Recorder } from "@/features/recorder";',
      "",
      "export function App() {",
      "  return Recorder;",
      "}",
    ].join("\n"),
  },
  {
    // The browser calls the function through the platform client, so the
    // fixture isolates the edge boundary rather than mixing in a separate
    // browser-side external-client finding.
    path: "src/features/recorder.tsx",
    content: [
      "export async function Recorder(client, text) {",
      '  const { data } = await client.functions.invoke("voice-note", { body: { text } });',
      "  return data;",
      "}",
    ].join("\n"),
  },
];

/* ---------------------------------------------------------------------- */
/* Exposed placement                                                       */
/* ---------------------------------------------------------------------- */

export const EXPOSED_PROVIDER_FILES: Array<{ path: string; content: string }> = [
  ...BROWSER_CLIENT,
  {
    path: "supabase/config.toml",
    content: ['project_id = "voice-notes"', "", "[functions.voice-note]", "verify_jwt = false"].join("\n"),
  },
  {
    path: "supabase/functions/_shared/cors.ts",
    content: [
      "export const corsHeaders = {",
      '  "Access-Control-Allow-Origin": "*",',
      '  "Access-Control-Allow-Headers": "authorization, content-type",',
      "};",
    ].join("\n"),
  },
  {
    path: "supabase/functions/voice-note/index.ts",
    content: [
      'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
      'import { VoiceLab } from "npm:@voicelab/speech-sdk@2";',
      "",
      'import { corsHeaders } from "../_shared/cors.ts";',
      "",
      'const voice = new VoiceLab({ apiKey: Deno.env.get("VOICE_API_KEY") });',
      "",
      "Deno.serve(async (request) => {",
      '  console.log("voice-note request", request.body);',
      "  const { text } = await request.json();",
      "  const audio = await voice.textToSpeech.convert(text);",
      "  const bucket = createClient(",
      '    Deno.env.get("SUPABASE_URL"),',
      '    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),',
      '  ).storage.from("voice-notes");',
      '  const name = crypto.randomUUID() + ".mp3";',
      "  await bucket.upload(name, audio);",
      "  const { data } = bucket.getPublicUrl(name);",
      "  return new Response(JSON.stringify({ url: data.publicUrl }), { headers: corsHeaders });",
      "});",
    ].join("\n"),
  },
  {
    path: "supabase/migrations/20240101_voice_notes.sql",
    content: [
      "create table voice_notes (",
      "  id uuid primary key default gen_random_uuid(),",
      "  owner uuid not null,",
      "  audio_path text not null,",
      "  created_at timestamptz not null default now()",
      ");",
      "",
      "insert into storage.buckets (id, name, public)",
      "values ('voice-notes', 'voice-notes', true);",
    ].join("\n"),
  },
  {
    path: "README.md",
    content: "# Voice notes\n\nA browser client and one Supabase Edge Function.\n",
  },
];

/**
 * The exposed placement plus a documented claim about deployed state. The
 * repository still contains no guard; it now contains a sentence saying the
 * provider dashboard has one.
 */
export const RUNTIME_CLAIM_FILES: Array<{ path: string; content: string }> = [
  ...EXPOSED_PROVIDER_FILES,
  {
    path: "docs/operations.md",
    content: [
      "# Operations",
      "",
      "Rate limits for the speech provider are configured in the provider dashboard.",
      "The audio retention rule is configured in the storage provider dashboard.",
    ].join("\n"),
  },
];

/* ---------------------------------------------------------------------- */
/* Hardened placement                                                      */
/* ---------------------------------------------------------------------- */

export const HARDENED_PROVIDER_FILES: Array<{ path: string; content: string }> = [
  ...BROWSER_CLIENT,
  {
    path: "supabase/config.toml",
    content: [
      'project_id = "voice-notes"',
      "",
      "[functions.voice-note]",
      "verify_jwt = true",
      "",
      "[functions.render-worker]",
      "verify_jwt = true",
    ].join("\n"),
  },
  {
    path: "supabase/functions/_shared/cors.ts",
    content: [
      "export const corsHeaders = {",
      '  "Access-Control-Allow-Origin": "https://app.example.invalid",',
      '  "Access-Control-Allow-Headers": "authorization, content-type",',
      "};",
    ].join("\n"),
  },
  {
    // The request handler. It never calls the provider: it verifies identity,
    // enforces a quota, parses a bounded schema, and enqueues the work.
    path: "supabase/functions/voice-note/index.ts",
    content: [
      'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
      'import { z } from "npm:zod@3";',
      "",
      'import { corsHeaders } from "../_shared/cors.ts";',
      "",
      "const requestSchema = z.object({ text: z.string().max(2000) });",
      "",
      "Deno.serve(async (request) => {",
      '  const declared = Number(request.headers.get("content-length") ?? 0);',
      "  if (declared > 4096) {",
      '    return new Response("payload too large", { status: 413, headers: corsHeaders });',
      "  }",
      "  const supabase = createClient(",
      '    Deno.env.get("SUPABASE_URL"),',
      '    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),',
      "  );",
      "  const { data: { user } } = await supabase.auth.getUser();",
      '  if (!user || user.app_metadata.role !== "member") {',
      '    return new Response("forbidden", { status: 403, headers: corsHeaders });',
      "  }",
      '  const quota = await supabase.rpc("check_rate_limit", { caller: user.id });',
      "  if (!quota.data.allowed) {",
      '    return new Response("rate limit reached", { status: 429, headers: corsHeaders });',
      "  }",
      "  const body = requestSchema.parse(await request.json());",
      '  await supabase.from("render_jobs").insert({ owner: user.id, text: body.text });',
      "  return new Response(JSON.stringify({ queued: true }), { status: 202, headers: corsHeaders });",
      "});",
    ].join("\n"),
  },
  {
    // The background worker. It owns the provider call, its timeout, its
    // idempotency key, and its output ceiling.
    path: "supabase/functions/render-worker/index.ts",
    content: [
      'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";',
      "",
      'import { corsHeaders } from "../_shared/cors.ts";',
      "",
      'Deno.cron("render-worker", "*/5 * * * *", async () => {',
      "  const supabase = createClient(",
      '    Deno.env.get("SUPABASE_URL"),',
      '    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),',
      "  );",
      '  const jobs = await supabase.from("render_jobs").select("id, owner, text").limit(20);',
      "  for (const job of jobs.data) {",
      "    const text = job.text.slice(0, 2000);",
      '    const audio = await fetch("https://speech.provider.invalid/v1/render", {',
      '      method: "POST",',
      "      headers: {",
      '        Authorization: "Bearer " + Deno.env.get("VOICE_API_KEY"),',
      '        "idempotency-key": job.id,',
      "      },",
      "      body: JSON.stringify({ text, max_output_tokens: 400 }),",
      "      signal: AbortSignal.timeout(20000),",
      "    });",
      '    const name = job.id + ".mp3";',
      '    const bucket = supabase.storage.from("voice-notes");',
      "    await bucket.upload(name, await audio.arrayBuffer());",
      "    const { data } = bucket.getPublicUrl(name);",
      '    await supabase.from("render_jobs").update({ audio_url: data.publicUrl, expires_at: expiresAt }).eq("owner", job.owner);',
      "  }",
      "  return new Response(null, { status: 204, headers: corsHeaders });",
      "});",
      "",
      'Deno.cron("audio-retention", "0 3 * * *", async () => {',
      "  const supabase = createClient(",
      '    Deno.env.get("SUPABASE_URL"),',
      '    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),',
      "  );",
      '  const stale = await supabase.from("render_jobs").select("id").lt("expires_at", new Date().toISOString());',
      '  await supabase.storage.from("voice-notes").remove(stale.data.map((row) => row.id + ".mp3"));',
      "});",
    ].join("\n"),
  },
  {
    path: "supabase/migrations/20240101_voice_notes.sql",
    content: [
      "create table render_jobs (",
      "  id uuid primary key default gen_random_uuid(),",
      "  owner uuid not null,",
      "  text text not null,",
      "  audio_url text,",
      "  expires_at timestamptz not null default now() + interval '30 days',",
      "  created_at timestamptz not null default now()",
      ");",
      "",
      "create index render_jobs_owner on render_jobs (owner);",
      "",
      "alter table render_jobs enable row level security;",
      "",
      "create policy render_jobs_owner_read on render_jobs",
      "  for select using (auth.uid() = owner);",
      "",
      "create table rate_limit_counters (",
      "  owner uuid primary key,",
      "  window_started_at timestamptz not null,",
      "  request_count integer not null default 0",
      ");",
      "",
      "insert into storage.buckets (id, name, public)",
      "values ('voice-notes', 'voice-notes', true);",
    ].join("\n"),
  },
  {
    path: "README.md",
    content: "# Voice notes\n\nA browser client, one request handler, and one scheduled worker.\n",
  },
];

/* ---------------------------------------------------------------------- */
/* Server-enforcement placements                                           */
/* ---------------------------------------------------------------------- */

/**
 * Weak evidence for authorization and validation: an `Authorization` request
 * header being forwarded, a comment promising a check, packages in the manifest,
 * and a browser-only role branch with a browser-only form schema.
 */
export const WEAK_ENFORCEMENT_FILES: Array<{ path: string; content: string }> = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "documents",
        private: true,
        dependencies: { next: "16.0.0", react: "19.0.0", zod: "3.23.8", "@casl/ability": "6.7.1" },
      },
      null,
      2,
    ),
  },
  {
    path: "src/app/api/documents/route.ts",
    content: [
      'import { NextResponse } from "next/server";',
      "",
      "export async function POST(request) {",
      "  // TODO: add a role check and validate the body with the shared schema.",
      '  const authorization = request.headers.get("authorization");',
      "  const body = await request.json();",
      '  const upstream = await fetch(documentsUrl, { headers: { authorization }, body: JSON.stringify(body) });',
      "  return NextResponse.json(await upstream.json());",
      "}",
    ].join("\n"),
  },
  {
    path: "src/app/page.tsx",
    content: [
      'import { documentSchema } from "./schema";',
      "",
      "export default function Page(props) {",
      '  if (props.user.role !== "admin") return null;',
      "  const form = useForm({ resolver: zodResolver(documentSchema) });",
      "  return form;",
      "}",
    ].join("\n"),
  },
  {
    path: "src/app/schema.ts",
    content: [
      'import { z } from "zod";',
      "",
      "export const documentSchema = z.object({ title: z.string().max(200) });",
    ].join("\n"),
  },
];

/** The same product with real server-side enforcement in the handler. */
export const SERVER_ENFORCEMENT_FILES: Array<{ path: string; content: string }> = [
  WEAK_ENFORCEMENT_FILES[0]!,
  {
    path: "src/app/api/documents/route.ts",
    content: [
      'import { NextResponse } from "next/server";',
      'import { documentSchema } from "@/app/schema";',
      "",
      "export async function POST(request) {",
      "  const { data: { user } } = await supabase.auth.getUser();",
      '  if (!user || user.app_metadata.role !== "editor") {',
      '    return NextResponse.json({ error: "forbidden" }, { status: 403 });',
      "  }",
      "  const body = documentSchema.parse(await request.json());",
      '  await supabase.from("documents").insert({ owner: user.id, title: body.title });',
      "  return NextResponse.json({ ok: true });",
      "}",
    ].join("\n"),
  },
  {
    path: "src/app/schema.ts",
    content: [
      'import { z } from "zod";',
      "",
      "export const documentSchema = z.object({ title: z.string().max(200) });",
    ].join("\n"),
  },
  {
    path: "tsconfig.json",
    content: '{ "compilerOptions": { "paths": { "@/*": ["src/*"] } } }',
  },
];

/* ---------------------------------------------------------------------- */
/* Reachability diagnostics                                                */
/* ---------------------------------------------------------------------- */

/**
 * A configured bundler alias that resolves, beside a local import that does
 * not. The unresolved specifier is what the internal diagnostics must name and
 * the public report must never contain.
 */
export const UNRESOLVED_IMPORT_FILES: Array<{ path: string; content: string }> = [
  BROWSER_CLIENT[1]!,
  {
    path: "src/main.tsx",
    content: [
      'import { Recorder } from "@/features/recorder";',
      'import { Waveform } from "./widgets/waveform-preview";',
      "",
      "export const App = [Recorder, Waveform];",
    ].join("\n"),
  },
  BROWSER_CLIENT[4]!,
];

export function p0_9Snapshot(
  files: Array<{ path: string; content: string }>,
  detectedStacks: string[] = ["Node.js / TypeScript"],
): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/p0-9",
    sourceUrl: null,
    files: files.map((file) => ({ ...file, size: file.content.length })),
    coverage: {
      discoveredRelevantFiles: files.length,
      processedRelevantFiles: files.length,
      skippedBinaryFiles: 0,
      skippedOversizedFiles: 0,
      unprocessedRelevantFiles: 0,
      processedTextBytes: files.reduce((total, file) => total + file.content.length, 0),
      durationMs: 1,
      partial: false,
      limitsCrossed: [],
    },
    detectedStacks,
    history: {
      source: "synthetic",
      availability: "unavailable",
      repository: {
        scope: "Repository",
        sampledCommits: 0,
        attributedCommits: 0,
        activeContributors: 0,
        estimatedBusFactor: null,
        topContributorShare: null,
        band: "Insufficient evidence",
      },
      modules: [],
      note: "Synthetic fixture.",
    },
  };
}
