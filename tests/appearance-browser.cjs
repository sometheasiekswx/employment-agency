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

async function awaitAppearance(page, theme) {
  await awaitTheme(page, theme);
  const brand = page.getByRole("link", {
    name: "Employment Agency — Opportunities",
    exact: true,
  });
  assert.equal(await brand.getAttribute("href"), "/discover/");
  const image = brand.locator("img:visible");
  const { source, ratio } = await image.evaluate(async (image) => {
    await image.decode();
    return {
      source: new URL(image.currentSrc).pathname,
      ratio: image.width / image.height,
    };
  });
  assert.equal(source, `/agency-header-on-${theme}.svg`);
  assert.ok(
    Math.abs(ratio - 1236 / 330) < 0.1,
    "Wordmark keeps its aspect ratio",
  );
}

async function checkBrowserIcons(page) {
  const iconLinks = [
    {
      rel: "icon",
      suffix: ".ico",
      sizes: "16x16 32x32 48x48",
      type: /^image\/(?:vnd\.microsoft\.icon|x-icon)(?:;|$)/,
    },
    {
      rel: "icon",
      suffix: ".svg",
      sizes: "any",
      type: /^image\/svg\+xml(?:;|$)/,
    },
    {
      rel: "apple-touch-icon",
      suffix: ".png",
      sizes: "180x180",
      type: /^image\/png(?:;|$)/,
    },
    {
      rel: "mask-icon",
      suffix: ".svg",
      sizes: null,
      type: /^image\/svg\+xml(?:;|$)/,
    },
  ];
  async function asset(url, mime) {
    assert.equal(new URL(url, base).origin, base);
    const response = await page.request.get(new URL(url, base).href);
    assert.equal(response.status(), 200, url);
    assert.match(response.headers()["content-type"], mime, url);
    return response;
  }
  for (const { rel, suffix, sizes, type } of iconLinks) {
    const link = page.locator(`link[rel="${rel}"][href$="${suffix}"]`);
    assert.equal(await link.getAttribute("sizes"), sizes);
    await asset(await link.getAttribute("href"), type);
  }
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifest = await (
    await asset(manifestUrl, /^application\/manifest\+json(?:;|$)/)
  ).json();
  assert.equal(manifest.name, "Employment Agency");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/discover/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map(({ sizes, purpose }) => ({ sizes, purpose })),
    [
      { sizes: "192x192", purpose: "any" },
      { sizes: "512x512", purpose: "any" },
      { sizes: "512x512", purpose: "maskable" },
    ],
  );
  for (const { src, sizes, type } of manifest.icons) {
    assert.equal(type, "image/png");
    await asset(src, /^image\/png(?:;|$)/);
    const dimensions = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, src);
    assert.equal(dimensions, sizes);
  }
}

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
    await awaitAppearance(page, "dark");
    await checkBrowserIcons(page);

    await choice.selectOption("system");
    await awaitAppearance(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await awaitAppearance(page, "dark");
    assert.equal(await choice.inputValue(), "system");

    await choice.selectOption("light");
    await awaitAppearance(page, "light");
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
    await awaitAppearance(page, "light");
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(await choice.inputValue(), "light");
    await awaitAppearance(page, "light");

    const secondTab = await context.newPage();
    await secondTab.goto(base + "/settings/");
    await themeSelect(secondTab).selectOption("dark");
    await awaitAppearance(page, "dark");
    assert.equal(await choice.inputValue(), "dark");
    await secondTab.evaluate(
      (key) => localStorage.setItem(key, "invalid"),
      appearanceKey,
    );
    await page.reload();
    await choice.waitFor();
    assert.equal(await choice.inputValue(), "dark");
    await awaitAppearance(page, "dark");
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
    await awaitAppearance(blockedPage, "light");
    console.log(
      "PASS: Appearance and themed wordmark, CSP first paint, tab sync, denied storage, browser and install icons.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
