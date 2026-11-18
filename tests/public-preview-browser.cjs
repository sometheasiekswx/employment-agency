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

async function assertCompanyLogo(mark, expectedUrl, base) {
  const image = mark.locator("img");
  await image.scrollIntoViewIfNeeded();
  assert.equal(await mark.count(), 1);
  assert.equal(new URL(await image.getAttribute("src"), base).href, new URL(expectedUrl, base).href);
  assert.ok(await image.isVisible());
  assert.deepEqual(await image.evaluate(async (element) => {
    await element.decode();
    return {
      decoded: element.naturalWidth > 0 && element.naturalHeight > 0,
      imageBackground: getComputedStyle(element).backgroundColor,
      markBackground: getComputedStyle(element.parentElement).backgroundColor,
      initials: element.parentElement.textContent.trim(),
    };
  }), {
    decoded: true,
    imageBackground: "rgba(0, 0, 0, 0)",
    markBackground: "rgba(0, 0, 0, 0)",
    initials: "",
  }, expectedUrl);
}

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(base, "Set TEST_URL to the static public preview");
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
    const allRoles = snapshot.state.jobs;
    const applications = new Map(snapshot.state.applications.map((app) => [app.job_id, app]));
    const removed = allRoles.filter((job) => job.removals?.length && !job.removals.at(-1).restored_at);
    const submitted = allRoles.filter((job) => applications.get(job.id)?.status === "submitted");
    const active = allRoles.filter((job) => job.demo_active);
    const saved = allRoles.filter((job) => job.saved);
    const assigned = new Set([...removed, ...submitted, ...active, ...saved].map(({ id }) => id));
    const incoming = allRoles.filter((job) => !assigned.has(job.id));
    const unseen = incoming.filter((job) => job.demo_new !== false);
    assert.equal(assigned.size, removed.length + submitted.length + active.length + saved.length);
    assert.equal(Math.abs(incoming.length - 2 * unseen.length) <= 1, true);
    const catalog = require("../employment_agency/demo_data/showcase_jobs.json");
    assert.equal(snapshot.current_catalog_only, true);
    assert.equal(profile.locations.length, 7);
    if (catalog.schema === 3) {
      for (const destination of profile.locations)
        assert.equal(catalog.new_employers_by_destination[destination].length, 3);
      for (const [roles, share] of [[incoming, .70], [saved, .10], [active, .08], [submitted, .07], [removed, .05]])
        assert.ok(Math.abs(roles.length - share * allRoles.length) <= 2);
    }
    const jobsByCompany = new Map();
    for (const job of allRoles) {
      assert.ok(job.source?.startsWith("reviewed:"));
      assert.equal(job.hiring_employer_verified, true);
      assert.ok(job.company?.id, "A reviewed job has a verified employer");
      const companyJobs = jobsByCompany.get(job.company.id) ?? [];
      companyJobs.push(job);
      jobsByCompany.set(job.company.id, companyJobs);
    }
    // Published by the prior revision; each is realistic browser data with a
    // recognized reviewed source, a bookmark and a recoverable removal.
    const archived = [
      { id: "d4a3e3e6ec786b5037b39f5c", source: "reviewed:plaid",
        url: "https://jobs.ashbyhq.com/plaid/a9dc0810-546b-4773-9545-2862409e24b4" },
      { id: "fb0ff9de9c14f0fdbd62bb26", source: "reviewed:ramp",
        url: "https://jobs.ashbyhq.com/ramp/6511d68f-b65d-4499-962f-7e2f75eabe3f" },
      { id: "66851db453ef0e7b147b54aa", source: "reviewed:figma",
        url: "https://job-boards.greenhouse.io/figma/jobs/5691911004" },
    ].find(({ id }) => !allRoles.some((job) => job.id === id));
    if (archived) {
      await page.addInitScript((job) => {
        if (sessionStorage.getItem("demo-migration-fixture")) return;
        sessionStorage.setItem("demo-migration-fixture", "true");
        localStorage.setItem(`employment-agency:public-posting:${job.id}`, JSON.stringify({
          ...job, title: "Previous catalog engineer", location: "New York", city: "New York",
        }));
        localStorage.setItem(`employment-agency:employer-bookmarks:job:${job.id}`, "true");
        localStorage.setItem(`employment-agency:employer-removals:job:${job.id}`, JSON.stringify([{
          id: "1".repeat(32), at: "2026-11-15T00:00:00Z", reason: "Earlier role removal",
        }]));
      }, archived);
    }
    await page.goto(base + "/discover/?view=all");
    const board = page.getByRole("region", { name: "Opportunities by company" });
    await board.waitFor();
    const desktopLabel = page.locator(".workspace-topbar .demo-label");
    assert.equal(await desktopLabel.innerText(), "Public demo");
    assert.ok(await desktopLabel.isVisible());
    if (archived)
      assert.equal(await page.evaluate((id) =>
        Object.keys(localStorage).some((key) => key.endsWith(id)), archived.id), false);
    const logoOutcomes = new Map(catalog.companies.flatMap((company) =>
      company.listings.map(({ job_id }) => [job_id, company.logo]),
    ));
    const verifiedLogoUrls = new Set(Object.values(snapshot.company_logos));
    assert.ok(verifiedLogoUrls.size > 0, "The catalog bundles verified logo assets");
    const evidenceDir = "output/playwright/public-preview";
    fs.mkdirSync(evidenceDir, { recursive: true });
    for (const colorScheme of ["light", "dark"]) {
      await page.goto(base + "/settings/");
      const themeControl = page.getByRole("button", { name: /color theme/i });
      await themeControl.waitFor();
      assert.equal(await themeControl.count(), 1);
      if (colorScheme === "light") {
        await page.getByRole("button", { name: "Color theme: Dark. Switch to Light", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "Color theme: Light. Switch to System", exact: true }).click();
        await page.getByRole("button", { name: "Color theme: System. Switch to Dark", exact: true }).click();
      }
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, colorScheme);
      await page.goto(base + "/discover/?view=all");
      await board.waitFor();
      await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, colorScheme);
      assert.equal(await board.locator("article[data-job-id] .discover-employer-mark").count(), 0);
      const decoded = new Set();
      for (const [companyId, jobs] of jobsByCompany) {
        const column = board.locator(`[data-company-id="employer:${companyId}"]`);
        const company = jobs[0].company;
        await column.waitFor();
        const outcome = logoOutcomes.get(jobs[0].id);
        assert.equal(outcome?.status, "verified", company.name);
        const logoUrl = `/demo/company-logos/${outcome.sha256}.png`;
        assert.ok(verifiedLogoUrls.has(logoUrl));
        assert.ok(jobs.every((job) => job.company.logo_url === logoUrl));
        await assertCompanyLogo(column.locator("header .discover-employer-mark"), logoUrl, base);
        decoded.add(logoUrl);
        const displayedIds = await column.locator("article[data-job-id]").evaluateAll((cards) =>
          cards.map((card) => card.dataset.jobId),
        );
        assert.deepEqual(new Set(displayedIds), new Set(jobs.filter(({ id }) => !assigned.has(id)).map(({ id }) => id)));
        const picks = reviews.get(companyId) ?? [];
        const compared = jobs.filter((job) => !removed.includes(job) && !submitted.includes(job));
        assert.equal(picks.length, compared.length > 2 ? 2 : 0, company.name);
        assert.deepEqual(displayedIds.slice(0, picks.length), picks.map(({ job_id }) => job_id));
        assert.equal(await column.locator(".discover-match-reason").count(), picks.length);
        for (const { job_id, reason } of picks)
          assert.equal(await column.locator(`[data-job-id="${job_id}"] .discover-match-reason`).innerText(), reason);
      }
      assert.deepEqual(decoded, verifiedLogoUrls);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${evidenceDir}/catalog-${colorScheme}.png` });
    }
    for (const [query, roles, stage] of [
      ["?status=new", unseen, "new"], ["?view=to-apply", saved, "to-apply"],
      ["?view=applications&section=active", active, "active"],
      ["?view=applications&section=submitted", submitted, "submitted"],
    ]) {
      await page.goto(base + "/discover/" + query);
      await page.locator("article[data-job-id]").first().waitFor();
      assert.equal(await page.locator("article[data-job-id] .discover-employer-mark").count(), 0, query);
      const ids = await page.locator("article[data-job-id]").evaluateAll((cards) =>
        cards.map((card) => card.dataset.jobId),
      );
      assert.deepEqual(new Set(ids), new Set(roles.map(({ id }) => id)), query);
      if (roles === active)
        assert.equal(await page.locator("article").getByText("Sample draft", { exact: true }).count(), active.length);
      await page.screenshot({ path: `${evidenceDir}/catalog-${stage}.png` });
    }
    await page.goto(base + "/discover/?view=all");
    await board.locator("article[data-job-id]").first().waitFor();
    const layoutOrder = await board.locator("article[data-job-id]").evaluateAll((cards) =>
      cards.map((card) => card.dataset.jobId),
    );
    const primary = layoutOrder
      .map((id) => incoming.find((job) => job.id === id))
      .find((job) => job?.requirements?.length && !job.pending_blocker);
    const secondary = incoming.find((job) =>
      job.company.id !== primary?.company.id && !job.pending_blocker);
    const sampleJob = active[0];
    assert.ok(primary && secondary && sampleJob, "The fixture has independent opportunities and a sample draft");
    const assess = (job, tab = page) => tab.locator(`[data-job-id="${job.id}"]`)
      .getByRole("button", { name: `Assess ${job.title} at ${job.employer}`, exact: true });
    const choice = (job, tab = page, existing = false) => tab.locator(`[data-job-id="${job.id}"]`)
      .getByRole("button", { name: `${existing ? "Remove from To apply" : "Apply later"} · ${job.title}`, exact: true });
    const assessPrimary = () => assess(primary);
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1440, height: 768 },
      { width: 1024, height: 1000 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      for (const view of ["recommended", "all"]) {
        await page.goto(`${base}/discover/?view=${view}`);
        await assessPrimary().waitFor();
        await assessPrimary().evaluate((element) => {
          const { top, bottom } = element.getBoundingClientRect();
          if (top < 0 || bottom > window.innerHeight)
            element.scrollIntoView({ block: "center" });
        });
        await page.evaluate(() => new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const opener = await assessPrimary().boundingBox();
        assert.ok(opener);
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.mouse.click(opener.x + opener.width / 2, opener.y + opener.height / 2);
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
    await assessPrimary().waitFor();
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
    await assessPrimary().click();
    const inspector = page.locator(".discover-inspector");
    const applicationId = applications.get(sampleJob.id)?.id;
    assert.ok(applicationId, "the sample role has a versioned CV");
    await inspector
      .getByRole("heading", { name: primary.title, exact: true })
      .waitFor();
    await assertCompanyLogo(inspector.locator(".discover-inspector-company .discover-employer-mark"), primary.company.logo_url, base);
    const evidence = inspector.getByRole("region", { name: "Career evidence" });
    await evidence.getByText(primary.requirements[0], { exact: true }).first().waitFor();
    assert.equal(
      await evidence
        .getByRole("button", { name: /I have this skill|Add evidence/ })
        .count(),
      0,
      "Public preview shows evidence without offering career fact mutations",
    );
    assert.equal(
      await inspector
        .getByRole("link", { name: primary.title, exact: true })
        .count(),
      1,
      "Reviewed roles link to the original listing",
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
    assert.equal(await assessPrimary().count(), 0);
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
          key.startsWith("employment-agency:employer-bookmarks:job:"),
        ),
      ),
    );
    assert.equal(Object.keys(overlay).length, 1);
    assert.match(Object.keys(overlay)[0], /:job:[a-f0-9]+$/);
    assert.deepEqual(
      Object.values(overlay).map((value) => JSON.parse(value)),
      [true],
    );
    assert.equal(await assessPrimary().count(), 0);
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
    await assessPrimary().waitFor();

    const independent = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const second = await independent.newPage();
    await second.goto(base + "/discover/?view=all");
    await choice(primary, second).waitFor();
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
    await Promise.all([choice(primary, firstTab).waitFor(), choice(secondary, secondTab).waitFor()]);
    for (const [job, tab] of [[primary, firstTab], [secondary, secondTab]]) {
      await choice(job, tab).click();
      await tab.locator(".notification-card:not([inert])")
        .filter({ hasText: "Role added to To apply." }).last().waitFor();
    }
    for (const tab of [firstTab, secondTab]) {
      await tab.reload();
      await tab.getByRole("button", { name: "To apply", exact: true }).click();
      await choice(primary, tab, true).waitFor();
      await choice(secondary, tab, true).waitFor();
    }
    await shared.close();

    await assess(secondary).click();
    assert.equal(
      await inspector
        .getByRole("button", { name: "Prepare application", exact: true })
        .isDisabled(),
      false,
    );
    await page
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await page.goto(base + "/discover/?view=applications&section=active");
    await assess(sampleJob).click();
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
      path: "output/playwright/public-preview/sample-document.png",
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
    await assessPrimary().waitFor();
    const desktopAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      desktopAxe.violations.map((violation) => violation.id),
      [],
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLabel = page.locator(".workspace-topbar")
      .getByText("Public demo", { exact: true });
    await mobileLabel.waitFor();
    await assessPrimary().click();
    const modal = page.getByRole("dialog", {
      name: primary.title,
      exact: true,
    });
    await modal.waitFor();
    await modal
      .getByRole("button", { name: "Resize opportunity details", exact: true })
      .click();
    await assertCompanyLogo(modal.locator(".discover-inspector-company .discover-employer-mark"), primary.company.logo_url, base);
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
      if (width === 320) {
        await mobileLabel.waitFor();
        const brand = page.getByRole("link", {
          name: "Employment Agency — Opportunities",
          exact: true,
        });
        const [wordmark, badge, menu] = await Promise.all([
          brand.boundingBox(),
          mobileLabel.boundingBox(),
          page.locator(".mobile-header-actions").boundingBox(),
        ]);
        assert.ok(
          wordmark.width >= 160 &&
            wordmark.x + wordmark.width <= menu.x &&
            menu.x + menu.width <= width &&
            Math.abs(wordmark.y - menu.y) < 4,
          "The narrow public masthead fits the wordmark and controls on one row",
        );
        assert.ok(
          badge.x >= 0 && badge.x + badge.width <= width &&
            badge.y >= wordmark.y + wordmark.height,
          "The public demo badge remains visible in the page heading",
        );
      }
      await assessPrimary().click();
      const inspector = page.locator(".discover-inspector");
      await inspector
        .getByRole("button", {
          name: `Remove ${primary.title}`,
          exact: true,
        })
        .click();
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
        .getByRole("button", { name: `Removed (${removed.length + 1})`, exact: true })
        .waitFor();
      assert.equal(
        await assessPrimary().count(),
        0,
        "browser-local removal survives reload",
      );
      await page
        .getByRole("button", { name: `Removed (${removed.length + 1})`, exact: true })
        .click();
      await assessPrimary().waitFor();
      await page
        .getByRole("button", {
          name: `Add removal reason for ${primary.title}`,
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
          name: `Restore ${primary.title}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Show available roles", exact: true })
        .click();
      await assessPrimary().waitFor();
    }
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(
      "Public static preview passed: verified company logos, five sample queues, sample PDF/Word views, current catalog migration, browser-local choices and accessible desktop/mobile layouts.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
