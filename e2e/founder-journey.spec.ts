import { readFile } from "node:fs/promises";

import { expect, test, type APIRequestContext } from "@playwright/test";

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

test("landing to demo verdict shows three evidence-linked actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run the synthetic demo" }).click();

  await expect(page.getByText("Technical readiness dossier")).toBeVisible();
  await expect(page.locator(".action-item")).toHaveCount(3);

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

test("390x844 shows the primary CTA and keeps report download available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const input = page.getByLabel("Public repository URL");
  const analyze = page.getByRole("button", { name: "Analyze" });
  await expect(input).toBeInViewport();
  await expect(analyze).toBeInViewport();

  await page.getByRole("button", { name: "Run the synthetic demo" }).click();
  await expect(page.getByText("Technical readiness dossier")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download Markdown report" }),
  ).toBeVisible();
});
