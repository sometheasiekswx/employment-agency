// Reversible triage against a disposable production-export Concept A fixture.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(
  new URL(base).port,
  "8766",
  "Never mutate the private workspace",
);
const output = "output/playwright/opportunity-removal";
fs.mkdirSync(output, { recursive: true });
const current = (job) =>
  (job.removals || []).findLast((event) => !event.restored_at);
const label = (job) => `${job.title} · ${job.employer}`;

(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const contexts = [];
  const errors = [];
  const consoleErrors = [];
  const httpErrors = [];
  const external = [];
  let activePage;
  try {
    const guard = await browser.newContext();
    contexts.push(guard);
    const read = async () => {
      const response = await guard.request.get(base + "/api/state");
      assert.equal(response.status(), 200);
      return response.json();
    };
    const original = await read();
    assert.equal(original.state._workspace.demo, true);
    assert.equal(original.state.identity.name, "Alex Morgan");
    assert.match(
      original.state._workspace.path,
      /(?:^|\/)ea-concept-a-preview-[^/]+\/workspace$/,
    );
    const action = async (name, data) => {
      // Guarded setup/reset only; successful user flows use the rendered UI.
      const response = await guard.request.post(`${base}/api/${name}`, {
        headers: { Origin: base, "X-Workspace-Token": original.token },
        data,
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    const state = async () => (await read()).state;
    const jobState = async (job) =>
      (await state()).jobs.find((row) => row.id === job.id);
    const waitState = async (predicate, message) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const value = await state();
        if (predicate(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.fail(message);
    };
    const reset = async () => {
      for (const job of (await state()).jobs) {
        const event = current(job);
        if (event)
          await action("restore-job", { id: job.id, removal_id: event.id });
      }
    };
    const cloud = original.state.jobs.find(
      (job) => job.employer === "Emberlane Systems",
    );
    const submitted = original.state.applications.find(
      (app) => app.status === "submitted",
    );
    const application = original.state.applications.find(
      (app) => app.job_id === cloud.id,
    );
    assert.ok(cloud && submitted && application);
    const hashSubmitted = async () => {
      const response = await guard.request.get(
        `${base}/files/${submitted.id}/resume.pdf`,
      );
      assert.equal(response.status(), 200);
      return crypto
        .createHash("sha256")
        .update(await response.body())
        .digest("hex");
    };
    const originalHash = await hashSubmitted();
    const secondProfile = await action("profile", {
      name: "Alternative fictional triage profile",
      roles: ["Engineer"],
      locations: ["Singapore", "Melbourne", "Berlin", "Toronto"],
      hard: ["locations"],
      include_unknown: true,
      include_stretch: true,
      template: "plain",
    });
    const contextFor = async (width, recording = false) => {
      const context = await browser.newContext({
        viewport: { width, height: width > 1000 ? 1000 : 844 },
        isMobile: width <= 1000,
        hasTouch: width <= 1000,
        reducedMotion: recording ? "no-preference" : "reduce",
        ...(recording
          ? {
              recordVideo: {
                dir: `${output}/recordings`,
                size: { width, height: 844 },
              },
            }
          : {}),
      });
      contexts.push(context);
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (["http:", "https:"].includes(url.protocol) && url.origin !== base) {
          external.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      activePage = page;
      await page.addInitScript(() => {
        window.__removalFocusTrace = [];
        for (const type of ["focusin", "focusout"])
          document.addEventListener(
            type,
            (event) => {
              const element = event.target;
              window.__removalFocusTrace.push({
                type,
                tag: element.tagName,
                label: element.getAttribute?.("aria-label"),
                text: element.textContent?.trim().slice(0, 70),
                connected: element.isConnected,
              });
              if (window.__removalFocusTrace.length > 200)
                window.__removalFocusTrace.shift();
            },
            true,
          );
      });
      page.setDefaultTimeout(10000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() < 400) return;
        const pathname = new URL(response.url()).pathname;
        if (
          response.status() === 503 &&
          [
            "/api/remove-job",
            "/api/restore-job",
            "/api/job-removal-reason",
            "/api/state",
          ].includes(pathname)
        )
          return;
        httpErrors.push(`${response.status()} ${pathname}`);
      });
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          !message.text().startsWith("Failed to load resource:")
        )
          consoleErrors.push(message.text());
      });
      page.on("dialog", async (dialog) => {
        errors.push(`Unexpected ${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss();
      });
      return { context, page };
    };
    const card = (page, job) =>
      page.getByRole("button", {
        name: `Assess ${job.title} at ${job.employer}`,
        exact: true,
      });
    const panel = (page) => page.locator(".discover-inspector:visible");
    const notice = (page, job) =>
      page.locator(`.removal-feedback-notice[data-job-id="${job.id}"]:visible`);
    const editor = (page, job) =>
      page.locator(`.removal-reason-editor[data-job-id="${job.id}"]:visible`);
    const close = async (page) => {
      const button = panel(page).getByRole("button", {
        name: "Close opportunity details",
        exact: true,
      });
      if (await button.count()) await button.click();
      await panel(page).waitFor({ state: "hidden" });
    };
    const all = async (page) => {
      await page.goto(base + "/discover/?view=all");
      await page.locator(".discover-card-open").first().waitFor();
    };
    const removed = async (page) => {
      await close(page);
      await page
        .getByRole("button", { name: /^Removed \(\d+\)$/, exact: true })
        .click();
      await page.waitForURL(
        (url) => url.searchParams.get("removed") === "true",
      );
    };
    const assertFits = async (page, name) => {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        name,
      );
      const outside = await page
        .locator(
          ".removal-feedback:visible button, .removal-reason-editor:visible textarea",
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const r = element.getBoundingClientRect();
              return r.left < -1 || r.right > innerWidth + 1 || r.width < 40;
            })
            .map((element) => element.outerHTML),
        );
      assert.deepEqual(
        outside,
        [],
        `${name}: feedback controls fit and remain touch sized`,
      );
    };
    const removeCard = (page, job) =>
      card(page, job)
        .locator("..")
        .getByRole("button", { name: `Remove ${job.title}`, exact: true });

    for (const width of [1440, 390]) {
      await reset();
      const { page } = await contextFor(width);
      const mode = width > 1000 ? "desktop" : "mobile";
      await all(page);
      const ordered = await page
        .locator(".discover-card-open")
        .evaluateAll((buttons) =>
          buttons.map(
            (button) =>
              button.closest("article").querySelector("[data-opportunity-id]")
                .dataset.opportunityId,
          ),
        );
      const jobs = ordered.map((id) =>
        original.state.jobs.find((job) => job.id === id),
      );
      const first = jobs[0],
        next = jobs[1];
      const saveFirst = page.getByRole("button", {
        name: `Save ${first.title}`,
        exact: true,
      });
      if (await saveFirst.count()) await saveFirst.click();
      await card(page, first).focus();
      await page.keyboard.press("Enter");
      await panel(page)
        .getByRole("heading", { name: first.title, exact: true })
        .waitFor();
      const resize = panel(page).getByRole("button", {
        name: "Resize opportunity details",
        exact: true,
      });
      if (width <= 1000) await resize.click();
      const expanded =
        width <= 1000 ? await resize.getAttribute("aria-expanded") : null;
      await panel(page)
        .getByRole("button", { name: `Remove ${first.title}`, exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await panel(page)
        .getByRole("heading", { name: next.title, exact: true })
        .waitFor();
      await notice(page, first)
        .getByText(`Removed ${label(first)}.`, { exact: true })
        .waitFor();
      assert.equal(
        await card(page, first).count(),
        0,
        "Selected role leaves the board",
      );
      if (width <= 1000) {
        assert.equal(
          await resize.getAttribute("aria-expanded"),
          expanded,
          "Removal retains the expanded detent",
        );
        assert.equal(
          await notice(page, first).evaluate((element) =>
            Boolean(element.closest("dialog[open]")),
          ),
          true,
          "Feedback stays in the native top layer",
        );
      }
      await page.waitForFunction(() =>
        document
          .querySelector(".discover-inspector")
          ?.contains(document.activeElement),
      );
      await waitState(
        (value) =>
          Boolean(current(value.jobs.find((job) => job.id === first.id))),
        "Removal persists",
      );
      await notice(page, first)
        .getByRole("button", { name: "Add reason", exact: true })
        .click();
      const draft = `Fictional ${mode} reason retained while browsing; no document guard.`;
      await editor(page, first)
        .getByRole("textbox", {
          name: "Removal reason (optional)",
          exact: true,
        })
        .fill(draft);
      assert.equal(
        current(await jobState(first)).reason,
        "",
        "Typing does not save a reason",
      );
      await panel(page)
        .getByRole("button", { name: "Next opportunity", exact: true })
        .click();
      assert.equal(
        await editor(page, first).getByRole("textbox").inputValue(),
        draft,
      );
      await page.keyboard.press("Escape");
      await panel(page).waitFor({ state: "hidden" });
      await card(page, next).click();
      await notice(page, first)
        .getByRole("button", { name: "Add reason", exact: true })
        .click();
      assert.equal(
        await editor(page, first).getByRole("textbox").inputValue(),
        draft,
        "Reason draft survives closing and browsing without a confirmation, attached to the removed job",
      );
      let reasonAttempts = 0;
      const reasonFailure = async (route) => {
        reasonAttempts++;
        if (reasonAttempts === 1)
          return route.fulfill({
            status: 503,
            json: { error: "Fixture reason save failure" },
          });
        return route.continue();
      };
      await page.route("**/api/job-removal-reason", reasonFailure);
      await assertFits(page, mode);
      await page.screenshot({ path: `${output}/${mode}-reason.png` });
      await editor(page, first)
        .getByRole("button", { name: "Save reason", exact: true })
        .click();
      await editor(page, first)
        .getByRole("alert")
        .filter({ hasText: "Fixture reason save failure" })
        .waitFor();
      assert.equal(
        await editor(page, first).getByRole("textbox").inputValue(),
        draft,
      );
      assert.equal(
        current(await jobState(first)).reason,
        "",
        "Failure does not persist a reason",
      );
      assert.ok(
        current(await jobState(first)),
        "Reason failure never restores the role",
      );
      await editor(page, first)
        .getByRole("button", { name: "Retry saving reason", exact: true })
        .click();
      await editor(page, first).waitFor({ state: "hidden" });
      await notice(page, first)
        .getByRole("button", { name: "Undo", exact: true })
        .waitFor();
      assert.equal(reasonAttempts, 2);
      assert.equal(current(await jobState(first)).reason, draft);
      await page.unroute("**/api/job-removal-reason", reasonFailure);
      await close(page);
      await page.locator(".discover-filters > summary").click();
      await page
        .getByRole("combobox", { name: "Search profile", exact: true })
        .selectOption(secondProfile.id);
      await page.locator(".discover-filters > summary").click();
      for (const view of ["Recommended", "All roles", "Saved"]) {
        await page
          .getByRole("group", { name: "Opportunity views", exact: true })
          .getByRole("button", { name: view, exact: true })
          .click();
        await page.waitForFunction(
          () => !document.querySelector(".discover-skeleton"),
        );
        assert.equal(
          await card(page, first).count(),
          0,
          `Removal survives ${view} in another profile`,
        );
      }
      await page
        .getByRole("group", { name: "Opportunity views", exact: true })
        .getByRole("button", { name: "All roles", exact: true })
        .click();
      await removed(page);
      await card(page, first).waitFor();
      await page
        .getByRole("button", {
          name: `Add removal reason for ${first.title}`,
          exact: true,
        })
        .click();
      assert.equal(
        await editor(page, first).getByRole("textbox").inputValue(),
        draft,
      );
      const edited = `${draft} Updated from Removed.`;
      await editor(page, first).getByRole("textbox").fill(edited);
      await editor(page, first)
        .getByRole("button", { name: "Save reason", exact: true })
        .click();
      await editor(page, first).waitFor({ state: "hidden" });
      await page.reload();
      await card(page, first).waitFor();
      await page
        .getByRole("button", {
          name: `Add removal reason for ${first.title}`,
          exact: true,
        })
        .click();
      assert.equal(
        await editor(page, first).getByRole("textbox").inputValue(),
        edited,
        "Saved reason survives browser reload",
      );
      await card(page, first).click();
      await panel(page)
        .getByRole("button", { name: "Restore role", exact: true })
        .click();
      await waitState(
        (value) => !current(value.jobs.find((job) => job.id === first.id)),
        "Restore persists",
      );
      await panel(page).waitFor({ state: "hidden" });
      await page.waitForFunction(() =>
        document.activeElement?.matches(
          ".discover-removed-filter, .removal-feedback button, .discover-views button[aria-pressed='true']",
        ),
      );
      assert.equal(
        (await jobState(first)).saved,
        true,
        "Restoration preserves the bookmark",
      );
      await page
        .getByRole("button", { name: "Show available roles", exact: true })
        .click();
      await card(page, first).waitFor();
      console.log(
        `PASS: ${mode} triage, advance/detent, exact-job feedback, reason draft/save retry, profile isolation, reload and Restore.`,
      );
      await page.close();
    }

    await reset();
    const { page } = await contextFor(1440);
    await all(page);
    const saved = original.state.jobs.find((job) => job.saved);
    assert.ok(saved);
    let removalAttempts = 0;
    const removalFailure = async (route) => {
      removalAttempts++;
      if (removalAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Fixture removal failure" },
        });
      return route.continue();
    };
    await page.route("**/api/remove-job", removalFailure);
    await removeCard(page, saved).click();
    await notice(page, saved)
      .getByRole("alert")
      .filter({ hasText: "Fixture removal failure" })
      .waitFor();
    await card(page, saved).waitFor();
    assert.equal(current(await jobState(saved)), undefined);
    await notice(page, saved)
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await notice(page, saved)
      .getByText(`Removed ${label(saved)}.`, { exact: true })
      .waitFor();
    assert.equal(removalAttempts, 2);
    await page.unroute("**/api/remove-job", removalFailure);
    await removed(page);
    let restoreAttempts = 0;
    const restoreFailure = async (route) => {
      restoreAttempts++;
      if (restoreAttempts === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Fixture restore failure" },
        });
      return route.continue();
    };
    await page.route("**/api/restore-job", restoreFailure);
    await page
      .getByRole("button", { name: `Restore ${saved.title}`, exact: true })
      .click();
    await notice(page, saved)
      .getByRole("alert")
      .filter({ hasText: "Fixture restore failure" })
      .waitFor();
    await card(page, saved).waitFor();
    assert.ok(current(await jobState(saved)));
    await notice(page, saved)
      .getByRole("button", { name: "Retry", exact: true })
      .click();
    await waitState(
      (value) => !current(value.jobs.find((job) => job.id === saved.id)),
      "Restore retry persists",
    );
    await page.unroute("**/api/restore-job", restoreFailure);
    assert.equal(
      (await jobState(saved)).saved,
      true,
      "Restore retains its bookmark",
    );
    await all(page);

    // Queue Undo while the first removal has no response, then remove another job.
    let release;
    const delayed = new Promise((resolve) => {
      release = resolve;
    });
    let delayedRequest;
    const delayRemoval = async (route) => {
      const data = route.request().postDataJSON();
      if (data.id === cloud.id && !delayedRequest) {
        delayedRequest = data;
        await delayed;
      }
      return route.continue();
    };
    await page.route("**/api/remove-job", delayRemoval);
    await card(page, cloud).click();
    await panel(page)
      .getByRole("button", { name: `Remove ${cloud.title}`, exact: true })
      .click();
    await page.waitForURL(
      (url) => url.searchParams.get("opportunity") !== cloud.id,
    );
    const other = original.state.jobs.find(
      (job) => job.id === new URL(page.url()).searchParams.get("opportunity"),
    );
    assert.ok(other);
    const nextRemove = panel(page).getByRole("button", {
      name: `Remove ${other.title}`,
      exact: true,
    });
    assert.equal(
      await nextRemove.isEnabled(),
      true,
      "Next inspector Remove stays enabled while the first request is pending",
    );
    await notice(page, cloud)
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await nextRemove.click();
    await notice(page, other)
      .getByText(`Removed ${label(other)}.`, { exact: true })
      .waitFor();
    release();
    await waitState((value) => {
      const first = value.jobs.find((job) => job.id === cloud.id);
      return (
        first.removals?.some(
          (event) =>
            event.id === delayedRequest.removal_id && event.restored_at,
        ) && Boolean(current(value.jobs.find((job) => job.id === other.id)))
      );
    }, "Queued Undo restores only its exact job/event");
    await page.unroute("**/api/remove-job", delayRemoval);
    await close(page);
    await card(page, cloud).waitFor();
    await removeCard(page, cloud).click();
    await notice(page, cloud)
      .getByText(`Removed ${label(cloud)}.`, { exact: true })
      .waitFor();
    const events = (await jobState(cloud)).removals;
    assert.ok(events.length >= 2);
    assert.notEqual(
      events.at(-1).id,
      delayedRequest.removal_id,
      "Repeated removal gets a distinct event",
    );
    assert.ok(
      current(await jobState(other)),
      "An older queued Undo cannot undo a different successful removal",
    );

    // Successful mutation with failed refresh keeps its successful status.
    const remaining = original.state.jobs.find(
      (job) => ![cloud.id, other.id].includes(job.id),
    );
    const refreshFailure = (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Fixture refresh failure" },
      });
    await page.route("**/api/state", refreshFailure);
    await removeCard(page, remaining).click();
    await notice(page, remaining)
      .getByText(`Removed ${label(remaining)}.`, { exact: true })
      .waitFor();
    assert.ok(current(await jobState(remaining)));
    assert.equal(
      await notice(page, remaining)
        .getByRole("button", { name: "Retry", exact: true })
        .count(),
      0,
    );
    await page.unroute("**/api/state", refreshFailure);

    // Removal never changes application decisions or preserved document bytes.
    await page
      .getByRole("group", { name: "Opportunity views", exact: true })
      .getByRole("button", { name: "Applications", exact: true })
      .click();
    await card(page, cloud).click();
    await panel(page)
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    const workbench = page.locator(".opportunities-workbench:visible");
    await workbench
      .locator(`[data-application-id="${application.id}"]`)
      .waitFor();
    await workbench
      .getByRole("button", { name: "View / edit CV", exact: true })
      .waitFor();
    await workbench
      .getByRole("button", { name: "View / edit CV", exact: true })
      .click();
    const documentEditor = page.getByRole("dialog", {
      name: "CV",
      exact: true,
    });
    const cancellationMutations = [];
    const recordCancellationMutation = (request) => {
      if (
        [
          "remove-job",
          "restore-job",
          "job-removal-reason",
          "save-document",
        ].includes(new URL(request.url()).pathname.split("/").at(-1))
      )
        cancellationMutations.push(request.url());
    };
    page.on("request", recordCancellationMutation);
    await documentEditor
      .getByRole("textbox", { name: "Text", exact: true })
      .last()
      .fill("Fictional unsaved document edit still needs its document guard.");
    await documentEditor
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const discard = page.getByRole("alertdialog", {
      name: "Discard unsaved document edits?",
      exact: true,
    });
    await discard.waitFor();
    await discard
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    assert.equal(
      await page.getByRole("alertdialog").count(),
      0,
      "Cancellation does not open another prompt",
    );
    assert.deepEqual(
      cancellationMutations,
      [],
      "Cancelling a dirty document close performs no mutation",
    );
    page.off("request", recordCancellationMutation);
    assert.equal(
      await documentEditor
        .getByRole("textbox", { name: "Text", exact: true })
        .last()
        .inputValue(),
      "Fictional unsaved document edit still needs its document guard.",
    );
    await documentEditor
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await discard
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await documentEditor.waitFor({ state: "detached" });
    await workbench
      .getByRole("link", { name: "View application history", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/history/");
    await page.locator(".history-version").first().waitFor();
    assert.deepEqual(
      (await state()).applications,
      original.state.applications,
      "Removal never changes application records",
    );
    assert.equal(
      await hashSubmitted(),
      originalHash,
      "Submitted bytes remain immutable",
    );
    console.log(
      "PASS: removal/restore rollback + Retry, bookmark retention, queued Undo, repeated event identity, failed refresh and preserved Applications/History.",
    );

    // Exhaustion falls back to the previous role, then closes with reachable feedback.
    await reset();
    await all(page);
    const ids = await page
      .locator(".discover-card-open")
      .evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            button.closest("article").querySelector("[data-opportunity-id]")
              .dataset.opportunityId,
        ),
      );
    const last = original.state.jobs.find((job) => job.id === ids.at(-1));
    const previous = original.state.jobs.find((job) => job.id === ids.at(-2));
    await card(page, last).click();
    await panel(page)
      .getByRole("button", { name: `Remove ${last.title}`, exact: true })
      .click();
    await panel(page)
      .getByRole("heading", { name: previous.title, exact: true })
      .waitFor();
    await close(page);
    for (const id of ids.slice(0, -2)) {
      const job = original.state.jobs.find((job) => job.id === id);
      await removeCard(page, job).click();
      await notice(page, job)
        .getByText(`Removed ${label(job)}.`, { exact: true })
        .waitFor();
    }
    await card(page, previous).click();
    await panel(page)
      .getByRole("button", { name: `Remove ${previous.title}`, exact: true })
      .click();
    await panel(page).waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        document.activeElement?.matches(
          ".discover-removed-filter, .removal-feedback button, .discover-views button[aria-pressed='true']",
        ),
      null,
      { timeout: 2000 },
    );
    await notice(page, previous)
      .getByRole("button", { name: "Add reason", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await editor(page, previous)
      .getByRole("textbox")
      .fill("The last role can still have a reason.");
    await assertFits(page, "last-role feedback");
    await page.screenshot({ path: `${output}/desktop-last-role.png` });
    await page.reload();
    await page
      .getByRole("button", { name: /^Removed \(6\)$/, exact: true })
      .click();
    await card(page, previous).waitFor();
    await page.close();

    // Native contact starts on the new footer control without activating it.
    await reset();
    const motion = await contextFor(390, true);
    const mobile = motion.page;
    const mobileVideo = mobile.video();
    assert.ok(mobileVideo);
    await all(mobile);
    const session = await motion.context.newCDPSession(mobile);
    const settle = async () =>
      mobile.waitForFunction(() => {
        const element = document.querySelector(".discover-inspector");
        return (
          element &&
          !element.style.height &&
          !document
            .getAnimations()
            .some(
              (animation) =>
                animation.effect?.target instanceof Element &&
                animation.effect.target.closest(".discover-inspector") &&
                (animation.pending || animation.playState === "running"),
            )
        );
      });
    const drag = async (locator, delta, fraction = 0.5) => {
      const rect = await locator.boundingBox();
      assert.ok(rect);
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height * fraction;
      assert.ok(
        Math.min(y, y + delta) > 0 && Math.max(y, y + delta) < 844,
        "Native gesture remains in viewport",
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 24; step++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + (delta * step) / 24 }],
        });
        await mobile.waitForTimeout(16);
      }
      await mobile.waitForTimeout(150);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await card(mobile, cloud).tap();
    await settle();
    const footerRemove = panel(mobile).getByRole("button", {
      name: `Remove ${cloud.title}`,
      exact: true,
    });
    await drag(footerRemove, -80);
    await settle();
    assert.equal(
      await panel(mobile)
        .getByRole("button", {
          name: "Resize opportunity details",
          exact: true,
        })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      current(await jobState(cloud)),
      undefined,
      "Dragging the remove control never removes a role",
    );
    await drag(panel(mobile).locator(".discover-inspector-body"), -140, 0.75);
    assert.ok(
      (await panel(mobile)
        .locator(".discover-inspector-body")
        .evaluate((element) => element.scrollTop)) > 40,
      "Expanded content retains native reading after the footer gesture",
    );
    await mobile.screenshot({ path: `${output}/mobile-footer-expanded.png` });
    await panel(mobile)
      .locator(".discover-inspector-body")
      .evaluate((element) => {
        element.scrollTop = 0;
      });
    await drag(panel(mobile).locator(".discover-inspector-company"), 340);
    await settle();
    assert.equal(
      await panel(mobile)
        .getByRole("button", {
          name: "Resize opportunity details",
          exact: true,
        })
        .getAttribute("aria-expanded"),
      "false",
    );
    await drag(panel(mobile).locator(".discover-inspector-body"), 160, 0.2);
    await panel(mobile).waitFor({ state: "hidden" });
    assert.equal(
      await card(mobile, cloud).evaluate(
        (button) => button === document.activeElement,
      ),
      true,
      "Native dismissal restores its opener",
    );
    await card(mobile, cloud).tap();
    await settle();
    await footerRemove.tap();
    await notice(mobile, cloud)
      .getByText(`Removed ${label(cloud)}.`, { exact: true })
      .waitFor();
    assert.equal(
      await panel(mobile)
        .getByRole("button", {
          name: "Resize opportunity details",
          exact: true,
        })
        .getAttribute("aria-expanded"),
      "false",
      "Actual footer removal retains peek",
    );
    await notice(mobile, cloud)
      .getByRole("button", { name: "Undo", exact: true })
      .tap();
    await waitState(
      (value) => !current(value.jobs.find((job) => job.id === cloud.id)),
      "Touch Undo persists",
    );
    await mobile.keyboard.press("Escape");
    await panel(mobile).waitFor({ state: "hidden" });
    const mobileJobs = await mobile
      .locator(".discover-card-open")
      .evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            button.closest("article").querySelector("[data-opportunity-id]")
              .dataset.opportunityId,
        ),
      );
    for (const id of mobileJobs.slice(0, -1)) {
      const job = original.state.jobs.find((job) => job.id === id);
      await removeCard(mobile, job).tap();
      await notice(mobile, job)
        .getByText(`Removed ${label(job)}.`, { exact: true })
        .waitFor();
    }
    const mobileLast = original.state.jobs.find(
      (job) => job.id === mobileJobs.at(-1),
    );
    await card(mobile, mobileLast).tap();
    await panel(mobile)
      .getByRole("button", { name: `Remove ${mobileLast.title}`, exact: true })
      .tap();
    await panel(mobile).waitFor({ state: "hidden" });
    await mobile.waitForFunction(
      () =>
        document.activeElement?.matches(
          ".discover-removed-filter, .removal-feedback button, .discover-views button[aria-pressed='true']",
        ),
      null,
      { timeout: 2000 },
    );
    await notice(mobile, mobileLast)
      .getByRole("button", { name: "Add reason", exact: true })
      .tap();
    await editor(mobile, mobileLast)
      .getByRole("textbox")
      .fill("The last mobile role remains recoverable.");
    await assertFits(mobile, "mobile last-role feedback");
    await mobile.screenshot({ path: `${output}/mobile-last-role.png` });
    await motion.context.close();
    await mobileVideo.saveAs(`${output}/mobile-motion.webm`);
    await reset();
    for (const width of [320, 390, 1440]) {
      const shot = await contextFor(width);
      await all(shot.page);
      await removeCard(shot.page, cloud).click();
      await notice(shot.page, cloud)
        .getByRole("button", { name: "Add reason", exact: true })
        .click();
      await editor(shot.page, cloud)
        .getByRole("textbox")
        .fill("Fictional review reason. This role stays recoverable.");
      await assertFits(shot.page, `${width}px feedback`);
      await shot.page.screenshot({
        path: `${output}/feedback-${width}.png`,
        fullPage: true,
      });
      await shot.page.close();
      await reset();
    }
    assert.deepEqual(
      errors,
      [],
      "No page errors or unexpected confirmation dialogs",
    );
    assert.deepEqual(consoleErrors, [], "No application console errors");
    assert.deepEqual(httpErrors, [], "No unexpected failed HTTP responses");
    assert.deepEqual(external, [], "No external API or employer requests");
    fs.writeFileSync(
      `${output}/results.json`,
      JSON.stringify(
        {
          passed: true,
          viewports: [320, 390, 1440],
          errors,
          consoleErrors,
          httpErrors,
          external,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS: last/previous role handling, native footer expand/read/close, touch removal + Undo, Escape/focus, reduced motion, 320/390/1440 overflow and animation-enabled recording.",
    );
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage
        .screenshot({ path: `${output}/failure.png`, fullPage: true })
        .catch(() => {});
      fs.writeFileSync(
        `${output}/failure.txt`,
        `${error.stack}\nURL: ${activePage.url()}\nFocus: ${await activePage.evaluate(() => document.activeElement?.outerHTML.slice(0, 500)).catch(() => "unavailable")}\n`,
      );
      fs.writeFileSync(
        `${output}/focus-trace.json`,
        JSON.stringify(
          await activePage.evaluate(() => window.__removalFocusTrace || []),
          null,
          2,
        ) + "\n",
      );
      fs.writeFileSync(
        `${output}/results.json`,
        JSON.stringify(
          {
            passed: false,
            error: error.message,
            errors,
            consoleErrors,
            httpErrors,
            external,
          },
          null,
          2,
        ) + "\n",
      );
    }
    throw error;
  } finally {
    await Promise.all(
      contexts.map((context) => context.close().catch(() => {})),
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
