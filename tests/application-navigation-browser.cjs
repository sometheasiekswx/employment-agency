// Package jumps preserve keyboard context without moving focus on refresh.
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
    const response = await page.request.get(base + "/api/state");
    const original = await response.json();
    assert.match(original.state._workspace.path, /ea-concept-a-preview-/);
    assert.equal(original.state._workspace.demo, true);

    await page.goto(base + "/");
    const packages = page.locator(".application-overview-row");
    await packages.nth(1).waitFor();
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.tagName),
      "ARTICLE",
      "The default first package does not take focus",
    );
    await packages.nth(1).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.searchParams.has("application"));
    const selected = new URL(page.url()).searchParams.get("application");
    const target = page.locator(`[data-application-id="${selected}"]`);
    await page.waitForFunction(
      (id) =>
        document.activeElement?.getAttribute("data-application-id") === id,
      selected,
    );
    assert.equal(await target.getAttribute("tabindex"), "-1");
    const labelId = await target.getAttribute("aria-labelledby");
    assert.equal(
      await page.locator(`[id="${labelId}"]`).textContent(),
      original.state.applications.find((app) => app.id === selected).title,
    );
    await page.keyboard.press("Tab");
    const activePackage = () =>
      page.evaluate(() =>
        document.activeElement
          ?.closest("[data-application-id]")
          ?.getAttribute("data-application-id"),
      );
    assert.equal(
      await activePackage(),
      selected,
      "Tab enters the package that was selected, not an earlier package",
    );
    const focused = await page.evaluate(() => {
      window.__applicationFocusedElement = document.activeElement;
      return document.activeElement?.tagName;
    });
    assert.notEqual(focused, "ARTICLE");
    // The local provider refreshes state every 1.5s. Observe a real refresh.
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

    await page.goto(base + "/?application=nonexistent-fixture-package");
    await packages.nth(1).waitFor();
    assert.notEqual(
      await page.evaluate(() => document.activeElement?.tagName),
      "ARTICLE",
      "An invalid requested package must not focus the default package",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: selecting the second application moves keyboard context into that package; default/invalid selection and polling preserve focus.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
