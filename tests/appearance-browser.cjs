// Use the production export and a disposable local Concept A workspace.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(new URL(base).port, "8766", "Never use the private workspace");

const appearanceKey = "employment-agency:appearance";
const nextMode = { Dark: "Light", Light: "System", System: "Dark" };
const themeLabel = (mode) =>
  `Color theme: ${mode}. Switch to ${nextMode[mode]}`;
const themeButton = (page, mode) =>
  page.getByRole("button", { name: themeLabel(mode), exact: true });
const themeFeedback = (page, mode) =>
  page.getByRole("status").filter({ hasText: new RegExp(`^${mode} theme$`) });
async function assertMode(page, mode) {
  await themeButton(page, mode).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /color theme/i }).count(),
    1,
  );
  assert.equal(
    await themeButton(page, mode).getAttribute("title"),
    themeLabel(mode),
  );
}
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
  const browser =
    process.env.BROWSER_ENGINE === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          channel: process.env.BROWSER_CHANNEL || "chrome",
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
    await assertMode(page, "Dark");
    await awaitAppearance(page, "dark");
    await checkBrowserIcons(page);

    const themePosition = await themeButton(page, "Dark").boundingBox();
    await themeButton(page, "Dark").press("Enter");
    await assertMode(page, "Light");
    await themeFeedback(page, "Light").waitFor();
    assert.deepEqual(
      await themeButton(page, "Light").boundingBox(),
      themePosition,
    );
    assert.ok(
      await themeButton(page, "Light").evaluate(
        (button) =>
          button === document.activeElement && button.matches(":focus-visible"),
      ),
    );
    await awaitAppearance(page, "light");
    await themeFeedback(page, "Light").waitFor({
      state: "hidden",
      timeout: 4_000,
    });
    await themeButton(page, "Light").press("Space");
    await assertMode(page, "System");
    await awaitAppearance(page, "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await awaitAppearance(page, "dark");
    await assertMode(page, "System");
    await page.reload();
    await assertMode(page, "System");
    await awaitAppearance(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await awaitAppearance(page, "light");
    await themeButton(page, "System").click();
    await assertMode(page, "Dark");
    await awaitAppearance(page, "dark");

    await themeButton(page, "Dark").click();
    await assertMode(page, "Light");
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
    await assertMode(page, "Light");
    await awaitAppearance(page, "light");
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await assertMode(page, "Light");
    await awaitAppearance(page, "light");

    const secondTab = await context.newPage();
    await secondTab.goto(base + "/settings/");
    await themeButton(secondTab, "Light").click();
    await assertMode(page, "System");
    await themeButton(secondTab, "System").click();
    await awaitAppearance(page, "dark");
    await assertMode(page, "Dark");
    await secondTab.evaluate(
      (key) => localStorage.setItem(key, "invalid"),
      appearanceKey,
    );
    await page.reload();
    await assertMode(page, "Dark");
    await awaitAppearance(page, "dark");
    assert.deepEqual(errors, []);

    const phone = await browser.newContext({
      viewport: { width: 320, height: 700 },
      hasTouch: true,
      reducedMotion: "reduce",
      colorScheme: "light",
    });
    const phonePage = await phone.newPage();
    await phonePage.goto(base + "/discover/");
    await assertMode(phonePage, "Dark");
    const phoneBounds = await themeButton(phonePage, "Dark").boundingBox();
    assert.ok(phoneBounds.width >= 44 && phoneBounds.height >= 44);
    await themeButton(phonePage, "Dark").tap();
    await assertMode(phonePage, "Light");
    await themeFeedback(phonePage, "Light").waitFor();
    await themeButton(phonePage, "Light").tap();
    await assertMode(phonePage, "System");
    await themeFeedback(phonePage, "System").waitFor();
    assert.equal(await themeFeedback(phonePage, "Light").count(), 0);
    const feedbackBounds = await themeFeedback(
      phonePage,
      "System",
    ).boundingBox();
    assert.ok(
      feedbackBounds.x >= 0 &&
        feedbackBounds.x + feedbackBounds.width <= 320 &&
        feedbackBounds.y >= 0 &&
        feedbackBounds.y + feedbackBounds.height <= 700,
      "Theme feedback fits in the phone viewport",
    );
    await awaitAppearance(phonePage, "light");
    await phonePage
      .getByRole("navigation", { name: "Workspace sections", exact: true })
      .getByRole("link", { name: "Settings", exact: true })
      .tap();
    await phonePage.waitForURL(base + "/settings/");
    await assertMode(phonePage, "System");
    await phone.close();

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
    await assertMode(blockedPage, "Dark");
    await themeButton(blockedPage, "Dark").click();
    await awaitAppearance(blockedPage, "light");
    console.log(
      "PASS: Single theme button cycles Dark → Light → System → Dark with keyboard, touch and temporary feedback, tracks system and tab changes, and preserves first paint, denied-storage behavior, wordmark and install icons.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
