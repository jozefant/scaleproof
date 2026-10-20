import type { RepositorySnapshot } from "@/lib/repository/types";

import type { ScanContext } from "./types";

/**
 * P0.10 synthetic multi-module fixtures.
 *
 * Two placements of the *same* payloads. Fixture A puts every credential, N+1
 * loop, unbounded query, and external client in explicitly non-production
 * scope: a test source set, a fixture, a generated user-interface primitive, a
 * migration, and an offline importer. Fixture B puts the same payloads in the
 * reachable production call graph. Nothing here is copied from a real
 * repository.
 */
export const P0_10_CONTEXT: ScanContext = {
  stage: "scaling_production",
  dataSensitivity: "basic_personal",
  growthTarget: "users_10x",
};

/** One fixed credential value, reused so the scope alone changes the verdict. */
export const CREDENTIAL_VALUE = "Sup3rSecretValue1234567890";
export const CREDENTIAL_PROPERTIES = [
  "spring.datasource.url=jdbc:postgresql://db/orders",
  `spring.datasource.password=${CREDENTIAL_VALUE}`,
].join("\n");

/** One unbounded external client, with no timeout and no workload boundary. */
export const EXTERNAL_CLIENT_SOURCE = [
  "export async function charge(order) {",
  "  return fetch(providerUrl, { method: 'POST', body: JSON.stringify(order) });",
  "}",
].join("\n");

/** One visible N+1: a loop around a repository lookup. */
export const N_PLUS_ONE_SOURCE = [
  "export async function report(ids) {",
  "  const rows = [];",
  "  for (const id of ids) { rows.push(await orderRepository.findAll(id)); }",
  "  return rows;",
  "}",
].join("\n");

/** One unbounded SQL statement. */
export const UNBOUNDED_QUERY_SOURCE = "const listAll = 'SELECT id, email FROM orders';";

/**
 * Shared multi-module skeleton: an independently buildable Java backend and an
 * independently buildable React frontend, an API contract, per-module CI, and
 * documented boundaries. No root workspace manifest exists on purpose.
 */
export const MODULE_SKELETON: Array<{ path: string; content: string }> = [
  {
    path: "backend/pom.xml",
    content:
      "<project><artifactId>orders-backend</artifactId><packaging>jar</packaging></project>",
  },
  {
    path: "backend/src/main/java/com/acme/OrderController.java",
    content:
      "@RestController public class OrderController { public List<Order> list() { return orderRepository.findById(1L); } }",
  },
  {
    // A database service call. `orderRepository.fetch(...)` carries a
    // recognized client token, but it is a persistence handle, not an
    // outbound network dependency.
    path: "backend/src/main/java/com/acme/OrderService.java",
    content:
      "public class OrderService { public Order load(Long id) { return orderRepository.fetch(id); } }",
  },
  {
    path: "frontend/package.json",
    content:
      '{"name":"orders-frontend","dependencies":{"react":"19.0.0","react-dom":"19.0.0"}}',
  },
  {
    path: "frontend/src/App.tsx",
    content: "export default function App() { return null; }",
  },
  {
    path: "contracts/openapi.yaml",
    content: "openapi: 3.1.0\npaths:\n  /orders:\n    get: {}",
  },
  {
    path: ".github/workflows/ci.yml",
    content: [
      "on: pull_request",
      "jobs:",
      "  backend:",
      "    steps:",
      "      - run: mvn verify",
      "        working-directory: backend",
      "  frontend:",
      "    steps:",
      "      - run: npm run build",
      "        working-directory: frontend",
    ].join("\n"),
  },
  {
    path: "docs/architecture.md",
    content: [
      "# Architecture",
      "",
      "| Module | Responsibility | May depend on |",
      "| --- | --- | --- |",
      "| backend | Order API | contracts |",
      "| frontend | Browser client | contracts |",
      "",
      "The module boundaries are the two build manifests above.",
    ].join("\n"),
  },
  {
    path: "db/migrations/001_init.sql",
    content:
      "create table orders(id bigserial primary key, email varchar(255)); create index orders_email on orders(email);",
  },
  { path: "README.md", content: "# Orders\n\nRun `mvn verify` and `npm run build`." },
];

/** Fixture A: every risky payload sits in explicitly non-production scope. */
export const NON_PRODUCTION_PLACEMENT: Array<{ path: string; content: string }> = [
  {
    path: "backend/src/test/resources/application.properties",
    content: CREDENTIAL_PROPERTIES,
  },
  {
    path: "backend/src/test/java/com/acme/OrderControllerIT.java",
    content:
      "import org.junit.jupiter.api.Test;\nclass OrderControllerIT { @Test void chargesOrders() { restTemplate.getForObject(url, String.class); } }",
  },
  {
    path: "fixtures/service-account.env",
    content: `API_KEY=${CREDENTIAL_VALUE}`,
  },
  {
    path: "frontend/src/components/ui/data-table.tsx",
    content: [
      'import * as TablePrimitive from "@radix-ui/react-table";',
      `const API_KEY = "${CREDENTIAL_VALUE}";`,
      UNBOUNDED_QUERY_SOURCE,
      EXTERNAL_CLIENT_SOURCE,
    ].join("\n"),
  },
  {
    path: "backend/src/api/orders-client.generated.ts",
    content: `// generated from contracts/openapi.yaml\n${EXTERNAL_CLIENT_SOURCE}`,
  },
  {
    path: "scripts/import-legacy-orders.ts",
    content: [
      `const LEGACY_API_KEY = "${CREDENTIAL_VALUE}";`,
      EXTERNAL_CLIENT_SOURCE,
      N_PLUS_ONE_SOURCE,
    ].join("\n"),
  },
  {
    path: "scripts/api/refresh-cache.ts",
    content: EXTERNAL_CLIENT_SOURCE,
  },
  {
    path: "db/migrations/20240101_backfill.ts",
    content: [`const API_TOKEN = "${CREDENTIAL_VALUE}";`, N_PLUS_ONE_SOURCE].join(
      "\n",
    ),
  },
  {
    path: "frontend/src/__tests__/checkout.test.ts",
    content: EXTERNAL_CLIENT_SOURCE,
  },
];

/** Fixture B: the same payloads, in the reachable production call graph. */
export const PRODUCTION_PLACEMENT: Array<{ path: string; content: string }> = [
  {
    path: "backend/src/main/resources/application.properties",
    content: CREDENTIAL_PROPERTIES,
  },
  { path: "backend/src/routes/payments.ts", content: EXTERNAL_CLIENT_SOURCE },
  { path: "backend/src/orders-report.ts", content: N_PLUS_ONE_SOURCE },
];

export function p0Snapshot(
  files: Array<{ path: string; content: string }>,
  label = "synthetic/p0-10",
): RepositorySnapshot {
  return {
    repositoryLabel: label,
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
    detectedStacks: ["Java", "Node.js / TypeScript"],
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

