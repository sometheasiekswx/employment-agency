// Queue acceptance against a disposable installed wheel, never the checkout app.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  roleCard,
} = require("./browser-applications.cjs");

(async () => {
  const [base, fixturePath] = process.argv.slice(2);
  assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.match(fixture.workspace, /ea-wheel-proof-/);
  assert.equal(path.basename(fixture.workspace), "queue-workspace");
  const digest = (bytes) =>
    crypto.createHash("sha256").update(bytes).digest("hex");
  const statePath = path.join(fixture.workspace, "state.json");
  const originalState = digest(fs.readFileSync(statePath));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const initial = await (await page.request.get(base + "/api/state")).json();
    assert.equal(initial.state._workspace.path, fixture.workspace);
    assert.equal(initial.state.applications.length, fixture.versions.length);
    for (const key of [
      "old_draft",
      "earlier_sent",
      "sent",
      "late_draft",
      "active",
      "separate",
      "rejected",
      "legacy_sent",
    ]) {
      const application = initial.state.applications.find(
        (app) => app.id === fixture[key].id,
      );
      assert.ok(application, `The installed fixture retains ${key}`);
      fixture[key] = application;
    }
    const card = (app) => page.locator(`[data-application-id="${app.id}"]`);
    const role = (app) => roleCard(page, app);
    const tab = (name, count) =>
      page.getByRole("button", { name: `${name} ${count}`, exact: true });
    const counts = async (submitted = 1) => {
      for (const name of ["Active 2", `Submitted ${submitted}`, "Removed 1"])
        assert.equal(
          await page
            .getByRole("group", { name: "Application stage" })
            .getByRole("button", { name, exact: true })
            .count(),
          1,
          "Counts represent jobs rather than preserved document versions",
        );
    };

    await page.goto(base + "/discover/?view=applications&section=active");
    await tab("Active", 2).waitFor();
    await counts();
    assert.equal(await page.locator(".discover-card").count(), 2);
    assert.equal(await role(fixture.active).count(), 1);
    assert.equal(await role(fixture.separate).count(), 1);
    for (const app of [
      fixture.old_draft,
      fixture.earlier_sent,
      fixture.sent,
      fixture.late_draft,
    ]) {
      assert.equal(
        await role(app).count(),
        0,
        "Submitted job has no active sibling",
      );
    }
    assert.deepEqual(
      await page
        .locator(".discover-filters select[aria-label='Location'] option")
        .allTextContents(),
      ["All locations", "Toronto", "Montreal"],
    );
    await page.locator(".discover-filters summary").click();
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .selectOption("Toronto");
    await page.locator(".discover-filters summary").click();
    await page.getByText("1 role · 1 company", { exact: true }).waitFor();
    assert.equal(await role(fixture.active).count(), 1);
    assert.equal(await role(fixture.separate).count(), 0);

    await tab("Submitted", 1).click();
    await role(fixture.sent).locator(".discover-card-open").click();
    const workspace = page.getByRole("dialog", { name: fixture.sent.title });
    const panels = workspace.getByRole("group", { name: "Role workspace" });
    await panels.getByRole("button", { name: "CV", exact: true }).click();
    await card(fixture.sent).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 1);
    assert.equal(
      await card(fixture.earlier_sent).count(),
      0,
      "Latest submission wins by decision time",
    );
    assert.equal(
      await card(fixture.late_draft).count(),
      0,
      "Later edit does not replace a submission",
    );
    await panels.getByRole("button", { name: "Documents", exact: true }).click();
    const versionIds = await workspace
      .getByRole("combobox", { name: "Document version", exact: true })
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
    for (const application of [
      fixture.old_draft,
      fixture.earlier_sent,
      fixture.sent,
      fixture.late_draft,
    ])
      assert.ok(
        versionIds.includes(application.id),
        "The role workspace retains access to every preserved sibling",
      );
    await panels.getByRole("button", { name: "Activity", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Apply For Me", exact: true })
        .count(),
      0,
    );
    await panels.getByRole("button", { name: "CV", exact: true }).click();
    const resumeLink = card(fixture.sent).getByRole("link", {
      name: "Download CV",
      exact: true,
    });
    const resume = await page.request.get(
      new URL(await resumeLink.getAttribute("href"), base).href,
    );
    assert.equal(resume.status(), 200);
    assert.equal(
      digest(await resume.body()),
      fixture.submitted_files.find(
        (file) => file.id === fixture.sent.id && file.name === "resume.pdf",
      ).sha256,
    );

    await workspace.getByRole("button", { name: "Close opportunity details" }).click();

    await page.getByLabel("Include earlier review queues").check();
    await tab("Submitted", 2).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("location"), "Toronto");
    assert.equal(await role(fixture.legacy_sent).count(), 0);
    await page
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await role(fixture.legacy_sent).waitFor();
    await counts(2);
    assert.equal(await page.locator(".discover-card").count(), 2);
    await tab("Active", 2).click();
    await role(fixture.active).waitFor();
    assert.equal(
      await page.locator(".discover-card").count(),
      2,
      "Earlier queues do not resurrect drafts",
    );
    await tab("Removed", 1).click();
    await role(fixture.rejected).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 1);

    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.locator(".history-files").first().waitFor({ state: "attached" });
    assert.equal(
      await page.locator(".history-files").count(),
      fixture.versions.length,
    );
    for (const version of fixture.versions) {
      assert.ok(
        await page
          .locator(`a[href^="/history/files/${version.history_id}/"]`)
          .count(),
        `History retains preserved version ${version.id}`,
      );
    }
    for (const file of fixture.submitted_files) {
      const response = await page.request.get(
        `${base}/files/${file.id}/${encodeURIComponent(file.name)}`,
      );
      assert.equal(response.status(), 200);
      assert.equal(digest(await response.body()), file.sha256);
      assert.equal(
        digest(fs.readFileSync(file.path)),
        file.sha256,
        "Submitted PDF bytes remain unchanged",
      );
    }
    assert.equal(
      digest(fs.readFileSync(statePath)),
      originalState,
      "Queue browsing preserves durable state",
    );
    assert.deepEqual(errors, [], "Installed interface has no browser errors");
    console.log(
      "Installed wheel queue browser PASS: one card per job, latest submission precedence, counts/destinations, all versions in history and unchanged submitted files/state.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
