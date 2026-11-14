// Native mobile acceptance against a disposable fictional workspace only.
const { chromium, webkit } = require("../frontend/node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = path.resolve("output/playwright/mobile-workspace");
const name = "Assess Cloud Software Engineer at Emberlane Systems";

async function settled(page) {
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector(".discover-inspector");
      return (
        root &&
        !root.style.height &&
        !document
          .getAnimations()
          .some(
            (a) =>
              a.effect?.target instanceof Element &&
              a.effect.target.closest(".discover-inspector") &&
              (a.pending || a.playState === "running"),
          )
      );
    });
  } catch (error) {
    console.error(
      "Sheet did not settle",
      await page.evaluate(() => {
        const root = document.querySelector(".discover-inspector");
        return {
          url: location.href,
          root: root && {
            style: root.getAttribute("style"),
            open: root.open,
            rect: root.getBoundingClientRect().toJSON(),
          },
          animations: document.getAnimations().map((a) => ({
            state: a.playState,
            pending: a.pending,
            target: a.effect?.target?.className,
          })),
        };
      }),
    );
    await page.screenshot({ path: path.join(output, "settle-failure.png") });
    throw error;
  }
}
async function drag(page, control, delta, session) {
  const r = await control.boundingBox();
  const x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  if (session)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
  }
  for (let i = 1; i <= 20; i++) {
    if (session)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (delta * i) / 20 }],
      });
    else await page.mouse.move(x, y + (delta * i) / 20);
    await page.waitForTimeout(16);
  }
  if (session)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  else await page.mouse.up();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  for (const [engine, label] of [
    [chromium, "chromium"],
    [webkit, "webkit"],
  ]) {
    if (engine === webkit && !fs.existsSync(webkit.executablePath())) {
      console.log(
        "SKIP optional WebKit: browser is not installed; Chromium touch checks remain required.",
      );
      continue;
    }
    const browser = await engine.launch(
      engine === chromium
        ? { channel: "chrome", headless: true }
        : { headless: true },
    );
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: "no-preference",
        recordVideo: {
          dir: path.join(output, "recordings"),
          size: { width: 390, height: 844 },
        },
      });
      const preflight = await context.request.get(base + "/api/state");
      const state = (await preflight.json()).state;
      assert.equal(state._workspace.demo, true);
      assert.equal(state.identity.name, "Alex Morgan");
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/discover/?view=jobs");
      const role = page.getByRole("button", { name, exact: true });
      await role.waitFor();
      const search = page
        .getByRole("search", { name: "Filter opportunities" })
        .getByRole("searchbox");
      await search.waitFor({ state: "visible" });
      await search.fill("Ember");
      await page.waitForFunction(
        () => document.querySelectorAll(".discover-card").length === 1,
      );
      assert.equal(
        await search.evaluate((el) => el === document.activeElement),
        true,
      );
      await page.getByRole("button", { name: "Clear search" }).click();
      await role.waitFor();
      await page.screenshot({
        path: path.join(output, `${label}-mobile-search.png`),
      });
      const session =
        engine === chromium ? await context.newCDPSession(page) : null;
      await role.click();
      // A tap below the drag threshold must resume an interrupted arrival,
      // including on the non-button toolbar (where no click-to-resize follows).
      await page.waitForTimeout(90);
      const toolbar = page.locator(".discover-inspector-toolbar");
      const toolbarRect = await toolbar.boundingBox();
      await page.mouse.move(
        toolbarRect.x + 35,
        toolbarRect.y + toolbarRect.height / 2,
      );
      await page.mouse.down();
      await page.mouse.up();
      await settled(page);
      const panel = page.locator(".discover-inspector"),
        grip = panel.getByRole("button", {
          name: "Resize opportunity details",
        });
      const showOverview = async () => {
        const overview = panel.getByRole("button", {
          name: "Overview",
          exact: true,
        });
        if ((await overview.getAttribute("aria-pressed")) !== "true") {
          await overview.click();
          await page.waitForURL(
            (url) => url.searchParams.get("panel") === "overview",
          );
        }
        await settled(page);
        assert.equal(await grip.getAttribute("aria-expanded"), "false");
      };
      const backdropPoint = async () => {
        const bounds = await panel.boundingBox();
        assert.ok(
          bounds && bounds.y > 16,
          "The overview leaves a tappable backdrop",
        );
        return { x: bounds.x + bounds.width / 2, y: bounds.y / 2 };
      };
      const releaseBackdrop = async () => {
        const { x, y } = await backdropPoint();
        if (session) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      };
      assert.equal(
        await panel.evaluate(
          (element) =>
            Math.abs(element.getBoundingClientRect().bottom - innerHeight) < 1,
        ),
        true,
        "a toolbar tap during arrival settles flush to the viewport rather than freezing mid-flight",
      );
      assert.equal(
        await panel.evaluate((el) => el.matches("dialog:modal")),
        true,
      );
      assert.equal(
        await page.getByText("Expand details", { exact: true }).count(),
        0,
      );
      assert.equal(
        await page.getByText("Collapse details", { exact: true }).count(),
        0,
      );
      await showOverview();
      const peek = await panel.boundingBox();
      assert.ok(peek);
      await drag(
        page,
        grip,
        -Math.min(280, Math.round((peek.y - 8) * 0.75)),
        session,
      );
      await settled(page);
      assert.equal(await grip.getAttribute("aria-expanded"), "true");
      await page.screenshot({
        path: path.join(output, `${label}-mobile-expanded.png`),
      });
      await drag(page, grip, 700, session);
      await panel.waitFor({ state: "detached" });
      assert.equal(
        await role.evaluate((el) => el === document.activeElement),
        true,
      );
      await role.click();
      await showOverview();
      if (session) {
        // The pointer release must work even when touch produces no click.
        await panel.evaluate((sheet) => {
          sheet.addEventListener(
            "touchend",
            (event) => event.preventDefault(),
            {
              once: true,
              passive: false,
            },
          );
        });
      }
      await releaseBackdrop();
      await panel.waitFor({ state: "detached" });
      await role.click();
      await showOverview();
      await drag(page, grip, 330, session);
      await panel.waitFor({ state: "detached" });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await role.click();
      await settled(page);
      assert.equal(
        await panel.evaluate((el) => getComputedStyle(el).transform),
        "none",
      );
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      assert.equal(
        page.url(),
        base + "/discover/?view=jobs",
        "Escape during reduced motion returns to the current shortlist",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await role.click();
      await settled(page);
      await page.goBack();
      await panel.waitFor({ state: "detached" });
      await page.goForward();
      await panel.waitFor({ state: "visible" });
      await settled(page);
      await panel
        .getByRole("button", { name: "Activity", exact: true })
        .click();
      const comment = panel.getByRole("textbox", {
        name: "Comments",
        exact: true,
      });
      const originalComment = await comment.inputValue();
      const draftComment = `${originalComment} Pending mobile dismissal regression`;
      await comment.fill(draftComment);
      await showOverview();
      const dirtyUrl = page.url();
      const cancelDismissal = async (trigger) => {
        const confirmation = page
          .waitForEvent("dialog")
          .then(async (dialog) => {
            assert.equal(dialog.type(), "confirm");
            assert.equal(dialog.message(), "Discard unsaved changes?");
            await dialog.dismiss();
          });
        await Promise.all([confirmation, trigger()]);
        await settled(page);
        await page.waitForFunction(
          () => {
            const sheet = document.querySelector(".discover-inspector");
            return (
              sheet && sheet.getBoundingClientRect().bottom <= innerHeight + 1
            );
          },
          undefined,
          { timeout: 2000 },
        );
        assert.equal(
          page.url(),
          dirtyUrl,
          "cancelled dismissal retains the selected role",
        );
        assert.equal(
          await panel.evaluate((element) => element.matches("dialog:modal")),
          true,
        );
        assert.equal(
          await panel.evaluate(
            (element) =>
              element.getBoundingClientRect().bottom <= innerHeight + 1,
          ),
          true,
          "cancelled dirty dismissal restores the visible sheet instead of trapping focus offscreen",
        );
      };
      await cancelDismissal(() =>
        panel
          .getByRole("button", {
            name: "Close opportunity details",
            exact: true,
          })
          .click(),
      );
      await cancelDismissal(releaseBackdrop);
      await cancelDismissal(() => drag(page, grip, 330, session));
      await cancelDismissal(() => page.goBack());
      await panel
        .getByRole("button", { name: "Activity", exact: true })
        .click();
      assert.equal(
        await comment.inputValue(),
        draftComment,
        "cancelled sheet dismissal preserves the unsent Activity draft",
      );
      await comment.fill(originalComment);
      await showOverview();
      // The editor deliberately keeps an edited draft dirty even after its text
      // is restored. Explicitly discard this test draft during cleanup only.
      const discardCleanup = (dialog) => dialog.accept();
      page.once("dialog", discardCleanup);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      page.off("dialog", discardCleanup);
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(base + "/discover/");
      await role.click();
      await showOverview();
      const gap = panel
        .locator(".discover-assessment-check")
        .filter({ hasText: "Evidence gap: Kubernetes" });
      await gap.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(
        () => {
          const check = [
            ...document.querySelectorAll(".discover-assessment-check"),
          ].find((element) =>
            element.textContent.includes("Evidence gap: Kubernetes"),
          );
          const footer = document.querySelector(".discover-inspector-footer");
          return (
            check &&
            footer &&
            check.getBoundingClientRect().bottom <=
              footer.getBoundingClientRect().top
          );
        },
        undefined,
        { timeout: 3000 },
      );
      await page.screenshot({ path: path.join(output, `${label}-320.png`) });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(errors, []);
      const video = page.video();
      await context.close();
      await video.saveAs(path.join(output, `${label}-journey.webm`));
      console.log(
        `PASS ${label}: visible live search, clear, grip-only resizing, expanded/peek drag dismissal, backdrop, reduced motion, focus and 320px.`,
      );
    } finally {
      await browser.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
