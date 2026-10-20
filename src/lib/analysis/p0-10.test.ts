import { describe, expect, it } from "vitest";

import {
  mandatoryRemediationCodes,
  selectDeterministicActions,
} from "./actions";
import { buildControlInventory } from "./control-inventory";
import { evaluateControls } from "./controls";
import { evidenceRoles } from "./file-roles";
import {
  CREDENTIAL_VALUE,
  MODULE_SKELETON,
  NON_PRODUCTION_PLACEMENT,
  P0_10_CONTEXT,
  PRODUCTION_PLACEMENT,
  p0Snapshot,
} from "./p0-10-fixtures";
import { createRepositoryIndex } from "./signals";
import type { CheckResult } from "./types";

/**
 * P0.10 — production execution context.
 *
 * The seam under test is a whole synthetic multi-module repository through
 * `evaluateControls` and deterministic action selection. Two fixtures carry the
 * *same* payloads: fixture A places every credential, N+1 loop, unbounded
 * query, and external client in test, fixture, generated, migration, or offline
 * scope; fixture B places them in the reachable production call graph. The pair
 * proves both directions of the same rule.
 *
 * The public-report privacy half of the acceptance runs one layer up, in
 * `src/lib/application/p0-10-report.test.ts`, because rendering the founder
 * document belongs to the application and report layers.
 */

function analyze(files: Array<{ path: string; content: string }>) {
  const repository = p0Snapshot(files);
  const index = createRepositoryIndex(repository);
  const checks = evaluateControls(repository, P0_10_CONTEXT);
  const find = (id: string): CheckResult => {
    const check = checks.find((candidate) => candidate.id === id);
    expect(check, `missing ${id}`).toBeDefined();
    return check!;
  };
  return {
    checks,
    find,
    roles: (id: string) => evidenceRoles(index, find(id).evidence),
    actions: selectDeterministicActions(checks, P0_10_CONTEXT.growthTarget),
    mandatory: mandatoryRemediationCodes(checks),
  };
}

const nonProduction = () => analyze([...MODULE_SKELETON, ...NON_PRODUCTION_PLACEMENT]);
const production = () => analyze([...MODULE_SKELETON, ...PRODUCTION_PLACEMENT]);

describe("P0.10 non-production evidence cannot assert production execution", () => {
  it("does not raise a critical production secret from fixed test credentials or fixtures", () => {
    const { find, roles, actions, mandatory } = nonProduction();
    const secret = find("security.exposed-secret");

    expect(secret).toMatchObject({
      outcome: "unknown",
      evidenceTier: "inferred",
      severity: "medium",
    });
    // Test properties, a fixture, a generated UI primitive, a migration, and
    // an offline importer all carry the same credential-shaped value.
    expect(secret.evidence.map((reference) => reference.path).sort()).toEqual([
      "backend/src/test/resources/application.properties",
      "db/migrations/20240101_backfill.ts",
      "fixtures/service-account.env",
      "frontend/src/components/ui/data-table.tsx",
      "scripts/import-legacy-orders.ts",
    ]);
    expect([...roles("security.exposed-secret")].sort()).toEqual([
      "fixture",
      "generated",
      "test",
      "tooling",
      "tooling",
    ]);
    expect(mandatory.has("remove-exposed-secret")).toBe(false);
    expect(actions.map((action) => action.remediationCode)).not.toContain(
      "remove-exposed-secret",
    );
    expect(JSON.stringify(secret)).not.toContain(CREDENTIAL_VALUE);
  });

  it("does not raise a request-path external-work failure from generated, migration, or offline code", () => {
    const { checks, find, mandatory } = nonProduction();

    expect(find("saas.slow-work")).toMatchObject({ outcome: "not_applicable" });
    expect(find("saas.failure-safety")).toMatchObject({
      outcome: "not_applicable",
    });
    // Nothing concrete fails, so no mandatory failure-control action exists.
    // `rel.failure-controls` may still report missing evidence; that is a
    // documented absence, not an asserted production failure.
    expect(mandatory.has("add-failure-controls")).toBe(false);
    expect(
      checks
        .filter((check) => check.outcome === "fail")
        .map((check) => check.remediationCode),
    ).not.toContain("add-failure-controls");
  });

  it("does not raise an N+1 or unbounded-query failure from a migration, generated UI, or importer", () => {
    const { find } = nonProduction();
    const database = find("saas.database-discipline");

    expect(database.outcome).not.toBe("fail");
    expect(database.summary).not.toContain("N+1");
    expect(database.summary).not.toContain("unbounded");
    // The importer and the generated table stay out of the evidence entirely.
    const paths = database.evidence.map((reference) => reference.path);
    expect(paths).not.toContain("scripts/import-legacy-orders.ts");
    expect(paths).not.toContain("frontend/src/components/ui/data-table.tsx");
  });

  it("does not read a persistence-handle call as an external dependency", () => {
    // `orderRepository.fetch(id)` carries the `fetch(` client token in a
    // production file. It is a database service call, so it must not create a
    // slow-work or failure-safety finding on its own.
    const { find } = analyze([
      ...MODULE_SKELETON.filter(
        (file) => !file.path.endsWith("OrderController.java"),
      ),
    ]);

    expect(find("saas.failure-safety")).toMatchObject({
      outcome: "not_applicable",
    });
    expect(find("saas.slow-work")).toMatchObject({ outcome: "not_applicable" });
  });

  it("reconciles control metadata for the non-production repository", () => {
    const { checks } = nonProduction();
    expect(() => buildControlInventory(checks)).not.toThrow();
  });
});

