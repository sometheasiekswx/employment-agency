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
    const mutations = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (request) => {
      if (request.method() === "POST") mutations.push(request.url());
    });
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
      await panel
        .getByRole("button", { name: "Overview", exact: true })
        .click();
      await page.waitForURL(
        (url) => url.searchParams.get("panel") === "overview",
      );
      await settle();
    }
    async function drag(
      locator,
      delta,
      {
        fraction = 0.7,
        xFraction = 0.5,
        sidewaysStart = false,
        steps = 24,
        hold = 150,
        beforeEnd,
        cancel = false,
        reverse = 0,
      } = {},
    ) {
      const r = await locator.boundingBox();
      const x = r.x + r.width * xFraction,
        y = r.y + r.height * fraction;
      assert.ok(
        Math.min(y, y + delta, y + delta + reverse) > 0 &&
          Math.max(y, y + delta, y + delta + reverse) <
            (await page.evaluate(() => innerHeight)),
        `Native touch evidence must remain inside the visible viewport (start ${y.toFixed(1)}, travel ${delta})`,
      );
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      if (sidewaysStart) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + 14, y: y - 4 }],
        });
        await page.waitForTimeout(16);
      }
      for (let i = 1; i <= steps; i++) {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x + (sidewaysStart ? 14 : 0), y: y + (delta * i) / steps },
          ],
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
    await drag(body, -20);
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "sub-threshold body drag returns to peek",
    );
    await drag(grip, -70, { fraction: 0.5 });
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "true",
      "header uses the same expansion distance as the body",
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await open();
    await drag(body, -80, { sidewaysStart: true });
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "true",
      "upward intent survives small initial sideways drift",
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    await open();
    const peekHeight = (await panel.boundingBox()).height;
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
      "upward reading works immediately from the expanded top edge",
    );
    const expanded = await panel.boundingBox();
    const background = await page.evaluate(() => scrollY);
    const startingScroll = 80;
    async function pullPastTop(pull) {
      await body.evaluate((element, offset) => {
        element.scrollTop = offset;
      }, startingScroll);
      assert.equal(await body.evaluate((e) => e.scrollTop), startingScroll);
      await drag(body, startingScroll + pull, {
        fraction: 0.04,
        beforeEnd: async () => {
          assert.equal(await body.evaluate((e) => e.scrollTop), 0);
          const position = (await panel.boundingBox()).y;
          assert.ok(
            Math.abs(position - expanded.y - pull) < 4,
            "Only travel past the top moves the sheet before release",
          );
          assert.equal(await page.evaluate(() => scrollY), background);
        },
      });
    }
    await pullPastTop(32);
    await settle();
    assert.equal(await grip.getAttribute("aria-expanded"), "true");
    await pullPastTop(Math.round((expanded.height - peekHeight) * 0.7));
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "A medium pull after reaching the top returns to peek",
    );
    await grip.tap();
    await settle();
    await pullPastTop(
      Math.ceil(expanded.height - peekHeight + peekHeight * 0.28),
    );
    await panel.waitFor({ state: "detached" });
    assert.equal(
      await role.evaluate((e) => e === document.activeElement),
      true,
    );
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
    // Reading remains available on subsequent expanded contacts.
    const previous = await body.evaluate((e) => e.scrollTop);
    await drag(body, -140, { fraction: 0.75 });
    await page.waitForTimeout(350);
    assert.ok(
      (await body.evaluate((e) => e.scrollTop)) > previous + 40,
      "expanded body scrolling continues on the next contact",
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
    // Bring the disclosure into the upper visible body so a real downward
    // contact can cross the dismissal boundary without leaving the screen.
    await summary.evaluate((element) => {
      const scroller = element.closest(".discover-inspector-body");
      scroller.scrollTop +=
        element.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        20;
    });
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

    for (const region of [
      "title",
      "footer action",
      "bookmark",
      "footer padding",
    ]) {
      await page.evaluate(() => window.scrollTo(0, 180));
      await open();
      const position = await page.evaluate(() => scrollY);
      const height = (await panel.boundingBox()).height;
      const footer = panel.locator(".discover-inspector-footer");
      const target =
        region === "title"
          ? panel.locator(".role-workspace-heading h2")
          : region === "footer action"
            ? footer.getByRole("button", {
                name: "Save Cloud Software Engineer",
                exact: true,
              })
            : region === "bookmark"
              ? footer.locator("button[aria-pressed] svg")
              : footer;
      const requests = mutations.length;
      await drag(target, region === "footer action" ? -470 : -70, {
        fraction: region === "footer padding" ? 0.95 : 0.5,
        xFraction: region === "footer padding" ? 0.025 : 0.5,
        beforeEnd: async () => {
          assert.ok((await panel.boundingBox()).height > height + 50);
          if (region === "footer action")
            assert.ok(
              (await body.evaluate((element) => element.scrollTop)) > 90,
              "Footer contact expands then reads before finger lift",
            );
        },
      });
      await settle();
      assert.equal(await grip.getAttribute("aria-expanded"), "true", region);
      assert.equal(await page.evaluate(() => scrollY), position);
      assert.equal(
        mutations.length,
        requests,
        "Dragging never activates an action",
      );
      assert.equal(
        await panel
          .getByRole("button", { name: "Overview", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
    }

    // Exercise the real disabled-control and explanatory-note markup with a
    // controlled fictional eligibility response, without changing its CSS.
    await page.route("**/api/rank", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const backend = data.result.find(
        (entry) => entry.job.employer === "Bayform Labs",
      );
      assert.ok(backend);
      backend.match.eligible_for_preparation = false;
      await route.fulfill({ response, json: data });
    });
    await page.goto(base + "/discover/?view=all");
    await role.waitFor();
    const backend = page.getByRole("button", {
      name: "Assess Backend Engineer at Bayform Labs",
      exact: true,
    });
    for (const region of ["disabled action", "footer note"]) {
      await backend.tap();
      await panel.waitFor();
      await settle();
      const disabled = panel.getByRole("button", {
        name: "Prepare application",
        exact: true,
      });
      assert.equal(await disabled.isDisabled(), true);
      const position = await page.evaluate(() => scrollY);
      const requests = mutations.length;
      await drag(
        region === "disabled action"
          ? disabled
          : panel.locator(".discover-preparation-note"),
        -70,
        { fraction: 0.5 },
      );
      await settle();
      assert.equal(await grip.getAttribute("aria-expanded"), "true", region);
      assert.equal(await page.evaluate(() => scrollY), position);
      assert.equal(mutations.length, requests);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
    }
    await open();
    await panel.getByRole("button", { name: "CV", exact: true }).tap();
    await page.waitForURL(
      (url) => url.searchParams.get("panel") === "documents",
    );
    const workbench = page.locator(".discover-inspector:visible");
    await workbench.waitFor();
    await workbench
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .tap();
    await workbench.waitFor({ state: "hidden" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open();
    await drag(body, -20);
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "reduced motion retains the same sub-threshold return rule",
    );
    await drag(panel.getByRole("button", { name: "CV", exact: true }), -70, {
      fraction: 0.5,
    });
    await settle();
    assert.equal(await grip.getAttribute("aria-expanded"), "true");
    await pullPastTop(Math.round((expanded.height - peekHeight) * 0.7));
    await settle();
    assert.equal(
      await grip.getAttribute("aria-expanded"),
      "false",
      "Reduced motion keeps the same scroll handoff and snap point",
    );
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    const video = page.video();
    await context.close();
    await video.saveAs(output + "/native-body-scroll.webm");
    console.log(
      "PASS: same-contact reading and expanded top-edge handoff, three release outcomes, body/footer/disabled-control expansion, fixed background, ordinary taps/focus and reduced motion.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
