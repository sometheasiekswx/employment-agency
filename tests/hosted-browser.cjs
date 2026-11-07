// Run with PLAYWRIGHT_PATH pointing at an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  showPanel,
  selectApplication,
  workbench,
  removalControl,
} = require("./browser-applications.cjs");
(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "ea-cloud-session",
      JSON.stringify({
        access_token: "fixture-session",
        refresh_token: "fixture",
        expires_at: Date.now() + 3600000,
      }),
    ),
  );
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8769");
  await page.waitForURL((url) => url.pathname === "/discover/");

  await page.getByRole("link", { name: "Career profile" }).click();
  await page.getByRole("heading", { name: "Your details" }).waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Alex Morgan");
  await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.locator("#notice").filter({ hasText: "Saved." }).waitFor();
  await page.getByText("Add experience or a skill", { exact: true }).click();
  await page
    .getByLabel("Statement", { exact: true })
    .fill("Built Python APIs and automated integration tests.");
  await page.getByRole("button", { name: "Save for confirmation" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByText("1 confirmed", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Search preferences" }).click();
  await page.getByText("Create another profile", { exact: true }).click();
  await page.getByLabel("Profile name").fill("Software engineering");
  await page.getByLabel("Target roles").fill("Engineer");
  await page.getByLabel("Locations in priority order").fill("Toronto");
  await page.getByLabel("Include stretch roles").check();
  await page.getByLabel("Prepare drafts when eligibility").check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByText("Edit Software engineering", { exact: true }).waitFor();
  await page
    .getByText("Paste an advert or add details manually", { exact: true })
    .click();
  await page.getByLabel("Job title", { exact: true }).fill("Software Engineer");
  await page.getByLabel("Employer", { exact: true }).fill("Fictional Systems");
  await page.getByLabel("Exact location").fill("Toronto");
  await page
    .getByLabel("Paste the job advert")
    .fill("Build Python APIs and integration tests.");
  await page.getByLabel("Requirements —").fill("Python APIs");
  await page.route("**/api/job", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.getByRole("button", { name: "Save job" }).click();
  // Hosted saves are asynchronous. Rank only after the saved record is visible.
  await page.getByText("Saved jobs (1)", { exact: true }).waitFor();
  await page.unroute("**/api/job");
  await page.getByRole("button", { name: "Rank saved jobs" }).click();
  await page
    .getByRole("heading", { name: "Software Engineer · Fictional Systems" })
    .waitFor();
  await page
    .getByRole("button", { name: "Prepare application", exact: true })
    .click();
  await page.locator("#notice").filter({ hasText: "Saved." }).waitFor();
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Assess Software Engineer at Fictional Systems",
      exact: true,
    })
    .click();
  await page.waitForURL((url) => Boolean(url.searchParams.get("opportunity")));
  const selectedJob = new URL(page.url()).searchParams.get("opportunity");
  await showPanel(page, "documents");
  await page.waitForURL((url) => Boolean(url.searchParams.get("application")));
  const selectedApplication = {
    id: new URL(page.url()).searchParams.get("application"),
    job_id: selectedJob,
    title: "Software Engineer",
    status: "draft",
  };
  await workbench(page)
    .getByRole("heading", { name: "Software Engineer", exact: true })
    .waitFor();
  assert.equal(await page.locator('a[href^="/files/"]').count(), 8);
  const fileLink = page.getByRole("link", { name: "CV PDF", exact: true });
  const download = page.waitForEvent("download");
  await fileLink.click();
  assert.match((await download).suggestedFilename(), /CV.*pdf$/);
  assert.equal(await page.locator('select[name="status"]').count(), 0);
  await page.locator(".application-context > summary").click();
  assert.equal(
    await page
      .locator(".application-details dd")
      .filter({ hasText: /^unknown$/i })
      .count(),
    0,
  );
  await page.locator(".fit-summary").waitFor();
  fs.mkdirSync("output/playwright", { recursive: true });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "output/playwright/hosted-current.png",
    fullPage: true,
  });
  await showPanel(page, "activity");
  await page
    .getByLabel("Comments", { exact: true })
    .fill("Reviewed the tailored files.");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await page.getByText("Review history (1)", { exact: true }).waitFor();
  await removalControl(page, selectedApplication).click();
  await page.getByRole("button", { name: "Removed 1", exact: true }).click();
  await selectApplication(page, selectedApplication);
  await removalControl(page, selectedApplication, true).click();
  await page.getByRole("button", { name: "Active 1", exact: true }).click();
  await selectApplication(page, selectedApplication);
  await page
    .getByRole("button", { name: "Record submission…", exact: true })
    .click();
  await page
    .getByLabel("Where or how you submitted")
    .fill("Fictional employer website");
  await page
    .getByLabel("I have already submitted this application.", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Confirm submission record", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("section") === "submitted" &&
      url.searchParams.get("panel") === "activity",
  );
  assert.equal(
    await workbench(page)
      .getByRole("button", { name: "Activity", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "Recording a submission stays in Activity so its decision is visible",
  );
  await page.getByRole("button", { name: "Submitted 1", exact: true }).click();
  await selectApplication(page, selectedApplication);
  await workbench(page).locator(".dossier").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Reject", exact: true }).count(),
    0,
  );
  await page
    .getByLabel("Comments", { exact: true })
    .fill("Saved after submission.");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await page.getByText("Review history (3)", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Submitted 1", exact: true })
    .waitFor();
  await workbench(page).locator(".dossier").waitFor();
  assert.equal(
    await page
      .locator(".application-review-history")
      .evaluate((element) => element.open),
    true,
  );
  await page.getByText("Saved after submission.", { exact: false }).waitFor();
  fs.mkdirSync("output/playwright", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "output/playwright/hosted-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction((mobile) => {
      const surface = document.querySelector(
        ".opportunities-workbench:not([hidden])",
      );
      return surface?.matches("dialog:modal") === mobile;
    }, width <= 1000);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "output/playwright/hosted-mobile.png",
    fullPage: true,
  });
  await workbench(page)
    .getByRole("button", { name: "Close application workspace", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Account and recovery" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Open Folder", exact: true })
      .count(),
    0,
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Browser workflow passed: identity, fact confirmation, profile, job, rank, run, review, responsive layout, no console errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
