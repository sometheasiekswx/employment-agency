const { chromium } = require(process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const base = process.env.TEST_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const page = await context.newPage();
    await page.route("**/*", (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const read = async () => (await (await page.request.get(base + "/api/state")).json());
    const initial = await read();
    assert.match(initial.state._workspace.path, /ea-research-browser-/);
    const headers = { Origin: base, "X-Workspace-Token": initial.token };
    const request = (action, data) => page.request.post(base + "/api/" + action, { data, headers });
    const action = async (name, data) => {
      const response = await request(name, data);
      assert.ok(response.ok(), await response.text());
      return (await response.json()).result;
    };
    await page.goto(base + "/discover/?view=jobs");
    await page.getByRole("button", { name: "Copy agent instructions", exact: true }).click();
    await page.getByText("Agent instructions copied.", { exact: true }).waitFor();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(prompt.includes(base + "/api/research-workflow"));
    assert.ok(!prompt.includes(initial.token));
    const guide = (await (await page.request.get(base + "/api/research-workflow")).json()).result;
    assert.ok(prompt.includes(guide.sha256));
    assert.equal(createHash("sha256").update(guide.text).digest("hex"), guide.sha256);
    assert.equal((await read()).state._workspace.snapshot.revision, initial.state._workspace.snapshot.revision);
    const avoidance = (await (await page.request.get(base + "/api/company-avoid")).json()).result;
    assert.equal(avoidance.workspace, initial.state._workspace.path);
    const workspace_id = initial.state._workspace.workspace_id;
    const profile_id = initial.state.profiles[0].id;
    const research = await action("company-research-start", { workspace_id, profile_id });
    for (const name of ["Fictional Alpha", "Fictional Beta"]) {
      assert.equal((await action("company-research-check", { name })).research_eligible, true);
    }
    const discovery = await action("discovery-start", {
      profile_id, research_id: research.id, firecrawl: false,
      urls: ["https://alpha.example.test/careers", "https://beta.example.test/careers"],
    });
    let result;
    for (let n = 0; n < 100; n++) {
      result = await action("discovery-status", { id: discovery.id });
      if (result.status !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(result.status, "complete");
    const job_ids = [...new Set(result.sources.flatMap((source) => source.job_ids || []))];
    assert.equal(job_ids.length, 2);
    for (const job_id of job_ids) {
      await action("company-map", { job_id, confirmed: true });
    }
    const scope = { workspace_id, profile_id, research_id: research.id, job_ids };
    const refused = await request("company-research-complete", scope);
    assert.equal(refused.status(), 409);
    const blockers = (await refused.json()).result.completion.blockers;
    assert.deepEqual(blockers.map((row) => row.code), ["logo_check_missing", "logo_check_missing"]);
    const inventory = (await (await page.request.get(base + "/api/company-logo-inventory")).json()).result;
    for (const company of inventory.companies) {
      const host = company.name === "Fictional Alpha" ? "alpha" : "beta";
      await action("company-logo-backfill", {
        workspace_id, research_id: research.id, company_ids: [company.id],
        sources: { [company.id]: { url: `https://${host}.example.test/`, evidence: "Official fictional employer home page." } },
      });
    }
    const finished = await action("company-research-complete", scope);
    assert.equal(finished.completion.ready, true);
    assert.equal(finished.completion.coverage_complete, false);
    assert.deepEqual(finished.completion.gaps.map((row) => [row.kind, row.name]), [["logo", "Fictional Beta"]]);
    const receipts = await action("company-research-status", { workspace_id, research_id: research.id });
    assert.equal(receipts.sources.length, 2);
    assert.ok(receipts.sources.every((source) => source.method === "http" && Object.keys(source.jobs).length === 1));
    assert.equal(receipts.logos.length, 2);
    await page.reload();
    const alpha = inventory.companies.find((company) => company.name === "Fictional Alpha");
    const beta = inventory.companies.find((company) => company.name === "Fictional Beta");
    const alphaImage = page.locator(`[data-company-id="employer:${alpha.id}"] > header .discover-employer-mark img`);
    await alphaImage.waitFor();
    await alphaImage.evaluate((image) => image.decode());
    assert.equal(await alphaImage.evaluate((image) => image.naturalWidth), 48);
    const betaMark = page.locator(`[data-company-id="employer:${beta.id}"] > header .discover-employer-mark`);
    assert.equal(await betaMark.innerText(), "FB");
    assert.equal(await betaMark.locator("img").count(), 0);
    const output = path.join(__dirname, "../output/playwright/hybrid-research-handoff");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "completed-with-logo-gap.png"), fullPage: true });
    console.log("Research handoff, bundled guide, scraper receipts, logo outcomes and rendered fallback passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
