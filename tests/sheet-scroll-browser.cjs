// Native touch acceptance against a disposable fictional workspace.
const { chromium } = require("../frontend/node_modules/playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.notEqual(new URL(base).port, "8766");
const output = "output/playwright/sheet-scroll";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "no-preference",
      recordVideo: {
        dir: output + "/recordings",
        size: { width: 390, height: 844 },
      },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const state = (
      await (await context.request.get(base + "/api/state")).json()
    ).state;
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");
    await page.goto(base + "/discover/?view=all");
    const role = page.getByRole("button", {
      name: "Assess Cloud Software Engineer at Emberlane Systems",
      exact: true,
    });
    await role.waitFor();
    const panel = page.locator(".discover-inspector"),
      body = panel.locator(".discover-inspector-body"),
      grip = panel.getByRole("button", {
        name: "Resize opportunity details",
        exact: true,
      });
    const session = await context.newCDPSession(page);
    async function settle() {
      await page.waitForFunction(() => {
        const e = document.querySelector(".discover-inspector");
        return (
          e &&
          !e.style.height &&
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
    }
    async function open() {
      await role.tap();
      await panel.waitFor();
      await settle();
    }
    async function drag(
      locator,
      delta,
      {
        fraction = 0.7,
        steps = 24,
        hold = 150,
        beforeEnd,
        cancel = false,
        reverse = 0,
      } = {},
    ) {
      const r = await locator.boundingBox();
      const x = r.x + r.width / 2,
        y = r.y + r.height * fraction;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= steps; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + (delta * i) / steps }],
        });
        await page.waitForTimeout(16);
      }
      for (let i = 1; reverse && i <= 8; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + delta + (reverse * i) / 8 }],
        });
        await page.waitForTimeout(16);
      }
      if (beforeEnd) await beforeEnd();
      await page.waitForTimeout(hold);
      await session.send("Input.dispatchTouchEvent", {
        type: cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
    }
    await open();
    await drag(body, -70);
    await settle();
    await page.screenshot({ path: output + "/short-body-swipe.png" });
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "true",
      "a short deliberate upward body swipe must expand for reading, not spring back to peek",
    );
    await drag(body, -140, { fraction: 0.75 });
    assert.ok(
      (await body.evaluate((e) => e.scrollTop)) > 40,
      "native upward reading works immediately from the expanded top edge",
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await open();
    await drag(body, 12, { steps: 3 });
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "small touch jitter never dismisses",
    );
    await drag(body, 200, { fraction: 0.2, reverse: -30 });
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "paused upward reversal cancels dismissal",
    );
    await drag(body, -470, { fraction: 0.88, cancel: true });
    await settle();
    assert.equal(
      await body.evaluate((e) => e.scrollTop),
      0,
      "canceled overflow restores owned reading",
    );
    assert.equal(await grip.getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await open();
    await drag(body, -470, {
      fraction: 0.88,
      beforeEnd: async () => {
        assert.ok(
          (await body.evaluate((e) => e.scrollTop)) > 90,
          "remaining movement must scroll content before the finger is lifted",
        );
      },
    });
    await settle();
    assert.equal(await grip.getAttribute("aria-expanded"), "true");
    await page.screenshot({ path: output + "/same-gesture-reading.png" });
    // Native reading remains available on subsequent expanded contacts.
    const previous = await body.evaluate((e) => e.scrollTop);
    await drag(body, -140, { fraction: 0.75 });
    await page.waitForTimeout(350);
    assert.ok(
      (await body.evaluate((e) => e.scrollTop)) > previous + 40,
      "expanded body scrolling remains native",
    );
    // Company row belongs to the enlarged header even when the body is scrolled.
    await body.evaluate((e) => {
      e.scrollTop = 0;
    });
    await page.waitForTimeout(180);
    await drag(panel.locator(".discover-inspector-company"), 320, {
      fraction: 0.5,
    });
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "company-name region can collapse the expanded sheet",
    );
    await body.evaluate((e) => {
      e.scrollTop = 80;
    });
    await drag(body, 155, { fraction: 0.25 });
    await panel.waitFor({ state: "detached" });
    assert.equal(
      await role.evaluate((e) => e === document.activeElement),
      true,
    );
    await open();
    const summary = body.locator("summary").first();
    await drag(summary, 155, { fraction: 0.5 });
    await panel.waitFor({ state: "detached" });
    await open();
    await summary.tap();
    assert.equal(
      await summary.evaluate((e) => e.parentElement.open),
      true,
      "a normal disclosure tap still works after a drag dismissal",
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open();
    await drag(body, -60);
    await settle();
    assert.equal(await grip.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    await video.saveAs(output + "/native-body-scroll.webm");
    console.log(
      "PASS: short-body expansion, same-contact expansion-to-reading, native subsequent scroll, company/header collapse, lower-body/disclosure dismissal, taps/focus and reduced motion.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
