// Production-export links through the local fixture, with no employer traffic.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, devices, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
const listingUrl = "https://listing.example.com/jobs/cloud?ref=workspace";
const careersUrl = "https://company.example.com/team/careers";
const fallbackListing = "https://job-board.example.com/jobs/backend";
const fallbackCompany = new URL("/", fallbackListing).href;

async function checkSourceLinks(browser, profile, label) {
  const context = await browser.newContext(devices[profile]);
  try {
    const stateUrl = base + "/api/state";
    const { state } = await (await context.request.get(stateUrl)).json();
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");
    const cloud = state.jobs.find(
      (job) => job.employer === "Emberlane Systems",
    );
    const backend = state.jobs.find((job) => job.employer === "Bayform Labs");
    assert.ok(cloud && backend, "The fictional roles must be available");

    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    await context.route(stateUrl, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      Object.assign(
        data.state.jobs.find((job) => job.id === cloud.id),
        {
          url: listingUrl,
          careers_url: careersUrl,
        },
      );
      Object.assign(
        data.state.jobs.find((job) => job.id === backend.id),
        {
          url: fallbackListing,
          careers_url: "",
        },
      );
      await route.fulfill({ response, json: data });
    });
    for (const [url, heading] of [
      [listingUrl, "Fictional live listing"],
      [careersUrl, "Fictional careers site"],
      [fallbackCompany, "Fictional listing source"],
    ]) {
      await context.route(url, (route) =>
        route.fulfill({
          contentType: "text/html",
          headers: { "X-Frame-Options": "DENY" },
          body: `<h1>${heading}</h1>`,
        }),
      );
    }

    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/discover/?view=all");
    const inspector = page.locator(".discover-inspector");

    async function assess(role) {
      await page
        .getByRole("button", {
          name: `Assess ${role.title} at ${role.employer}`,
        })
        .tap();
      await page.waitForURL(
        (url) => url.searchParams.get("opportunity") === role.id,
      );
    }

    async function openSource(name, url, heading) {
      const selected = page.url();
      const link = inspector.getByRole("link", { name, exact: true });
      assert.equal(await link.evaluate((anchor) => anchor.href), url);
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        link.tap(),
      ]);
      await popup.waitForURL(url);
      await popup.getByRole("heading", { name: heading }).waitFor();
      assert.equal(await popup.evaluate(() => window.opener === null), true);
      assert.equal(context.pages().length, 2);
      await popup.close();
      assert.equal(page.url(), selected);
      assert.equal(await inspector.isVisible(), true);
      assert.equal(page.frames().length, 1);
      assert.equal(await page.locator(".discover-source-preview").count(), 0);
    }

    await assess(cloud);
    await openSource(cloud.title, listingUrl, "Fictional live listing");
    await openSource(cloud.employer, careersUrl, "Fictional careers site");
    await openSource("View job listing", listingUrl, "Fictional live listing");
    await inspector
      .getByRole("button", { name: "Close opportunity details" })
      .tap();
    await assess(backend);
    await openSource(
      backend.employer,
      fallbackCompany,
      "Fictional listing source",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${label}: listing and company links open new tabs and preserve the selected role.`,
    );
  } finally {
    await context.close();
  }
}

(async () => {
  for (const [engine, profile, label] of [
    [chromium, "Pixel 7", "Android Chromium"],
    [webkit, "iPhone 15", "iPhone WebKit"],
  ]) {
    if (engine === webkit && !fs.existsSync(webkit.executablePath())) {
      console.log("SKIP iPhone WebKit: browser is not installed.");
      continue;
    }
    const browser = await engine.launch(
      engine === chromium ? { channel: "chrome" } : {},
    );
    try {
      await checkSourceLinks(browser, profile, label);
    } finally {
      await browser.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
