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
    const headers = { Origin: base, "X-Workspace-Token": initial.token };
    const request = (name, data) => page.request.post(base + "/api/" + name, { data, headers });
    const action = async (name, data) => {
      const response = await request(name, data);
      assert.ok(response.ok(), await response.text());
      return (await response.json()).result;
    };
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async () => { throw new Error("Clipboard denied"); } },
      });
    });
    await page.goto(base + "/discover/?view=all");
    const logo = initial.state.jobs.find((job) => job.title === "Quality Engineer").company?.logo_url;
    assert.match(logo, /^\/api\/company-logo\/[0-9a-f]{64}\.png$/);
    {
      const logoResponse = await page.request.get(base + logo);
      assert.equal(logoResponse.headers()["content-type"], "image/png");
      assert.equal(logoResponse.status(), 200);
      const logoImage = page.locator(`.discover-card .discover-employer-mark img[src$="${logo}"]`).first();
      await logoImage.waitFor();
      await logoImage.evaluate((image) => image.decode());
      assert.ok(await logoImage.evaluate((image) => image.complete && image.naturalWidth === 48 && image.naturalHeight === 24));
    }
    const researchTrigger = page.getByRole("button", { name: "Copy agent instructions", exact: true });
    await researchTrigger.click();
    const prompt = page.getByRole("dialog", { name: "Agent instructions" });
    const research = await prompt.getByRole("textbox", { name: "Prompt" }).inputValue();
    assert.match(research, /^Find five additional eligible hiring companies/);
    assert.match(research, /GET \/api\/company-avoid/);
    assert.ok(research.includes(profile.id));
    await prompt.getByRole("button", { name: "Close agent instructions" }).click();
    assert.ok(await researchTrigger.evaluate((button) => button === document.activeElement));
    await page.getByRole("button", { name: "Assess Platform Engineer at Fictional Harbour" }).first().click();
    const details = page.getByRole("dialog", { name: "Platform Engineer" });
    await details.getByRole("button", { name: "Resize opportunity details" }).click();
    assert.equal(
      await details.getByRole("button", { name: "Copy job reference", exact: true }).count(),
      1,
      "Expanding SQLite role details keeps one Copy job reference button",
    );
    assert.equal(await details.getByRole("link", { name: first.title, exact: true }).getAttribute("href"), first.url);
    assert.equal(await details.getByRole("link", { name: "View job listing", exact: true }).count(), 0);
    assert.equal(await details.getByText("Company research", { exact: true }).count(), 0);
    assert.equal(await details.getByText("Check before applying", { exact: true }).count(), 0);
    await details.getByRole("button", { name: "Apply later", exact: true }).click();
    const current = await action("company-roles", { job_id: first.id, profile_id: profile.id });
    const known = current.employers.find(({ name }) => name === first.employer);
    if (known) await details.getByLabel("Hiring employer", { exact: true }).selectOption(known.id);
    else await details.getByLabel("Hiring employer name").fill(first.employer);
    await details.getByRole("button", { name: "Confirm employer" }).click();
    await details.getByRole("button", { name: "Remove from To apply", exact: true }).waitFor();
    await details.locator(`.discover-employer-mark img[src$="${logo}"]`).waitFor();
    await details.getByRole("button", { name: "Prepare application" }).click();
    await details.getByRole("heading", { name: "CV", exact: true }).waitFor();
    await details.getByRole("button", { name: "Open application site" }).click();
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
    await details.getByRole("region", { name: "Submission record", exact: true })
      .getByText("Fictional website receipt 2048", { exact: true }).waitFor();
    const recorded = await action("company-submission-status", { job_id: first.id });
    assert.equal(recorded[0].status, "confirmed");
    assert.equal(recorded[0].document_application_id, held[0].application_id);
    assert.deepEqual(await (await page.request.get(`${base}/files/${held[0].application_id}/resume.pdf`)).body(), original);
    const submitted = await action("application-queue", { stage: "submitted" });
    assert.equal(submitted.rows.find((row) => row.job_id === first.id).application_id, held[0].application_id);
    const linked = await action("company-roles", { job_id: first.id, profile_id: profile.id });
    for (const other of initial.state.jobs.filter((job) => job.id !== first.id)) {
      await action("company-map", { job_id: other.id, employer_id: linked.employer.id, confirmed: true });
    }
    const second = initial.state.jobs.find((job) => job.title === "Quality Engineer");
    const last = initial.state.jobs.find((job) => job.title === "Infrastructure Engineer");
    await action("save-job", { id: second.id, saved: true });
    assert.deepEqual(await action("company-selection", {
      job_id: first.id, profile_id: profile.id, job_ids: [second.id],
    }), { job_ids: [second.id] });
    const blocked = await request("save-job", { id: last.id, saved: true });
    assert.equal(blocked.status(), 409);
    assert.equal((await blocked.json()).code, "company_slots_used");
    await page.goto(base + "/discover/?view=jobs");
    const assessLast = page.getByRole("button", { name: `Assess ${last.title} at ${last.employer}` });
    await assessLast.click();
    const lastDetails = page.getByRole("dialog", { name: last.title });
    await lastDetails.getByText("No slots left for this company", { exact: true }).waitFor();
    assert.equal(await lastDetails.getByRole("button", { name: "Apply later", exact: true }).count(), 0);
    await lastDetails.getByRole("link", { name: "Review this company in To apply" }).click();
    await page.getByText("All To apply (1)", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Copy agent instructions", exact: true }).click();
    const instructionsField = prompt.getByRole("textbox", { name: "Prompt" });
    const instructions = await instructionsField.inputValue();
    assert.match(instructions, /^Apply for these exact roles/);
    assert.ok(instructions.includes(second.id));
    assert.ok(!instructions.includes(last.id));
    await instructionsField.fill(instructions + "\nFictional edited request.");
    await prompt.getByRole("button", { name: "Copy", exact: true }).click();
    await prompt.getByRole("alert").getByText(/Clipboard access failed/).waitFor();
    assert.equal(await instructionsField.inputValue(), instructions + "\nFictional edited request.");
    await prompt.getByRole("button", { name: "Reset", exact: true }).click();
    assert.equal(await instructionsField.inputValue(), instructions);
    await prompt.getByRole("button", { name: "Close agent instructions" }).click();
    if (process.env.EA_SQLITE_SCREENSHOT) {
      const target = process.env.EA_SQLITE_SCREENSHOT.replace("cooldown.png", "shortlist.png");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await page.screenshot({ path: target });
    }
    const draft = await action("local-package", { job_id: second.id, profile_id: profile.id });
    await action("review", { id: draft.id, status: "submitted" });
    await page.goto(base + "/discover/?view=all");
    await page.getByText("No roles in Jobs", { exact: true }).waitFor();
    const remainingRole = page.getByRole("button", { name: "Assess Infrastructure Engineer at Fictional Harbour" });
    assert.equal(await remainingRole.count(), 0);
    const pausedAdd = await request("save-job", { id: last.id, saved: true });
    assert.equal(pausedAdd.status(), 409);
    assert.equal((await pausedAdd.json()).code, "role_removed");
    await page.getByRole("button", { name: "Removed (1)" }).click();
    await remainingRole.waitFor();
    await page.getByText("Reason: Company application limit reached", { exact: true }).waitFor();
    const removedQueue = await action("application-queue", { stage: "removed" });
    assert.deepEqual(removedQueue.rows.map(({ job_id }) => job_id), [last.id]);
    const retainedSubmissions = await action("application-queue", { stage: "submitted" });
    assert.deepEqual(new Set(retainedSubmissions.rows.map(({ job_id }) => job_id)), new Set([first.id, second.id]));
    assert.deepEqual(await (await page.request.get(`${base}/files/${held[0].application_id}/resume.pdf`)).body(), original);
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
    await page.locator(".notification-card:not([inert])").filter({ hasText: "Company cooldown saved." }).waitFor();
    const extended = (await action("company-roles", { job_id: last.id })).status;
    assert.equal(extended.remaining, 0);
    assert.ok(Date.parse(extended.cooldown_until) > Date.parse(paused.cooldown_until));
    await page.reload();
    await months.waitFor();
    assert.equal(await months.inputValue(), "6");

    console.log(`SQLite mobile-width ${useWebKit ? "WebKit" : "Chromium"} passed: inline employer resolution, reserved self-apply, exact submitted bytes, shortlist, automatic removal, cooldown and settings`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
