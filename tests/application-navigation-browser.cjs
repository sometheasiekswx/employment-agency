// Role selection and application panels preserve keyboard context through polling.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");

(async () => {
  const base = process.env.TEST_URL;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const original = await (await page.request.get(base + "/api/state")).json();
    assert.match(original.state._workspace.path, /ea-concept-a-preview-/);
    assert.equal(original.state._workspace.demo, true);

    await page.goto(base + "/discover/?view=applications&section=active");
    const packages = page.locator(".discover-card-open");
    await packages.nth(1).waitFor();
    assert.equal(
      await page.locator(".discover-inspector:visible").count(),
      0,
      "The default first package does not open or take focus",
    );
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.tagName),
      "ARTICLE",
    );
    await packages.nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.searchParams.has("opportunity"));
    const selectedJob = new URL(page.url()).searchParams.get("opportunity");
    const expected = original.state.applications.find(
      (app) => app.job_id === selectedJob,
    );
    assert.ok(expected);
    const workspace = page.locator(".discover-inspector:visible");
    const target = workspace.locator(`[data-application-id="${expected.id}"]`);
    await target.waitFor();
    assert.equal(new URL(page.url()).searchParams.get("view"), "applications");
    assert.equal(
      await workspace
        .getByRole("button", { name: "CV", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const opener = await workspace
      .getByRole("link", { name: "View job listing", exact: true })
      .elementHandle();
    await workspace
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    await page.waitForURL((url) => url.searchParams.get("panel") === "files");
    assert.equal(await opener.evaluate((node) => node.isConnected), true);
    const labelId = await workspace.getAttribute("aria-labelledby");
    assert.equal(
      await page.locator(`[id="${labelId}"]`).textContent(),
      expected.title,
    );
    await workspace
      .getByRole("button", { name: "Documents", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await workspace.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      true,
      "Tab remains in the selected role's workspace",
    );
    await page.evaluate(() => {
      window.__applicationFocusedElement = document.activeElement;
    });
    await page.waitForResponse(
      (result) => result.url() === base + "/api/state" && result.ok(),
    );
    assert.equal(
      await page.evaluate(
        () => document.activeElement === window.__applicationFocusedElement,
      ),
      true,
      "Polling must leave focus on the user's current control",
    );
    await workspace
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await page.waitForFunction(
      (jobId) =>
        document.activeElement
          ?.closest(".discover-card")
          ?.getAttribute("data-job-id") === jobId,
      selectedJob,
    );

    // Old application bookmarks remain usable, including an invalid target.
    await page.goto(base + "/?application=nonexistent-fixture-package");
    await page
      .getByText(
        "This application is no longer available. Choose another saved application.",
        { exact: true },
      )
      .waitFor();
    await packages.nth(1).waitFor();
    assert.equal(
      await page.locator(".discover-inspector:visible").count(),
      0,
      "An invalid requested package never opens a different application",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: role selection opens the exact document version; keyboard context, close restoration, invalid legacy links and polling preserve focus.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
