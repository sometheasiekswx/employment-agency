// Selected profiles and unsaved edits survive client-side search navigation.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");
const { decideDialog } = require("./browser-dialog.cjs");

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
    const response = await page.request.get(base + "/api/state");
    const original = await response.json();
    assert.match(
      original.state._workspace.path,
      /ea-concept-a-preview-/,
      "Refuse a personal workspace",
    );
    assert.equal(original.state._workspace.demo, true);
    const created = await page.request.post(base + "/api/profile", {
      headers: { Origin: base, "X-Workspace-Token": original.token },
      data: {
        name: "Secondary search fixture",
        roles: ["Engineer"],
        locations: ["Berlin"],
        hard: ["locations"],
        include_unknown: true,
        include_stretch: true,
      },
    });
    assert.equal(created.status(), 200, await created.text());
    const second = (await created.json()).result;
    assert.notEqual(second.id, original.state.profiles[0].id);

    await page.goto(base + "/discover/?view=all");
    await page.locator(".discover-profile-context strong").waitFor();
    await page.locator(".discover-filters > summary").click();
    await page
      .getByLabel("Search profile", { exact: true })
      .selectOption(second.id);
    await page
      .getByText("Secondary search fixture.", { exact: true })
      .waitFor();
    await page.evaluate(() => {
      window.__searchNavigationSentinel = "same document";
    });
    const assertProfile = async () => {
      const context = page.locator(".discover-profile-context strong");
      await context.waitFor({ state: "attached" });
      assert.equal(
        (await context.textContent()).trim(),
        "Secondary search fixture.",
      );
      assert.equal(
        await page.getByLabel("Search profile", { exact: true }).inputValue(),
        second.id,
      );
      assert.equal(
        await page.evaluate(() => window.__searchNavigationSentinel),
        "same document",
        "Search must not reload the document and reset its provider",
      );
    };

    await page
      .getByRole("link", { name: "Add opportunities", exact: true })
      .click();
    await page.waitForURL(base + "/search/#add-opportunity");
    const importHeading = page.getByRole("heading", {
      name: "Add an opportunity",
      exact: true,
    });
    await importHeading.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.id === "add-opportunity",
    );
    const importBounds = await importHeading.boundingBox();
    assert.ok(
      importBounds.y >= 0 && importBounds.y < 1000,
      "Add opportunities scrolls directly to import controls",
    );
    const jobUrl = page.getByLabel("Job URL with JobPosting structured data", {
      exact: true,
    });
    await jobUrl.fill("https://example.com/jobs/unsaved-fixture");
    const discoverLink = page.getByRole("link", {
      name: "Discover",
      exact: true,
    });
    await decideDialog(page, () => discoverLink.click(), false);
    assert.equal(new URL(page.url()).hash, "#add-opportunity");
    assert.equal(
      await jobUrl.inputValue(),
      "https://example.com/jobs/unsaved-fixture",
    );
    await decideDialog(page, () => discoverLink.click(), true);
    await page.waitForURL(base + "/discover/");
    await assertProfile();

    const globalSearch = page.locator(".workspace-search input[name=q]");
    await globalSearch.fill("Backend");
    await globalSearch.press("Enter");
    await page.waitForURL(
      (url) =>
        url.pathname === "/discover/" &&
        url.searchParams.get("q") === "Backend",
    );
    await assertProfile();

    await page.setViewportSize({ width: 390, height: 844 });
    const filters = page.locator(".discover-filters");
    if (!(await filters.evaluate((element) => element.open)))
      await filters.locator("summary").click();
    const localSearch = page.getByLabel("Filter roles", { exact: true });
    await localSearch.fill("DevOps");
    await localSearch.press("Enter");
    await page.waitForURL((url) => url.searchParams.get("q") === "DevOps");
    await assertProfile();
    await page
      .getByRole("button", {
        name: "Assess DevOps Engineer at Northglass Works",
        exact: true,
      })
      .waitFor();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("link", { name: "Career profile", exact: true })
      .click();
    await page
      .getByLabel("Name", { exact: true })
      .fill("Unsaved search fixture name");
    await globalSearch.fill("Python");
    await decideDialog(page, () => globalSearch.press("Enter"), false);
    assert.equal(
      new URL(page.url()).pathname,
      "/career/",
      "Cancelling search navigation preserves the editing page",
    );
    assert.equal(
      await page.getByLabel("Name", { exact: true }).inputValue(),
      "Unsaved search fixture name",
    );
    const unchanged = await (
      await page.request.get(base + "/api/state")
    ).json();
    assert.equal(unchanged.state.identity.name, original.state.identity.name);

    const dialogs = [];
    const recordDialog = (dialog) => {
      dialogs.push(dialog.type());
    };
    page.on("dialog", recordDialog);
    await decideDialog(page, () => globalSearch.press("Enter"), true);
    await page.waitForURL(
      (url) =>
        url.pathname === "/discover/" && url.searchParams.get("q") === "Python",
    );
    await assertProfile();
    page.off("dialog", recordDialog);
    assert.deepEqual(
      dialogs,
      ["confirm"],
      "Accepted SPA navigation asks once, without a second beforeunload prompt",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: header and local search preserve the selected second profile; Enter uses SPA navigation; unsaved draft cancellation and one-time confirmation retain their boundaries.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
