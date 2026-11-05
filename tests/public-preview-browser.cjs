// Static public preview acceptance: no Python runtime, private API or sign-in.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(base, "Set TEST_URL to the static fictional preview");
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    const apiRequests = [];
    const externalRequests = [];
    const mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        url.pathname.startsWith("/api/") ||
        /supabase|oauth|openai|googleapis/.test(url.hostname)
      )
        apiRequests.push(url.href);
      if (!["GET", "HEAD"].includes(request.method()))
        mutations.push(request.method() + " " + url.href);
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.origin !== new URL(base).origin
      ) {
        externalRequests.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    const snapshot = await (
      await page.request.get(base + "/demo/preview.json")
    ).json();
    assert.equal(snapshot.public_preview, true);
    assert.equal(snapshot.state._workspace.demo, true);
    assert.equal(snapshot.state.identity.name, "Alex Morgan");
    const assessCloud = () =>
      page.getByRole("button", {
        name: "Assess Cloud Software Engineer at Emberlane Systems",
        exact: true,
      });
    fs.mkdirSync("output/playwright/public-preview", { recursive: true });
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1440, height: 768 },
      { width: 1024, height: 1000 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      for (const view of ["recommended", "all"]) {
        await page.goto(`${base}/discover/?view=${view}`);
        await assessCloud().waitFor();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await assessCloud().click();
        await page.waitForFunction(() => {
          const footer = document.querySelector(".discover-inspector-footer");
          return (
            footer &&
            footer.getBoundingClientRect().bottom <= window.innerHeight + 1
          );
        });
        const geometry = await page
          .locator(".discover-inspector")
          .evaluate((element) => ({
            top: element.getBoundingClientRect().top,
            bottom: element
              .querySelector(".discover-inspector-footer")
              .getBoundingClientRect().bottom,
            viewport: window.innerHeight,
            scroll: window.scrollY,
            bodyHeight: element.querySelector(".discover-inspector-body")
              .clientHeight,
          }));
        assert.ok(
          geometry.bottom <= geometry.viewport + 1,
          `footer stays visible at ${JSON.stringify(viewport)}, ${view}: ${JSON.stringify(geometry)}`,
        );
        assert.ok(
          geometry.bodyHeight > 0,
          "remaining panel space belongs to its scrollable body",
        );
        assert.equal(
          geometry.scroll,
          scrollBefore,
          "opening details does not scroll the page to uncover its footer",
        );
        if (
          viewport.width === 1440 &&
          viewport.height === 1000 &&
          view === "recommended"
        )
          await page.screenshot({
            path: "output/playwright/public-preview/inspector-viewport-fit.png",
          });
        await page
          .getByRole("button", {
            name: "Close opportunity details",
            exact: true,
          })
          .click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/discover/?view=all");
    await assessCloud().waitFor();
    await page
      .getByRole("complementary", { name: "Public preview information" })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /Continue with Google/ }).count(),
      0,
    );
    await page.screenshot({
      path: "output/playwright/public-preview/discover-desktop.png",
    });
    await assessCloud().click();
    const inspector = page.locator(".discover-inspector");
    const applicationId = new URL(
      await inspector
        .getByRole("link", { name: "Review documents", exact: true })
        .getAttribute("href"),
      base,
    ).searchParams.get("application");
    await inspector
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await inspector
      .getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      })
      .click();
    await inspector
      .getByRole("button", {
        name: "Unsave Cloud Software Engineer",
        exact: true,
      })
      .waitFor();
    await page.locator("#notice").filter({ hasText: "Role saved." }).waitFor();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".discover-inspector-footer")
          .getBoundingClientRect().bottom <=
        window.innerHeight + 1,
    );
    await page.reload();
    await inspector
      .getByRole("button", {
        name: "Unsave Cloud Software Engineer",
        exact: true,
      })
      .waitFor();
    const overlay = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith("employment-agency:fictional-bookmarks:"),
        ),
      ),
    );
    assert.equal(Object.keys(overlay).length, 1);
    assert.match(Object.keys(overlay)[0], /:job:[a-f0-9]+$/);
    assert.deepEqual(
      Object.values(overlay).map((value) => JSON.parse(value)),
      [true],
    );

    const independent = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const second = await independent.newPage();
    await second.goto(base + "/discover/?view=all");
    await second
      .getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      })
      .waitFor();
    await independent.close();

    // Both tabs load before either writes. Independent role keys must preserve
    // both choices instead of letting the second tab replace a stale whole map.
    const shared = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const firstTab = await shared.newPage();
    const secondTab = await shared.newPage();
    await Promise.all([
      firstTab.goto(base + "/discover/?view=all"),
      secondTab.goto(base + "/discover/?view=all"),
    ]);
    await Promise.all([
      firstTab
        .getByRole("button", {
          name: "Save Cloud Software Engineer",
          exact: true,
        })
        .waitFor(),
      secondTab
        .getByRole("button", { name: "Save Backend Engineer", exact: true })
        .waitFor(),
    ]).catch(async (error) => {
      for (const [index, tab] of [firstTab, secondTab].entries()) {
        await tab.screenshot({path: `output/playwright/public-preview/concurrent-tab-${index}.png`, fullPage: true});
        fs.writeFileSync(`output/playwright/public-preview/concurrent-tab-${index}.txt`, await tab.locator("body").innerText());
      }
      throw error;
    });
    await firstTab
      .getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      })
      .click();
    await firstTab
      .locator("#notice")
      .filter({ hasText: "Role saved." })
      .waitFor();
    await secondTab
      .getByRole("button", { name: "Save Backend Engineer", exact: true })
      .click();
    await secondTab
      .locator("#notice")
      .filter({ hasText: "Role saved." })
      .waitFor();
    for (const tab of [firstTab, secondTab]) {
      await tab.reload();
      await tab
        .getByRole("button", {
          name: "Unsave Cloud Software Engineer",
          exact: true,
        })
        .waitFor();
      await tab
        .getByRole("button", { name: "Unsave Backend Engineer", exact: true })
        .waitFor();
    }
    await shared.close();

    await page
      .getByRole("button", {
        name: "Assess Backend Engineer at Bayform Labs",
        exact: true,
      })
      .click();
    assert.equal(
      await inspector
        .getByRole("button", { name: "Prepare draft", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await assessCloud().click();
    await inspector
      .getByRole("link", { name: "Review documents", exact: true })
      .click();
    const application = page.locator(
      `[data-application-id="${applicationId}"]`,
    );
    await application
      .getByRole("button", { name: "View CV", exact: true })
      .waitFor();
    assert.equal(
      await application
        .getByRole("button", { name: "Record submission…", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await application
        .getByRole("button", { name: "Save comment", exact: true })
        .isDisabled(),
      true,
    );
    const pdfHref = await application
      .getByRole("link", { name: "CV PDF", exact: true })
      .getAttribute("href");
    assert.match(pdfHref, /^\/demo\/files\/[a-f0-9]+\.pdf$/);
    const pdf = await page.request.get(new URL(pdfHref, base).href);
    assert.equal(pdf.status(), 200);
    assert.equal((await pdf.body()).subarray(0, 4).toString(), "%PDF");
    await application
      .getByRole("button", { name: "View CV", exact: true })
      .click();
    const viewer = page.getByRole("dialog", { name: "CV", exact: true });
    await viewer.waitFor();
    assert.match(await viewer.locator("iframe").getAttribute("src"), /^blob:/);
    assert.equal(
      await viewer
        .getByRole("button", { name: "Save as new draft", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: "output/playwright/public-preview/fictional-document.png",
    });
    await viewer.getByRole("button", { name: "Close", exact: true }).click();
    await application
      .getByText("Supporting files & source evidence", { exact: true })
      .click();
    const wordLink = application.locator('a[href$=".docx"]').first();
    const word = await page.request.get(
      new URL(await wordLink.getAttribute("href"), base).href,
    );
    assert.equal(word.status(), 200);
    assert.equal((await word.body()).subarray(0, 2).toString(), "PK");

    await page.goto(base + "/career/");
    await page
      .getByRole("heading", { name: "Career profile", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Save details", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page.getByLabel("Name", { exact: true }).isDisabled(),
      true,
    );
    await page.goto(base + "/search/");
    await page
      .getByRole("heading", { name: "Preferred locations", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Import URL", exact: true })
        .isDisabled(),
      true,
    );
    await page.goto(base + "/history/");
    await page.getByRole("heading", { name: "History", exact: true }).waitFor();
    await page.locator(".history-version summary").first().click();
    const historical = page
      .locator('.history-files a[href^="/demo/files/"]')
      .first();
    await historical.waitFor();
    assert.equal(
      (
        await page.request.get(
          new URL(await historical.getAttribute("href"), base).href,
        )
      ).status(),
      200,
    );
    await page.goto(base + "/settings/");
    await page
      .getByRole("heading", { name: "Settings", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Open Folder", exact: true })
        .isDisabled(),
      true,
    );
    assert.ok(
      (
        await page
          .getByRole("button", { name: "Grant consent", exact: true })
          .all()
      ).length > 0,
    );
    for (const control of await page
      .getByRole("button", { name: "Grant consent", exact: true })
      .all())
      assert.equal(await control.isDisabled(), true);

    await page.goto(base + "/discover/?view=all");
    await assessCloud().waitFor();
    const desktopAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      desktopAxe.violations.map((violation) => violation.id),
      [],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await assessCloud().click();
    const modal = page.getByRole("dialog", {
      name: "Cloud Software Engineer",
      exact: true,
    });
    await modal.waitFor();
    await modal
      .getByRole("button", { name: "Expand details", exact: true })
      .click();
    await page.screenshot({
      path: "output/playwright/public-preview/discover-mobile.png",
    });
    const mobileAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      mobileAxe.violations.map((violation) => violation.id),
      [],
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(
      "Public static preview passed: six routes, fictional PDF/Word views, isolated browser bookmarks, disabled private operations, no API/auth/provider requests and accessible desktop/mobile layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
