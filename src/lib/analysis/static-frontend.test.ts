import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/repository/types";

import { selectDeterministicActions } from "./actions";
import { evaluateControls } from "./controls";
import { buildControlInventory } from "./control-inventory";
import { createRepositoryIndex } from "./signals";
import { staticFrontendProfile } from "./static-frontend";
import type { CheckResult, ScanContext } from "./types";

const CONTEXT: ScanContext = {
  stage: "live_early",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

const SERVER_RUNTIME_CONTROL_IDS = [
  "rel.stateless",
  "rel.database-foundations",
  "rel.failure-controls",
  "rel.health-lifecycle",
  "rel.async-work",
  "rel.load-tests",
  "rel.ha-path",
  "rel.actual-capacity",
  "ops.observability",
  "ops.structured-logging",
  "ops.alerting",
  "ops.runbook",
  "security.authentication",
  "security.authorization",
  "saas.stateless-tier",
  "saas.database-discipline",
  "saas.slow-work",
  "saas.failure-safety",
  "saas.observability",
  "saas.tenant-isolation",
] as const;

const BACKEND_SCALE_REMEDIATION_CODES = [
  "add-load-path",
  "define-ha-path",
  "remove-request-state",
  "add-failure-controls",
  "add-observability",
  "add-backup-restore",
  "harden-auth-boundary",
  "separate-log-types",
];

function snapshot(
  files: Array<{ path: string; content: string }>,
): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/static-frontend",
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

const STATIC_LANDING_PAGE = [
  {
    path: "package.json",
    content:
      '{"name":"studio-site","dependencies":{"react":"19.0.0","react-dom":"19.0.0"},"devDependencies":{"vite":"6.0.0"}}',
  },
  {
    path: "vite.config.ts",
    content: "export default { build: { outDir: 'dist' } };",
  },
  {
    path: "index.html",
    content:
      '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  },
  {
    path: "src/main.tsx",
    content:
      'import App from "./App"; export const mount = () => App();',
  },
  {
    path: "src/App.tsx",
    content:
      'import Hero from "./sections/Hero"; import ContactForm from "./sections/ContactForm"; export default function App() { return [Hero(), ContactForm()]; }',
  },
  {
    path: "src/sections/Hero.tsx",
    content: [
      'const heroImage = "https://images.unsplash.com/photo-1521737604893?auto=format&w=1600";',
      'const partnerLogo = "https://cdn.brandfetch.io/acme/logo";',
      "export default function Hero() {",
      '  return `<section><img src="https://images.unsplash.com/photo-1499951360447" alt="studio" />',
      '  <a href="https://www.linkedin.com/company/studio">Follow us</a>',
      '  <a href="https://studio.example.org/handbook.pdf">Handbook</a>',
      "  </section>`;",
      "}",
    ].join("\n"),
  },
  {
    path: "src/sections/ContactForm.tsx",
    content: [
      "export default function ContactForm() {",
      "  return `<form>",
      '    <input name="email" placeholder="Work email" />',
      '    <textarea name="message"></textarea>',
      '    <button type="submit">Send</button>',
      "  </form>`;",
      "}",
    ].join("\n"),
  },
];

function checksFor(
  files: Array<{ path: string; content: string }>,
  context: ScanContext = CONTEXT,
): CheckResult[] {
  return evaluateControls(snapshot(files), context);
}

function byId(checks: CheckResult[], id: string): CheckResult {
  const check = checks.find((candidate) => candidate.id === id);
  expect(check, `missing ${id}`).toBeDefined();
  return check!;
}

describe("static frontend evidence profile", () => {
  it("classifies a browser bundle without a backend as a static frontend", () => {
    const profile = staticFrontendProfile(
      createRepositoryIndex(snapshot(STATIC_LANDING_PAGE)),
    );

    expect(profile).toMatchObject({
      browserBundle: true,
      serverSurface: false,
      persistenceClient: false,
      outboundData: false,
      submissionPath: false,
      staticOnly: true,
    });
  });

  it("does not fail runtime-configuration or database and external-work controls for a static landing page", () => {
    const checks = checksFor(STATIC_LANDING_PAGE);

    expect(byId(checks, "saas.config-boundary")).toMatchObject({
      outcome: "not_applicable",
      evidenceTier: "absent",
      evidence: [],
    });
    for (const id of SERVER_RUNTIME_CONTROL_IDS) {
      expect(byId(checks, id), id).toMatchObject({
        outcome: "not_applicable",
        evidenceTier: "absent",
      });
    }
    for (const id of [
      "res.backup-restore",
      "res.rpo-rto",
      "res.encryption",
      "res.restore-recency",
    ]) {
      expect(byId(checks, id).outcome, id).not.toBe("fail");
    }
    expect(checks.filter((check) => check.outcome === "fail").map((check) => check.id))
      .toEqual(["quality.form-completeness"]);
    expect(buildControlInventory(checks).length).toBe(checks.length);
  });

  it("reports the inert form as product completeness without claiming a backend", () => {
    const checks = checksFor(STATIC_LANDING_PAGE);
    const form = byId(checks, "quality.form-completeness");

    expect(form).toMatchObject({
      domain: "quality",
      outcome: "fail",
      evidenceTier: "inferred",
      severity: "medium",
      remediationCode: "complete-submission-path",
      evidence: [{ path: "src/sections/ContactForm.tsx", kind: "code" }],
    });
    expect(form.summary).toContain("product-completeness signal");
    expect(form.summary).toContain("no path out of the browser");
    expect(form.summary).toContain(
      "establishes nothing about data handling, authentication, or resilience",
    );
    for (const check of checks) {
      expect(check.summary, check.id).not.toMatch(
        /\b(?:the|a|its|this) (?:deployed |existing )?(?:backend|api server|database) (?:is|handles|stores|receives)\b/i,
      );
    }
  });

  it("keeps founder actions relevant to a static product shape", () => {
    const checks = checksFor(STATIC_LANDING_PAGE);
    const actions = selectDeterministicActions(checks, CONTEXT.growthTarget);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].remediationCode).toBe("complete-submission-path");
    expect(actions[0].sourceCheckIds).toEqual(["quality.form-completeness"]);
    for (const action of actions) {
      expect(BACKEND_SCALE_REMEDIATION_CODES, action.remediationCode).not.toContain(
        action.remediationCode,
      );
      expect(
        `${action.title} ${action.rationale} ${action.whyNow} ${action.verification}`,
      ).not.toMatch(
        /\b(?:throughput|latency|headroom|load test|replica|failover|multi-region|deployed backend|production capacity|instance)\b/i,
      );
    }
    expect(
      actions.every((action) =>
        checks.some(
          (check) =>
            check.remediationCode === action.remediationCode &&
            check.outcome !== "not_applicable",
        ),
      ),
    ).toBe(true);
  });

  it("keeps growth labels evidence-free instead of claiming production capacity", () => {
    const checks = checksFor(STATIC_LANDING_PAGE);
    const runtime = SERVER_RUNTIME_CONTROL_IDS.map((id) => byId(checks, id));

    expect(runtime.every((check) => check.evidence.length === 0)).toBe(true);
    expect(byId(checks, "rel.actual-capacity").summary).toContain(
      "no reachable server route",
    );
  });
});

