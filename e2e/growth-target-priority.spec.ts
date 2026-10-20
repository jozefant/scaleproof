import { expect, test, type APIRequestContext } from "./coverage-fixtures";

/**
 * P0.6 — prove growth-target prioritization in the founder-visible flow.
 *
 * The seam under test is the real HTTP analysis route, not the action selector
 * in isolation: only question C (`growthTarget`) changes between requests, and
 * everything the founder is told about *evidence* has to stay identical.
 *
 * Determinism: `source: "demo"` uses the synthetic fixture and the web server
 * runs with a blanked `OPENAI_API_KEY`, so no provider call happens.
 */

type GrowthTarget =
  | "users_10x"
  | "users_100x"
  | "engineering_team"
  | "users_and_team"
  | "unknown"
  | "withheld";

type Report = {
  score: number;
  verdict: string;
  confidence: number;
  checks: unknown[];
  growth: unknown;
  actions: Array<{ remediationCode: string; title: string }>;
};

async function reportFor(
  request: APIRequestContext,
  growthTarget: GrowthTarget,
): Promise<Report> {
  const response = await request.post("/api/analyze", {
    data: {
      source: "demo",
      context: {
        stage: "prototype",
        dataSensitivity: "basic_personal",
        growthTarget,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Report;
}

const codes = (report: Report) =>
  report.actions.map((action) => action.remediationCode);

test("question C changes the founder-visible actions and nothing else", async ({
  request,
}) => {
  const users = await reportFor(request, "users_10x");
  const team = await reportFor(request, "engineering_team");

  // The founder-visible action order or selection must change.
  expect(codes(users)).not.toEqual(codes(team));

  // Everything evidence-derived must be identical.
  expect(users.score).toBe(team.score);
  expect(users.verdict).toBe(team.verdict);
  expect(users.confidence).toBe(team.confidence);
  expect(users.checks).toEqual(team.checks);
  expect(users.growth).toEqual(team.growth);
});

test("critical remediation stays ahead of every growth-target preference", async ({
  request,
}) => {
  const targets: GrowthTarget[] = [
    "users_10x",
    "users_100x",
    "engineering_team",
    "users_and_team",
    "unknown",
    "withheld",
  ];

  const baseline = await reportFor(request, "unknown");
  const criticalCode = baseline.actions[0]?.remediationCode;
  expect(criticalCode).toBe("remove-exposed-secret");

  for (const target of targets) {
    const report = await reportFor(request, target);
    expect(report.actions.length).toBeGreaterThan(0);
    expect(report.actions.length).toBeLessThanOrEqual(3);
    expect(report.actions[0].remediationCode, `first action for ${target}`).toBe(
      criticalCode,
    );
    expect(report.checks, `checks for ${target}`).toEqual(baseline.checks);
    expect(report.growth, `growth for ${target}`).toEqual(baseline.growth);
    expect(report.score, `score for ${target}`).toBe(baseline.score);
    expect(report.verdict, `verdict for ${target}`).toBe(baseline.verdict);
    expect(report.confidence, `confidence for ${target}`).toBe(
      baseline.confidence,
    );
  }
});

test("unknown and withheld growth targets stay neutral", async ({ request }) => {
  const unknown = await reportFor(request, "unknown");
  const withheld = await reportFor(request, "withheld");

  expect(codes(withheld)).toEqual(codes(unknown));

  // Neutral must mean "no preference applied", not "same as some target".
  const preferred = await reportFor(request, "engineering_team");
  expect(codes(unknown)).not.toEqual(codes(preferred));
});
