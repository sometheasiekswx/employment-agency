const { chromium } = require("../frontend/node_modules/playwright");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { openApplication } = require("./browser-applications.cjs");

(async () => {
  const base = process.env.TEST_URL;
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const initial = await (await page.request.get(base + "/api/state")).json();
    assert.match(initial.state._workspace.path, /employment-agency-apply-fixture-/);
    const emailApplication = initial.state.applications.find(
      (application) => application.title === "Software Engineer",
    );
    const websiteApplication = initial.state.applications.find(
      (application) => application.title === "Platform Engineer",
    );
    assert.ok(emailApplication && websiteApplication);

    const request = (operation, data, origin = base) =>
      page.request.post(base + "/api/" + operation, {
        data,
        headers: { Origin: origin, "X-Workspace-Token": initial.token },
      });
    const action = async (operation, data) => {
      const response = await request(operation, data);
      const body = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(body));
      return body.result;
    };
    const waitFor = async (id, status) => {
      const deadline = Date.now() + 20_000;
      let attempt;
      while (Date.now() < deadline) {
        attempt = await action("apply-get", { id });
        if (attempt.status === status) return attempt;
        if (["failed", "needs_user", "unknown"].includes(attempt.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Controlled ${attempt?.channel} attempt: ${attempt?.status} ${attempt?.note}`);
    };

    await openApplication(page, base, emailApplication, "documents");
    const cv = page.getByRole("region", { name: "CV" });
    await cv.waitFor();
    await cv.locator("canvas").first().waitFor();
    fs.mkdirSync("output/playwright/apply", { recursive: true });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await cv.evaluate((el) => el.scrollWidth > el.clientWidth), false);
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations.map((item) => item.id),
        [],
      );
      await page.screenshot({ path: `output/playwright/apply/review-${width}.png` });
    }

    const email = await action("apply-start", {
      application_id: emailApplication.id,
      disclosure_confirmed: true,
      channel: "gmail",
      to: "jobs@example.test",
      subject: "Controlled application",
      body: "Fictional fixture, no provider message.",
    });
    const reviewed = await waitFor(email.id, "awaiting_approval");
    const approval = { id: email.id, approved: true, fingerprint: reviewed.fingerprint };
    assert.equal((await request("apply-approve", { ...approval, fingerprint: "stale" })).status(), 400);
    assert.equal((await request("apply-approve", approval, "https://evil.example")).status(), 403);
    assert.equal((await action("apply-get", { id: email.id })).status, "awaiting_approval");
    await action("apply-approve", approval);
    const sent = await waitFor(email.id, "confirmed");
    assert.equal(sent.receipt.attachment_sha256, reviewed.binding.sha256);
    assert.equal(sent.receipt.cover_letter_sha256, reviewed.binding.cover_letter.sha256);
    await openApplication(page, base, { ...emailApplication, status: "submitted" }, "activity");
    const history = page.getByRole("region", { name: "Previous submission attempts" });
    await history.getByText("Confirmation evidence", { exact: true }).click();
    await history.getByText(/CONTROLLED RECORDING TRANSPORT/).waitFor();
    await history.getByText(/fixture-message/).waitFor();
    assert.ok((await history.innerText()).includes(reviewed.binding.sha256));
    assert.ok((await history.innerText()).includes(reviewed.binding.cover_letter.sha256));
    await page.screenshot({ path: "output/playwright/apply/gmail-confirmation.png" });

    const web = await action("apply-start", {
      application_id: websiteApplication.id,
      disclosure_confirmed: true,
      channel: "linkedin",
    });
    const form = await waitFor(web.id, "awaiting_approval");
    assert.equal(form.payload.site_review.upload_sha256, form.binding.sha256);
    assert.equal(form.payload.site_review.cover_letter_sha256, form.binding.cover_letter.sha256);
    await action("apply-approve", { id: web.id, approved: true, fingerprint: form.fingerprint });
    const confirmed = await waitFor(web.id, "confirmed");
    assert.equal(confirmed.receipt.confirmation, "Application sent");
    await openApplication(page, base, { ...websiteApplication, status: "submitted" }, "activity");
    await history.getByText("Confirmation evidence", { exact: true }).click();
    await history.getByText(/Application sent/).waitFor();
    await page.screenshot({ path: "output/playwright/apply/linkedin-confirmation.png" });
    assert.deepEqual(errors, []);
    console.log("Legacy delivery PASS: CV preview/3 widths/axe, approval and origin guards, exact PDFs and retained Gmail and browser receipts in Activity.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