describe("browser hand-off versus outbound submission", () => {
  const MAILTO_ONLY_PAGE = [
    ...STATIC_LANDING_PAGE.filter(
      (file) => file.path !== "src/sections/Hero.tsx",
    ),
    {
      path: "src/sections/Hero.tsx",
      content: [
        "export default function Hero() {",
        '  return `<section><a href="mailto:studio@example.org">Email the studio</a>',
        '  <a href="tel:+421900000000">Call us</a>',
        '  <p>Preferred method: post</p></section>`;',
        "}",
      ].join("\n"),
    },
  ];

  it("keeps a mailto-only landing page inside the static profile", () => {
    const profile = staticFrontendProfile(
      createRepositoryIndex(snapshot(MAILTO_ONLY_PAGE)),
    );

    expect(profile).toMatchObject({
      browserBundle: true,
      submissionPath: false,
      outboundData: false,
      staticOnly: true,
    });
  });

  it("still reports the inert form beside a mailto contact link", () => {
    const checks = checksFor(MAILTO_ONLY_PAGE);

    expect(byId(checks, "quality.form-completeness")).toMatchObject({
      outcome: "fail",
      evidence: [{ path: "src/sections/ContactForm.tsx" }],
    });
    for (const id of SERVER_RUNTIME_CONTROL_IDS) {
      expect(byId(checks, id), id).toMatchObject({ outcome: "not_applicable" });
    }
  });

  it.each([
    [
      "a form action targeting a route",
      'export default function ContactForm() { return `<form action="/api/contact" method="post"><input name="email" /></form>`; }',
    ],
    [
      "a submit handler that calls the network",
      'export default function ContactForm() { const onSubmit = (event) => fetch("/api/contact", { method: "POST", body: event.target.email.value }); return `<form onsubmit="onSubmit"><input name="email" /></form>`; }',
    ],
    [
      "a hosted form service",
      'export default function ContactForm() { return `<form action="https://formspree.io/f/mabcdefg" method="post"><input name="email" /></form>`; }',
    ],
  ])("leaves the static profile for %s", (_name, content) => {
    const files = [
      ...STATIC_LANDING_PAGE.filter(
        (file) => file.path !== "src/sections/ContactForm.tsx",
      ),
      { path: "src/sections/ContactForm.tsx", content },
    ];

    expect(
      staticFrontendProfile(createRepositoryIndex(snapshot(files))).staticOnly,
    ).toBe(false);
    expect(byId(checksFor(files), "quality.form-completeness").outcome).not.toBe(
      "fail",
    );
  });

  it("does not treat a stray post keyword as a form method", () => {
    const files = [
      ...STATIC_LANDING_PAGE.filter(
        (file) => file.path !== "src/sections/ContactForm.tsx",
      ),
      {
        path: "src/sections/ContactForm.tsx",
        content: [
          `const shareLink = '<a data-method="post" href="#share">Share</a>';`,
          "export default function ContactForm() {",
          '  return `<form><input name="email" /><button type="submit">Send</button></form>`;',
          "}",
        ].join("\n"),
      },
    ];

    expect(
      staticFrontendProfile(createRepositoryIndex(snapshot(files))).staticOnly,
    ).toBe(true);
    expect(byId(checksFor(files), "quality.form-completeness").outcome).toBe(
      "fail",
    );
  });
});

