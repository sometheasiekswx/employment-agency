const { chromium } = require("../frontend/node_modules/playwright");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  openApplication,
  selectApplication,
} = require("./browser-applications.cjs");
(async () => {
  const base = process.env.TEST_URL;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Software Engineer", exact: true })
      .waitFor();
    const initial = await (await page.request.get(base + "/api/state")).json();
    assert.match(
      initial.state._workspace.path,
      /employment-agency-apply-fixture-/,
    );
    const emailApplication = initial.state.applications.find(
      (application) => application.title === "Software Engineer",
    );
    const websiteApplication = initial.state.applications.find(
      (application) => application.title === "Platform Engineer",
    );
    assert.ok(emailApplication && websiteApplication);
    await openApplication(page, base, emailApplication, "activity");
    const app = page.locator(`[data-application-id="${emailApplication.id}"]`);
    await app
      .getByRole("button", { name: "Apply For Me", exact: true })
      .click();
    let dialog = page.locator(".apply-dialog");
    await dialog
      .getByText("alex@example.test", { exact: false })
      .first()
      .waitFor();
    await dialog.getByLabel("Allow disclosure", { exact: false }).check();
    await dialog
      .getByRole("button", { name: "Prepare application", exact: true })
      .click();
    await dialog.getByText("awaiting approval", { exact: false }).waitFor();
    const frame = dialog.locator("iframe");
    assert.equal(await frame.count(), 2);
    await page.waitForFunction(() =>
      document.querySelector("dialog iframe")?.src.startsWith("blob:"),
    );
    await page.waitForTimeout(700); // Give the native PDF viewer time to paint after the verified bytes load.
    fs.mkdirSync("output/playwright/apply", { recursive: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await dialog.evaluate((e) => e.scrollWidth > e.clientWidth),
        false,
        "dialog overflow",
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations.map((v) => v.id),
        [],
      );
      await page.screenshot({
        path: `output/playwright/apply/review-${width}.png`,
      });
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
        true,
        "focus remains in modal",
      );
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".apply-dialog").count(), 0);
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Apply For Me",
    );
    await app
      .getByRole("button", { name: "Apply For Me", exact: true })
      .click();
    dialog = page.locator(".apply-dialog");
    await dialog.getByText("awaiting approval", { exact: false }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector("dialog iframe")?.src.startsWith("blob:"),
    );
    // A stale approval and wrong HTTP origin cannot trigger a recording send.
    const record = (
      await (
        await page.request.post(base + "/api/apply-status", {
          data: {},
          headers: { Origin: base, "X-Workspace-Token": initial.token },
        })
      ).json()
    ).result.attempts[0];
    assert.equal(
      (
        await page.request.post(base + "/api/apply-approve", {
          data: { id: record.id, approved: true, fingerprint: "stale" },
          headers: { Origin: base, "X-Workspace-Token": initial.token },
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await page.request.post(base + "/api/apply-approve", {
          data: {
            id: record.id,
            approved: true,
            fingerprint: record.fingerprint,
          },
          headers: {
            Origin: "https://evil.example",
            "X-Workspace-Token": initial.token,
          },
        })
      ).status(),
      403,
    );
    await dialog.getByLabel("I reviewed this exact", { exact: false }).check();
    await dialog
      .getByRole("button", { name: "Send application", exact: true })
      .click();
    await dialog
      .getByText("CONTROLLED RECORDING TRANSPORT", { exact: false })
      .waitFor();
    assert.ok((await dialog.innerText()).includes(record.binding.sha256));
    assert.ok(
      (await dialog.innerText()).includes(record.binding.cover_letter.sha256),
    );
    await page.screenshot({
      path: "output/playwright/apply/gmail-confirmation.png",
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page
      .getByRole("button", { name: "Submitted 1", exact: true })
      .click();
    await selectApplication(page, emailApplication);
    await page
      .getByRole("button", { name: "Submission details", exact: true })
      .click();
    await page.getByText("fixture-message", { exact: false }).waitFor();
    await page
      .locator(".apply-dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("button", { name: "Active 1", exact: true }).click();
    await selectApplication(page, websiteApplication);
    await page
      .getByRole("button", { name: "Apply For Me", exact: true })
      .click();
    dialog = page.locator(".apply-dialog");
    await dialog
      .getByRole("combobox", { name: "Application method" })
      .selectOption("linkedin");
    await dialog.getByLabel("Allow disclosure", { exact: false }).check();
    await dialog
      .getByRole("button", { name: "Prepare application", exact: true })
      .click();
    await dialog.getByText("awaiting approval", { exact: false }).waitFor();
    await dialog
      .getByRole("heading", { name: "Website review", exact: true })
      .waitFor();
    await page.screenshot({
      path: "output/playwright/apply/linkedin-review.png",
    });
    await dialog.getByLabel("I reviewed this exact", { exact: false }).check();
    await dialog
      .getByRole("button", { name: "Submit application", exact: true })
      .click();
    try {
      await dialog
        .getByText("Application sent", { exact: false })
        .last()
        .waitFor();
    } catch (error) {
      const result = await (
        await page.request.post(base + "/api/apply-status", {
          data: {},
          headers: { Origin: base, "X-Workspace-Token": initial.token },
        })
      ).json();
      console.error(
        "Controlled attempt statuses:",
        result.result.attempts.map((r) => ({
          channel: r.channel,
          status: r.status,
          note: r.note,
        })),
      );
      await page.screenshot({ path: "output/playwright/apply/failure.png" });
      throw error;
    }
    await page.screenshot({
      path: "output/playwright/apply/linkedin-confirmation.png",
    });
    assert.deepEqual(errors, []);
    console.log(
      "Apply UI PASS: custom PDF review, 3 widths/axe, approval+origin guards, recorded Gmail bytes+receipt, durable submission details, real browser adapter/controlled LinkedIn form receipt; no external application.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
