// Static public preview acceptance: no Python runtime, private API or sign-in.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const { showPanel } = require("./browser-applications.cjs");

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
    assert.equal(
      snapshot.state.identity.name,
      snapshot.demo_resume?.name ?? "Alex Morgan",
    );
    const profile = snapshot.state.profiles[0];
    const reviews = new Map(
      (snapshot.state.company_best_matches ?? [])
        .filter((review) => review.profile_id === profile.id)
        .map((review) => [review.employer_id, review.picks]),
    );
    assert.ok(reviews.size > 0, "The public catalog includes reviewed highlights");
    const jobsByCompany = new Map();
    for (const job of snapshot.state.jobs.filter((job) => job.source?.startsWith("reviewed:"))) {
      assert.equal(job.hiring_employer_verified, true);
      assert.ok(job.company?.id, "A reviewed job has a verified employer");
      const companyJobs = jobsByCompany.get(job.company.id) ?? [];
      companyJobs.push(job);
      jobsByCompany.set(job.company.id, companyJobs);
    }
    assert.equal(profile.locations.length, 7);
    for (const destination of profile.locations) {
      const companyCount = [...jobsByCompany.values()]
        .filter((jobs) => jobs.some((job) => job.city === destination)).length;
      assert.ok(companyCount >= 5 && companyCount <= 10, `${destination} employer coverage`);
    }
    await page.goto(base + "/discover/?view=all");
    const board = page.getByRole("region", { name: "Opportunities by company" });
    await board.waitFor();
    const catalog = require("../employment_agency/demo_data/showcase_jobs.json");
    const logoOutcomes = new Map(catalog.companies.flatMap((company) =>
      company.listings.map(({ job_id }) => [job_id, company.logo]),
    ));
    const verifiedLogoUrls = new Set(Object.values(snapshot.company_logos));
    assert.ok(verifiedLogoUrls.size > 0, "The catalog bundles verified logo assets");
    const decodedLogoUrls = new Set();
    let decodedCompanies = 0;
    const expectedLogoCompanies = catalog.companies.filter(
      ({ logo }) => logo.status === "verified",
    ).length;
    for (const [companyId, jobs] of jobsByCompany) {
      const column = board.locator(`[data-company-id="employer:${companyId}"]`);
      const company = jobs[0].company;
      await column.waitFor();
      assert.ok(jobs.length >= 1 && jobs.length <= 7, `${company.name} vacancy count`);
      const outcome = logoOutcomes.get(jobs[0].id);
      assert.ok(outcome, `Recorded logo retrieval outcome for ${company.name}`);
      const mark = column.locator("header .discover-employer-mark");
      const logo = mark.locator("img");
      if (outcome.status === "verified") {
        const logoUrl = `/demo/company-logos/${outcome.sha256}.png`;
        assert.match(logoUrl, /^\/demo\/company-logos\/[a-f0-9]{64}\.png$/);
        assert.ok(verifiedLogoUrls.has(logoUrl));
        assert.ok(jobs.every((job) => job.company.logo_url === logoUrl));
        assert.equal(new URL(await logo.getAttribute("src"), base).href, new URL(logoUrl, base).href);
        await logo.scrollIntoViewIfNeeded();
        assert.ok(await logo.evaluate(async (image) => {
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        }), `${company.name} official logo decodes in the browser`);
        decodedLogoUrls.add(logoUrl);
        decodedCompanies += 1;
      } else {
        assert.equal(outcome.status, "unavailable");
        assert.ok(outcome.reason, `Recorded logo gap for ${company.name}`);
        assert.ok(jobs.every((job) => !job.company.logo_url));
        assert.equal(await logo.count(), 0);
        const initials = company.name.trim().split(/\s+/).slice(0, 2)
          .map((part) => Array.from(part)[0]).join("").toLocaleUpperCase();
        const label = mark.locator("span");
        assert.equal(await label.innerText(), initials);
        assert.ok(await label.isVisible(), `${company.name} fallback is visible`);
      }
      const cards = column.locator("article[data-job-id]");
      const displayedIds = await cards.evaluateAll((articles) =>
        articles.map((article) => article.dataset.jobId),
      );
      assert.deepEqual(new Set(displayedIds), new Set(jobs.map((job) => job.id)));
      const picks = reviews.get(companyId) ?? [];
      assert.equal(picks.length, jobs.length > 2 ? 2 : 0, company.name);
      assert.deepEqual(displayedIds.slice(0, picks.length), picks.map(({ job_id }) => job_id));
      assert.equal(await column.locator(".discover-match-reason").count(), picks.length);
      for (const { job_id, reason } of picks) {
        const card = column.locator(`article[data-job-id="${job_id}"]`);
        assert.equal(await card.locator(".discover-match-reason").innerText(), reason);
      }
      for (const text of ["Best matches for you", "More roles"]) {
        assert.equal(
          await column.getByRole("heading", { name: text, exact: true }).count(),
          picks.length ? 1 : 0,
        );
      }
    }
    assert.equal(decodedCompanies, expectedLogoCompanies);
    assert.deepEqual(decodedLogoUrls, verifiedLogoUrls);
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
        await page.waitForURL((url) => !url.searchParams.has("opportunity"));
        await page.locator(".discover-inspector").waitFor({ state: "hidden" });
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
    const applicationId = snapshot.state.applications.find(
      (application) => application.title === "Cloud Software Engineer",
    )?.id;
    assert.ok(applicationId, "the sample role has a versioned CV");
    await inspector
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await showPanel(page, "overview");
    const evidence = inspector.getByRole("region", { name: "Career evidence" });
    await evidence.getByText("Kubernetes", { exact: true }).waitFor();
    assert.equal(
      await evidence
        .getByRole("button", { name: /I have this skill|Add evidence/ })
        .count(),
      0,
      "Public preview shows evidence without offering career fact mutations",
    );
    assert.equal(
      await inspector
        .getByRole("link", { name: "Cloud Software Engineer", exact: true })
        .count(),
      0,
      "Fictional roles with no original listing URL show a plain title",
    );
    await inspector
      .getByRole("button", {
        name: "Apply later",
        exact: true,
      })
      .click();
    await inspector
      .getByRole("button", {
        name: "Remove from To apply",
        exact: true,
      })
      .waitFor();
    await page.locator(".notification-card:not([inert])").filter({ hasText: "Role added to To apply." }).last().waitFor();
    assert.equal(await assessCloud().count(), 0);
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
        name: "Remove from To apply",
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
    assert.equal(await assessCloud().count(), 0);
    await inspector
      .getByRole("button", {
        name: "Remove from To apply",
        exact: true,
      })
      .click();
    await page
      .locator(".notification-card:not([inert])")
      .filter({ hasText: "Role removed from To apply." })
      .last().waitFor();
    await assessCloud().waitFor();

    const independent = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const second = await independent.newPage();
    await second.goto(base + "/discover/?view=all");
    await second
      .getByRole("button", {
        name: "Apply later · Cloud Software Engineer",
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
          name: "Apply later · Cloud Software Engineer",
          exact: true,
        })
        .waitFor(),
      secondTab
        .getByRole("button", { name: "Apply later · Backend Engineer", exact: true })
        .waitFor(),
    ]).catch(async (error) => {
      for (const [index, tab] of [firstTab, secondTab].entries()) {
        await tab.screenshot({
          path: `output/playwright/public-preview/concurrent-tab-${index}.png`,
          fullPage: true,
        });
        fs.writeFileSync(
          `output/playwright/public-preview/concurrent-tab-${index}.txt`,
          await tab.locator("body").innerText(),
        );
      }
      throw error;
    });
    await firstTab
      .getByRole("button", {
        name: "Apply later · Cloud Software Engineer",
        exact: true,
      })
      .click();
    await firstTab
      .locator(".notification-card:not([inert])")
      .filter({ hasText: "Role added to To apply." })
      .last().waitFor();
    await secondTab
      .getByRole("button", { name: "Apply later · Backend Engineer", exact: true })
      .click();
    await secondTab
      .locator(".notification-card:not([inert])")
      .filter({ hasText: "Role added to To apply." })
      .last().waitFor();
    for (const tab of [firstTab, secondTab]) {
      await tab.reload();
      await tab.getByRole("button", { name: "To apply", exact: true }).click();
      await tab
        .getByRole("button", {
          name: "Remove from To apply · Cloud Software Engineer",
          exact: true,
        })
        .waitFor();
      await tab
        .getByRole("button", { name: "Remove from To apply · Backend Engineer", exact: true })
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
        .getByRole("button", { name: "Prepare application", exact: true })
        .isDisabled(),
      false,
    );
    await page
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await assessCloud().click();
    await showPanel(page, "documents");
    const application = page.locator(
      `[data-application-id="${applicationId}"]`,
    );
    await application.getByRole("region", { name: "CV", exact: true }).waitFor();
    await showPanel(page, "activity");
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
    await showPanel(page, "files");
    const pdfHref = await application
      .getByRole("link", { name: "CV PDF", exact: true })
      .getAttribute("href");
    assert.match(pdfHref, /^\/demo\/files\/[a-f0-9]+\.pdf$/);
    const pdf = await page.request.get(new URL(pdfHref, base).href);
    assert.equal(pdf.status(), 200);
    const cv = await pdf.body();
    assert.equal(cv.subarray(0, 4).toString(), "%PDF");
    if (snapshot.demo_resume)
      assert.equal(
        createHash("sha256").update(cv).digest("hex"),
        snapshot.demo_resume.sha256,
      );
    await showPanel(page, "documents");
    const viewer = application.getByRole("region", { name: "CV", exact: true });
    await viewer.waitFor();
    await viewer.getByRole("img", { name: /^PDF page 1 of / }).waitFor();
    assert.match(
      await viewer.getByRole("link", { name: "Download CV", exact: true }).getAttribute("href"),
      /^\/demo\/files\/.*\.pdf$/,
    );
    assert.equal(
      await viewer
        .getByRole("button", { name: "Save as new draft", exact: true })
        .count(),
      0,
    );
    await page.screenshot({
      path: "output/playwright/public-preview/fictional-document.png",
    });
    await showPanel(page, "files");
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
    await page.goto(base + "/discover/?view=applications&section=submitted");
    const sampleCount = snapshot.state.applications.filter(
      (app) => app.status === "submitted",
    ).length;
    const sampleSubmissions = page
      .locator(".discover-card")
      .getByText("Sample submission", { exact: true });
    await sampleSubmissions.first().waitFor();
    assert.equal(await sampleSubmissions.count(), sampleCount);
    await page.goto(base + "/history/");
    await page.getByRole("heading", { name: "History", exact: true }).waitFor();
    await page
      .getByText("Sample application documents. No applications were sent.", {
        exact: true,
      })
      .waitFor();
    await page
      .locator(".history-version-title")
      .filter({ hasText: "Sample submission" })
      .first()
      .waitFor();
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
      .getByRole("button", { name: "Resize opportunity details", exact: true })
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
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(base + "/discover/?view=all");
      await assessCloud().click();
      const inspector = page.locator(".discover-inspector");
      await inspector
        .getByRole("button", {
          name: "Remove Cloud Software Engineer",
          exact: true,
        })
        .click();
      await inspector
        .getByRole("heading", { name: "Backend Engineer", exact: true })
        .waitFor();
      await page
        .getByRole("region", { name: "Opportunity removal", exact: true })
        .getByRole("button", { name: "Add reason", exact: true })
        .click();
      const reason = inspector.getByRole("textbox", {
        name: "Removal reason (optional)",
        exact: true,
      });
      if (width <= 1000)
        assert.ok(
          await reason.evaluate(
            (node) => parseFloat(getComputedStyle(node).fontSize) >= 16,
          ),
          "Mobile reason text avoids Safari's small-input zoom",
        );
      const explanation = `Fictional ${width}px check: prefer a role with more product work.`;
      await reason.fill(explanation);
      await inspector
        .getByRole("button", { name: "Save reason", exact: true })
        .click();
      await reason.waitFor({ state: "hidden" });
      const feedbackAxe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        feedbackAxe.violations.map((item) => item.id),
        [],
      );
      await page.keyboard.press("Escape");
      await page.goto(base + "/discover/?view=all");
      await page
        .getByRole("button", { name: /^Removed \(3\)$/, exact: true })
        .waitFor();
      assert.equal(
        await assessCloud().count(),
        0,
        "browser-local removal survives reload",
      );
      await page
        .getByRole("button", { name: /^Removed \(3\)$/, exact: true })
        .click();
      await assessCloud().waitFor();
      await page
        .getByRole("button", {
          name: "Add removal reason for Cloud Software Engineer",
          exact: true,
        })
        .click();
      assert.equal(
        await page
          .getByRole("textbox", {
            name: "Removal reason (optional)",
            exact: true,
          })
          .inputValue(),
        explanation,
      );
      await page.screenshot({
        path: `output/playwright/public-preview/removal-${width}.png`,
      });
      await page
        .getByRole("button", {
          name: "Restore Cloud Software Engineer",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Show available roles", exact: true })
        .click();
      await assessCloud().waitFor();
    }
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(
      "Public static preview passed: six routes, fictional PDF/Word views, browser-local bookmarks/removal/reasons/restore, limited private operations, isolated employer feeds and accessible desktop/mobile layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