describe("runtime configuration boundary", () => {
  it("does not fail on content, media, font, or documentation URLs in a server repository", () => {
    const files = [
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content: 'import Hero from "./Hero"; export const mount = () => Hero();',
      },
      {
        path: "src/Hero.tsx",
        content: [
          'const heroImage = "https://images.unsplash.com/photo-1521737604893";',
          'const promoVideo = "https://videos.acme-cdn.net/launch";',
          "export default function Hero() {",
          '  return `<img src="https://images.unsplash.com/photo-1499951360447" />',
          '  <a href="https://blog.acme.dev/launch-notes">Read the notes</a>`;',
          "}",
        ].join("\n"),
      },
      {
        path: "src/app/api/leads/route.ts",
        content:
          "export async function POST(request) { return Response.json({ ok: true }); }",
      },
    ];

    expect(
      staticFrontendProfile(createRepositoryIndex(snapshot(files))).staticOnly,
    ).toBe(false);
    expect(byId(checksFor(files), "saas.config-boundary").outcome).not.toBe("fail");
  });

  it.each([
    [
      "client constructor",
      "src/lib/supabase.ts",
      'import { createClient } from "@supabase/supabase-js"; export const db = createClient("https://abcdefgh.supabase.co", token);',
    ],
    [
      "deployment endpoint binding",
      "src/config.ts",
      'export const API_BASE_URL = "https://api.acme-internal.io/v2";',
    ],
    [
      "credential-shaped value",
      "src/config.ts",
      'export const apiKey = "live_9f1c4a7b2d8e6f0a3b5c";',
    ],
    [
      "database connection string",
      "src/config.ts",
      'export const dsn = "postgresql://app:hunter2@db.acme-internal.io:5432/app";',
    ],
    [
      "direct network call",
      "src/client.ts",
      'export const load = () => fetch("https://api.acme-internal.io/leads");',
    ],
  ])("still fails for an embedded %s", (_name, path, content) => {
    const checks = checksFor([
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content: `import "./${path.replace(/^src\//, "").replace(/\.ts$/, "")}"; export const app = true;`,
      },
      { path, content },
    ]);

    expect(byId(checks, "saas.config-boundary")).toMatchObject({
      outcome: "fail",
      severity: "medium",
      evidence: [{ path }],
    });
  });

  it.each([
    ["asset CDN base", 'export const cdnBase = "https://cdn.acme-media.net/v1";'],
    ["asset CDN url", 'export const cdnUrl = "https://cdn.example.com/hero";'],
    ["media origin", 'export const mediaOrigin = "https://media.acme-cdn.net";'],
  ])("does not fail for an %s", (_name, content) => {
    const files = [
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content: 'import "./assets"; export const app = true;',
      },
      { path: "src/assets.ts", content },
      {
        path: "src/app/api/leads/route.ts",
        content: "export async function POST() { return Response.json({}); }",
      },
    ];

    expect(byId(checksFor(files), "saas.config-boundary").outcome).not.toBe(
      "fail",
    );
  });

  it.each([
    ["service host", 'export const apiHost = "https://api.acme-internal.io";'],
    [
      "deployment gateway endpoint",
      'export const gatewayEndpoint = "https://gateway.acme-internal.io/v2";',
    ],
    [
      "cache service host",
      'export const redisHost = "https://cache.acme-internal.io:6379";',
    ],
  ])("still fails for a %s", (_name, content) => {
    const files = [
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content: 'import "./config"; export const app = true;',
      },
      { path: "src/config.ts", content },
      {
        path: "src/app/api/leads/route.ts",
        content: "export async function POST() { return Response.json({}); }",
      },
    ];

    expect(byId(checksFor(files), "saas.config-boundary")).toMatchObject({
      outcome: "fail",
      evidence: [{ path: "src/config.ts" }],
    });
  });

  it("keeps the runtime-configuration boundary assessable outside the static profile", () => {
    const checks = checksFor([
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content:
          'import Page from "./Page"; export const mount = () => Page();',
      },
      {
        path: "src/Page.tsx",
        content:
          'const heroImage = "https://images.unsplash.com/photo-42"; export default function Page() { return `<img src="${heroImage}" />`; }',
      },
      {
        path: "src/app/api/leads/route.ts",
        content:
          "export async function POST(request) { return Response.json({ ok: true }); }",
      },
    ]);

    expect(byId(checks, "saas.config-boundary")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });
});

