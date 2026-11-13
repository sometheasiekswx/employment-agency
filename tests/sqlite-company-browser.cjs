const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const base = process.env.TEST_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const useWebKit = process.env.BROWSER_ENGINE === "webkit";
  const browser = useWebKit ? await webkit.launch() : await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(8000);
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort(),
    );
    const initial = await (await page.request.get(base + "/api/state")).json();
    assert.match(initial.state._workspace.path, /ea-sqlite-browser-/);
    assert.equal(initial.state._workspace.snapshot.status, "current");
    const profile = initial.state.profiles[0];
    const first = initial.state.jobs.find((job) => job.title === "Platform Engineer");
    const action = async (name, data) => {
      const response = await page.request.post(base + "/api/" + name, {
        data, headers: { Origin: base, "X-Workspace-Token": initial.token },
      });
      assert.ok(response.ok(), await response.text());
      return (await response.json()).result;
    };
    await page.goto(base + "/discover/?view=all");
    await page.getByRole("button", { name: "Assess Platform Engineer at Fictional Harbour" }).first().click();
    await page.getByRole("button", { name: "Compare roles at this company" }).click();
    await page.getByRole("button", { name: "Confirm employer" }).click();
    await page.getByText("2 application slots available", { exact: true }).waitFor();
    const current = await action("company-roles", { job_id: first.id, profile_id: profile.id });
    for (const other of initial.state.jobs.filter((job) => job.id !== first.id)) {
      await action("company-map", { job_id: other.id, employer_id: current.employer.id, confirmed: true });
    }
    await page.getByRole("button", { name: "Compare roles at this company" }).click();
    await page.getByRole("button", { name: "Compare roles at this company" }).click();
    await page.getByRole("checkbox", { name: "Quality Engineer" }).check();
    await page.getByRole("button", { name: "Confirm shortlist" }).click();
    await page.getByRole("link", { name: "Open selected role" }).waitFor();
    if (process.env.EA_SQLITE_SCREENSHOT) {
      const target = process.env.EA_SQLITE_SCREENSHOT.replace("cooldown.png", "shortlist.png");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.getByText("2 application slots available", { exact: true }).evaluate((label) =>
        label.scrollIntoView({ block: "start" }),
      );
      await page.screenshot({ path: target });
    }
    for (const job of initial.state.jobs.filter((job) => job.title !== "Infrastructure Engineer")) {
      const draft = await action("local-package", { job_id: job.id, profile_id: profile.id });
      await action("review", { id: draft.id, status: "submitted" });
    }
    const last = initial.state.jobs.find((job) => job.title === "Infrastructure Engineer");
    await page.goto(base + "/discover/?view=all");
    await page.getByText("Companies are paused", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Assess Infrastructure Engineer at Fictional Harbour" }).count(), 0);
    await action("save-job", { id: last.id, saved: true });
    await page.goto(base + "/discover/?view=saved");
    await page.getByRole("button", { name: "Assess Infrastructure Engineer at Fictional Harbour" }).first().click();
    await page.getByRole("button", { name: "Compare roles at this company" }).click();
    await page.getByText(/^Paused until /).waitFor();
    assert.equal((await action("company-roles", { job_id: last.id })).status.remaining, 0);
    if (process.env.EA_SQLITE_SCREENSHOT) {
      const target = process.env.EA_SQLITE_SCREENSHOT;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target });
    }
    console.log(`SQLite mobile-width ${useWebKit ? "WebKit" : "Chromium"} passed: company mapping, shortlist, paused search and saved-role deadline`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
