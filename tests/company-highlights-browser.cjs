const { chromium } = require(process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const base = process.env.TEST_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const output = path.join(__dirname, "../output/playwright/company-highlights");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const pages = await Promise.all([
      browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    ]);
    for (const page of pages) {
      page.setDefaultTimeout(8000);
      await page.route("**/*", (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
    }
    const [desktop] = pages;
    const read = async () => (await (await desktop.request.get(base + "/api/state")).json());
    const initial = await read();
    assert.match(initial.state._workspace.path, /ea-sqlite-browser-/);
    const profile = initial.state.profiles[0];
    const employer = initial.state.employers[0];
    const roles = initial.state.jobs.filter((job) => job.employer === employer.name);
    assert.equal(roles.length, 3);
    const request = async (name, data) => desktop.request.post(base + "/api/" + name, {
      data,
      headers: { Origin: base, "X-Workspace-Token": initial.token },
    });
    const action = async (name, data) => {
      const response = await request(name, data);
      assert.ok(response.ok(), await response.text());
      return (await response.json()).result;
    };
    for (const role of roles.filter((job) => !job.hiring_employer_verified)) {
      await action("company-map", { job_id: role.id, employer_id: employer.id, confirmed: true });
    }
    const secondProfile = await action("profile", {
      name: "Platform engineering", roles: ["Platform Engineer"], include_unknown: true, include_stretch: true,
    });
    const workspace_id = initial.state._workspace.workspace_id;
    const research = await action("company-research-start", { workspace_id, profile_id: profile.id });
    const scope = { workspace_id, profile_id: profile.id, research_id: research.id, job_ids: roles.map((job) => job.id) };
    for (const role of roles) {
      await action("company-research-record", {
        workspace_id, research_id: research.id, url: role.url, status: "retrieved", job_ids: [role.id],
        evidence: "Fictional browser fixture checked the original role and its requirements.",
      });
    }
    const checked = await action("company-research", scope);
    assert.equal(checked.completion.ready, false);
    const complete = () => request("company-research-complete", scope);
    async function expectBlocked(code) {
      const response = await complete();
      assert.equal(response.status(), 409);
      assert.equal((await response.json()).result.completion.blockers[0].code, code);
    }
    const board = (page) => page.getByRole("region", { name: employer.name + " opportunities" });
    const missing = (page) => board(page).getByText("Company highlights need review", { exact: true });
    const stale = (page) => board(page).getByText("Company highlights need a new review", { exact: true });
    const current = (page) => board(page).getByRole("heading", { name: "Best matches for you" });
    const filter = (page) => page.getByRole("searchbox", { name: "Filter roles" });
    const visibleRoles = (page) => board(page).getByRole("button", { name: /^Assess/ });
    const openJobs = async (page) => {
      await page.goto(base + "/discover/?view=jobs");
      await visibleRoles(page).first().waitFor();
    };
    const selectProfile = async (page, id) => {
      const select = page.getByLabel("Search profile", { exact: true });
      if (await select.inputValue() === id) return;
      const filters = page.locator(".discover-filters > summary");
      await filters.click();
      await select.selectOption(id);
      await filters.click();
    };
    const screenshot = (page, suffix) => page.screenshot({
      path: path.join(output, `${page === desktop ? "desktop" : "mobile"}-${suffix}.png`),
      animations: "disabled",
    });

    const before = (await read()).state;
    await expectBlocked("company_highlights_missing");
    for (const page of pages) {
      await openJobs(page);
      await selectProfile(page, profile.id);
      await missing(page).waitFor();
      assert.equal(await visibleRoles(page).count(), 3);
      await screenshot(page, "missing");
      await filter(page).fill(roles[0].title);
      await page.waitForFunction(() => document.querySelectorAll(".discover-card").length === 1);
      assert.ok(await missing(page).isVisible());
      await page.getByRole("button", { name: "Clear search" }).click();
    }
    const basis = await action("company-best-matches-basis", {
      workspace_id, profile_id: profile.id, employer_id: employer.id,
    });
    const picks = [
      { job_id: roles[1].id, reason: "Integration test experience supports quality checks.", fact_ids: [basis.facts[0].id] },
      { job_id: roles[2].id, reason: "Python service maintenance supports the engineering work.", fact_ids: [basis.facts[0].id] },
    ];
    await action("company-best-matches", {
      workspace_id, profile_id: profile.id, employer_id: employer.id,
      basis: basis.basis, compared_job_ids: scope.job_ids, picks,
    });
    const completed = await complete();
    assert.ok(completed.ok(), await completed.text());
    assert.equal((await completed.json()).result.completion.ready, true);
    for (const page of pages) {
      await openJobs(page);
      await selectProfile(page, profile.id);
      await current(page).waitFor();
      assert.deepEqual(await visibleRoles(page).allTextContents(), [roles[1].title, roles[2].title, roles[0].title]);
      await board(page).getByRole("heading", { name: "More roles" }).waitFor();
      await screenshot(page, "current");
      await selectProfile(page, secondProfile.id);
      await missing(page).waitFor();
      assert.equal(await current(page).count(), 0);
      await selectProfile(page, profile.id);
      await current(page).waitFor();
    }
    const newFact = await action("fact", { text: "Maintained deployment runbooks for fictional services." });
    await action("confirm", { id: newFact.id });
    await expectBlocked("company_highlights_stale");
    for (const page of pages) {
      await openJobs(page);
      await stale(page).waitFor();
      assert.equal(await current(page).count(), 0);
      assert.equal(await visibleRoles(page).count(), 3);
      await screenshot(page, "stale");
    }
    const after = (await read()).state;
    assert.deepEqual(after.applications, before.applications);
    assert.deepEqual(after.application_queue, before.application_queue);
    assert.deepEqual(after.jobs.map(({ id, saved }) => [id, saved]), before.jobs.map(({ id, saved }) => [id, saved]));
    console.log("Company highlight review and completion passed at desktop and mobile widths.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
