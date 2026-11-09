// Production-export Discover acceptance against serve_concept_fixture.py only.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(base, "Use the disposable concept fixture through TEST_URL");
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
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
    const external = [];
    let preparations = 0;
    let rankings = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/local-package")
        preparations++;
      if (new URL(request.url()).pathname === "/api/rank") rankings++;
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        url.origin !== new URL(base).origin
      ) {
        external.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    const state = async () =>
      (await (await page.request.get(base + "/api/state")).json()).state;
    const initial = await state();
    assert.equal(initial._workspace.demo, true);
    assert.match(initial._workspace.path, /ea-concept-a-preview-/);
    assert.equal(initial.identity.name, "Alex Morgan");
    const submitted = initial.applications.find(
      (app) => app.status === "submitted",
    );
    assert.ok(submitted);
    const snapshotHash = async () => {
      const response = await page.request.get(
        `${base}/files/${submitted.id}/resume.pdf`,
      );
      assert.equal(response.status(), 200);
      return crypto
        .createHash("sha256")
        .update(await response.body())
        .digest("hex");
    };
    const originalHash = await snapshotHash();
    const cloud = () =>
      page.getByRole("button", {
        name: "Assess Cloud Software Engineer at Emberlane Systems",
        exact: true,
      });
    const inspector = () => page.locator(".discover-inspector");
    const close = () =>
      page.getByRole("button", {
        name: "Close opportunity details",
        exact: true,
      });
    const checkKeyboardNavigation = async () => {
      const visualTitles = await page
        .locator(".discover-card-open h3")
        .allTextContents();
      assert.ok(
        visualTitles.length > 2,
        "The fixture exercises navigation between and across boundaries",
      );
      const next = inspector().getByRole("button", {
        name: "Next opportunity",
        exact: true,
      });
      const previous = inspector().getByRole("button", {
        name: "Previous opportunity",
        exact: true,
      });
      const assertFocusedTitle = async (name) => {
        const heading = inspector().getByRole("heading", { name, exact: true });
        await heading.waitFor();
        await page.waitForFunction(
          (text) =>
            document.activeElement?.tagName === "H2" &&
            document.activeElement.textContent === text,
          name,
        );
      };
      await next.focus();
      for (let index = 1; index < visualTitles.length; index++) {
        await page.keyboard.press("Enter");
        await inspector()
          .getByRole("heading", { name: visualTitles[index], exact: true })
          .waitFor();
        assert.equal(
          await inspector()
            .locator(".discover-inspector-navigation [aria-live]")
            .textContent(),
          `${index + 1} of ${visualTitles.length}`,
        );
        if (index === visualTitles.length - 1) {
          assert.equal(await next.isDisabled(), true);
          await assertFocusedTitle(visualTitles[index]);
        } else {
          assert.equal(
            await next.evaluate((button) => button === document.activeElement),
            true,
            "Next retains keyboard focus between boundaries",
          );
        }
      }
      await previous.focus();
      for (let index = visualTitles.length - 2; index >= 0; index--) {
        await page.keyboard.press("Enter");
        await inspector()
          .getByRole("heading", { name: visualTitles[index], exact: true })
          .waitFor();
        if (index === 0) {
          assert.equal(await previous.isDisabled(), true);
          await assertFocusedTitle(visualTitles[index]);
        } else {
          assert.equal(
            await previous.evaluate(
              (button) => button === document.activeElement,
            ),
            true,
            "Previous retains keyboard focus between boundaries",
          );
        }
      }
    };
    const discovery = base + "/discover/?view=all";
    fs.mkdirSync("output/playwright/concept-a", { recursive: true });

    await page.goto(base + "/discover/");
    await cloud().waitFor();
    // Capture the URL in the click task itself, before an asynchronous router
    // replacement could finish. The next role selection must start from Browse.
    const browseUrl = await page
      .getByRole("button", { name: "Browse", exact: true })
      .evaluate((button) => {
        button.click();
        return window.location.href;
      });
    assert.equal(
      browseUrl,
      discovery,
      "Browse updates the board URL immediately",
    );
    await cloud().click();
    await inspector()
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await page.waitForURL((url) => url.searchParams.has("opportunity"));
    await page.goBack();
    await page.waitForURL(discovery);
    await inspector().waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Assess Cloud Software Engineer at Emberlane Systems",
    );

    await page.goto(discovery);
    await cloud().waitFor();
    assert.equal(
      preparations,
      0,
      "loading/ranking never prepares an application",
    );
    const initialRankings = rankings;
    await page
      .getByRole("button", { name: "Applications", exact: true })
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("view") === "applications",
    );
    await page.getByRole("button", { name: "Browse", exact: true }).click();
    await cloud().waitFor();
    assert.equal(
      rankings,
      initialRankings,
      "returning reuses completed matches",
    );
    assert.equal(
      await page
        .getByRole("heading", { name: "Assessing opportunities", exact: true })
        .count(),
      0,
    );
    await page.getByRole("button", { name: "Browse", exact: true }).click();
    await page.waitForURL(discovery);
    await page.screenshot({
      path: "output/playwright/concept-a/discover-desktop.png",
    });
    await cloud().focus();
    await page.keyboard.press("Enter");
    await inspector()
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("dialog[open]").count(),
      0,
      "desktop inspector is nonmodal",
    );
    assert.equal(
      await inspector()
        .getByRole("link", { name: "Review documents", exact: true })
        .count(),
      1,
    );
    await page.screenshot({
      path: "output/playwright/concept-a/discover-desktop-inspector.png",
    });
    const desktopAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      desktopAxe.violations.map((violation) => violation.id),
      [],
    );
    await page.waitForURL((url) =>
      Boolean(url.searchParams.get("opportunity")),
    );
    const selectedRoute = page.url();
    const selectedParams = new URL(selectedRoute).searchParams;
    assert.equal(selectedParams.get("view"), "all");
    assert.equal(
      selectedParams.get("assessment_profile"),
      initial.profiles[0].id,
    );
    assert.equal(
      selectedParams.get("opportunity"),
      initial.jobs.find((job) => job.employer === "Emberlane Systems").id,
    );
    const listingUrl = initial.jobs.find(
      (job) => job.id === selectedParams.get("opportunity"),
    ).url;
    const company = inspector().getByRole("link", {
      name: "Emberlane Systems",
      exact: true,
    });
    const listing = inspector().getByRole("link", {
      name: "Cloud Software Engineer",
      exact: true,
    });
    const openSourceTab = async (link, url) => {
      const appUrl = page.url();
      assert.equal(await link.evaluate((anchor) => anchor.href), url);
      assert.equal(await link.getAttribute("target"), "_blank");
      await context.route(url, (route) =>
        route.fulfill({ body: "Fictional opportunity website" }),
      );
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        link.press("Enter"),
      ]);
      await popup.waitForURL(url);
      assert.equal(page.url(), appUrl);
      assert.equal(await page.locator(".discover-source-preview").count(), 0);
      await popup.close();
      await context.unroute(url);
    };
    await openSourceTab(company, new URL("/", listingUrl).href);
    await openSourceTab(listing, listingUrl);

    const existingDocuments = inspector().getByRole("link", {
      name: "Review documents",
      exact: true,
    });
    const existingApplication = new URL(
      await existingDocuments.getAttribute("href"),
      base,
    ).searchParams.get("application");
    await existingDocuments.click();
    await page
      .locator(`[data-application-id="${existingApplication}"]`)
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("view"), "all");
    assert.equal(
      new URL(page.url()).searchParams.get("opportunity"),
      selectedParams.get("opportunity"),
    );
    await page
      .locator(".opportunities-workbench:visible")
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("panel") === "overview",
    );
    await inspector()
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Close opportunity details",
    );
    await checkKeyboardNavigation();
    await page
      .getByRole("button", { name: "Next opportunity", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Next opportunity", exact: true })
      .click();
    await inspector()
      .getByRole("heading", { name: "Full Stack Engineer", exact: true })
      .waitFor();
    await close().click();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Assess Full Stack Engineer at Paperwell Studio",
    );
    await page.waitForURL(discovery);
    assert.equal(page.url(), discovery, "assessment keeps the shortlist route");

    const filteredDiscovery = discovery + "&q=Cloud";
    await page.goto(filteredDiscovery);
    await cloud().click();
    await page.waitForURL((url) => url.searchParams.has("opportunity"));
    await page.goBack();
    await page.waitForURL(filteredDiscovery);
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Assess Cloud Software Engineer at Emberlane Systems",
    );

    // Persist a bookmark through a full reload before testing rollback in Saved.
    await page.goto(discovery + "&q=Cloud");
    await page
      .getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Enter");
    await cloud().waitFor({ state: "detached" });
    await page.locator("#notice").filter({ hasText: "Role saved." }).waitFor();
    const allRoles = page.getByRole("button", {
      name: "Browse",
      exact: true,
    });
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === "Browse",
    );
    assert.equal(await allRoles.getAttribute("aria-pressed"), "true");
    await page.reload();
    await page
      .getByRole("heading", { name: "No roles match these filters" })
      .waitFor();
    assert.equal(
      await cloud().count(),
      0,
      "Saved remains separate after reload",
    );
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await cloud().waitFor();
    await cloud().click();
    let receiveFailure;
    const failureRequest = new Promise((resolve) => {
      receiveFailure = resolve;
    });
    const saveFailure = async (route) => {
      receiveFailure(route);
    };
    await page.route(base + "/api/save-job", saveFailure);
    await inspector()
      .getByRole("button", {
        name: "Unsave Cloud Software Engineer",
        exact: true,
      })
      .click();
    const failedRoute = await failureRequest;
    await cloud().waitFor({ state: "detached" });
    await failedRoute.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated bookmark failure" }),
    });
    await page
      .getByRole("alert")
      .filter({ hasText: "Simulated bookmark failure" })
      .waitFor();
    await cloud().waitFor();
    assert.equal(
      (await state()).jobs.find((job) => job.employer === "Emberlane Systems")
        .saved,
      true,
    );
    await page.unroute(base + "/api/save-job", saveFailure);
    await close().click();
    await inspector().waitFor({ state: "detached" });
    await page
      .getByRole("button", {
        name: "Unsave Cloud Software Engineer",
        exact: true,
      })
      .click();
    await cloud().waitFor({ state: "detached" });
    await page
      .locator("#notice")
      .filter({ hasText: "Role removed from Saved." })
      .waitFor();
    assert.equal(
      (await state()).jobs.find((job) => job.employer === "Emberlane Systems")
        .saved,
      false,
    );

    // A failed read-only assessment retains the workspace and offers a real retry.
    await page.goto(discovery);
    await cloud().waitFor();
    const rankFailure = (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated assessment failure" }),
      });
    await page.route(base + "/api/rank", rankFailure);
    await page
      .getByRole("button", { name: "Refresh matches", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Simulated assessment failure" })
      .waitFor();
    await page.unroute(base + "/api/rank", rankFailure);
    await page
      .getByRole("button", { name: "Retry assessment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry assessment", exact: true })
      .waitFor({ state: "detached" });
    assert.equal(preparations, 0);

    // Only the explicit preparation action can create a new version.
    await page
      .getByRole("button", {
        name: "Assess Backend Engineer at Bayform Labs",
        exact: true,
      })
      .click();
    const beforePrepare = (await state()).applications.length;
    await inspector()
      .getByRole("button", { name: "Prepare draft", exact: true })
      .click();
    const documents = inspector().getByRole("link", {
      name: "Review documents",
      exact: true,
    });
    await documents.waitFor();
    assert.equal(preparations, 1);
    const afterPrepare = await state();
    assert.equal(afterPrepare.applications.length, beforePrepare + 1);
    const created = afterPrepare.applications.find(
      (app) => app.employer === "Bayform Labs",
    );
    assert.ok(created);
    const documentUrl = new URL(await documents.getAttribute("href"), base);
    assert.equal(documentUrl.searchParams.get("application"), created.id);
    await documents.click();
    await page.locator(`[data-application-id="${created.id}"]`).waitFor();
    await page.waitForURL(
      (url) => url.searchParams.get("application") === created.id,
    );
    assert.equal(
      new URL(page.url()).searchParams.get("application"),
      created.id,
    );
    await page.goto(`${base}/discover/?view=applications&section=submitted`);
    await page
      .getByRole("button", {
        name: "Assess Backend Software Engineer at Cedarlight Software",
        exact: true,
      })
      .click();
    const submittedLink = inspector().getByRole("link", {
      name: "View submission",
      exact: true,
    });
    await submittedLink.waitFor();
    assert.equal(
      new URL(await submittedLink.getAttribute("href"), base).searchParams.get(
        "application",
      ),
      submitted.id,
    );
    assert.equal(
      await inspector()
        .getByRole("button", { name: "Prepare draft", exact: true })
        .count(),
      0,
    );
    assert.equal(preparations, 1);
    assert.equal(
      await snapshotHash(),
      originalHash,
      "submitted PDF bytes stay identical",
    );
    await close().click();

    // Responsive layouts retain controls and keep overflow within the board.
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
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
        `viewport overflow at ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(discovery);
    await cloud().waitFor();
    await page.screenshot({
      path: "output/playwright/concept-a/discover-mobile.png",
    });
    await cloud().click();
    const modal = page.getByRole("dialog", {
      name: "Cloud Software Engineer",
      exact: true,
    });
    await modal.waitFor();
    await page.waitForURL((url) =>
      Boolean(url.searchParams.get("opportunity")),
    );
    const mobileSelectedRoute = page.url();
    await modal
      .getByRole("link", { name: "Review documents", exact: true })
      .click();
    await page
      .locator(`[data-application-id="${existingApplication}"]`)
      .waitFor();
    assert.equal(
      new URL(page.url()).searchParams.get("opportunity"),
      new URL(mobileSelectedRoute).searchParams.get("opportunity"),
    );
    await page
      .locator(".opportunities-workbench:visible")
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("panel") === "overview",
    );
    await modal.waitFor();
    assert.equal(await modal.evaluate((element) => element.open), true);
    await checkKeyboardNavigation();
    const sheet = await modal.boundingBox();
    assert.ok(
      sheet.y >= 844 * 0.4 - 1,
      "default sheet leaves the shortlist visible",
    );
    await page.screenshot({
      path: "output/playwright/concept-a/discover-mobile-inspector.png",
    });
    await modal
      .getByRole("button", { name: "Resize opportunity details", exact: true })
      .click();
    await modal
      .getByRole("button", { name: "Resize opportunity details", exact: true })
      .waitFor();
    for (let step = 0; step < 18; step++) {
      await page.keyboard.press("Tab");
      const focus = await modal.evaluate((element) => ({
        inside: element.contains(document.activeElement),
        documentFocused: document.hasFocus(),
        activeTag: document.activeElement?.tagName,
        modal: element.open,
      }));
      // Native Chrome includes browser chrome at the Tab boundary. Within the
      // document, focus must stay in the modal; background controls stay inert.
      assert.ok(
        focus.inside || (!focus.documentFocused && focus.activeTag === "BODY"),
        `Tab never reaches background application controls: ${JSON.stringify(focus)}`,
      );
      assert.equal(focus.modal, true);
    }
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await modal.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      true,
    );
    const footerBefore = await modal
      .locator(".discover-inspector-footer")
      .boundingBox();
    await modal.locator(".discover-inspector-body").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const footerAfter = await modal
      .locator(".discover-inspector-footer")
      .boundingBox();
    assert.equal(
      footerAfter.y,
      footerBefore.y,
      "body scroll leaves the action footer fixed",
    );
    assert.ok(
      footerAfter.y + footerAfter.height <= 845,
      "footer stays in the viewport",
    );
    await page.screenshot({
      path: "output/playwright/concept-a/discover-mobile-inspector-expanded.png",
    });
    const advert = modal.getByRole("link", {
      name: "View advert",
      exact: true,
    });
    // A narrow desktop window still uses the browser's new-tab behavior.
    await openSourceTab(advert, listingUrl);

    // Failure feedback must remain inside the modal's accessible focus context.
    const mobileSaveFailure = (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated mobile save failure" }),
      });
    await page.route(base + "/api/save-job", mobileSaveFailure);
    await modal
      .getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      })
      .click();
    const modalError = modal
      .getByRole("alert")
      .filter({ hasText: "Simulated mobile save failure" });
    await modalError.waitFor();
    assert.equal(
      await modalError.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    const mobileAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      mobileAxe.violations.map((violation) => violation.id),
      [],
    );
    await page.unroute(base + "/api/save-job", mobileSaveFailure);
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Assess Cloud Software Engineer at Emberlane Systems",
    );
    assert.equal(await snapshotHash(), originalHash);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], "the journey makes no external requests");
    console.log(
      "Discover acceptance passed: in-place assessment/focus, saved persistence/rollback, explicit draft/deep link, preserved submission, responsive native sheet and accessible errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
