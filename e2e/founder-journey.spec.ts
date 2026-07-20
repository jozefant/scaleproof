import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const context = {
  stage: "unknown",
  dataSensitivity: "unknown",
  growthTarget: "unknown",
};

async function demoReport(request: APIRequestContext): Promise<unknown> {
  const response = await request.post("/api/analyze", {
    data: { source: "demo", context },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

type ArtifactViewport = {
  name: "desktop" | "mobile";
  size: { width: number; height: number };
};

const ARTIFACT_VIEWPORTS: ArtifactViewport[] = [
  { name: "desktop", size: { width: 1440, height: 960 } },
  { name: "mobile", size: { width: 390, height: 844 } },
];

async function saveViewportArtifact(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  await page.screenshot({ path: testInfo.outputPath(name) });
}

async function scrollHeadingBelowReportHeader(
  page: Page,
  heading: ReturnType<Page["locator"]>,
): Promise<void> {
  await heading.evaluate((element) => {
    element.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  });
  await expect(heading).toBeInViewport();
  const [headerBox, headingBox] = await Promise.all([
    page.locator(".report-header").boundingBox(),
    heading.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(headingBox?.y).toBeGreaterThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0),
  );
}

async function captureFounderFlowArtifacts(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  viewport: ArtifactViewport,
): Promise<void> {
  const report = await demoReport(request);
  await page.setViewportSize(viewport.size);
  await page.goto("/");
  const analyze = page.getByRole("button", { name: "Analyze" });
  await expect(page.getByLabel("Public repository URL")).toBeInViewport();
  await expect(analyze).toBeInViewport();
  await saveViewportArtifact(page, testInfo, `${viewport.name}-landing.png`);

  const stage = page.getByRole("radio", { name: "Scaling or production" });
  const data = page.getByRole("radio", { name: "Sensitive or regulated data" });
  const growthStart = page.getByRole("radio", { name: "10x more users" });
  const growth = page.getByRole("radio", { name: "100x more users" });
  await stage.check();
  await data.check();
  await growthStart.press("ArrowRight");
  await expect(growth).toBeFocused();
  await expect(growth).toBeChecked();
  await expect.poll(() => growth.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(analyze).toBeInViewport();
  const [analyzeBox, focusedChoiceBox] = await Promise.all([
    analyze.boundingBox(),
    growth.locator("xpath=..").boundingBox(),
  ]);
  expect(analyzeBox).not.toBeNull();
  expect(focusedChoiceBox).not.toBeNull();
  expect(focusedChoiceBox?.y).toBeGreaterThanOrEqual(
    (analyzeBox?.y ?? 0) + (analyzeBox?.height ?? 0),
  );
  await saveViewportArtifact(page, testInfo, `${viewport.name}-selected-focus.png`);

  await page
    .getByLabel("Public repository URL")
    .fill("https://github.com/example/repository/tree/main");
  await analyze.click();
  await expect(page.locator(".error-notice")).toBeVisible();
  await expect(stage).toBeChecked();
  await expect(data).toBeChecked();
  await expect(growth).toBeChecked();

  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/analyze", async (route) => {
    await held;
    await route.fulfill({ status: 200, json: report });
  });
  await page
    .getByLabel("Public repository URL")
    .fill("https://github.com/example/repository");
  await analyze.click();
  const radios = await page.getByRole("radio").all();
  await Promise.all(radios.map((radio) => expect(radio).toBeDisabled()));
  await saveViewportArtifact(page, testInfo, `${viewport.name}-processing.png`);

  release?.();
  await expect(page.getByText("Technical readiness dossier")).toBeVisible();

  await scrollHeadingBelowReportHeader(page, page.locator(".dossier-cover h1"));
  await saveViewportArtifact(page, testInfo, `${viewport.name}-report-summary.png`);
  await scrollHeadingBelowReportHeader(page, page.locator(".do-now h2"));
  await saveViewportArtifact(page, testInfo, `${viewport.name}-actions.png`);
  await scrollHeadingBelowReportHeader(page, page.locator(".evidence-dossier h2"));
  await saveViewportArtifact(page, testInfo, `${viewport.name}-evidence.png`);
}

test("landing to demo verdict shows three evidence-linked actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run the synthetic demo" }).click();

  await expect(page.getByText("Technical readiness dossier")).toBeVisible();
  await expect(page.locator(".action-item")).toHaveCount(3);
  const verdict = page.locator(".verdict-stamp strong");
  const panel = page.locator(".verdict-stamp");
  const [verdictBox, panelBox] = await Promise.all([
    verdict.boundingBox(),
    panel.boundingBox(),
  ]);
  expect(verdictBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(verdictBox?.x).toBeGreaterThanOrEqual(panelBox?.x ?? 0);
  expect((verdictBox?.x ?? 0) + (verdictBox?.width ?? 0)).toBeLessThanOrEqual(
    (panelBox?.x ?? 0) + (panelBox?.width ?? 0),
  );

  await page
    .getByRole("button", { name: /^Open supporting check / })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
    .toMatch(/^check-/);
  await expect(page.locator('[id^="check-"]:focus')).toBeVisible();
});

