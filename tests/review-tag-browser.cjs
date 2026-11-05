// Actual Bell Toggle round trips with disposable fictional records only.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const base = process.env.TEST_URL;
  assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const evidence = "output/playwright/review-tag/bell-toggle";
  fs.mkdirSync(evidence, { recursive: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
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
    const card = (app) => page.locator(`[data-application-id="${app.id}"]`);
    const status = (app) =>
      card(app).locator(".review-status .bell-toggle__button");
    const saved = async (app) =>
      (await read()).applications.find((item) => item.id === app.id);
    const submittedPdf = path.join(
      root,
      fixture.sent.folder,
      fixture.sent.documents["resume.pdf"],
    );
    const hash = () =>
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(submittedPdf))
        .digest("hex");
    const beforeHash = hash();
    const dimensions = (control) =>
      control.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
        clip:
          parseFloat(getComputedStyle(node).getPropertyValue("--bt-clip")) || 0,
        visible:
          node.getBoundingClientRect().width -
          (parseFloat(getComputedStyle(node).getPropertyValue("--bt-clip")) ||
            0),
        radius: parseFloat(getComputedStyle(node).borderRadius),
      }));
    const waitState = async (app, value, owner = page) =>
      owner.waitForFunction(
        ({ id, value }) => {
          const control = document.querySelector(
            `[data-application-id="${id}"] .bell-toggle__button`,
          );
          return (
            control?.dataset.status === value &&
            control.getAttribute("aria-pressed") ===
              String(value === "reviewed") &&
            control.getAttribute("aria-disabled") !== "true"
          );
        },
        { id: app.id, value },
      );
    const waitWidth = async (app, target, owner = page) =>
      owner.waitForFunction(
        ({ id, target }) => {
          const control = document.querySelector(
            `[data-application-id="${id}"] .bell-toggle__button`,
          );
          if (!control) return false;
          const visible =
            control.getBoundingClientRect().width -
            (parseFloat(
              getComputedStyle(control).getPropertyValue("--bt-clip"),
            ) || 0);
          return Math.abs(visible - target) < 0.4;
        },
        { id: app.id, target },
      );
    const waitFace = async (app, state, owner = page) =>
      owner.waitForFunction(
        ({ id, state }) => {
          const node = document.querySelector(
            `[data-application-id="${id}"] .bell-toggle`,
          );
          const visible = node?.querySelector(
            `.bell-toggle__face--${state === "reviewed" ? "on" : "off"}`,
          );
          const hidden = node?.querySelector(
            `.bell-toggle__face--${state === "reviewed" ? "off" : "on"}`,
          );
          return (
            visible &&
            hidden &&
            parseFloat(getComputedStyle(visible).opacity) > 0.99 &&
            parseFloat(getComputedStyle(hidden).opacity) < 0.01
          );
        },
        { id: app.id, state },
      );

    await page.goto(base);
    await status(fixture.active).waitFor();
    const tag = status(fixture.active);
    assert.equal(
      await page
        .locator('.review-pane button[name="status"][value="reviewed"]')
        .count(),
      0,
    );
    assert.equal(
      await tag.getAttribute("aria-label"),
      "Draft — switch to Reviewed",
    );
    assert.equal(
      await card(fixture.active).locator(".bell-toggle__glyph svg").count(),
      1,
      "The actual bell glyph is present",
    );
    assert.equal(
      await card(fixture.active).locator(".bell-toggle__wave").count(),
      2,
      "The actual bell waves are present",
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const draftSize = await dimensions(tag);
    assert.equal(draftSize.height, 44);
    assert.equal(draftSize.radius, 22);
    assert.ok(
      draftSize.clip > 8,
      "Draft visibly clips the longer label reserved space",
    );
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await tag.hover();
      await waitFace(fixture.active, "draft");
      assert.equal(
        (await saved(fixture.active)).status,
        "draft",
        "Hover never saves or relabels Draft",
      );
      assert.ok(
        Math.abs((await dimensions(tag)).visible - draftSize.visible) < 0.5,
        "Hover does not unfurl the pill",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .include(
              `[data-application-id="${fixture.active.id}"] .dossier-header`,
            )
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations.map((item) => item.id),
        [],
        "Changed header accessibility",
      );
      await card(fixture.active)
        .locator(".dossier-header")
        .screenshot({
          path: `${evidence}/draft-${width}.png`,
          animations: "disabled",
        });
    }
    await tag.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await tag.evaluate((node) => node === document.activeElement),
      true,
    );
    assert.equal(
      await tag.evaluate(
        (node) =>
          getComputedStyle(node.parentElement, "::after").borderTopStyle,
      ),
      "solid",
      "Keyboard ring is drawn on the unclipped wrapper",
    );
    assert.equal(
      (await saved(fixture.active)).status,
      "draft",
      "Focus does not save",
    );

    const comment = "Checked both fictional tailored documents.";
    await card(fixture.active)
      .getByLabel("Comments", { exact: true })
      .fill(comment);
    let attempts = 0;
    await page.route("**/api/review", async (route) => {
      if (route.request().postDataJSON().id !== fixture.active.id)
        return route.continue();
      attempts++;
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Controlled toggle failure. Please retry.",
        }),
      });
    });
    await tag.click();
    await card(fixture.active)
      .getByRole("alert")
      .filter({ hasText: "Controlled toggle failure" })
      .waitFor();
    assert.equal(await tag.getAttribute("aria-pressed"), "false");
    assert.equal((await saved(fixture.active)).status, "draft");
    assert.equal(
      await card(fixture.active)
        .getByLabel("Comments", { exact: true })
        .inputValue(),
      comment,
    );
    assert.ok(
      Math.abs((await dimensions(tag)).visible - draftSize.visible) < 0.5,
      "Failed save cannot unfurl into success",
    );
    assert.equal(attempts, 1);
    await card(fixture.active).screenshot({ path: `${evidence}/failure.png` });
    await page.unroute("**/api/review");
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let pendingRequests = 0;
    await page.route("**/api/review", async (route) => {
      if (route.request().postDataJSON().id !== fixture.active.id)
        return route.continue();
      pendingRequests++;
      await gate;
      await route.continue();
    });
    try {
      await tag.click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`[data-application-id="${id}"] .bell-toggle__button`)
            ?.getAttribute("aria-busy") === "true",
        fixture.active.id,
      );
      assert.equal((await saved(fixture.active)).status, "draft");
      assert.equal(await tag.getAttribute("aria-pressed"), "false");
      assert.ok(
        Math.abs((await dimensions(tag)).visible - draftSize.visible) < 0.5,
      );
      for (const name of ["Reject", "Record submission…", "Save comment"])
        assert.equal(
          await card(fixture.active)
            .getByRole("button", { name, exact: true })
            .isDisabled(),
          true,
        );
      await tag.evaluate((node) => node.click());
      await page.waitForTimeout(100);
      assert.equal(pendingRequests, 1, "Pending saves cannot duplicate");
      await card(fixture.active).screenshot({ path: `${evidence}/saving.png` });
    } finally {
      release();
    }
    await waitState(fixture.active, "reviewed");
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-application-id="${id}"] .bell-toggle__glyph`)
          ?.getAnimations()
          .some((animation) => animation.playState === "running"),
      fixture.active.id,
    );
    const ring = await card(fixture.active)
      .locator(".bell-toggle__glyph")
      .evaluate((node) =>
        node
          .getAnimations()
          .flatMap((animation) => animation.effect?.getKeyframes() || []),
      );
    assert.ok(
      ring.some((frame) => /rotate\(/.test(frame.transform || "")),
      "The source bell actually rings",
    );
    const reviewedSize = await dimensions(tag);
    await waitWidth(fixture.active, reviewedSize.width);
    await waitFace(fixture.active, "reviewed");
    assert.equal(
      await tag.getAttribute("aria-label"),
      "Reviewed — switch to Draft",
    );
    assert.ok(
      (await dimensions(tag)).visible > draftSize.visible + 8,
      "Reviewed visibly expands",
    );
    assert.equal(
      await card(fixture.active)
        .getByLabel("Comments", { exact: true })
        .inputValue(),
      "",
    );
    const completed = await saved(fixture.active);
    assert.equal(completed.comments.at(-1).text, comment);
    assert.ok(completed.reviewed_at);
    await page.unroute("**/api/review");
    await page.reload();
    await waitState(fixture.active, "reviewed");
    await waitFace(fixture.active, "reviewed");
    await card(fixture.active).screenshot({ path: `${evidence}/reviewed.png` });

    await card(fixture.active)
      .getByLabel("Comments", { exact: true })
      .fill("Rechecking before a new draft.");
    await page.route("**/api/review", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Controlled reverse failure." }),
      }),
    );
    await tag.click();
    await card(fixture.active)
      .getByRole("alert")
      .filter({ hasText: "Controlled reverse failure" })
      .waitFor();
    assert.equal((await saved(fixture.active)).status, "reviewed");
    assert.equal(await tag.getAttribute("aria-pressed"), "true");
    assert.equal(
      await card(fixture.active)
        .getByLabel("Comments", { exact: true })
        .inputValue(),
      "Rechecking before a new draft.",
    );
    await page.unroute("**/api/review");
    await tag.click();
    await waitState(fixture.active, "draft");
    await waitWidth(fixture.active, draftSize.visible);
    await waitFace(fixture.active, "draft");
    assert.equal(
      (await saved(fixture.active)).comments.at(-1).text,
      "Rechecking before a new draft.",
    );
    assert.equal(
      await card(fixture.active)
        .getByLabel("Comments", { exact: true })
        .inputValue(),
      "",
    );
    assert.ok(
      Math.abs((await dimensions(tag)).visible - draftSize.visible) < 0.5,
      "Draft contracts to its original visible width",
    );
    for (const value of ["reviewed", "draft", "reviewed", "draft"]) {
      await tag.click();
      await waitState(fixture.active, value);
      await waitWidth(
        fixture.active,
        value === "reviewed" ? reviewedSize.width : draftSize.visible,
      );
      assert.equal((await saved(fixture.active)).status, value);
    }
    for (const [app, key] of [
      [fixture.reopened, "Enter"],
      [fixture.separate, "Space"],
    ]) {
      const control = status(app);
      await control.focus();
      for (const value of ["reviewed", "draft"]) {
        await control.press(key);
        await waitState(app, value);
        assert.equal((await saved(app)).status, value);
        assert.equal(
          await control.evaluate((node) => node === document.activeElement),
          true,
        );
        assert.equal(
          await card(app)
            .locator(".bell-toggle__glyph")
            .evaluate(
              (node) =>
                node
                  .getAnimations()
                  .filter((animation) => animation.playState === "running")
                  .length,
            ),
          0,
          "Keyboard skips ringing",
        );
      }
    }
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const touchPage = await touch.newPage();
    touchPage.on("pageerror", (error) => errors.push(error.message));
    await touchPage.goto(base);
    const touchTag = touchPage.locator(
      `[data-application-id="${fixture.active.id}"] .bell-toggle__button`,
    );
    await touchTag.waitFor();
    assert.equal(
      await touchPage.evaluate(() => matchMedia("(hover: none)").matches),
      true,
    );
    assert.ok((await touchTag.boundingBox()).height >= 44);
    await touchTag.tap();
    await waitState(fixture.active, "reviewed", touchPage);
    assert.equal(
      (await saved(fixture.active)).status,
      "reviewed",
      "First touch toggles without hover",
    );
    await touchTag.tap();
    await waitState(fixture.active, "draft", touchPage);
    await waitWidth(fixture.active, draftSize.visible, touchPage);
    await touchPage.waitForFunction(
      (id) =>
        !document
          .querySelector(`[data-application-id="${id}"] .bell-toggle`)
          ?.getAnimations({ subtree: true })
          .some((animation) => animation.playState === "running"),
      fixture.active.id,
    );
    await touchPage.screenshot({ path: `${evidence}/touch.png` });
    await touch.close();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await status(fixture.active).waitFor();
    for (const value of ["reviewed", "draft"]) {
      await tag.click();
      await waitState(fixture.active, value);
      await waitWidth(
        fixture.active,
        value === "reviewed" ? reviewedSize.width : draftSize.visible,
      );
      const motion = await card(fixture.active)
        .locator(".bell-toggle")
        .evaluate((node) => ({
          running: node
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
          faces: [...node.querySelectorAll(".bell-toggle__face")].map(
            (face) => ({
              transition: getComputedStyle(face).transitionDuration,
              filter: getComputedStyle(face).filter,
            }),
          ),
        }));
      assert.equal(motion.running, 0);
      assert.ok(
        motion.faces.every(
          (face) =>
            face.transition
              .split(",")
              .every((value) => parseFloat(value) === 0) &&
            face.filter === "none",
        ),
      );
    }
    await card(fixture.active)
      .locator(".dossier-header")
      .screenshot({ path: `${evidence}/reduced-motion.png` });
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Record native browser frames of the real unfurl/ring/contract round trip.
    const videoContext = await browser.newContext({
      viewport: { width: 768, height: 600 },
      recordVideo: {
        dir: path.resolve(evidence),
        size: { width: 768, height: 600 },
      },
    });
    const videoPage = await videoContext.newPage();
    videoPage.on("pageerror", (error) => errors.push(error.message));
    await videoPage.goto(base);
    const videoTag = videoPage.locator(
      `[data-application-id="${fixture.active.id}"] .bell-toggle__button`,
    );
    await videoTag.waitFor();
    await videoTag.evaluate((node) => {
      const article = node.closest("article");
      const header = document.querySelector(".workspace-header");
      window.scrollTo(
        0,
        article.getBoundingClientRect().top +
          scrollY -
          (header?.getBoundingClientRect().height || 0) -
          16,
      );
    });
    await videoPage.waitForTimeout(500);
    await videoTag.click();
    await waitState(fixture.active, "reviewed", videoPage);
    await waitWidth(fixture.active, reviewedSize.width, videoPage);
    await videoPage.waitForTimeout(1200);
    await videoTag.click();
    await waitState(fixture.active, "draft", videoPage);
    await waitWidth(fixture.active, draftSize.visible, videoPage);
    await videoPage.waitForTimeout(600);
    const video = videoPage.video();
    await videoContext.close();
    await video.saveAs(path.resolve(evidence, "bell-toggle.webm"));

    await page
      .getByRole("button", { name: "Submitted (1)", exact: true })
      .click();
    assert.equal(await card(fixture.sent).locator(".review-status").count(), 0);
    await page
      .getByRole("button", { name: "Rejected (1)", exact: true })
      .click();
    assert.equal(
      await card(fixture.declined).locator(".review-status").count(),
      0,
    );
    assert.equal(
      (await read()).applications.length,
      initial.applications.length,
    );
    assert.equal(hash(), beforeHash);
    assert.deepEqual(errors, []);
    console.log(
      "Bell Toggle PASS: actual bell/waves/clip spring, Draft↔Reviewed round trips and persisted comments, pointer/keyboard/touch, pending/failure/retry/duplicate guards, three widths/header axe, reduced motion, submitted bytes and native animation video.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
