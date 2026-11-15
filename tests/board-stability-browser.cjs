// Spatial/temporal regression checks against a disposable fictional workspace.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);

(async () => {
  const base = process.env.TEST_URL;
  assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(new URL(base).port, "8766");
  const engine = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch(
    engine === chromium ? { channel: "chrome" } : {},
  );
  const output = `output/playwright/board-stability/${engine === chromium ? "chromium" : "webkit"}`;
  fs.mkdirSync(output, { recursive: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
    });
    const page = await context.newPage();
    const original = (
      await (await page.request.get(base + "/api/state")).json()
    ).state;
    assert.equal(original._workspace.demo, true);
    assert.equal(original.identity.name, "Alex Morgan");
    const state = structuredClone(original);
    state.applications = [];
    state.application_queue = [];
    state.agent_intents = [];
    state.jobs = [3, 2, 2, 1, 2, 1, 2].flatMap((count, company) =>
      Array.from({ length: count }, (_, role) => ({
        id: `board-${company}-${role}`,
        title: `Board Engineer ${company + 1}.${role + 1}`,
        employer: `Fictional Company ${company + 1}`,
        location: "Singapore",
        requirements: ["Python"],
        saved: false,
        removals: [],
      })),
    );
    let rankedIds = state.jobs.map(({ id }) => id);
    let rejectSave = false;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    await page.route("**/api/state", (route) =>
      route.fulfill({ json: { state, token: "fictional-board" } }),
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({
        json: {
          result: rankedIds.map((id) => ({
            job: state.jobs.find((job) => job.id === id),
            match: {
              eligible_for_preparation: true,
              hard_conflicts: [],
              unknowns: [],
              gaps: [],
              evidence: [],
              preferences: [],
              salary_expectation: {},
            },
          })),
        },
      }),
    );
    for (const operation of ["save-job", "remove-job", "restore-job"]) {
      await page.route(`**/api/${operation}`, async (route) => {
        const data = route.request().postDataJSON();
        const job = state.jobs.find(({ id }) => id === data.id);
        assert.ok(job);
        if (operation === "save-job") {
          if (rejectSave) {
            rejectSave = false;
            return route.fulfill({
              status: 503,
              json: { error: "Fictional save failure" },
            });
          }
          job.saved = data.saved;
        } else if (operation === "remove-job") {
          job.removals.push({
            id: data.removal_id,
            at: new Date().toISOString(),
            reason: "",
          });
        } else {
          job.removals.find(({ id }) => id === data.removal_id).restored_at =
            new Date().toISOString();
        }
        await route.fulfill({ json: { result: job } });
      });
    }
    const card = (id) =>
      page.locator(`.discover-board .discover-card[data-job-id="${id}"]`);
    const settle = async () => {
      // ResizeObserver work can start on the frame after viewport changes.
      // Observe consecutive settled frames, not just an animation-free instant.
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            let stable = 0;
            let last = "";
            const start = performance.now();
            const sample = () => {
              const board = document.querySelector(".discover-board");
              const moving = document
                .getAnimations()
                .some(
                  (a) =>
                    a.playState === "running" &&
                    a.effect?.target?.closest?.(".discover-board"),
                );
              const geometry = JSON.stringify(
                [...document.querySelectorAll(".discover-column")].map(
                  (node) => {
                    const rect = node.getBoundingClientRect();
                    return [rect.x, rect.y, rect.width, rect.height];
                  },
                ),
              );
              stable =
                !moving &&
                geometry === last &&
                (!board || board.scrollWidth <= board.clientWidth + 1)
                  ? stable + 1
                  : 0;
              last = geometry;
              if (stable >= 3) return resolve();
              if (performance.now() - start > 5000)
                return reject(
                  new Error("Board did not settle without overflow"),
                );
              requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }),
      );
    };
    const positions = async () => {
      await settle();
      return page.locator(".discover-board").evaluate((board) => {
        const origin = board.getBoundingClientRect();
        return Object.fromEntries(
          [...board.querySelectorAll("[data-job-id]")].map((node) => {
            const rect = node.getBoundingClientRect();
            return [
              node.dataset.jobId,
              { x: rect.x - origin.x, y: rect.y - origin.y },
            ];
          }),
        );
      });
    };
    const same = (a, b, label) => {
      assert.ok(
        Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1,
        `${label}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`,
      );
    };
    const snapshot = async (name) => {
      await settle();
      await page.screenshot({ path: `${output}/${name}.png` });
    };
    const remove = async (id) => {
      await card(id).getByTitle("Remove role", { exact: true }).click();
      await card(id).waitFor({ state: "detached" });
      await settle();
    };
    const save = async (id) => {
      await card(id).getByTitle("Apply later", { exact: true }).click();
      await card(id).waitFor({ state: "detached" });
      await settle();
    };
    await page.goto(base + "/discover/?view=jobs");
    await card("board-6-1").waitFor();
    const before = await positions();
    await snapshot("before");
    await page.evaluate(() => {
      window.__boardFrames = [];
      let count = 0;
      const sample = (time) => {
        const node = document.querySelector('[data-job-id="board-0-2"]');
        window.__boardFrames.push({ time, y: node?.getBoundingClientRect().y });
        if (++count < 45) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await remove("board-0-1");
    const after = await positions();
    for (const [id, point] of Object.entries(after)) {
      assert.equal(point.x, before[id].x, `${id}: no sideways movement`);
      if (before[id].x !== before["board-0-1"].x)
        same(point, before[id], `${id}: other column stays still`);
    }
    assert.ok(
      after["board-0-2"].y < before["board-0-2"].y,
      "Next role closes the local gap",
    );
    const frames = await page.evaluate(() => window.__boardFrames);
    assert.ok(
      new Set(frames.map(({ y }) => Math.round(y))).size > 3,
      "Local displacement has observable intermediate frames",
    );
    fs.writeFileSync(`${output}/frames.json`, JSON.stringify(frames, null, 2));
    await snapshot("local-gap");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await card("board-0-1").waitFor();
    const undone = await positions();
    Object.keys(before).forEach((id) =>
      same(undone[id], before[id], `${id}: Undo restores position`),
    );

    // Saving the last visible role of a company removes its heading, without
    // sending any other company across the board.
    await save("board-0-0");
    await save("board-0-1");
    const lastRole = await positions();
    await save("board-0-2");
    const emptyCompany = await positions();
    Object.keys(emptyCompany).forEach((id) =>
      assert.equal(
        emptyCompany[id].x,
        lastRole[id].x,
        `${id}: company exit stays in its lane`,
      ),
    );
    assert.equal(
      await page
        .getByRole("region", {
          name: "Fictional Company 1 opportunities",
          exact: true,
        })
        .count(),
      0,
    );
    await snapshot("company-exit");

    // Rollback should recover its former place, even after optimistic removal.
    const failureBefore = await positions();
    rejectSave = true;
    await card("board-1-0").getByTitle("Apply later", { exact: true }).click();
    await page
      .getByText("Fictional save failure", { exact: true })
      .first()
      .waitFor();
    await card("board-1-0").waitFor();
    const failureAfter = await positions();
    Object.keys(failureBefore).forEach((id) =>
      same(failureAfter[id], failureBefore[id], `${id}: save rollback`),
    );

    // A background refresh with a reversed ranking and a new leading company
    // must append the arrival and retain the existing visible arrangement.
    const existing = await positions();
    state.jobs.push({
      ...state.jobs[3],
      id: "new-arrival",
      title: "New Arrival Engineer",
      employer: "Fictional Arrival",
      saved: false,
      removals: [],
    });
    rankedIds = ["new-arrival", ...rankedIds.toReversed()];
    // The provider's actual poll refreshes the mock state; no layout-only event.
    await card("new-arrival").waitFor({ timeout: 12000 });
    const arrived = await positions();
    Object.keys(existing).forEach((id) =>
      same(arrived[id], existing[id], `${id}: background arrival`),
    );
    const companyNames = await page
      .locator(".discover-company-name")
      .allTextContents();
    assert.equal(companyNames.at(-1), "Fictional Arrival");
    await page
      .getByRole("button", { name: "Refresh matches", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector(".discover-company-name")?.textContent ===
        "Fictional Arrival",
    );
    await settle();

    // A fully exhausted physical column stays empty until an explicit reset.
    const full = await positions();
    const x = full["new-arrival"].x;
    const lane = Object.keys(full).filter((id) => full[id].x === x);
    for (const id of lane) await remove(id);
    const exhausted = await positions();
    Object.keys(exhausted).forEach((id) =>
      same(exhausted[id], full[id], `${id}: exhausted neighbour column`),
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    const keyboardId = Object.keys(exhausted)[0];
    const keyboardNext = Object.keys(exhausted)[1];
    await card(keyboardId).getByTitle("Remove role", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await card(keyboardId).waitFor({ state: "detached" });
    assert.equal(
      await page
        .locator(".discover-card-open:focus")
        .getAttribute("aria-label"),
      await card(keyboardNext)
        .locator(".discover-card-open")
        .getAttribute("aria-label"),
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect?.target?.closest?.(".discover-board"),
            ).length,
      ),
      0,
    );

    // Interrupt a running local movement with another real action, without
    // Playwright's normal wait-for-a-stable-click-target hiding the overlap.
    state.jobs.forEach((job) => {
      job.saved = false;
      job.removals = [];
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(base + "/discover/?view=jobs");
    await card("board-0-0").waitFor();
    await card("board-0-2").scrollIntoViewIfNeeded();
    const rapidBefore = await positions();
    // Compare the old visible position with the replacement's first frame.
    // Hold that single sample while React commits; browser/protocol clocks can
    // otherwise advance enough to confuse valid travel with a discontinuity.
    await page.evaluate(() => {
      window.__boardInterruption = new Promise((resolve, reject) => {
        const find = (id) =>
          document.querySelector(
            `.discover-board .discover-card[data-job-id="${id}"]`,
          );
        const first = find("board-0-2");
        const second = find("board-0-1");
        const remaining = find("board-0-0");
        let observer;
        let frame;
        const timeout = setTimeout(() => {
          cancelAnimationFrame(frame);
          observer?.disconnect();
          reject(new Error("Could not interrupt an active board movement"));
        }, 5000);
        const sample = () => {
          const running = remaining
            .getAnimations()
            .find(
              (animation) =>
                animation.playState === "running" &&
                animation.effect
                  .getKeyframes()
                  .some((keyframe) => keyframe.transform),
            );
          const progress = running?.effect.getComputedTiming().progress;
          if (
            first.isConnected ||
            !running ||
            !(progress > 0 && progress < 1)
          ) {
            frame = requestAnimationFrame(sample);
            return;
          }
          const sampleTime = running.currentTime;
          running.pause();
          running.currentTime = sampleTime;
          const before = remaining.getBoundingClientRect();
          observer = new MutationObserver(() => {
            if (second.isConnected) return;
            const replacement = remaining
              .getAnimations()
              .find(
                (animation) =>
                  animation !== running &&
                  animation.playState === "running" &&
                  animation.effect
                    .getKeyframes()
                    .some((keyframe) => keyframe.transform),
              );
            // Safari can advance its animation clock during DOM reads. Seek
            // the replacement's initial frame, then let it play normally.
            if (replacement) {
              replacement.pause();
              replacement.currentTime = 0;
            }
            const after = remaining.getBoundingClientRect();
            replacement?.play();
            observer.disconnect();
            clearTimeout(timeout);
            resolve({
              before: { x: before.x, y: before.y },
              after: { x: after.x, y: after.y },
              interruptedProgress: progress,
              replacementStarted: Boolean(replacement),
              previousCancelled: running.playState === "idle",
            });
          });
          observer.observe(document.querySelector(".discover-board"), {
            childList: true,
            subtree: true,
          });
          second.querySelector('button[title="Remove role"]').click();
        };
        frame = requestAnimationFrame(sample);
      });
    });
    await card("board-0-2").getByTitle("Remove role", { exact: true }).click();
    const interruption = await page.evaluate(() => window.__boardInterruption);
    fs.writeFileSync(
      `${output}/interruption.json`,
      JSON.stringify(interruption, null, 2),
    );
    assert.ok(
      interruption.replacementStarted && interruption.previousCancelled,
      `The second removal retargets an active movement: ${JSON.stringify(interruption)}`,
    );
    same(
      interruption.before,
      interruption.after,
      "Interrupted motion preserves its visible position at the update boundary",
    );
    const rapidAfter = await positions();
    Object.keys(rapidAfter).forEach((id) => {
      assert.equal(rapidAfter[id].x, rapidBefore[id].x);
      if (rapidBefore[id].x !== rapidBefore["board-0-0"].x)
        same(
          rapidAfter[id],
          rapidBefore[id],
          `${id}: rapid actions leave other columns still`,
        );
    });

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const bottom = await page
      .locator(".discover-board .discover-card")
      .evaluateAll(
        (cards) =>
          cards.toSorted(
            (a, b) =>
              b.getBoundingClientRect().bottom -
              a.getBoundingClientRect().bottom,
          )[0].dataset.jobId,
      );
    await card(bottom)
      .getByTitle("Remove role", { exact: true })
      .evaluate((button) => button.click());
    await card(bottom).waitFor({ state: "detached" });
    await settle();
    assert.ok(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore) < 1,
      "Removing the bottom card preserves the viewport's scroll position",
    );

    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await settle();
      const layout = await page
        .locator(".discover-board")
        .evaluate((board) => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          boardOverflow: board.scrollWidth > board.clientWidth + 1,
          cards: [...board.querySelectorAll("[data-job-id]")].map((node) => ({
            x: node.getBoundingClientRect().x,
            width: node.getBoundingClientRect().width,
          })),
        }));
      assert.equal(
        layout.overflow || layout.boardOverflow,
        false,
        `${width}px has no implicit overflowing columns`,
      );
      layout.cards.forEach(({ x, width: cardWidth }) =>
        assert.ok(x >= 0 && x + cardWidth <= width + 1),
      );
      await snapshot(`responsive-${width}`);
    }
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "Board stability: local motion, columns, Undo, rollback, arrivals, reset, empty column, keyboard, reduced motion, interruption, scroll and responsive layouts passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