test("mixed grouped action labels and links every source accurately", async ({
  page,
  request,
}) => {
  const report = (await demoReport(request)) as {
    checks: Array<{
      id: string;
      outcome: string;
      evidenceTier: string;
    }>;
    actions: Array<{
      sourceCheckIds: string[];
      whyNow: string;
    }>;
  };
  const concrete = report.checks.find((check) => check.outcome === "fail");
  const missing = report.checks.find(
    (check) =>
      check.outcome === "unknown" && check.evidenceTier === "absent",
  );
  expect(concrete).toBeTruthy();
  expect(missing).toBeTruthy();
  const grouped = report.actions[0];
  grouped.sourceCheckIds = [concrete?.id ?? "", missing?.id ?? ""];
  grouped.whyNow =
    `Concrete repository evidence triggered ${concrete?.id}. ` +
    `Repository evidence is missing for ${missing?.id}; establish that evidence before treating those controls as operational.`;

  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({ status: 200, json: report });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Run the synthetic demo" }).click();

  await expect(page.locator(".action-item").first()).toContainText(
    `Concrete repository evidence triggered ${concrete?.id}.`,
  );
  await expect(page.locator(".action-item").first()).toContainText(
    `Repository evidence is missing for ${missing?.id}`,
  );

  const firstAction = page.locator(".action-item").first();
  for (const sourceCheckId of grouped.sourceCheckIds) {
    await firstAction
      .getByRole("button", {
        name: `Open supporting check ${sourceCheckId}`,
      })
      .click();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
      .toBe(`check-${sourceCheckId}`);
  }
});

test("valid public URL accepts a complete schema-valid report", async ({
  page,
  request,
}) => {
  const report = await demoReport(request);
  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({ status: 200, json: report });
  });
  await page.goto("/");
  await page
    .getByLabel("Public repository URL")
    .fill("https://github.com/example/repository");
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page.getByText("Technical readiness dossier")).toBeVisible();
  await expect(page.getByText("Repository evidence score")).toBeVisible();
  await expect(page.getByText("Context assumptions")).not.toBeAttached();
  await expect(page.locator(".context-assumptions")).toBeVisible();
});

test("invalid nested GitHub URL is preserved with the specific correction", async ({
  page,
}) => {
  const nested =
    "https://github.com/example/repository/tree/main/src";
  await page.goto("/");
  await page.getByLabel("Public repository URL").fill(nested);
  await page.getByRole("button", { name: "Analyze" }).click();

  await expect(page.locator(".error-notice")).toContainText(
    "Use the repository root URL",
  );
  await expect(page.getByLabel("Public repository URL")).toHaveValue(nested);
});

test("optional context uses radio cards and submits the selected values", async ({
  page,
  request,
}) => {
  const report = await demoReport(request);
  let submittedContext: unknown;
  await page.route("**/api/analyze", async (route) => {
    submittedContext = route.request().postDataJSON()?.context;
    await route.fulfill({ status: 200, json: report });
  });
  await page.goto("/");

  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "I don't know" }).first()).toBeChecked();
  await page.getByRole("radio", { name: "Scaling or production" }).check();
  await page.getByRole("radio", { name: "Sensitive or regulated data" }).check();
  await page.getByRole("radio", { name: "100x more users" }).check();

  await page
    .getByLabel("Public repository URL")
    .fill("https://github.com/example/repository");
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByText("Technical readiness dossier")).toBeVisible();
  expect(submittedContext).toEqual({
    stage: "scaling_production",
    dataSensitivity: "sensitive_regulated",
    growthTarget: "users_100x",
  });
});

for (const viewport of ARTIFACT_VIEWPORTS) {
  test(`founder flow saves ${viewport.name} UI artifacts`, async ({ page, request }, testInfo) => {
    await captureFounderFlowArtifacts(page, request, testInfo, viewport);
  });
}

test("Markdown download contains the same action sources and verification", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run the synthetic demo" }).click();
  await expect(page.getByText("Technical readiness dossier")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown report" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const markdown = await readFile(path ?? "", "utf8");

  expect(download.suggestedFilename()).toMatch(/^scaleproof-.*\.md$/);
  expect(markdown).toContain("Source checks:");
  expect(markdown).toContain("Complete when:");
  expect(markdown).toContain("## Context assumptions");
});

test("cancel returns the preserved form to a usable state without an alert", async ({
  page,
}) => {
  let releaseRequest: (() => void) | undefined;
  const heldRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/analyze", async (route) => {
    await heldRequest;
    await route.abort("aborted").catch(() => undefined);
  });
  await page.goto("/");
  await page
    .getByLabel("Public repository URL")
    .fill("https://github.com/example/repository");
  await page.getByRole("button", { name: "Analyze" }).click();
  await expect(page.getByRole("button", { name: "Cancel scan" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel scan" }).click();

  await expect(page.getByRole("button", { name: "Analyze" })).toBeEnabled();
  await expect(page.locator(".error-notice")).not.toBeAttached();
  await expect(page.getByLabel("Public repository URL")).toHaveValue(
    "https://github.com/example/repository",
  );
  releaseRequest?.();
});
