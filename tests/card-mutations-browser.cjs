const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright");

const origin = process.env.TEST_URL;
assert.match(origin || "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(new URL(origin).port, "8766");

const roles = [
  ["first", "Fictional Cloud", "Cairo"],
  ["neighbor", "Fictional Cloud", "Berlin"],
  ["other", "Fictional Systems", "Singapore"],
  ["fourth", "Fictional Studio", "Toronto"],
  ["fifth", "Fictional Research", "London"],
];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function hold(queue) {
  const requested = deferred();
  const release = deferred();
  const finished = deferred();
  queue.push({ requested, release, finished });
  return {
    async waitForRequest() {
      let timer;
      try {
        await Promise.race([
          requested.promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Expected fixture request did not start")), 8000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    async respond(status = 200) {
      release.resolve(status);
      await finished.promise;
    },
  };
}

async function respond(route, queue, json) {
  const held = queue.shift();
  held?.requested.resolve();
  const status = held ? await held.release.promise : 200;
  await route.fulfill({
    status,
    json: status === 200 ? json : { error: "Fictional state read failed" },
  });
  held?.finished.resolve();
}

const card = (page, id = "first") => page.locator(`.discover-board article[data-job-id="${id}"]`);
const bookmark = (page) => card(page).getByTitle("Apply later", { exact: true });
const gone = (page) => card(page).waitFor({ state: "detached" });
const frames = (page) => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
));

async function scenario(browser, width, check) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  try {
    const response = await context.request.get(origin + "/api/state");
    const { state } = await response.json();
    assert.equal(state.identity.name, "Alex Morgan");
    assert.equal(state._workspace.demo, true);
    state.applications = [];
    state.application_queue = [];
    state.agent_intents = [];
    state.jobs = roles.map(([id, employer, location]) => ({
      id, employer, location, title: `Fictional engineer ${id}`,
      requirements: ["Python"], saved: false, removals: [],
    }));
    const reads = [];
    const choices = [];
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await context.route("**/api/state", (route) =>
      respond(route, reads, { state: structuredClone(state), token: "fictional-card-test" }),
    );
    await context.route("**/api/rank", (route) => route.fulfill({
      json: { result: state.jobs.map((job) => ({
        job,
        match: {
          eligible_for_preparation: true, hard_conflicts: [], unknowns: [],
          gaps: [], evidence: [], preferences: [], salary_expectation: {},
        },
      })) },
    }));
    await context.route("**/api/save-job", (route) => {
      const { id, saved } = route.request().postDataJSON();
      const job = state.jobs.find((item) => item.id === id);
      assert.ok(job);
      job.saved = saved;
      return respond(route, choices, { result: { id, saved } });
    });
    await context.route("**/api/remove-job", (route) => {
      const { id, removal_id } = route.request().postDataJSON();
      const job = state.jobs.find((item) => item.id === id);
      assert.ok(job);
      job.removals.push({ id: removal_id, at: new Date().toISOString(), reason: "" });
      return route.fulfill({ json: { result: { id, removals: job.removals } } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.clock.install();
    await page.goto(origin + "/discover/?view=jobs");
    await bookmark(page).waitFor();
    await check({ page, context, state, reads, choices });
    assert.equal(await page.locator(".discover-inspector[open]").count(), 0);
  } finally {
    await context.close();
  }
}

(async () => {
  const useWebKit = process.env.BROWSER_ENGINE === "webkit";
  const browser = useWebKit ? await webkit.launch() : await chromium.launch({ channel: "chrome" });
  try {
    await scenario(browser, 1440, async ({ page, reads }) => {
      const actionRead = hold(reads);
      const pollRead = hold(reads);
      await bookmark(page).click();
      await gone(page);
      await actionRead.waitForRequest();
      await page.clock.fastForward(8_000);
      await pollRead.waitForRequest();
      await actionRead.respond();
      await frames(page);
      assert.equal(await card(page).count(), 0, "A superseded refresh leaves the saved card absent");
      await pollRead.respond();
      await frames(page);
      assert.equal(await card(page).count(), 0);
    });

    await scenario(browser, 1440, async ({ page, reads }) => {
      const failedRead = hold(reads);
      await bookmark(page).click();
      await gone(page);
      await failedRead.waitForRequest();
      await failedRead.respond(503);
      await page.getByRole("alert").filter({ hasText: "Fictional state read failed" }).waitFor();
      assert.equal(await card(page).count(), 0, "A failed state read leaves the accepted save in effect");
      assert.equal(await page.getByText(/Your previous To apply choice is shown/).count(), 0);
      await page.getByRole("button", { name: "To apply", exact: true }).click();
      await card(page).waitFor();
    });

    await scenario(browser, 1440, async ({ page, context, state, choices }) => {
      const delayedReceipt = hold(choices);
      await bookmark(page).click();
      await delayedReceipt.waitForRequest();
      await gone(page);
      const otherClient = await context.newPage();
      await otherClient.goto(origin + "/discover/?view=to-apply");
      await card(otherClient).getByTitle("Remove from To apply", { exact: true }).click();
      await gone(otherClient);
      assert.equal(state.jobs[0].saved, false);
      await delayedReceipt.respond();
      await card(page).waitFor({ timeout: 5000 });
      await frames(page);
      assert.equal(await card(page).count(), 1, "A newer observed server choice supersedes the receipt");
    });

    for (const action of ["Apply later", "Remove role"]) {
      await scenario(browser, 390, async ({ page }) => {
        const city = page.getByRole("combobox", { name: "Filter by city", exact: true });
        await city.waitFor();
        assert.ok(await city.locator('option[value="Cairo"]').count());
        const heading = page.getByRole("heading", { name: "Fictional Cloud", exact: true });
        const before = await heading.boundingBox();
        await card(page).getByTitle(action, { exact: true }).click();
        await gone(page);
        await frames(page);
        assert.equal(await city.locator('option[value="Cairo"]').count(), 0);
        assert.ok(await city.isVisible(), "Keep the filter control during a review");
        assert.ok(await card(page, "neighbor").count());
        const after = await heading.boundingBox();
        assert.ok(Math.abs(before.y - after.y) < 1, `${action} keeps the company heading anchored`);
      });
    }
    console.log(`PASS ${useWebKit ? "WebKit" : "Chromium"}: closed details, poll overlap, failed refresh, newer two-client reversal, and mobile location stability after save and removal.`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
