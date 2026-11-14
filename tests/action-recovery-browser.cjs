// Real local UI recovery with disposable fictional records only.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { showPanel, workbench } = require("./browser-applications.cjs");
(async () => {
  const base = process.env.TEST_URL;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const read = async () =>
      (await (await page.request.get(base + "/api/state")).json()).state;
    const initial = await read();
    const root = initial._workspace.path;
    assert.match(root, /employment-agency-queue-fixture-/);
    const fixture = JSON.parse(
      fs.readFileSync(path.join(root, "queue-fixture.json")),
    );
    const fingerprint = (app) =>
      Object.fromEntries(
        Object.entries(app.documents).map(([name, file]) => [
          name,
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(root, app.folder, file)))
            .digest("hex"),
        ]),
      );
    fs.mkdirSync("output/playwright/action-recovery", { recursive: true });
    for (const [width, app] of [
      [1440, fixture.active],
      [390, fixture.separate],
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      const bytes = fingerprint(app);
      await page.goto(
        `${base}/?section=active&application=${app.id}&panel=activity`,
      );
      let card = page.locator(`[data-application-id="${app.id}"]`);
      const record = card.getByRole("button", {
        name: "Record submission…",
        exact: true,
      });
      await record.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("heading", { name: "Record this submission?", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", {
            name: "Record this submission?",
            exact: true,
          })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await card
        .getByLabel("Where or how you submitted")
        .fill("Do not save this cancelled record");
      await card.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(
        await record.evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        (await read()).applications.find((item) => item.id === app.id).status,
        "draft",
      );
      const submissionComment = `Fictional ${width}px review note consumed by the submission record.`;
      await card
        .getByLabel("Comments", { exact: true })
        .fill(submissionComment);
      await record.click();
      await card
        .getByLabel("Where or how you submitted")
        .fill("Fictional website; accidental record for recovery test");
      await card
        .getByLabel("I have already submitted this application.", {
          exact: true,
        })
        .check();
      await card
        .getByRole("button", { name: "Confirm submission record", exact: true })
        .click();
      await page.waitForURL(
        (url) =>
          url.searchParams.get("section") === "submitted" &&
          url.searchParams.get("panel") === "activity",
      );
      card = page.locator(`[data-application-id="${app.id}"]`);
      const submitted = (await read()).applications.find(
        (item) => item.id === app.id,
      );
      assert.equal(submitted.status, "submitted");
      assert.ok(
        submitted.comments.some((comment) =>
          comment.text.includes(submissionComment),
        ),
        "Recording a submission persists the existing Activity comment",
      );
      assert.deepEqual(fingerprint(submitted), bytes);
      assert.equal(
        await card.getByLabel("Comments", { exact: true }).inputValue(),
        "",
      );
      const unexpectedPrompts = [];
      const rejectUnexpectedPrompt = (dialog) => {
        unexpectedPrompts.push(dialog.message());
        void dialog.dismiss();
      };
      page.on("dialog", rejectUnexpectedPrompt);
      try {
        await workbench(page).getByRole("button", { name: "CV", exact: true }).click();
        assert.deepEqual(
          unexpectedPrompts,
          [],
          "A comment consumed by submission no longer prompts on panel navigation",
        );
      } finally {
        page.off("dialog", rejectUnexpectedPrompt);
      }
      await page.waitForURL(
        (url) => url.searchParams.get("panel") === "documents",
      );
      await showPanel(page, "activity");
      await card
        .getByRole("button", {
          name: "Correct submission record…",
          exact: true,
        })
        .click();
      const reason = card.getByLabel("Reason for correction");
      await reason.fill("The fictional submission was recorded by mistake.");
      await card
        .getByLabel(
          "This application was not actually submitted; the record was a mistake.",
          { exact: true },
        )
        .check();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `confirmation overflow at ${width}`,
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations.map((v) => v.id),
        [],
      );
      await card.screenshot({
        path: `output/playwright/action-recovery/confirmation-${width}.png`,
      });
      let failOnce = true;
      await page.route("**/api/correct-submission", async (route) => {
        if (failOnce) {
          failOnce = false;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Temporary recovery failure; retry safely.",
            }),
          });
        } else await route.continue();
      });
      const correct = card.getByRole("button", {
        name: "Create corrected draft record",
        exact: true,
      });
      await correct.click();
      await card
        .getByRole("alert")
        .filter({ hasText: "Temporary recovery failure" })
        .waitFor();
      assert.equal(
        await reason.inputValue(),
        "The fictional submission was recorded by mistake.",
      );
      assert.equal(
        (await read()).applications.length,
        initial.applications.length + (width === 390 ? 1 : 0),
      );
      await correct.click();
      await page.waitForURL(
        (url) =>
          url.searchParams.get("section") === "active" &&
          url.searchParams.get("application") !== app.id,
      );
      const recoveredId = new URL(page.url()).searchParams.get("application");
      const recoveredCard = page.locator(
        `[data-application-id="${recoveredId}"]`,
      );
      await showPanel(page, "files");
      await recoveredCard.locator(".application-context > summary").click();
      await recoveredCard
        .getByText("Original submission record and correction", { exact: true })
        .click();
      await recoveredCard
        .getByRole("link", { name: "Original CV PDF", exact: true })
        .waitFor();
      const final = await read();
      const original = final.applications.find((item) => item.id === app.id);
      const recovered = final.applications.find(
        (item) => item.id === recoveredId,
      );
      assert.equal(original.status, "submitted");
      assert.equal(original.submitted_at, submitted.submitted_at);
      assert.equal(original.manifest_hash, submitted.manifest_hash);
      assert.equal(
        original.submission_correction.recovery_application_id,
        recoveredId,
      );
      assert.equal(recovered.status, "draft");
      assert.equal(recovered.submission_recovery.original_id, app.id);
      assert.deepEqual(fingerprint(original), bytes);
      assert.deepEqual(fingerprint(recovered), bytes);
      await recoveredCard.screenshot({
        path: `output/playwright/action-recovery/recovered-${width}.png`,
      });
      await page.unroute("**/api/correct-submission");

      const fact = (await read()).facts.find((item) => !item.retired);
      assert.ok(fact);
      await page.goto(base + "/career/");
      const factCard = page.locator(`[id="career-fact-${fact.id}"]`);
      const retire = factCard.getByRole("button", {
        name: "Retire",
        exact: true,
      });
      await retire.focus();
      await page.keyboard.press("Enter");
      await factCard
        .getByRole("heading", { name: "Retire this career fact?", exact: true })
        .waitFor();
      await factCard
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal(
        await retire.evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        (await read()).facts.find((item) => item.id === fact.id).retired,
        false,
      );
      await retire.click();
      await factCard
        .getByRole("button", { name: "Retire fact", exact: true })
        .click();
      const retired = page.locator("details").filter({
        has: page.locator("summary").filter({ hasText: /^Retired facts/ }),
      });
      await page.waitForFunction(() =>
        document.activeElement?.textContent?.startsWith("Retired facts"),
      );
      assert.equal(await retired.getAttribute("open"), "");
      await retired
        .getByRole("button", { name: "Restore", exact: true })
        .click();
      await page.waitForFunction(
        (id) => document.activeElement?.id === `career-fact-${id}`,
        fact.id,
      );
      const restored = (await read()).facts.find((item) => item.id === fact.id);
      assert.equal(restored.retired, false);
      assert.equal(restored.confirmed, false);
      assert.equal(restored.text, fact.text);
      assert.deepEqual(restored.source, fact.source);
      await factCard
        .getByRole("button", { name: "Confirm", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: `output/playwright/action-recovery/career-restored-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "Desktop/mobile confirmation, cancellation, failed recovery retry, audit links and immutable documents passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
