const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const { openApplication, showPanel, workbench } = require("./browser-applications.cjs");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  if (process.env.HOSTED)
    await page.addInitScript(
      () =>
        window === window.top &&
        sessionStorage.setItem(
          "ea-cloud-session",
          JSON.stringify({
            access_token: "fixture-session",
            refresh_token: "fixture",
            expires_at: Date.now() + 3600000,
          }),
        ),
    );
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8773");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const setup = page.getByRole("button", {
    name: "Use this workspace",
    exact: true,
  });
  if (await setup.isVisible()) await setup.click();
  const readState = async () =>
    (
      await (
        await page.request.get(
          (process.env.TEST_URL || "http://127.0.0.1:8773") + "/api/state",
          {
            headers: process.env.HOSTED
              ? { Authorization: "Bearer fixture-session" }
              : {},
          },
        )
      ).json()
    ).state;
  const before = (await readState()).applications;
  const selected = before
    .filter(
      (app) =>
        !app.archived &&
        !["submitted", "rejected"].includes(app.status) &&
        !before.some(
          (sibling) =>
            sibling.job_id === app.job_id && sibling.status === "submitted",
        ),
    )
    .at(-1);
  assert.ok(
    selected,
    "Seed an active fictional document version before editor acceptance",
  );
  await openApplication(
    page,
    process.env.TEST_URL || "http://127.0.0.1:8773",
    selected,
  );
  const count = await page.locator(".discover-card").count();
  const editedId = await page
    .getByRole("button", { name: "Edit CV", exact: true })
    .evaluate((e) => e.closest("[data-application-id]").dataset.applicationId);
  await page
    .getByRole("button", { name: "Edit CV", exact: true })
    .click();
  const dialog = page.locator(".document-editor");
  await dialog.waitFor();
  assert.equal(
    await dialog.evaluate((element) => element.matches("dialog:modal")),
    true,
  );
  assert.match(
    await dialog
      .locator(".editor-pdf-actions a[download]")
      .getAttribute("href"),
    /^blob:/,
  );
  const resizeDraft = "Fictional draft retained across responsive layouts.";
  await dialog.getByLabel("Text", { exact: true }).first().fill(resizeDraft);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await dialog.count(),
      1,
      `The editor remains mounted at ${width}px`,
    );
    assert.equal(
      await dialog
        .locator('textarea[aria-label="Text"]')
        .evaluateAll(
          (fields, value) => fields.some((field) => field.value === value),
          resizeDraft,
        ),
      true,
      `Unsaved document edits survive viewport changes at ${width}px`,
    );
    assert(await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth + 1));
  }
  const previewText = "Built reliable Python APIs with integration tests.";
  await dialog.getByLabel("Text", { exact: true }).last().fill(previewText);
  await dialog.getByRole("button", { name: "Update preview" }).click();
  await dialog
    .getByRole("status")
    .filter({ hasText: "Preview updated" })
    .waitFor();
  await dialog.getByRole("button", { name: "Read text", exact: true }).click();
  await dialog
    .getByRole("region", { name: "PDF text, page 1", exact: true })
    .getByText(previewText, { exact: false })
    .waitFor();
  assert.deepEqual(
    (await readState()).applications,
    before,
    "Updating the rendered preview must leave the stored applications unchanged",
  );
  await dialog.getByRole("button", { name: "View page", exact: true }).click();
  await dialog.getByRole("img", { name: /^PDF page 1 of / }).waitFor();
  await dialog.evaluate((d) => (d.scrollTop = 0));
  await page.screenshot({
    path: "output/playwright/document-editor.png",
    fullPage: false,
  });
  await dialog.getByRole("button", { name: "Save as new draft" }).click();
  await page
    .locator("#notice")
    .filter({ hasText: "Saved as a new draft" })
    .waitFor();
  const after = (await readState()).applications;
  assert.equal(
    after.length,
    before.length + 1,
    "Editing preserves the original and appends a version",
  );
  const draft = after.find((app) => !before.some((old) => old.id === app.id));
  assert.equal(draft.derived_from, editedId);
  await page.locator(`[data-application-id="${draft.id}"]`).waitFor();
  assert.equal(
    await page.locator(`[data-application-id="${editedId}"]`).count(),
    0,
    "Only the selected version occupies the workspace",
  );
  await page
    .getByRole("button", { name: `Active ${count}`, exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: `Active ${count}`, exact: true })
    .waitFor();
  await page.locator(`[data-application-id="${draft.id}"]`).waitFor();
  await showPanel(page, "files");
  assert.ok(
    await page
      .getByRole("combobox", { name: "Document version", exact: true })
      .locator(`option[value="${editedId}"]`)
      .count(),
    "The original remains selectable",
  );
  await page
    .getByRole("button", { name: "View / edit cover letter", exact: true })
    .first()
    .click();
  await page
    .locator(".document-editor")
    .getByLabel("Text", { exact: true })
    .last()
    .fill("Unsaved draft text");
  const retainedPdf = await page
    .locator(".document-editor")
    .locator(".editor-pdf-actions a[download]")
    .getAttribute("href");
  const confirmation = page.getByRole("alertdialog", {
    name: "Discard unsaved document edits?",
  });
  await page.keyboard.press("Escape");
  await confirmation.waitFor();
  assert.equal(
    await confirmation
      .getByRole("button", { name: "Keep editing", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  assert.equal(
    await page.getByRole("textbox", { name: "Text", exact: true }).count(),
    0,
    "Editor fields stay outside the confirmation keyboard/accessible surface",
  );
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await confirmation.evaluate((d) => d.scrollWidth > d.clientWidth + 1),
      false,
      `Discard prompt overflow at ${width}`,
    );
    assert.equal(
      await confirmation.evaluate(
        (d) => d.getBoundingClientRect().height < innerHeight * 0.6,
      ),
      true,
      `Discard prompt remains compact at ${width}`,
    );
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations;
    assert.deepEqual(
      violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      `Discard prompt accessibility at ${width}`,
    );
    if (width === 320)
      await page.screenshot({
        path: "output/playwright/document-editor-discard-320.png",
        fullPage: false,
      });
  }
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "detached" });
  assert(await page.locator(".document-editor").isVisible());
  assert.equal(
    await page
      .locator(".document-editor")
      .getByLabel("Text", { exact: true })
      .last()
      .inputValue(),
    "Unsaved draft text",
  );
  assert.equal(
    await page
      .locator(".document-editor")
      .locator(".editor-pdf-actions a[download]")
      .getAttribute("href"),
    retainedPdf,
    "Keep editing retains the same PDF blob",
  );
  assert.equal(
    await page
      .locator(".document-editor")
      .locator(".editor-pdf-page canvas")
      .isVisible(),
    true,
  );
  await page.keyboard.press("Escape");
  await confirmation
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await confirmation.waitFor({ state: "detached" });
  assert.equal(
    await page
      .locator(".document-editor")
      .getByLabel("Text", { exact: true })
      .last()
      .inputValue(),
    "Unsaved draft text",
  );
  assert.equal(
    await page
      .locator(".document-editor")
      .locator(".editor-pdf-actions a[download]")
      .getAttribute("href"),
    retainedPdf,
  );
  assert.equal(
    await page
      .locator(".document-editor")
      .locator(".editor-pdf-page canvas")
      .isVisible(),
    true,
  );
  await page.locator(".document-editor").evaluate((d) => d.close());
  await confirmation.waitFor();
  await confirmation
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await confirmation.waitFor({ state: "detached" });
  assert.equal(
    await page
      .locator(".document-editor")
      .getByLabel("Text", { exact: true })
      .last()
      .inputValue(),
    "Unsaved draft text",
    "Unexpected native close retains dirty edits",
  );
  await page.keyboard.down("Escape");
  await confirmation.waitFor();
  await page.keyboard.down("Escape");
  assert(
    await confirmation.isVisible(),
    "Holding Escape never discards or hides the modal",
  );
  await page.keyboard.up("Escape");
  await page.keyboard.press("Tab");
  assert.equal(
    await confirmation
      .getByRole("button", { name: "Discard changes", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Enter");
  await confirmation.waitFor({ state: "detached" });
  assert.equal(await page.locator(".document-editor").count(), 0);
  assert.equal(
    await workbench(page).count(),
    1,
    "Discard returns to the same role workspace",
  );
  await page.waitForFunction(
    () => document.activeElement?.textContent === "View / edit cover letter",
  );
  const syntheticPdf = execFileSync(process.env.TEST_PYTHON || "python3", [
    join(__dirname, "synthetic_cid_pdf.py"),
  ]).toString("base64");
  await page.route("**/api/document-editor", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    assert.ok(response.ok() && body.result?.pdf);
    body.result.pdf = syntheticPdf;
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await showPanel(page, "documents");
  await page
    .getByRole("button", { name: "Edit CV", exact: true })
    .click();
  const canvas = dialog.getByRole("img", { name: "PDF page 1 of 2" });
  await canvas.waitFor();
  assert.equal(
    await canvas.evaluate((surface) => {
      // The two fixture lines use separate bands. Only the CJK line is here.
      const start = Math.floor(surface.height * 0.15);
      const height = Math.ceil(surface.height * 0.027);
      const { data } = surface
        .getContext("2d")
        .getImageData(0, start, surface.width, height);
      return data.some(
        (red, offset) => offset % 4 === 0 && red < 128 && data[offset + 3] > 0,
      );
    }),
    true,
    "The unembedded CID line contributes visible ink to the preview",
  );
  await dialog.getByRole("button", { name: "Read text", exact: true }).click();
  const firstPage = dialog.getByRole("region", { name: "PDF text, page 1" });
  assert.match(await firstPage.textContent(), /Fictional career profile/);
  assert.match(await firstPage.textContent(), /你好世界，工作履历/);
  const nextPdf = dialog.getByRole("button", { name: "Next PDF page" });
  const previousPdf = dialog.getByRole("button", { name: "Previous PDF page" });
  await nextPdf.press("Enter");
  const secondPage = dialog.getByRole("region", { name: "PDF text, page 2" });
  assert.match(await secondPage.textContent(), /Fictional second page/);
  assert.equal(await nextPdf.getAttribute("aria-disabled"), "true");
  assert.equal(
    await nextPdf.evaluate((e) => e === document.activeElement),
    true,
  );
  await nextPdf.press("Enter");
  assert.equal(await secondPage.isVisible(), true);
  await previousPdf.press("Enter");
  await firstPage.waitFor();
  assert.equal(await previousPdf.getAttribute("aria-disabled"), "true");
  assert.equal(
    await previousPdf.evaluate((e) => e === document.activeElement),
    true,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  assert.equal(download.suggestedFilename(), "cv.pdf");
  assert.equal(
    (await readFile(await download.path())).toString("base64"),
    syntheticPdf,
    "The original synthetic PDF bytes are available for download",
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("Document editor browser checks passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