describe("client applications with a real data boundary", () => {
  const SUPABASE_CLIENT_APP = [
    {
      path: "package.json",
      content:
        '{"dependencies":{"react":"19.0.0","@supabase/supabase-js":"2.0.0"},"devDependencies":{"vite":"6.0.0"}}',
    },
    { path: "index.html", content: '<div id="root"></div>' },
    {
      path: "src/main.tsx",
      content: 'import Signup from "./Signup"; export const mount = () => Signup();',
    },
    {
      path: "src/Signup.tsx",
      content: [
        'import { supabase } from "./supabase";',
        "export default function Signup() {",
        "  const onSubmit = async (event) => {",
        '    await supabase.from("leads").insert({ email: event.target.email.value });',
        "  };",
        '  return `<form onsubmit="onSubmit"><input name="email" /></form>`;',
        "}",
      ].join("\n"),
    },
    {
      path: "src/supabase.ts",
      content:
        'import { createClient } from "@supabase/supabase-js"; export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);',
    },
  ];

  it("stays outside the static profile when a persistence client and data write exist", () => {
    const profile = staticFrontendProfile(
      createRepositoryIndex(snapshot(SUPABASE_CLIENT_APP)),
    );

    expect(profile).toMatchObject({
      browserBundle: true,
      persistenceClient: true,
      outboundData: true,
      submissionPath: true,
      staticOnly: false,
    });
  });

  it("keeps data-boundary controls assessable for a browser application with real data calls", () => {
    const checks = checksFor(SUPABASE_CLIENT_APP);

    for (const id of [
      "security.authentication",
      "security.authorization",
      "saas.stateless-tier",
      "saas.observability",
      "rel.stateless",
      "rel.failure-controls",
    ]) {
      expect(byId(checks, id).outcome, id).not.toBe("not_applicable");
    }
    expect(byId(checks, "quality.form-completeness").outcome).not.toBe("fail");
  });

  it("keeps server controls assessable when a browser bundle calls an API route", () => {
    const checks = checksFor([
      { path: "package.json", content: '{"dependencies":{"react":"19.0.0"}}' },
      { path: "index.html", content: '<div id="root"></div>' },
      {
        path: "src/main.tsx",
        content: 'import Form from "./Form"; export const mount = () => Form();',
      },
      {
        path: "src/Form.tsx",
        content: [
          "export default function Form() {",
          "  const onSubmit = (event) => {",
          '    fetch("/api/leads", { method: "POST", body: event.target.email.value });',
          "  };",
          '  return `<form onsubmit="onSubmit"><input name="email" /></form>`;',
          "}",
        ].join("\n"),
      },
      {
        path: "src/app/api/leads/route.ts",
        content:
          "export async function POST(request) { return Response.json({ ok: true }); }",
      },
    ]);

    expect(byId(checks, "saas.stateless-tier").outcome).not.toBe("not_applicable");
    expect(byId(checks, "security.authentication").outcome).not.toBe(
      "not_applicable",
    );
    expect(byId(checks, "ops.observability").outcome).not.toBe("not_applicable");
  });
});