describe("P0.10 production evidence still produces the concrete failure", () => {
  it("keeps the critical secret finding and the mandatory removal action", () => {
    const { find, roles, actions, mandatory } = production();
    const secret = find("security.exposed-secret");

    expect(secret).toMatchObject({
      outcome: "fail",
      evidenceTier: "enforced",
      severity: "critical",
    });
    expect(secret.evidence.map((reference) => reference.path)).toEqual([
      "backend/src/main/resources/application.properties",
    ]);
    expect(roles("security.exposed-secret")).toEqual(["production"]);
    expect(mandatory.has("remove-exposed-secret")).toBe(true);
    expect(actions.map((action) => action.remediationCode)).toContain(
      "remove-exposed-secret",
    );
    expect(JSON.stringify(secret)).not.toContain(CREDENTIAL_VALUE);
  });

  it("keeps the reachable production external client failing without a timeout", () => {
    const { find, roles } = production();

    expect(find("saas.failure-safety")).toMatchObject({
      outcome: "fail",
      severity: "critical",
    });
    expect(find("saas.failure-safety").evidence.map((r) => r.path)).toContain(
      "backend/src/routes/payments.ts",
    );
    expect(roles("saas.failure-safety")).toEqual(["production"]);

    expect(find("saas.slow-work")).toMatchObject({ outcome: "fail" });
    expect(find("saas.slow-work").evidence.map((r) => r.path)).toContain(
      "backend/src/routes/payments.ts",
    );
    expect(roles("saas.slow-work")).toEqual(["production"]);
  });

  it("keeps the production N+1 failing", () => {
    const { find, roles } = production();
    const database = find("saas.database-discipline");

    expect(database).toMatchObject({ outcome: "fail", severity: "high" });
    expect(database.evidence.map((reference) => reference.path)).toContain(
      "backend/src/orders-report.ts",
    );
    expect(roles("saas.database-discipline")).toEqual(["production"]);
    expect(database.summary).toContain("N+1");
  });

  it("keeps the mandatory failure-control action ahead of growth-target preferences", () => {
    const { actions } = production();
    expect(actions.map((action) => action.remediationCode)).toContain(
      "add-failure-controls",
    );
  });
});

describe("P0.10 nested module boundaries", () => {
  it("passes on separate backend and frontend manifests with no root workspace manifest", () => {
    const { find } = nonProduction();
    const boundaries = find("arch.module-boundaries");

    expect(boundaries).toMatchObject({ outcome: "pass", evidenceTier: "inferred" });
    expect(boundaries.evidence.map((reference) => reference.path)).toEqual(
      expect.arrayContaining(["backend/pom.xml", "frontend/package.json"]),
    );
    expect(boundaries.summary).toContain("independently buildable nested modules");
  });

  it("recognizes the contract, workflow, and documented boundary as supporting evidence", () => {
    const { find } = nonProduction();
    const paths = find("arch.module-boundaries").evidence.map((r) => r.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        "contracts/openapi.yaml",
        ".github/workflows/ci.yml",
      ]),
    );
  });

  it("still reports a missing module layout for a single-module repository", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"app"}' },
      { path: "src/index.ts", content: "export {}" },
      { path: "docs/architecture.md", content: "# Architecture" },
    ]);

    expect(find("arch.module-boundaries")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });

  it("does not count test, fixture, example, or vendored manifests as modules", () => {
    const { find } = analyze([
      { path: "package.json", content: '{"name":"app"}' },
      { path: "src/index.ts", content: "export {}" },
      { path: "e2e/package.json", content: '{"name":"e2e"}' },
      { path: "examples/basic/package.json", content: '{"name":"example"}' },
      { path: "node_modules/pkg/package.json", content: '{"name":"pkg"}' },
      { path: "docs/site/package.json", content: '{"name":"docs"}' },
    ]);

    expect(find("arch.module-boundaries")).toMatchObject({
      outcome: "unknown",
      evidenceTier: "absent",
    });
  });
});
