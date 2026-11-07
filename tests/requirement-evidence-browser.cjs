// Uses a separate fictional Concept A workspace for all writes.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(base, "Use the disposable concept fixture through TEST_URL");
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const mobile = process.env.BROWSER_ENGINE === "webkit";
  const browser = mobile
    ? await webkit.launch()
    : await chromium.launch({
        channel: process.env.BROWSER_CHANNEL || "chrome",
      });
  try {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const read = async () =>
      (await page.request.get(base + "/api/state")).json();
    const initial = await read();
    assert.equal(initial.state._workspace.demo, true);
    assert.match(initial.state._workspace.path, /ea-concept-a-preview-/);
    assert.equal(initial.state.identity.name, "Alex Morgan");
    const skill = "Zig";
    const employer = "Fictional Evidence Lab";
    const addJob = async (title, requirement) => {
      const response = await page.request.post(base + "/api/job", {
        data: {
          title,
          employer,
          location: "Toronto",
          description: "Synthetic requirement evidence browser scenario.",
          requirements: [requirement],
        },
        headers: { Origin: base, "X-Workspace-Token": initial.token },
      });
      assert.equal(response.status(), 200);
      return (await response.json()).result;
    };
    const original = await addJob("Systems Engineer", skill);
    const equivalentRequirement = "Experience with Zig";
    const equivalent = await addJob(
      "Infrastructure Engineer",
      equivalentRequirement,
    );
    const inspector = page.locator(".discover-inspector");
    const row = (requirement) =>
      inspector.locator(".discover-evidence-row").filter({
        has: page.getByText(requirement, { exact: true }),
      });
    const action = (requirement) =>
      row(requirement).getByRole("button", { name: /^I have this skill/ });
    const expand = async () => {
      if (!mobile) return;
      await inspector
        .getByRole("button", {
          name: "Resize opportunity details",
          exact: true,
        })
        .click();
    };
    const open = async (job) => {
      await page.goto(base + "/discover/?view=all&q=Fictional+Evidence+Lab");
      await page
        .getByRole("button", {
          name: `Assess ${job.title} at ${employer}`,
          exact: true,
        })
        .click();
      await inspector
        .getByRole("heading", { name: job.title, exact: true })
        .waitFor();
      await expand();
    };

    await open(original);
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/requirement-evidence" &&
        response.request().method() === "POST",
    );
    await action(skill).click();
    assert.equal((await saved).status(), 200);
    await row(skill)
      .getByText("Source: User confirmed skill", { exact: true })
      .waitFor();
    assert.equal(await action(skill).count(), 0);
    const { state } = await read();
    const matchingFacts = state.facts.filter((fact) => fact.text === skill);
    assert.equal(matchingFacts.length, 1);
    const [fact] = matchingFacts;
    assert.equal(fact.category, "skill");
    assert.equal(fact.confirmed, true);
    assert.equal(fact.source.name, "User confirmed skill");
    assert.deepEqual(
      state.jobs.find((job) => job.id === original.id).requirement_evidence[
        skill
      ].fact_ids,
      [fact.id],
    );
    assert.equal(
      state.jobs.find((job) => job.id === original.id).eligibility,
      "unknown",
    );

    await page.reload();
    await expand();
    await row(skill)
      .getByText("Source: User confirmed skill", { exact: true })
      .waitFor();
    await page.goto(base + "/career/");
    const careerFact = page.locator(`#career-fact-${fact.id}`);
    await careerFact
      .getByRole("paragraph")
      .filter({ hasText: /^Zig$/ })
      .waitFor();
    await careerFact.getByText("Confirmed", { exact: true }).waitFor();
    await open(equivalent);
    const reusedSkill = row(equivalentRequirement)
      .getByRole("listitem")
      .filter({ hasText: skill });
    await reusedSkill.waitFor();
    assert.equal(await action(equivalentRequirement).count(), 0);
    const refreshed = (await read()).state;
    assert.equal(
      refreshed.facts.filter((item) => item.text === skill).length,
      1,
    );
    const equivalentJob = refreshed.jobs.find(
      (job) => job.id === equivalent.id,
    );
    assert.deepEqual(
      equivalentJob.matched_skill_evidence[equivalentRequirement],
      [fact.id],
    );
    assert.equal(equivalentJob.requirement_evidence, undefined);
    console.log(
      "Requirement evidence browser passed: exact confirmed fact, durable link, career profile, equivalent listing, and no duplicate or eligibility change.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
