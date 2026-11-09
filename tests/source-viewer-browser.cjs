// Production-export source links with fictional websites and no external traffic.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  chromium,
  devices,
  webkit,
} = require("../frontend/node_modules/playwright");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const listingUrl = "https://listing.example.com/jobs/cloud";
const secondListingUrl = "https://listing.example.com/jobs/backend";
const careersUrl = "https://company.example.com/careers";
const employer = "Emberlane Systems";
const title = "Cloud Software Engineer";
const output = "output/playwright/source-viewer";

async function checkMobile(browser, profile, label) {
  const context = await browser.newContext(devices[profile]);
  const listingResponse = Promise.withResolvers();
  try {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    const stateUrl = base + "/api/state";
    const response = await context.request.get(stateUrl);
    const { state } = await response.json();
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");
    const role = state.jobs.find((job) => job.employer === employer);
    const secondRole = state.jobs.find(
      (job) => job.employer === "Bayform Labs",
    );
    await context.route(stateUrl, async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const job = data.state.jobs.find((job) => job.id === role.id);
      Object.assign(job, { url: listingUrl, careers_url: careersUrl });
      data.state.jobs.find((job) => job.id === secondRole.id).url =
        secondListingUrl;
      await route.fulfill({ response, json: data });
    });
    let listingRequests = 0;
    await context.route(listingUrl, async (route) => {
      listingRequests++;
      await listingResponse.promise;
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><title>Fictional listing</title><h1>Fictional live listing</h1><script>document.querySelector("h1").textContent = "Script ran";</script>',
      });
    });
    await context.route(careersUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: { "X-Frame-Options": "DENY" },
        body: "<h1>Fictional company careers</h1>",
      }),
    );
    await context.route(secondListingUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Fictional backend listing</h1>",
      }),
    );

    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/discover/?view=all");
    await page
      .getByRole("button", { name: `Assess ${title} at ${employer}` })
      .tap();
    const inspector = page.locator(".discover-inspector");
    const listingLink = inspector.getByRole("link", {
      name: title,
      exact: true,
    });
    await page.waitForURL(
      (url) => url.searchParams.get("opportunity") === role.id,
    );
    const selected = page.url();
    assert.equal(listingRequests, 0, "Wait for a deliberate link activation");

    const requested = page.waitForRequest(listingUrl);
    await listingLink.tap();
    await requested;
    const listing = page.getByRole("dialog", { name: "Listing preview" });
    const done = listing.getByRole("button", { name: "Done", exact: true });
    await done.waitFor();
    assert.equal(
      await done.evaluate((button) => button === document.activeElement),
      true,
    );
    assert.equal(page.url(), selected);
    assert.equal(context.pages().length, 1);
    assert.equal(
      await listing.getByText(role.description, { exact: true }).isVisible(),
      true,
      "The first view shows saved details even while the website request is pending",
    );
    listingResponse.resolve();
    await listing.getByRole("button", { name: "Show website" }).tap();
    const relay = listing.frameLocator(
      'iframe[title="Listing website preview"]',
    );
    await relay
      .frameLocator('iframe[title="Source website"]')
      .getByRole("heading", {
        name: "Fictional live listing",
      })
      .waitFor();
    assert.equal(await relay.locator("iframe").getAttribute("sandbox"), "");
    assert.equal(
      listingRequests,
      1,
      "The website stays loaded while reading saved details",
    );
    await page.screenshot({ path: `${output}/${label}-listing.png` });
    await done.tap();
    await listing.waitFor({ state: "hidden" });
    assert.equal(
      await listingLink.evaluate((link) => link === document.activeElement),
      true,
    );
    assert.equal(page.url(), selected);

    const companyLink = inspector.getByRole("link", {
      name: employer,
      exact: true,
    });
    const companyRequest = page.waitForRequest(careersUrl);
    await companyLink.tap();
    await companyRequest;
    const company = page.getByRole("dialog", { name: "Company preview" });
    await company
      .getByText("Careers site · company.example.com", { exact: true })
      .waitFor();
    await company.getByRole("button", { name: "Show website" }).tap();
    await company
      .getByText("If the preview stays blank, open it in a new tab.")
      .waitFor();
    await company.getByRole("button", { name: "Saved details" }).tap();
    await page.setViewportSize({ width: 320, height: 700 });
    assert.equal(
      await company.evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return (
          rect.top === 0 &&
          rect.left === 0 &&
          rect.width === innerWidth &&
          rect.height === innerHeight &&
          dialog.scrollWidth <= dialog.clientWidth
        );
      }),
      true,
      "The viewer fills a narrow phone viewport without overflow",
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map((violation) => violation.id),
      [],
    );
    await page.screenshot({ path: `${output}/${label}-saved-company.png` });
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      company.getByRole("link", { name: "Open in new tab" }).tap(),
    ]);
    await popup.waitForURL(careersUrl);
    await popup.close();
    assert.equal(page.url(), selected);
    await page.keyboard.press("Escape");
    await company.waitFor({ state: "hidden" });
    assert.equal(
      await companyLink.evaluate((link) => link === document.activeElement),
      true,
    );
    const originalDocument = page.frame({ url: listingUrl });
    assert.ok(originalDocument, "Done keeps a recent website loaded");
    await listingLink.tap();
    await listing.getByText(role.description, { exact: true }).waitFor();
    await listing.getByRole("button", { name: "Show website" }).tap();
    await relay
      .frameLocator('iframe[title="Source website"]')
      .getByRole("heading", { name: "Fictional live listing" })
      .waitFor();
    assert.equal(page.frame({ url: listingUrl }), originalDocument);
    assert.equal(
      listingRequests,
      1,
      "Reopening does not request the site again",
    );
    await done.tap();

    await inspector
      .getByRole("button", { name: "Close opportunity details" })
      .tap();
    await page
      .getByRole("button", {
        name: `Assess ${secondRole.title} at ${secondRole.employer}`,
      })
      .tap();
    const secondRequest = page.waitForRequest(secondListingUrl);
    await inspector
      .getByRole("link", { name: secondRole.title, exact: true })
      .tap();
    await secondRequest;
    const retainedFrames = await listing
      .locator("iframe")
      .evaluateAll((frames) =>
        frames.map((frame) =>
          decodeURIComponent(new URL(frame.src).hash.slice(1)),
        ),
      );
    assert.deepEqual(retainedFrames, [listingUrl, secondListingUrl]);
    assert.equal(page.frame({ url: listingUrl }), originalDocument);
    await done.tap();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${label}: immediate saved details, denied-frame fallback, sandbox, one request across repeat opens, explicit tab and focus return.`,
    );
  } finally {
    listingResponse.resolve();
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
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
      await checkMobile(browser, profile, label);
    } finally {
      await browser.close();
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
