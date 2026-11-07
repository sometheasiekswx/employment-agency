// Use the production export and a disposable local Concept A workspace.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(new URL(base).port, "8766", "Never use the private workspace");

const appearanceKey = "employment-agency:appearance";
const themeSelect = (page) =>
  page
    .getByRole("region", { name: "Appearance", exact: true })
    .getByRole("combobox", { name: "Color theme", exact: true });
const awaitTheme = (page, theme) =>
  page.waitForFunction(
    (value) =>
      document.documentElement.dataset.theme === value &&
      getComputedStyle(document.documentElement).colorScheme === value,
    theme,
  );

(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    const state = (await (await page.request.get(base + "/api/state")).json())
      .state;
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");

    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy|hydrat/i.test(message.text())
      )
        errors.push(message.text());
    });

    await page.goto(base + "/settings/");
    const choice = themeSelect(page);
    await choice.waitFor();
    assert.equal(await choice.inputValue(), "dark");
    await awaitTheme(page, "dark");

    await choice.selectOption("system");
    await awaitTheme(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await awaitTheme(page, "dark");
    assert.equal(await choice.inputValue(), "system");

    await choice.selectOption("light");
    await awaitTheme(page, "light");
    const beforeHydration = await context.newPage();
    await beforeHydration.emulateMedia({ colorScheme: "dark" });
    await beforeHydration.route(
      (url) =>
        url.pathname.startsWith("/_next/static/") &&
        url.pathname.endsWith(".js"),
      (route) => route.abort(),
    );
    await beforeHydration.goto(base + "/history/");
    await awaitTheme(beforeHydration, "light");
    await beforeHydration.close();

    await page.reload();
    await choice.waitFor();
    assert.equal(await choice.inputValue(), "light");
    await awaitTheme(page, "light");
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(await choice.inputValue(), "light");
    await awaitTheme(page, "light");

    const secondTab = await context.newPage();
    await secondTab.goto(base + "/settings/");
    await themeSelect(secondTab).selectOption("dark");
    await awaitTheme(page, "dark");
    assert.equal(await choice.inputValue(), "dark");
    await secondTab.evaluate(
      (key) => localStorage.setItem(key, "invalid"),
      appearanceKey,
    );
    await page.reload();
    await choice.waitFor();
    assert.equal(await choice.inputValue(), "dark");
    await awaitTheme(page, "dark");
    assert.deepEqual(errors, []);

    const blocked = await browser.newContext({ colorScheme: "light" });
    await blocked.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Storage disabled", "SecurityError");
        },
      });
    });
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(base + "/settings/");
    assert.equal(await themeSelect(blockedPage).inputValue(), "dark");
    await themeSelect(blockedPage).selectOption("light");
    await awaitTheme(blockedPage, "light");
    console.log(
      "PASS: Dark default, live System, explicit overrides, browser persistence, first paint under CSP, tab sync and denied storage.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
