// Production-export Opportunities acceptance against serve_concept_fixture.py.
// Run with TEST_URL and the existing frontend Playwright installation.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(base, "Set TEST_URL to a disposable concept fixture");
  const origin = new URL(base);
  assert.equal(origin.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
  assert.notEqual(origin.port, "8766", "Never use the private app server");
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const output = "output/playwright/opportunities";
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  const external = [];
  const contexts = [];
  const runId = crypto.randomUUID();
  try {
    const contextFor = async (width = 1440) => {
      const context = await browser.newContext({
        viewport: { width, height: width <= 1000 ? 844 : 1000 },
        reducedMotion: "reduce",
      });
      contexts.push(context);
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          ["http:", "https:"].includes(url.protocol) &&
          url.origin !== origin.origin
        ) {
          external.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      context.on("page", (page) => {
        page.on("pageerror", (error) => errors.push(error.message));
        page.setDefaultTimeout(15000);
      });
      return context;
    };
    const guard = await contextFor();
    const read = async () => {
      const response = await guard.request.get(base + "/api/state");
      assert.equal(response.status(), 200);
      return (await response.json()).state;
    };
    const initial = await read();
    assert.equal(initial._workspace.demo, true);
    assert.match(
      initial._workspace.path,
      /(?:^|\/)ea-concept-a-preview-[^/]+\/workspace$/,
    );
    assert.equal(initial.identity.name, "Alex Morgan");
    const cloud = initial.jobs.find(
      (job) => job.employer === "Emberlane Systems",
    );
    const application = initial.applications
      .filter((app) => app.job_id === cloud.id)
      .at(-1);
    const submitted = initial.applications.find(
      (app) => app.status === "submitted",
    );
    assert.ok(
      application && submitted,
      "The fixture has active and submitted records",
    );
    const submittedHash = async () => {
      const response = await guard.request.get(
        `${base}/files/${submitted.id}/resume.pdf`,
      );
      assert.equal(response.status(), 200);
      return crypto
        .createHash("sha256")
        .update(await response.body())
        .digest("hex");
    };
    const beforeHash = await submittedHash();
    const card = (page, job) =>
      page.getByRole("button", {
        name: `Assess ${job.title} at ${job.employer}`,
        exact: true,
      });
    const views = (page) =>
      page.getByRole("group", { name: "Opportunity views", exact: true });
    const stages = (page) =>
      page.getByRole("group", { name: "Application stage", exact: true });
    const inspector = (page) => page.locator(".discover-inspector:visible");
    const workbench = (page) => page.locator(".discover-inspector:visible");
    const panel = async (page, name) => {
      await workbench(page).getByRole("button", { name, exact: true }).click();
      await page.waitForURL(
        (url) =>
          url.searchParams.get("panel") ===
          ({ CV: "documents", Documents: "files" }[name] || name.toLowerCase()),
      );
    };
    const assertFits = async (page, label) => {
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth + 1,
        workbench: [...document.querySelectorAll(".discover-inspector")]
          .filter((element) => element.getClientRects().length)
          .some((element) => element.scrollWidth > element.clientWidth + 1),
      }));
      assert.deepEqual(overflow, { page: false, workbench: false }, label);
    };
    const assertAccessible = async (page, label) => {
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        result.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target),
        })),
        [],
        label,
      );
    };
    const cancelDiscard = async (
      page,
      action,
      message = "Discard unsaved changes?",
    ) => {
      const confirmation = page.waitForEvent("dialog");
      const pending = action();
      const dialog = await confirmation;
      assert.equal(dialog.type(), "confirm");
      assert.equal(dialog.message(), message);
      await dialog.dismiss();
      await pending;
    };
    const assertEditorPreview = async (page, editor, width) => {
      if (width > 760) {
        assert.equal(await editor.getByRole("tablist").count(), 0);
        return;
      }
      const preview = editor.getByRole("tab", { name: "Preview", exact: true });
      await preview.waitFor();
      assert.equal(await preview.getAttribute("aria-selected"), "true");
      const pdfPage = editor.getByRole("img", { name: /^PDF page 1 of / });
      await pdfPage.waitFor();
      const bounds = await pdfPage.boundingBox();
      const visibleHeight = Math.min(
        bounds.height,
        page.viewportSize().height - bounds.y,
      );
      assert.ok(visibleHeight >= 180, "Mobile PDF has a readable visible area");
      assert.ok(
        bounds.y >= 0 && bounds.y < page.viewportSize().height,
        "Mobile PDF is visible immediately without scrolling through edit blocks",
      );
      assert.equal(await editor.evaluate((element) => element.scrollTop), 0);
    };
    const editPane = async (editor, width) => {
      if (width <= 760)
        await editor.getByRole("tab", { name: "Edit", exact: true }).click();
    };

    for (const width of [1440, 390]) {
      const context = await contextFor(width);
      const page = await context.newPage();
      const label = width > 1000 ? "desktop" : "mobile";
      const otherProfile = "opportunities-fixture-alternative-profile";
      if (width > 1000) {
        await page.route("**/api/state", async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          body.state.profiles.push({
            ...body.state.profiles[0],
            id: otherProfile,
            name: "Alternative fictional profile",
          });
          return route.fulfill({ response, json: body });
        });
      }
      await page.goto(base + "/discover/");
      await views(page).getByRole("button", { name: "Jobs", exact: true }).waitFor();
      assert.deepEqual(await views(page).getByRole("button").allTextContents(), [
        "Jobs", "To apply", "Applications",
      ]);
      assert.equal(
        await views(page).getByRole("button", { name: "Jobs", exact: true }).getAttribute("aria-pressed"),
        "true",
      );
      const save = page.getByRole("button", {
        name: `Apply later · ${cloud.title}`,
        exact: true,
      });
      if (!(await read()).jobs.find((job) => job.id === cloud.id).saved) {
        await card(page, cloud).waitFor();
        await save.click();
        await page
          .locator(".notification-card:not([inert])")
          .filter({ hasText: "Role added to To apply." })
          .last().waitFor();
      }
      await card(page, cloud).waitFor({ state: "detached" });
      await views(page)
        .getByRole("button", { name: "To apply", exact: true })
        .click();
      await card(page, cloud).waitFor();
      await page.waitForURL((url) => url.searchParams.get("view") === "to-apply");
      await card(page, cloud).focus();
      await page.keyboard.press("Enter");
      await inspector(page)
        .getByRole("heading", { name: cloud.title, exact: true })
        .waitFor();
      assert.equal(
        await page.locator("dialog:modal").count(),
        width > 1000 ? 0 : 1,
      );
      assert.equal(
        await inspector(page)
          .getByRole("button", { name: "CV", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(new URL(page.url()).searchParams.get("view"), "to-apply");
      const dossier = () =>
        workbench(page).locator(`[data-application-id="${application.id}"]`);
      const editorButton = () =>
        dossier().getByRole("button", { name: "Edit CV", exact: true });
      await editorButton().waitFor();
      assert.equal(
        await dossier()
          .getByRole("textbox", { name: "Comments", exact: true })
          .count(),
        0,
        "Documents shows document actions",
      );
      await editorButton().click();
      const editor = page.getByRole("dialog", { name: "CV", exact: true });
      await editor.waitFor();
      assert.match(
        await editor
          .locator(".editor-pdf-actions a[download]")
          .getAttribute("href"),
        /^blob:/,
      );
      await assertEditorPreview(page, editor, width);
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await editor.waitFor({ state: "detached" });
      assert.equal(
        await editorButton().evaluate(
          (button) => document.activeElement === button,
        ),
        true,
        "Closing the shared editor restores its opener",
      );
      await assertFits(page, `${label} documents fit`);
      await assertAccessible(page, `${label} document accessibility`);
      await page.screenshot({ path: `${output}/${label}-documents.png` });

      await panel(page, "Activity");
      const markReviewed = dossier().getByRole("button", {
        name: "Draft — switch to Reviewed",
        exact: true,
      });
      if (await markReviewed.count()) {
        await markReviewed.click();
        await dossier()
          .getByRole("button", {
            name: "Reviewed — switch to Draft",
            exact: true,
          })
          .waitFor();
      }
      const comment = () =>
        dossier().getByRole("textbox", { name: "Comments", exact: true });
      const note = `Opportunities ${label} review retained after a failed save (${runId}).`;
      await comment().fill(note);
      await panel(page, "CV");
      await panel(page, "Activity");
      assert.equal(
        await comment().inputValue(),
        note,
        "Switching panels retains the same application's comment draft",
      );
      const dirtyUrl = page.url();
      await cancelDiscard(page, () =>
        workbench(page)
          .getByRole("button", {
            name: "Close opportunity details",
            exact: true,
          })
          .click(),
      );
      assert.equal(
        page.url(),
        dirtyUrl,
        "Cancelling a close keeps the selected application and panel",
      );
      assert.equal(await comment().inputValue(), note);
      assert.equal(
        await workbench(page).evaluate((element) =>
          element.contains(document.activeElement),
        ),
        true,
        "Cancelling a close keeps keyboard context in the workspace",
      );
      if (width > 1000) {
        const profile = page.getByRole("combobox", {
          name: "Search profile",
          exact: true,
        });
        await page.locator(".discover-filters > summary").click();
        const previousProfile = await profile.inputValue();
        await cancelDiscard(page, () => profile.selectOption(otherProfile));
        assert.equal(
          await profile.inputValue(),
          previousProfile,
          "Cancelling a profile switch keeps the current profile",
        );
        assert.equal(
          page.url(),
          dirtyUrl,
          "Cancelling a profile switch keeps application context",
        );
        assert.equal(await comment().inputValue(), note);
        await page.locator(".discover-filters > summary").click();
      }
      await panel(page, "CV");
      const commentDocumentUrl = page.url();
      await editorButton().click();
      await editor.waitFor();
      await editPane(editor, width);
      const unsavedDocument = `Fictional ${label} CV edit retained with the unsaved Activity comment (${runId}).`;
      await editor
        .getByRole("textbox", { name: "Text", exact: true })
        .last()
        .fill(unsavedDocument);
      let documentSaves = 0;
      const countDocumentSaves = (request) => {
        if (new URL(request.url()).pathname === "/api/save-document")
          documentSaves++;
      };
      page.on("request", countDocumentSaves);
      await cancelDiscard(
        page,
        () =>
          editor
            .getByRole("button", { name: "Save as new draft", exact: true })
            .click(),
        "Save this new document version and discard the unsaved Activity changes? Choose Cancel to keep both drafts.",
      );
      assert.equal(
        documentSaves,
        0,
        "Cancelling the other-draft warning makes no save-document request",
      );
      assert.equal(
        page.url(),
        commentDocumentUrl,
        "Cancelling a save retains the original version and panel",
      );
      assert.equal(
        await editor
          .getByRole("textbox", { name: "Text", exact: true })
          .last()
          .inputValue(),
        unsavedDocument,
        "Cancelling a save retains the editor draft",
      );
      const alternateWidth = width > 1000 ? 390 : 1440;
      await page.setViewportSize({
        width: alternateWidth,
        height: alternateWidth <= 1000 ? 844 : 1000,
      });
      await editPane(editor, alternateWidth);
      assert.equal(
        await editor
          .getByRole("textbox", { name: "Text", exact: true })
          .last()
          .inputValue(),
        unsavedDocument,
        "Resizing keeps the mounted editor draft",
      );
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await page
        .getByRole("alertdialog", {
          name: "Discard unsaved document edits?",
          exact: true,
        })
        .getByRole("button", { name: "Discard changes", exact: true })
        .click();
      await editor.waitFor({ state: "detached" });
      page.off("request", countDocumentSaves);
      await panel(page, "Activity");
      await comment().focus();
      assert.equal(
        await comment().evaluate(
          (element) => document.activeElement === element,
        ),
        true,
        "The resized parent workspace accepts focus after the nested editor closes",
      );
      await page.setViewportSize({ width, height: width <= 1000 ? 844 : 1000 });
      assert.equal(
        await comment().inputValue(),
        note,
        "The Activity draft remains after cancelling a version save and discarding only the editor draft",
      );
      let reviewAttempts = 0;
      const failOnce = async (route) => {
        reviewAttempts++;
        if (reviewAttempts === 1)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Fixture comment failure. Please retry.",
            }),
          });
        return route.continue();
      };
      await page.route("**/api/review", failOnce);
      await dossier()
        .getByRole("button", { name: "Save comment", exact: true })
        .click();
      await dossier()
        .getByRole("alert")
        .filter({ hasText: "Fixture comment failure" })
        .waitFor();
      assert.equal(
        await comment().inputValue(),
        note,
        "A failed save retains the user's note",
      );
      assert.equal(
        (await read()).applications
          .find((app) => app.id === application.id)
          .comments.some((entry) => entry.text === note),
        false,
      );
      await dossier()
        .getByRole("button", { name: "Save comment", exact: true })
        .click();
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-application-id="${id}"] textarea`)
            ?.value === "",
        application.id,
      );
      assert.equal(reviewAttempts, 2);
      await page.unroute("**/api/review", failOnce);
      const saved = (await read()).applications.find(
        (app) => app.id === application.id,
      );
      assert.equal(
        saved.status,
        "reviewed",
        "A comment does not change the decision",
      );
      assert.equal(
        saved.comments.filter((entry) => entry.text === note).length,
        1,
        "Retry records one comment",
      );
      const history = dossier().locator(".application-review-history");
      if ((await history.getAttribute("open")) === null)
        await history.locator("summary").click();
      await dossier()
        .locator(".review-pane details p")
        .filter({ hasText: note })
        .waitFor();
      await assertFits(page, `${label} activity fits`);
      await assertAccessible(page, `${label} activity accessibility`);
      await page.screenshot({ path: `${output}/${label}-activity.png` });

      await workbench(page)
        .getByRole("button", {
          name: `Remove ${cloud.title}`,
          exact: true,
        })
        .click();
      await dossier().waitFor({ state: "hidden" });
      if (await inspector(page).count())
        await inspector(page)
          .getByRole("button", {
            name: "Close opportunity details",
            exact: true,
          })
          .click();
      await views(page)
        .getByRole("button", { name: "Applications", exact: true })
        .click();
      await stages(page).waitFor();
      assert.equal(
        await card(page, cloud).count(),
        0,
        "Removed applications leave Active",
      );
      await stages(page)
        .getByRole("button", { name: /^Removed\b/ })
        .click();
      await card(page, cloud).waitFor();
      await page.waitForURL(
        (url) =>
          url.searchParams.get("view") === "applications" &&
          url.searchParams.get("section") === "removed",
      );
      await card(page, cloud).click();
      await inspector(page)
        .getByRole("button", { name: "Activity", exact: true })
        .click();
      await dossier()
        .getByRole("button", {
          name: "Reviewed — switch to Draft",
          exact: true,
        })
        .waitFor();
      await workbench(page)
        .getByRole("button", {
          name: `Restore ${cloud.title}`,
          exact: true,
        })
        .click();
      await dossier().waitFor({ state: "hidden" });
      await stages(page)
        .getByRole("button", { name: /^Active\b/ })
        .click();
      await card(page, cloud).waitFor();
      await stages(page)
        .getByRole("button", { name: /^Submitted\b/ })
        .click();
      await card(page, {
        title: submitted.title,
        employer: submitted.employer,
      }).waitFor();
      assert.equal(await card(page, cloud).count(), 0);
      await page.waitForURL(
        (url) => url.searchParams.get("section") === "submitted",
      );
      await stages(page)
        .getByRole("button", { name: /^Removed\b/ })
        .click();
      assert.equal(
        await card(page, cloud).count(),
        0,
        "Restoring the role clears its Removed entry",
      );
      await views(page)
        .getByRole("button", { name: "To apply", exact: true })
        .click();
      await card(page, cloud).waitFor();
      assert.equal(await page.locator("dialog:modal").count(), 0);
      await assertFits(page, `${label} saved shortlist fits`);
      await page.screenshot({ path: `${output}/${label}-saved.png` });
      await views(page)
        .getByRole("button", { name: "Jobs", exact: true })
        .click();
      await card(page, cloud).waitFor({ state: "detached" });
      await page.locator(".discover-filters > summary").click();
      const statusFilter = page.getByRole("combobox", {
        name: "Application status",
        exact: true,
        includeHidden: true,
      });
      assert.equal(
        await statusFilter
          .getByRole("option", { name: "Applications", exact: true })
          .count(),
        0,
        "The status selector exposes only supported statuses",
      );
      await statusFilter.selectOption("new");
      await page.waitForURL(
        (url) =>
          url.searchParams.get("view") === "jobs" &&
          url.searchParams.get("status") === "new",
      );
      assert.equal(await statusFilter.inputValue(), "new");
      assert.equal(await card(page, cloud).count(), 0);
      const assertSubmittedFilter = async () => {
        await page.waitForURL(
          (url) =>
            url.searchParams.get("view") === "applications" &&
            url.searchParams.get("section") === "submitted" &&
            url.searchParams.get("status") === "submitted",
        );
        await card(page, submitted).waitFor();
        const submittedStage = stages(page).getByRole("button", {
          name: /^Submitted\b/,
        });
        assert.equal(
          await submittedStage.getAttribute("aria-pressed"),
          "true",
          "Selecting Submitted opens the matching application queue",
        );
        assert.equal(
          await submittedStage.evaluate(
            (element) => element === document.activeElement,
          ),
          true,
          "The Submitted queue takes focus when its source filter is removed",
        );
        assert.equal(await page.locator(".discover-card-open").count(), 1);
        assert.equal(await card(page, cloud).count(), 0);
        assert.equal(
          await statusFilter.count(),
          0,
          "Submitted does not offer an incompatible status filter",
        );
      };
      await statusFilter.focus();
      await statusFilter.selectOption("submitted");
      await assertSubmittedFilter();
      await views(page)
        .getByRole("button", { name: "Applications", exact: true })
        .click();
      await page.locator(".discover-filters > summary").click();
      await statusFilter.focus();
      await statusFilter.selectOption("submitted");
      await assertSubmittedFilter();
      await context.close();
    }
    // Saving an editor version keeps the role, filters and Documents workspace.
    for (const width of [1440, 390]) {
      const context = await contextFor(width);
      const page = await context.newPage();
      const label = width > 1000 ? "desktop" : "mobile";
      const before = await read();
      const current = before.applications
        .filter((app) => app.job_id === cloud.id)
        .at(-1);
      const originalResponse = await guard.request.get(
        `${base}/files/${current.id}/resume.pdf`,
      );
      assert.equal(originalResponse.status(), 200);
      const originalHash = crypto
        .createHash("sha256")
        .update(await originalResponse.body())
        .digest("hex");
      const query = new URLSearchParams({
        view: "all",
        location: "Singapore",
        opportunity: cloud.id,
        assessment_profile: initial.profiles[0].id,
        application: current.id,
        panel: "documents",
      });
      await page.goto(`${base}/discover/?${query}`);
      await workbench(page)
        .locator(`[data-application-id="${current.id}"]`)
        .getByRole("button", { name: "Edit CV", exact: true })
        .click();
      const editor = page.getByRole("dialog", { name: "CV", exact: true });
      await editor.waitFor();
      await assertEditorPreview(page, editor, width);
      await editPane(editor, width);
      const textFields = () =>
        editor.getByRole("textbox", { name: "Text", exact: true });
      const textValues = () =>
        textFields().evaluateAll((fields) =>
          fields.map((field) => field.value),
        );
      const originalTexts = await textValues();
      const sectionCount = originalTexts.length;
      assert.ok(sectionCount > 1, "The fixture provides sections to reorder");
      const editedText = `Fictional ${label} editor regression ${runId}: built reliable Python APIs with integration tests.`;
      await editor
        .getByRole("textbox", { name: "Text", exact: true })
        .last()
        .fill(editedText);
      assert.equal(
        await editor
          .getByRole("button", { name: "Move up section 1", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await editor
          .getByRole("button", {
            name: `Move down section ${sectionCount}`,
            exact: true,
          })
          .isDisabled(),
        true,
      );
      const moveSection = async (direction, section, expectedIndex) => {
        await editor
          .getByRole("button", {
            name: `Move ${direction} section ${section}`,
            exact: true,
          })
          .focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await textFields().nth(expectedIndex).inputValue(),
          editedText,
        );
        assert.equal(
          await editor
            .getByRole("combobox", { name: "Document section", exact: true })
            .inputValue(),
          String(expectedIndex),
          "The section picker follows the moved text",
        );
        assert.equal(
          await textFields()
            .nth(expectedIndex)
            .evaluate((field) => document.activeElement === field),
          true,
          "Keyboard reordering focuses the moved text",
        );
      };
      await moveSection("up", sectionCount, sectionCount - 2);
      await moveSection("down", sectionCount - 1, sectionCount - 1);
      await moveSection("up", sectionCount, sectionCount - 2);
      const expectedTexts = [...originalTexts];
      expectedTexts[sectionCount - 2] = editedText;
      expectedTexts[sectionCount - 1] = originalTexts[sectionCount - 2];
      assert.deepEqual(
        await textValues(),
        expectedTexts,
        "Keyboard reordering changes only the selected section's position",
      );
      const previewRequest = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/api/preview-document",
      );
      await editor
        .getByRole("button", { name: "Update preview", exact: true })
        .click();
      assert.deepEqual(
        (await previewRequest).postDataJSON().blocks.map((block) => block[1]),
        expectedTexts,
        "Preview uses the reordered sections",
      );
      await editor
        .locator(".notification-card:not([inert])")
        .filter({ hasText: "Preview updated" })
        .waitFor();
      if (width <= 760) {
        await editor.getByRole("tab", { name: "Preview", exact: true }).click();
        await assertEditorPreview(page, editor, width);
      }
      await assertAccessible(
        page,
        `${label} reordered document editor accessibility`,
      );
      const saveRequest = page.waitForRequest(
        (request) => new URL(request.url()).pathname === "/api/save-document",
      );
      await editor
        .getByRole("button", { name: "Save as new draft", exact: true })
        .click();
      assert.deepEqual(
        (await saveRequest).postDataJSON().blocks.map((block) => block[1]),
        expectedTexts,
        "Saving uses the reordered sections",
      );
      await editor.waitFor({ state: "detached" });
      await page.waitForURL(
        (url) =>
          url.pathname === "/discover/" &&
          url.searchParams.get("application") !== current.id &&
          Boolean(url.searchParams.get("application")),
      );
      const url = new URL(page.url());
      for (const [key, value] of query) {
        if (key !== "application")
          assert.equal(
            url.searchParams.get(key),
            value,
            `Saving retains ${key}`,
          );
      }
      const after = await read();
      assert.equal(
        after.applications.length,
        before.applications.length + 1,
        "Saving creates one preserved application version",
      );
      const draft = after.applications.find(
        (app) => app.id === url.searchParams.get("application"),
      );
      assert.ok(draft, "The URL selects the new persisted draft");
      assert.equal(draft.derived_from, current.id);
      assert.equal(draft.job_id, cloud.id);
      assert.equal(draft.status, "draft");
      await workbench(page)
        .locator(`[data-application-id="${draft.id}"]`)
        .getByRole("button", { name: "Edit CV", exact: true })
        .waitFor();
      const savedUrl = page.url();
      await page.reload();
      assert.equal(
        page.url(),
        savedUrl,
        "Reload retains the newly selected draft",
      );
      await workbench(page)
        .locator(`[data-application-id="${draft.id}"]`)
        .getByRole("button", { name: "Edit CV", exact: true })
        .click();
      await editor.waitFor();
      await assertEditorPreview(page, editor, width);
      await editPane(editor, width);
      assert.deepEqual(
        await textValues(),
        expectedTexts,
        "The new draft retains the saved CV edit and section order",
      );
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await editor.waitFor({ state: "detached" });
      await panel(page, "Documents");
      const versions = () =>
        workbench(page).getByRole("combobox", {
          name: "Document version",
          exact: true,
        });
      assert.equal(await versions().inputValue(), draft.id);
      const selectedVersionTitle = await versions()
        .locator("option:checked")
        .textContent();
      const selectedVersionDate = await versions().evaluate(
        (select) =>
          document.getElementById(select.getAttribute("aria-describedby"))
            ?.textContent,
      );
      assert.ok(
        selectedVersionDate,
        "Documents exposes the date for the selected version",
      );
      await versions().focus();
      await versions().selectOption(current.id);
      await page.waitForURL(
        (url) =>
          url.searchParams.get("application") === current.id &&
          url.searchParams.get("panel") === "files",
      );
      assert.equal(
        await versions().evaluate(
          (select) => select === document.activeElement,
        ),
        true,
        "Switching to an earlier document version retains keyboard focus",
      );
      await panel(page, "CV");
      const originalEditorButton = workbench(page)
        .locator(`[data-application-id="${current.id}"]`)
        .getByRole("button", { name: "Edit CV", exact: true });
      await originalEditorButton.waitFor();
      await originalEditorButton.click();
      await editor.waitFor();
      await assertEditorPreview(page, editor, width);
      await editPane(editor, width);
      assert.deepEqual(
        await textValues(),
        originalTexts,
        "Selecting the original version opens its preserved CV content and order",
      );
      await editor.getByRole("button", { name: "Close", exact: true }).click();
      await editor.waitFor({ state: "detached" });
      await panel(page, "Documents");
      await versions().selectOption(draft.id);
      await page.waitForURL(
        (url) =>
          url.searchParams.get("application") === draft.id &&
          url.searchParams.get("panel") === "files",
      );
      assert.equal(await versions().inputValue(), draft.id);
      const preserved = await guard.request.get(
        `${base}/files/${current.id}/resume.pdf`,
      );
      assert.equal(preserved.status(), 200);
      assert.equal(
        crypto
          .createHash("sha256")
          .update(await preserved.body())
          .digest("hex"),
        originalHash,
        "Saving preserves the prior version's document bytes",
      );
      assert.equal(
        await submittedHash(),
        beforeHash,
        "Editing a draft preserves submitted document bytes",
      );
      await assertFits(page, `${label} saved editor version fits`);
      await page.screenshot({ path: `${output}/${label}-edited-draft.png` });
      const historyLink = workbench(page).getByRole("link", {
        name: "View application history",
        exact: true,
      });
      const historyUrl = new URL(await historyLink.getAttribute("href"), base);
      assert.equal(historyUrl.pathname, "/history/");
      assert.equal(historyUrl.searchParams.get("role"), cloud.title);
      assert.equal(historyUrl.searchParams.get("employer"), cloud.employer);
      await historyLink.click();
      await page.waitForURL(
        (url) =>
          url.pathname === "/history/" &&
          url.searchParams.get("role") === cloud.title &&
          url.searchParams.get("employer") === cloud.employer,
      );
      const historyContext = page.getByRole("region", {
        name: "Selected application history",
        exact: true,
      });
      await historyContext.waitFor();
      await page
        .getByRole("heading", { name: cloud.title, exact: true })
        .waitFor();
      const historyVersion = page
        .locator(".history-version")
        .filter({ hasText: selectedVersionTitle });
      await historyVersion.waitFor();
      assert.equal(
        await historyVersion.locator(".history-version-title").textContent(),
        selectedVersionTitle,
        "History identifies the same numbered version and status as Documents",
      );
      assert.equal(
        await historyVersion.locator(".history-version-date").textContent(),
        selectedVersionDate,
        "History uses the same version date as Documents",
      );
      await historyVersion.locator("summary").click();
      const storageLabel = await historyVersion
        .locator(".history-version-content > p")
        .filter({ hasText: "Storage label:" })
        .textContent();
      assert.ok(
        storageLabel.includes(draft.folder.split("/").slice(4).join("/")),
        "Expanded history preserves the exact canonical storage label",
      );
      assert.equal(
        await page.locator(".history-version").count(),
        after.applications.filter((app) => app.job_id === cloud.id).length,
        "Role-scoped history shows each preserved version of this application",
      );
      assert.equal(
        await page
          .getByRole("heading", { name: "Platform Engineer", exact: true })
          .count(),
        0,
      );
      await assertFits(page, `${label} scoped history fits`);
      await assertAccessible(page, `${label} scoped history accessibility`);
      await page.screenshot({ path: `${output}/${label}-scoped-history.png` });
      await historyContext
        .getByRole("link", { name: "Clear role filter", exact: true })
        .click();
      await page.waitForURL(
        (url) =>
          url.pathname === "/history/" &&
          !url.searchParams.has("role") &&
          !url.searchParams.has("employer"),
      );
      await page
        .getByRole("heading", { name: "Platform Engineer", exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".history-version").count(),
        after.applications.length,
        "Clearing the role filter restores all application history",
      );
      await context.close();
    }

    // Existing / application bookmarks preserve filters and open the same record.
    const legacyContext = await contextFor();
    const legacy = await legacyContext.newPage();
    await legacy.goto(
      `${base}/?section=active&application=${application.id}&history=true&destination=Singapore&fixture=kept#application-${application.id}`,
    );
    await legacy.waitForURL(
      (url) =>
        url.pathname === "/discover/" &&
        url.searchParams.get("panel") === "documents",
    );
    const legacyUrl = new URL(legacy.url());
    for (const [key, value] of Object.entries({
      view: "applications",
      section: "active",
      application: application.id,
      history: "true",
      destination: "Singapore",
      fixture: "kept",
    }))
      assert.equal(legacyUrl.searchParams.get(key), value);
    assert.equal(legacyUrl.hash, `#application-${application.id}`);
    await workbench(legacy)
      .locator(`[data-application-id="${application.id}"]`)
      .waitFor();
    await legacyContext.close();

    // Ranking is not a dependency of the durable application queue.
    const failedContext = await contextFor();
    const failed = await failedContext.newPage();
    await failed.route("**/api/rank", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Fixture ranking unavailable" }),
      }),
    );
    await failed.goto(base + "/discover/?view=all");
    await failed
      .getByRole("alert")
      .filter({ hasText: "Fixture ranking unavailable" })
      .waitFor();
    await views(failed)
      .getByRole("button", { name: "Applications", exact: true })
      .click();
    await card(failed, cloud).waitFor();
    assert.equal(
      await failed
        .getByRole("alert")
        .filter({ hasText: "Fixture ranking unavailable" })
        .count(),
      0,
    );
    await failedContext.close();

    for (const missing of ["profile", "job"]) {
      const context = await contextFor();
      const page = await context.newPage();
      let rankings = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/rank") rankings++;
      });
      await page.route("**/api/state", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        if (missing === "profile") body.state.profiles = [];
        else
          body.state.jobs = body.state.jobs.filter(
            (job) => job.id !== cloud.id,
          );
        return route.fulfill({ response, json: body });
      });
      await page.goto(
        `${base}/discover/?view=applications&section=active&application=${application.id}&panel=documents`,
      );
      await card(page, cloud).waitFor();
      await workbench(page)
        .locator(`[data-application-id="${application.id}"]`)
        .getByRole("button", { name: "Edit CV", exact: true })
        .waitFor();
      assert.equal(
        rankings,
        0,
        `Opening applications does not rank with missing ${missing}`,
      );
      await workbench(page)
        .getByRole("button", {
          name: "Close opportunity details",
          exact: true,
        })
        .click();
      await card(page, cloud).click();
      await inspector(page)
        .getByRole("heading", { name: cloud.title, exact: true })
        .waitFor();
      await inspector(page)
        .getByRole("button", { name: "Activity", exact: true })
        .click();
      await workbench(page)
        .getByRole("textbox", { name: "Comments", exact: true })
        .waitFor();
      await context.close();
    }
    // Requested application context remains usable outside the visible board.
    for (const width of [1440, 390]) {
      for (const missing of [
        "profile",
        "job",
        "filtered-role",
        "hard-conflict",
      ]) {
        const context = await contextFor(width);
        const page = await context.newPage();
        if (missing === "profile" || missing === "job") {
          await page.route("**/api/state", async (route) => {
            const response = await route.fetch();
            const body = await response.json();
            if (missing === "profile") body.state.profiles = [];
            else
              body.state.jobs = body.state.jobs.filter(
                (job) => job.id !== cloud.id,
              );
            return route.fulfill({ response, json: body });
          });
        }
        if (missing === "hard-conflict") {
          await page.route("**/api/rank", async (route) => {
            const response = await route.fetch();
            const body = await response.json();
            body.result.find(
              (row) => row.job.id === cloud.id,
            ).match.hard_conflicts = ["Fictional eligibility conflict"];
            return route.fulfill({ response, json: body });
          });
        }
        const query = new URLSearchParams({
          view: missing === "hard-conflict" ? "recommended" : "all",
          application: application.id,
          panel: "documents",
        });
        if (missing === "filtered-role")
          query.set("q", "no-fixture-role-has-this-text");
        await page.goto(`${base}/discover/?${query}`);
        await workbench(page)
          .getByRole("button", { name: "Edit CV", exact: true })
          .waitFor();
        await panel(page, "Overview");
        assert.equal(
          new URL(page.url()).searchParams.get("application"),
          application.id,
        );
        const overview = inspector(page);
        await overview
          .getByRole("heading", { name: cloud.title, exact: true })
          .waitFor();
        await overview.getByRole("button", { name: "CV", exact: true }).click();
        await page.waitForURL(
          (url) => url.searchParams.get("panel") === "documents",
        );
        await workbench(page)
          .locator(`[data-application-id="${application.id}"]`)
          .getByRole("button", { name: "Edit CV", exact: true })
          .waitFor();
        await assertFits(page, `${width}px ${missing} overview recovery fits`);
        await context.close();
      }
    }
    // A successful manual submission consumes the comment draft; failures keep it guarded.
    for (const width of [1440, 390]) {
      const context = await contextFor(width);
      const page = await context.newPage();
      const label = width > 1000 ? "desktop" : "mobile";
      const currentState = await read();
      const targetJob = currentState.jobs.find(
        (job) =>
          job.employer ===
          (width > 1000 ? "Emberlane Systems" : "Fernbridge Digital"),
      );
      const target = currentState.applications
        .filter((app) => app.job_id === targetJob.id)
        .at(-1);
      assert.notEqual(target.status, "submitted");
      const bookmarked = width <= 1000;
      if (Boolean(targetJob.saved) !== bookmarked) {
        await page.goto(`${base}/discover/?view=applications&section=active`);
        await card(page, targetJob).waitFor();
        const [response] = await Promise.all([
          page.waitForResponse(`${base}/api/save-job`),
          page
            .getByRole("button", {
              name: `${bookmarked ? "Apply later" : "Remove from To apply"} · ${targetJob.title}`,
              exact: true,
            })
            .click(),
        ]);
        assert.equal(response.status(), 200);
      }
      await page.goto(`${base}/discover/?view=${bookmarked ? "saved" : "all"}`);
      await card(page, targetJob).waitFor();
      await page.goto(
        `${base}/discover/?view=applications&section=active&application=${target.id}&panel=activity`,
      );
      const dossier = () =>
        workbench(page).locator(`[data-application-id="${target.id}"]`);
      const comment = () =>
        dossier().getByRole("textbox", { name: "Comments", exact: true });
      const note = `Fictional ${label} manual submission comment (${runId}).`;
      await comment().fill(note);
      await dossier()
        .getByRole("button", { name: "Record submission…", exact: true })
        .click();
      const decision = dossier().locator(".decision-confirmation");
      const method = "Fictional fixture record only; no employer contacted.";
      await decision
        .getByRole("textbox", {
          name: "Where or how you submitted",
          exact: true,
        })
        .fill(method);
      await decision
        .getByRole("checkbox", {
          name: "I have already submitted this application.",
          exact: true,
        })
        .check();
      let attempts = 0;
      await page.route("**/api/review", (route) => {
        attempts++;
        if (attempts === 1)
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "Fixture submission record failure. Retry is available.",
            }),
          });
        return route.continue();
      });
      await decision
        .getByRole("button", { name: "Confirm submission record", exact: true })
        .click();
      await decision
        .getByRole("alert")
        .filter({ hasText: "Fixture submission record failure" })
        .waitFor();
      assert.equal(
        await comment().inputValue(),
        note,
        "A failed manual submission retains the comment draft",
      );
      assert.equal(
        await decision
          .getByRole("textbox", {
            name: "Where or how you submitted",
            exact: true,
          })
          .inputValue(),
        method,
      );
      const failedUrl = page.url();
      await cancelDiscard(page, () =>
        workbench(page)
          .getByRole("button", {
            name: "Close opportunity details",
            exact: true,
          })
          .click(),
      );
      assert.equal(
        page.url(),
        failedUrl,
        "A failed submission still guards closing the dirty workspace",
      );
      assert.equal(await comment().inputValue(), note);
      assert.equal(
        (await read()).applications.find((app) => app.id === target.id).status,
        target.status,
      );
      await decision
        .getByRole("button", { name: "Confirm submission record", exact: true })
        .click();
      await page.waitForURL(
        (url) =>
          url.searchParams.get("view") === "applications" &&
          url.searchParams.get("section") === "submitted" &&
          url.searchParams.get("application") === target.id &&
          url.searchParams.get("panel") === "activity",
      );
      await decision.waitFor({ state: "detached" });
      assert.equal(attempts, 2);
      assert.equal(
        await comment().inputValue(),
        "",
        "A successful manual submission consumes its comment draft",
      );
      const afterSubmission = await read();
      const saved = afterSubmission.applications.find(
        (app) => app.id === target.id,
      );
      assert.equal(saved.status, "submitted");
      assert.equal(
        Boolean(
          afterSubmission.jobs.find((job) => job.id === targetJob.id).saved,
        ),
        bookmarked,
        "Recording a submission preserves the existing bookmark",
      );
      assert.equal(
        saved.comments.filter(
          (entry) => entry.text.includes(note) && entry.text.includes(method),
        ).length,
        1,
      );
      let warnings = 0;
      const unexpectedWarning = async (dialog) => {
        warnings++;
        await dialog.dismiss();
      };
      page.on("dialog", unexpectedWarning);
      await workbench(page)
        .getByRole("button", {
          name: "Close opportunity details",
          exact: true,
        })
        .click();
      assert.equal(
        warnings,
        0,
        "Closing a successfully submitted record does not warn about the consumed comment",
      );
      await page.waitForURL(
        (url) =>
          !url.searchParams.has("application") &&
          !url.searchParams.has("panel"),
      );
      page.off("dialog", unexpectedWarning);
      await card(page, targetJob).waitFor();
      for (const view of ["all", "recommended", "saved"]) {
        await page.goto(`${base}/discover/?view=${view}`);
        await page
          .locator("button.discover-refresh:enabled")
          .waitFor({ state: "attached" });
        assert.equal(
          await card(page, targetJob).count(),
          0,
          `A submitted role leaves the ${view} board`,
        );
      }
      await context.close();
    }
    assert.equal(
      await submittedHash(),
      beforeHash,
      "Submitted document bytes remain immutable",
    );
    assert.deepEqual(external, [], "The journey makes no external requests");
    assert.deepEqual(errors, [], "The rendered journey has no browser errors");
    console.log(
      "PASS: desktop/mobile Opportunities journey, preserved editor drafts and route context, cancelled dirty navigation, retained comment/retry, application stages, saved shortlist, legacy links and matching-independent application records.",
    );
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
