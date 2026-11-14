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
    // Exercise the in-workspace continuation for browsers that block a popup.
    await page.addInitScript(() => { window.open = () => null; });
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
    const details = page.getByRole("dialog", { name: "Platform Engineer" });
    await details.getByRole("button", { name: "Resize opportunity details" }).click();
    assert.equal(
      await details.getByRole("button", { name: "Copy job reference", exact: true }).count(),
      1,
      "Expanding SQLite role details keeps one Copy job reference button",
    );
    await details.getByRole("button", { name: "Prepare application" }).click();
    await details.getByRole("heading", { name: "CV", exact: true }).waitFor();
    assert.equal(await details.getByRole("link", { name: "View job listing" }).getAttribute("href"), first.url);
    await details.getByRole("button", { name: "Open application site" }).click();
    await details.getByLabel("Hiring employer name").fill(first.employer);
    await details.getByRole("button", { name: "Confirm employer" }).click();
    await details.getByRole("button", { name: "I've applied" }).waitFor();
    const continuation = await details.getByRole("link", { name: "Continue to application site" }).getAttribute("href");
    assert.match(continuation, /^\/api\/application-site\/[a-f0-9]{32}\/[a-f0-9]{64}$/);
    const redirect = await page.request.get(base + continuation, { maxRedirects: 0 });
    assert.equal(redirect.status(), 302);
    assert.equal(redirect.headers().location, first.url);
    const denied = await page.request.get(base + continuation.slice(0, -1), { maxRedirects: 0 });
    assert.equal(denied.status(), 404);
    const held = await action("company-submission-status", { job_id: first.id });
    assert.equal(held.length, 1);
    assert.equal(held[0].status, "handed_off");
    assert.equal((await action("company-roles", { job_id: first.id })).status.remaining, 1);
    const sent = await page.request.get(`${base}/files/${held[0].application_id}/resume.pdf`);
    assert.ok(sent.ok());
    const original = await sent.body();
    await details.getByRole("button", { name: "I've applied" }).click();
    await details.getByLabel(/^Actual submission date and time/).fill(new Date().toISOString().slice(0, 16));
    await details.getByLabel("Did you use the reserved documents?").selectOption("yes");
    await details.getByLabel("Confirmation evidence").fill("Fictional website receipt 2048");
    await details.getByRole("button", { name: "Record submission" }).click();
    await details.getByText("Fictional website receipt 2048", { exact: true }).waitFor();
    const recorded = await action("company-submission-status", { job_id: first.id });
    assert.equal(recorded[0].status, "confirmed");
    assert.equal(recorded[0].document_application_id, held[0].application_id);
    assert.deepEqual(await (await page.request.get(`${base}/files/${held[0].application_id}/resume.pdf`)).body(), original);
    const submitted = await action("application-queue", { stage: "submitted" });
    assert.equal(submitted.rows.find((row) => row.job_id === first.id).application_id, held[0].application_id);
    const current = await action("company-roles", { job_id: first.id, profile_id: profile.id });
    for (const other of initial.state.jobs.filter((job) => job.id !== first.id)) {
      await action("company-map", { job_id: other.id, employer_id: current.employer.id, confirmed: true });
    }
    const second = initial.state.jobs.find((job) => job.title === "Quality Engineer");
    assert.deepEqual(await action("company-selection", {
      job_id: first.id, profile_id: profile.id, job_ids: [second.id],
    }), { job_ids: [second.id] });
    if (process.env.EA_SQLITE_SCREENSHOT) {
      const target = process.env.EA_SQLITE_SCREENSHOT.replace("cooldown.png", "shortlist.png");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target });
    }
    const draft = await action("local-package", { job_id: second.id, profile_id: profile.id });
    await action("review", { id: draft.id, status: "submitted" });
    const last = initial.state.jobs.find((job) => job.title === "Infrastructure Engineer");
    await page.goto(base + "/discover/?view=all");
    await page.getByText("Companies are paused", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Assess Infrastructure Engineer at Fictional Harbour" }).count(), 0);
    await action("save-job", { id: last.id, saved: true });
    await page.goto(base + "/discover/?view=saved");
    await page.getByRole("button", { name: "Assess Infrastructure Engineer at Fictional Harbour" }).first().click();
    await page.getByText("Company research", { exact: true }).click();
    await page.getByRole("button", { name: "Compare roles at this company" }).click();
    await page.getByText(/^Paused until /).waitFor();
    const paused = (await action("company-roles", { job_id: last.id })).status;
    assert.equal(paused.remaining, 0);
    assert.ok(Number.isFinite(Date.parse(paused.cooldown_until)));
    if (process.env.EA_SQLITE_SCREENSHOT) {
      const target = process.env.EA_SQLITE_SCREENSHOT;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target });
    }
    await page.goto(base + "/settings/");
    const months = page.getByRole("spinbutton", { name: "Cooldown in calendar months" });
    await months.waitFor();
    assert.equal(await months.inputValue(), "3");
    await months.fill("6");
    await page.getByRole("button", { name: "Save cooldown" }).click();
    await page.getByRole("status").filter({ hasText: "Company cooldown saved." }).waitFor();
    const extended = (await action("company-roles", { job_id: last.id })).status;
    assert.equal(extended.remaining, 0);
    assert.ok(Date.parse(extended.cooldown_until) > Date.parse(paused.cooldown_until));
    await page.reload();
    await months.waitFor();
    assert.equal(await months.inputValue(), "6");

    console.log(`SQLite mobile-width ${useWebKit ? "WebKit" : "Chromium"} passed: inline employer resolution, reserved self-apply, exact submitted bytes, shortlist, cooldown and settings`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
