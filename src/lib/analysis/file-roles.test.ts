import { describe, expect, it } from "vitest";

import type { RepositorySnapshot } from "@/lib/repository/types";

import {
  classifyFileRole,
  credentialScope,
  evidenceRoles,
  fileRole,
  isProductionExecutionFile,
  isProductionFileRole,
  productionExecutionFiles,
  NON_PRODUCTION_FILE_ROLES,
  type FileRole,
} from "./file-roles";
import { createRepositoryIndex } from "./signals";

function snapshot(
  files: Array<{ path: string; content: string }>,
): RepositorySnapshot {
  return {
    repositoryLabel: "synthetic/file-roles",
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

/**
 * Positive forms. Each row pins one recognized shape of one role. Path-only
 * rows pass an empty body deliberately: the path alone must be enough.
 */
const POSITIVE_FORMS: Array<[FileRole, string, string]> = [
  // --- production -------------------------------------------------------
  ["production", "src/server.ts", "export const app = createServer();"],
  ["production", "src/app/api/orders/route.ts", "export async function POST() {}"],
  [
    "production",
    "backend/src/main/java/com/acme/OrderController.java",
    "@RestController class OrderController {}",
  ],
  ["production", ".env.production", "DATABASE_URL=postgres://host/db"],
  ["production", ".env", "DATABASE_URL=postgres://host/db"],
  ["production", "deploy/production.yaml", "replicas: 3"],
  ["production", "k8s/deployment.yaml", "kind: Deployment"],
  ["production", "terraform/main.tf", 'resource "aws_db_instance" "main" {}'],
  ["production", "Dockerfile", "FROM node:22"],
  ["production", "src/components/Hero.tsx", "export const Hero = () => null;"],
  ["production", "config/app.env", "SERVICE_HOST=api.internal"],
  ["production", "frontend/vite.config.ts", "export default {};"],

  // --- test -------------------------------------------------------------
  ["test", "backend/src/test/resources/application.properties", "db.password=fixed"],
  [
    "test",
    "backend/src/test/java/com/acme/OrderControllerTest.java",
    "class OrderControllerTest {}",
  ],
  ["test", "src/orders.test.ts", "export {}"],
  ["test", "src/orders.spec.tsx", "export {}"],
  ["test", "__tests__/orders.ts", "export {}"],
  ["test", "e2e/checkout.spec.ts", "export {}"],
  ["test", "cypress/e2e/login.cy.ts", "export {}"],
  ["test", "tests/conftest.py", ""],
  ["test", "api/test_orders.py", ""],
  ["test", "pkg/orders_test.go", ""],
  ["test", "spec/models/user_spec.rb", ""],
  ["test", "src/main/resources/application-test.properties", "db.password=fixed"],
  ["test", ".env.test", "API_KEY=fixed"],
  ["test", ".env.example", "API_KEY=replace-me"],
  ["test", "compose.test.yml", "services: {}"],
  ["test", "vitest.config.ts", "export default {};"],
  ["test", "playwright.config.ts", "export default {};"],
  [
    "test",
    "backend/verification/OrderFlow.java",
    "import org.junit.jupiter.api.Test;\n@Test void run() {}",
  ],
  ["test", "verification/check.py", "import pytest\n\n\ndef test_ok(): pass"],
  [
    "test",
    "src/checks.ts",
    "describe('orders', () => { it('bounds the query', () => {}); });",
  ],

  // --- fixture ----------------------------------------------------------
  ["fixture", "fixtures/orders.json", "[]"],
  ["fixture", "src/__fixtures__/user.ts", "export const user = {};"],
  ["fixture", "examples/basic/app.ts", "export {}"],
  ["fixture", "samples/config.yaml", "port: 1"],
  ["fixture", "demo/data.json", "{}"],
  ["fixture", "src/user.fixture.ts", "export const user = {};"],
  ["fixture", "src/Button.stories.tsx", "export default {};"],

  // --- generated --------------------------------------------------------
  ["generated", "node_modules/react/index.js", "module.exports = {};"],
  ["generated", "vendor/github.com/acme/client.go", "package client"],
  [
    "generated",
    "src/components/ui/button.tsx",
    'import * as Slot from "@radix-ui/react-slot";',
  ],
  ["generated", "package-lock.json", '{"lockfileVersion":3}'],
  ["generated", "go.sum", "example.com/x v1.0.0 h1:abc"],
  ["generated", "src/api/schema.generated.ts", "export type Schema = never;"],
  ["generated", "internal/pb/orders.pb.go", "package pb"],
  ["generated", "proto/orders_pb2.py", ""],
  ["generated", "src/types.d.ts", "declare module 'x';"],
  ["generated", "public/app.min.js", "var a=1;"],
  [
    "generated",
    "src/api/client.ts",
    "// @generated by openapi-generator. DO NOT EDIT.\nexport const client = {};",
  ],
  ["generated", "target/classes/Config.java", "class Config {}"],

  // --- documentation ----------------------------------------------------
  ["documentation", "README.md", "# Project"],
  ["documentation", "docs/architecture.md", "# Architecture"],
  ["documentation", "docs/adr/001-database.md", "# ADR"],
  ["documentation", "docs/runbook.txt", "restart the service"],
  ["documentation", "LICENSE", "MIT"],
  ["documentation", "CHANGELOG.md", "## 1.0.0"],

  // --- tooling ----------------------------------------------------------
  ["tooling", "scripts/import-legacy-orders.ts", "export {}"],
  ["tooling", "tools/release.ts", "export {}"],
  ["tooling", "bin/deploy.js", "process.exit(0);"],
  ["tooling", "migrations/2024_add_orders.sql", "alter table orders add col int;"],
  ["tooling", "db/migrations/001_init.sql", "create table orders(id int);"],
  [
    "tooling",
    "prisma/migrations/20240101_init/migration.sql",
    "create table orders(id int);",
  ],
  ["tooling", ".github/workflows/ci.yml", "on: pull_request"],
  ["tooling", ".gitlab-ci.yml", "stages: [build]"],
  ["tooling", "seeds/users.ts", "export const users = [];"],
  ["tooling", "src/backfill.ts", "export {}"],
  ["tooling", "Makefile", "build:\n\tnpm run build"],
];

/**
 * Negative forms. Every row is a production file whose *name* resembles a
 * non-production one. Each is a case where a lazier substring rule would
 * silently remove real production evidence from the request-path controls.
 */
const NEGATIVE_FORMS: Array<[string, string]> = [
  ["src/Latest.java", "class Latest {}"],
  ["src/contest.ts", "export const contest = 1;"],
  ["src/testimonials.tsx", "export const Testimonials = () => null;"],
  ["src/protest/index.ts", "export const protest = 1;"],
  ["src/documents/upload.ts", "export const upload = 1;"],
  ["src/store/cart.ts", "export const cart = 1;"],
  ["src/binary/parser.ts", "export const parse = 1;"],
  ["src/demoted/flags.ts", "export const flags = 1;"],
  ["src/generateReport.ts", "export const generateReport = 1;"],
  ["src/example.ts", "export const example = 1;"],
  ["docs.ts", "export const docs = 1;"],
  [".env.local", "API_URL=http://localhost:3000"],
  ["src/specification.ts", "export const specification = 1;"],
  ["src/toolbar.tsx", "export const Toolbar = () => null;"],
  ["src/components/ui/button.tsx", "export const Button = () => null;"],
];

describe("execution-context file roles", () => {
  it.each(POSITIVE_FORMS)(
    "classifies %s form %s",
    (role, path, content) => {
      expect(classifyFileRole(path, content)).toBe(role);
    },
  );

  it.each(NEGATIVE_FORMS)(
    "keeps %s in production role",
    (path, content) => {
      expect(classifyFileRole(path, content)).toBe("production");
      expect(isProductionFileRole(classifyFileRole(path, content))).toBe(true);
    },
  );

  it("treats every non-production role as unable to prove production execution", () => {
    const roles: FileRole[] = [
      "test",
      "fixture",
      "generated",
      "documentation",
      "tooling",
    ];
    for (const role of roles) {
      expect(NON_PRODUCTION_FILE_ROLES.has(role)).toBe(true);
      expect(isProductionFileRole(role)).toBe(false);
    }
    expect(NON_PRODUCTION_FILE_ROLES.has("production")).toBe(false);
  });

  it("classifies from the path alone when no content is available", () => {
    expect(classifyFileRole("src/orders.test.ts")).toBe("test");
    expect(classifyFileRole("node_modules/react/index.js")).toBe("generated");
    expect(classifyFileRole("src/orders.ts")).toBe("production");
    // A content-only signal cannot be seen without content, and the
    // conservative answer is production rather than a silent downgrade.
    expect(classifyFileRole("src/components/ui/button.tsx")).toBe("production");
  });

  it("normalizes separators, relative prefixes, and case", () => {
    expect(classifyFileRole("./src/Orders.TEST.ts")).toBe("test");
    expect(classifyFileRole("src\\__tests__\\orders.ts")).toBe("test");
    expect(classifyFileRole("./README.md")).toBe("documentation");
  });
});

describe("credential scope", () => {
  const PRODUCTION_SCOPE: Array<[string, string]> = [
    [".env.production", "SUPABASE_SERVICE_ROLE_KEY=value"],
    [".env", "SERVICE_TOKEN=value"],
    ["config/app.env", "INTERNAL_API_KEY=value"],
    ["src/server.ts", "const apiKey = 'value';"],
    ["deploy/production.yaml", "apiKey: value"],
    // Continuous-integration definitions are offline tooling for execution
    // purposes, but they hold real deployment credentials.
    [".github/workflows/deploy.yml", "AWS_ACCESS_KEY_ID: value"],
    [".gitlab-ci.yml", "AWS_ACCESS_KEY_ID: value"],
    [".circleci/config.yml", "AWS_ACCESS_KEY_ID: value"],
  ];
  const NON_PRODUCTION_SCOPE: Array<[string, string]> = [
    ["backend/src/test/resources/application.properties", "db.password=fixed"],
    ["src/orders.test.ts", "const token = 'fixed';"],
    [".env.test", "API_KEY=fixed"],
    [".env.example", "API_KEY=replace-me"],
    ["fixtures/users.json", '{"token":"fixed"}'],
    ["examples/basic/config.json", '{"apiKey":"fixed"}'],
    ["migrations/001_seed.sql", "insert into config values('key','fixed');"],
    ["scripts/import-legacy-orders.ts", "const apiKey = 'fixed';"],
    ["node_modules/pkg/index.js", "const apiKey = 'fixed';"],
    ["docs/setup.txt", "API_KEY=fixed"],
  ];

  it.each(PRODUCTION_SCOPE)("keeps %s in production credential scope", (path, content) => {
    expect(credentialScope(path, content)).toBe("production");
  });

  it.each(NON_PRODUCTION_SCOPE)(
    "reads %s as non-production credential scope",
    (path, content) => {
      expect(credentialScope(path, content)).toBe("non_production");
    },
  );
});

describe("repository-index helpers", () => {
  const FILES = [
    { path: "src/main.ts", content: "import './orders'; export {}" },
    { path: "src/orders.ts", content: "export const list = () => [];" },
    { path: "src/orders.test.ts", content: "export {}" },
    { path: "scripts/import-legacy.ts", content: "export {}" },
    { path: "fixtures/orders.json", content: "[]" },
    { path: "README.md", content: "# Project" },
    { path: "node_modules/pkg/index.js", content: "module.exports = 1;" },
  ];

  it("returns only reachable production files", () => {
    const index = createRepositoryIndex(snapshot(FILES));
    expect(
      productionExecutionFiles(index).map((file) => file.path).sort(),
    ).toEqual(["src/main.ts", "src/orders.ts"]);
  });

  it("excludes each non-production role from production execution", () => {
    const index = createRepositoryIndex(snapshot(FILES));
    for (const file of index.files) {
      const expected = fileRole(index, file) === "production";
      expect(isProductionExecutionFile(index, file), file.path).toBe(
        expected && file.path !== "src/orders.test.ts",
      );
    }
  });

  it("reports the internal role behind public evidence references", () => {
    const index = createRepositoryIndex(snapshot(FILES));
    expect(
      evidenceRoles(index, [
        { path: "src/orders.ts", kind: "code" },
        { path: "src/orders.test.ts", kind: "test" },
        { path: "scripts/import-legacy.ts", kind: "code" },
        { path: "fixtures/orders.json", kind: "configuration" },
        { path: "README.md", kind: "documentation" },
        { path: "node_modules/pkg/index.js", kind: "code" },
      ]),
    ).toEqual([
      "production",
      "test",
      "tooling",
      "fixture",
      "documentation",
      "generated",
    ]);
  });

  it("classifies an evidence path that is no longer in the index", () => {
    const index = createRepositoryIndex(snapshot(FILES));
    expect(evidenceRoles(index, [{ path: "src/gone.test.ts", kind: "test" }])).toEqual([
      "test",
    ]);
  });
});
