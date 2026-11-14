// Temporal acceptance against serve_concept_fixture.py, using real browser frames.
// Run: TEST_URL=http://127.0.0.1:PORT node tests/motion-browser.cjs
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const output = path.resolve("output/playwright/motion");
const inspectorSelector = ".discover-inspector";
const cloudName = "Assess Cloud Software Engineer at Emberlane Systems";
const report = { checks: [], recordings: [], measurements: [] };

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

const inspector = (page) => page.locator(inspectorSelector);
const close = (page) =>
  inspector(page).getByRole("button", {
    name: "Close opportunity details",
    exact: true,
  });
const cloud = (page) =>
  page.getByRole("button", { name: cloudName, exact: true });
const heading = (page, title) =>
  inspector(page).getByRole("heading", { name: title, exact: true });
const navigation = (page, direction) =>
  inspector(page).getByRole("button", {
    name: `${direction} opportunity`,
    exact: true,
  });

async function frames(page, count = 2) {
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const tick = () =>
          --count <= 0 ? resolve() : requestAnimationFrame(tick);
        requestAnimationFrame(tick);
      }),
    count,
  );
}

// Probe actual browser animations; no test-only product attributes are needed.
async function startProbe(page, label, selector = inspectorSelector) {
  await page.evaluate(
    ({ label, selector }) => {
      if (window.__motionProbe)
        cancelAnimationFrame(window.__motionProbe.frame);
      const probe = { label, selector, frames: [], frame: 0 };
      window.__motionProbe = probe;
      const sample = (time) => {
        const animations = document.getAnimations().flatMap((animation) => {
          const target = animation.effect?.target;
          if (!(target instanceof Element) || !target.closest(selector))
            return [];
          const properties = [
            ...new Set(animation.effect.getKeyframes().flatMap(Object.keys)),
          ].filter((key) => ["transform", "opacity", "height"].includes(key));
          if (
            !properties.length ||
            (!animation.pending && animation.playState !== "running")
          )
            return [];
          const style = getComputedStyle(target);
          return [
            {
              target: `${target.tagName.toLowerCase()}.${target.getAttribute("class") || ""}`,
              properties,
              currentTime: animation.currentTime,
              progress: animation.effect.getComputedTiming().progress,
              transform: style.transform,
              opacity: style.opacity,
            },
          ];
        });
        probe.frames.push({
          time,
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
          animations,
        });
        // A bound also protects an abandoned probe during a failed assertion.
        if (probe.frames.length < 1800)
          probe.frame = requestAnimationFrame(sample);
      };
      probe.frame = requestAnimationFrame(sample);
    },
    { label, selector },
  );
}

async function stopProbe(page) {
  const result = await page.evaluate(() => {
    const probe = window.__motionProbe;
    cancelAnimationFrame(probe.frame);
    const active = probe.frames.filter((frame) => frame.animations.length);
    const result = {
      label: probe.label,
      sampledFrames: probe.frames.length,
      animatedFrames: active.length,
      properties: [
        ...new Set(
          active.flatMap((frame) =>
            frame.animations.flatMap((animation) => animation.properties),
          ),
        ),
      ],
      frames: probe.frames,
    };
    delete window.__motionProbe;
    return result;
  });
  report.checks.push(result);
  return result;
}

async function waitForMotion(page) {
  await page.waitForFunction(() =>
    window.__motionProbe?.frames.some((frame) =>
      frame.animations.some((animation) =>
        animation.properties.some(
          (key) => key === "transform" || key === "opacity",
        ),
      ),
    ),
  );
}

async function settled(page, selector = inspectorSelector) {
  await page.evaluate(
    (selector) =>
      new Promise((resolve, reject) => {
        const deadline = performance.now() + 6000;
        let stable = 0;
        const tick = () => {
          const active = document.getAnimations().some((animation) => {
            const target = animation.effect?.target;
            return (
              target instanceof Element &&
              target.closest(selector) &&
              (animation.pending || animation.playState === "running")
            );
          });
          const resizing = [...document.querySelectorAll(selector)].some(
            (element) => element.style.height,
          );
          stable = active || resizing ? 0 : stable + 1;
          if (stable >= 2) resolve();
          else if (performance.now() >= deadline)
            reject(new Error(`Animation did not settle: ${selector}`));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    selector,
  );
}

async function assertRestingLayout(page, label) {
  const result = await page.evaluate(() => {
    const root = document.querySelector(".discover-inspector");
    const surfaces = root
      ? [
          root,
          ...root.querySelectorAll(
            ".discover-inspector-body, .discover-inspector-footer",
          ),
        ]
      : [];
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      transforms: surfaces.map((element) => {
        const style = getComputedStyle(element);
        return {
          target: element.className,
          identity:
            style.transform === "none" ||
            new DOMMatrixReadOnly(style.transform).isIdentity,
          transform: style.transform,
          opacity: Number(style.opacity),
        };
      }),
    };
  });
  assert.equal(
    result.overflow,
    false,
    `${label}: no page-wide horizontal overflow`,
  );
  for (const surface of result.transforms) {
    assert.equal(
      surface.identity,
      true,
      `${label}: ${surface.target} rests at an identity transform (${surface.transform})`,
    );
    assert.equal(
      surface.opacity,
      1,
      `${label}: ${surface.target} is fully visible`,
    );
  }
}

async function assertFooter(page, label, wholeFooter = true) {
  const result = await inspector(page)
    .locator(".discover-inspector-footer")
    .evaluate((footer) => {
      const bounds = footer.getBoundingClientRect();
      const actions = [...footer.querySelectorAll("button, a")].filter(
        (node) => node.getClientRects().length && !node.disabled,
      );
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        height: innerHeight,
        actions: actions.map((node) => {
          const rect = node.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {
            label: node.getAttribute("aria-label") || node.textContent.trim(),
            visible: rect.top >= -1 && rect.bottom <= innerHeight + 1,
            reachable: hit === node || node.contains(hit),
          };
        }),
      };
    });
  if (wholeFooter)
    assert.ok(
      result.top >= -1 && result.bottom <= result.height + 1,
      `${label}: footer stays in the viewport`,
    );
  assert.ok(result.actions.length > 0);
  for (const action of result.actions)
    assert.ok(
      action.visible && action.reachable,
      `${label}: ${action.label} is visible and hit-testable`,
    );
}

async function assertFocused(locator, label) {
  assert.equal(
    await locator.evaluate((node) => node === document.activeElement),
    true,
    label,
  );
}

async function openWithPointer(page, label) {
  await startProbe(page, label);
  await cloud(page).click();
  await heading(page, "Cloud Software Engineer").waitFor();
  await waitForMotion(page);
  if (!(await inspector(page).evaluate((node) => node.matches(":modal"))))
    await assertFooter(page, `${label}: actions during arrival`, false);
  else
    assert.ok(
      (await inspector(page).evaluate(
        (node) => getComputedStyle(node).transform,
      )) !== "none",
      "mobile surface slides up from below",
    );
  await settled(page);
  const sample = await stopProbe(page);
  assert.ok(
    sample.animatedFrames > 1,
    `${label}: motion is present across browser frames`,
  );
  assert.ok(
    sample.properties.includes("transform") ||
      sample.properties.includes("opacity"),
  );
  const changing = sample.frames
    .flatMap((frame) => frame.animations)
    .map(
      (animation) =>
        `${animation.target}:${animation.transform}:${animation.opacity}`,
    );
  assert.ok(
    new Set(changing).size > 1,
    `${label}: the rendered transform or opacity changes`,
  );
  await assertRestingLayout(page, label);
  await assertFooter(page, label);
}

async function keyboardJourney(page, label) {
  await cloud(page).focus();
  const focus = await cloud(page).evaluate((button) => ({
    title: getComputedStyle(button).outlineStyle,
    card: getComputedStyle(button.closest(".discover-card")).outlineStyle,
  }));
  assert.equal(focus.title, "none", "no duplicate title focus border");
  assert.equal(
    focus.card,
    "solid",
    "full-card keyboard focus is still visible",
  );
  await page.screenshot({ path: path.join(output, `${label}-card-focus.png`) });
  await startProbe(page, `${label}: keyboard open`);
  await page.keyboard.press("Enter");
  await heading(page, "Cloud Software Engineer").waitFor();
  await frames(page);
  await assertFocused(
    label === "mobile"
      ? inspector(page).locator(".discover-sheet-expand")
      : close(page),
    `${label}: Enter establishes the initial inspector focus immediately`,
  );
  assert.equal(
    (await stopProbe(page)).animatedFrames,
    0,
    `${label}: keyboard opening is immediate`,
  );
  const titles = await page.locator(".discover-card-open h3").allTextContents();
  const next = navigation(page, "Next");
  const previous = navigation(page, "Previous");
  for (const [button, indices, boundary] of [
    [next, titles.slice(1).map((_, index) => index + 1), titles.length - 1],
    [
      previous,
      titles.slice(0, -1).map((_, index) => titles.length - 2 - index),
      0,
    ],
  ]) {
    await button.focus();
    for (const index of indices) {
      await startProbe(page, `${label}: keyboard selection ${index}`);
      await page.keyboard.press("Enter");
      await heading(page, titles[index]).waitFor();
      await frames(page);
      await assertFocused(
        index === boundary ? heading(page, titles[index]) : button,
        `${label}: navigation retains usable focus at ${index + 1} of ${titles.length}`,
      );
      assert.equal(
        (await stopProbe(page)).animatedFrames,
        0,
        `${label}: keyboard navigation is immediate`,
      );
    }
  }
  await page.keyboard.press("Escape");
  await inspector(page).waitFor({ state: "detached" });
  await page.waitForFunction(
    (name) => document.activeElement?.getAttribute("aria-label") === name,
    cloudName,
  );
  await assertRestingLayout(page, `${label}: Escape`);
}

async function rapidDesktop(page) {
  await openWithPointer(page, "desktop pointer open");
  await page.screenshot({ path: path.join(output, "desktop-settled.png") });
  const points = await page.evaluate((name) => {
    const center = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const card = [...document.querySelectorAll(".discover-card-open")].find(
      (node) => node.getAttribute("aria-label") === name,
    );
    const close = document.querySelector(
      '[aria-label="Close opportunity details"]',
    );
    document.addEventListener(
      "click",
      function capture(event) {
        if (!card.contains(event.target)) return;
        const active = document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.target instanceof Element &&
              animation.effect.target.matches(".discover-inspector") &&
              (animation.pending || animation.playState === "running"),
          );
        window.__reselectOverlap = active.length;
        window.__exitLifetime = Promise.all(
          active.map((animation) => animation.finished.catch(() => undefined)),
        );
        document.removeEventListener("click", capture, true);
      },
      true,
    );
    return { card: center(card), close: center(close) };
  }, cloudName);
  await startProbe(page, "desktop close interrupted by same-card reopen");
  // Precomputed real pointer coordinates avoid locator scrolling between the
  // two clicks; verify overlap at the actual card click, not by elapsed time.
  await page.mouse.click(points.close.x, points.close.y);
  await page.mouse.click(points.card.x, points.card.y);
  await heading(page, "Cloud Software Engineer").waitFor();
  assert.ok(
    await page.evaluate(() => window.__reselectOverlap > 0),
    "same-card reselect occurs while exit animations are active",
  );
  await page.evaluate(() => window.__exitLifetime);
  await settled(page);
  await frames(page);
  assert.equal(
    await inspector(page).isVisible(),
    true,
    "an interrupted close cannot hide or collapse the reopened inspector",
  );
  assert.equal(await cloud(page).getAttribute("aria-pressed"), "true");
  await stopProbe(page);
  await assertRestingLayout(page, "desktop same-card reopen");

  const titles = await page.locator(".discover-card-open h3").allTextContents();
  await startProbe(page, "desktop rapid Next / Next / Previous");
  await navigation(page, "Next").click({ force: true });
  await navigation(page, "Next").click({ force: true });
  await navigation(page, "Previous").click({ force: true });
  await heading(page, titles[1]).waitFor();
  await settled(page);
  assert.equal(
    (
      await inspector(page)
        .locator(".discover-inspector-navigation [aria-live]")
        .textContent()
    ).trim(),
    `2 of ${titles.length}`,
  );
  assert.equal(await inspector(page).isVisible(), true);
  await stopProbe(page);
  await assertRestingLayout(page, "desktop rapid selection");
  await close(page).click();
  await inspector(page).waitFor({ state: "detached" });
}

async function selectionBack(page, base, state, label) {
  await cloud(page).click();
  await heading(page, "Cloud Software Engineer").waitFor();
  await settled(page);
  await page.waitForURL((url) => Boolean(url.searchParams.get("opportunity")));
  const selected = page.url();
  const params = new URL(selected).searchParams;
  assert.equal(
    params.get("opportunity"),
    state.jobs.find((job) => job.title === "Cloud Software Engineer").id,
  );
  assert.ok(
    state.profiles.some(
      (profile) => profile.id === params.get("assessment_profile"),
    ),
  );
  assert.equal(params.get("view"), "all");
  const document = inspector(page).locator(".opportunity-application");
  await document.waitFor();
  const application = await document.getAttribute("data-application-id");
  assert.ok(application);
  if (label === "mobile") {
    const workbench = page.locator(".discover-inspector:visible");
    await assertFocused(
      workbench.getByRole("button", {
        name: "Resize opportunity details",
        exact: true,
      }),
      "mobile: opening a prepared role focuses the workspace immediately",
    );
    await page.goBack();
    await page.waitForURL(base + "/discover/?view=all");
    await workbench.waitFor({ state: "hidden" });
    await assertFocused(
      cloud(page),
      "mobile: Back restores the shortlist opener",
    );
    await cloud(page).click();
    await page.locator(`[data-application-id="${application}"]`).waitFor();
  }
  await page
    .locator(".discover-inspector:visible")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("panel") === "overview" &&
      url.searchParams.get("opportunity") === params.get("opportunity"),
  );
  await heading(page, "Cloud Software Engineer").waitFor();
  await settled(page);
  await assertFocused(
    inspector(page).getByRole("button", { name: "Overview", exact: true }),
    `${label}: Overview leaves focus on the current tab`,
  );
  assert.equal(
    await cloud(page).getAttribute("aria-pressed"),
    "true",
    `${label}: Overview retains the selected card`,
  );
  await assertRestingLayout(page, `${label}: Overview`);
  // Panel changes replace their query state. A separate page journey still
  // exercises native browser Back and reconstruction of the selected role.
  const restoredRoute = page.url();
  await page.goto(base + "/career/");
  await page
    .getByRole("heading", { name: "Your details", exact: true })
    .waitFor();
  await page.goBack();
  await page.waitForURL(restoredRoute);
  await heading(page, "Cloud Software Engineer").waitFor();
  await settled(page);
  await assertFocused(
    label === "mobile"
      ? inspector(page).locator(".discover-sheet-expand")
      : close(page),
    `${label}: browser Back restores selected-role focus`,
  );
  assert.equal(
    await cloud(page).getAttribute("aria-pressed"),
    "true",
    `${label}: browser Back restores the selected card`,
  );
  await assertRestingLayout(page, `${label}: browser Back`);
  await page.keyboard.press("Escape");
  await inspector(page).waitFor({ state: "detached" });
}

async function mobileSheet(page, session) {
  await openWithPointer(page, "mobile pointer sheet open");
  assert.equal(
    await inspector(page).evaluate((node) => node.matches("dialog:modal")),
    true,
    "mobile uses the native modal dialog",
  );
  await page.screenshot({ path: path.join(output, "mobile-settled.png") });
  const toggle = inspector(page).locator(".discover-sheet-expand");
  await inspector(page)
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await settled(page);
  await mobileGestures(page, session);
  await startProbe(page, "mobile rapid expand / collapse / expand");
  await toggle.click({ force: true });
  await toggle.click({ force: true });
  await toggle.click({ force: true });
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await assertFooter(page, "mobile interrupted expansion");
  await settled(page);
  await stopProbe(page);
  await assertFooter(page, "mobile expanded");
  await assertRestingLayout(page, "mobile expanded");
  await page.screenshot({ path: path.join(output, "mobile-expanded.png") });

  // Five complete cycles. These observations describe this instrumented run;
  // they are not an FPS claim, a performance budget, or a cross-device guarantee.
  await toggle.click();
  await settled(page);
  await session.send("Performance.enable");
  const before = Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics.map(
      ({ name, value }) => [name, value],
    ),
  );
  await page.evaluate(() => {
    window.__motionFrames = { times: [], frame: 0 };
    const tick = (time) => {
      window.__motionFrames.times.push(time);
      window.__motionFrames.frame = requestAnimationFrame(tick);
    };
    window.__motionFrames.frame = requestAnimationFrame(tick);
  });
  for (let cycle = 0; cycle < 5; cycle++) {
    for (const expanded of [true, false]) {
      await toggle.click({ force: true });
      assert.equal(
        await toggle.getAttribute("aria-expanded"),
        String(expanded),
      );
      await assertFooter(
        page,
        `mobile cycle ${cycle + 1} while ${expanded ? "expanding" : "collapsing"}`,
      );
      await settled(page);
      await assertFooter(page, `mobile cycle ${cycle + 1} settled`);
    }
  }
  const intervals = await page.evaluate(() => {
    const sample = window.__motionFrames;
    cancelAnimationFrame(sample.frame);
    delete window.__motionFrames;
    return sample.times
      .slice(1)
      .map((time, index) => time - sample.times[index]);
  });
  const after = Object.fromEntries(
    (await session.send("Performance.getMetrics")).metrics.map(
      ({ name, value }) => [name, value],
    ),
  );
  const sorted = [...intervals].sort((a, b) => a - b);
  assert.ok(sorted.length > 0);
  report.measurements.push({
    label: "mobile, five expand/collapse cycles",
    note: "Headless Chromium observations with footer geometry checks; no performance guarantee.",
    frameSamples: intervals.length,
    frameIntervalMs: {
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      maximum: sorted.at(-1),
    },
    LayoutCount: after.LayoutCount - before.LayoutCount,
    RecalcStyleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    LayoutDurationMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
    RecalcStyleDurationMs:
      (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
  });
  await page.evaluate(() => {
    window.__nativeDialogEvents = [];
    const dialog = document.querySelector(".discover-inspector");
    for (const type of ["cancel", "close"])
      dialog.addEventListener(type, (event) =>
        window.__nativeDialogEvents.push({ type, trusted: event.isTrusted }),
      );
  });
  await page.keyboard.press("Escape");
  await inspector(page).waitFor({ state: "detached" });
  const events = await page.evaluate(() => window.__nativeDialogEvents);
  assert.ok(
    events.some((event) => event.type === "cancel" && event.trusted),
    "Escape dispatches the native trusted cancel event",
  );
  await page.waitForFunction(
    (name) => document.activeElement?.getAttribute("aria-label") === name,
    cloudName,
  );
  await cloud(page).click();
  await heading(page, "Cloud Software Engineer").waitFor();
  await settled(page);
  await inspector(page).evaluate((dialog) => dialog.close());
  await inspector(page).waitFor({ state: "detached" });
  await page.waitForFunction(
    (name) => document.activeElement?.getAttribute("aria-label") === name,
    cloudName,
  );
}

// Native touch input exercises touch-action arbitration and pointercancel;
// synthetic DOM pointer events alone cannot prove scrolling is preserved.
async function swipeSheet(page, session, source, distance, options = {}) {
  const rect = await source.boundingBox();
  assert.ok(rect, "gesture source is visible");
  const x = options.content ? rect.x + rect.width - 8 : rect.x + rect.width / 2;
  const y = options.content
    ? rect.y + Math.min(120, rect.height * 0.4)
    : rect.y + rect.height / 2;
  // CDP round trips and geometry assertions must not turn a deliberate flick
  // into a held drag. Supply a native input timeline for velocity-specific cases.
  const clock = options.duration || options.reverse ? Date.now() / 1000 : null;
  const duration = options.duration || 240;
  const timestamp = (milliseconds) =>
    clock === null ? {} : { timestamp: clock + milliseconds / 1000 };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
    ...timestamp(0),
  });
  const steps = options.steps || 12;
  for (let step = 1; step <= steps; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + (distance * step) / steps }],
      ...timestamp((duration * step) / steps),
    });
    await frames(page, 1);
  }
  if (options.reverse) {
    await page.waitForTimeout(100);
    for (let step = 1; step <= 3; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + distance + (options.reverse * step) / 3 }],
        ...timestamp(duration + 100 + step * 15),
      });
      await frames(page, 1);
    }
  }
  if (options.pause) await page.waitForTimeout(options.pause);
  const during = await inspector(page).evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    dragging: element.hasAttribute("data-sheet-dragging"),
  }));
  assert.equal(during.dragging, true, "tracks a live drag before release");
  await assertFooter(page, "footer remains usable during the gesture");
  await session.send("Input.dispatchTouchEvent", {
    type: options.cancel ? "touchCancel" : "touchEnd",
    touchPoints: [],
    ...timestamp(
      duration + (options.reverse ? 145 : 0) + (options.pause || 0) + 5,
    ),
  });
  return during;
}

async function mobileGestures(page, session) {
  const toggle = inspector(page).locator(".discover-sheet-expand");
  const body = inspector(page).locator(".discover-inspector-body");
  const height = () =>
    inspector(page).evaluate(
      (element) => element.getBoundingClientRect().height,
    );
  const expanded = () => toggle.getAttribute("aria-expanded");
  const halfHeight = await height();
  const beforeScroll = await page.evaluate(() => window.scrollY);

  const maximum = await inspector(page).evaluate((element) =>
    parseFloat(getComputedStyle(element).maxHeight),
  );
  const travel = Math.min(280, Math.max(75, (maximum - halfHeight) * 0.85));
  const intermediate = await swipeSheet(page, session, toggle, -travel);
  assert.ok(
    Math.abs(intermediate.height - halfHeight - travel) < 2,
    "sheet follows the finger 1:1",
  );
  await settled(page);
  assert.equal(
    await expanded(),
    "true",
    "drag up expands without a tap or double toggle",
  );
  const fullHeight = await height();
  assert.ok(fullHeight > halfHeight + 70);
  await page.screenshot({
    path: path.join(output, "mobile-drag-expanded.png"),
  });

  const reading = await swipeSheet(page, session, body, -150, {
    content: true,
    pause: 120,
  });
  assert.ok(Math.abs(reading.height - fullHeight) < 2);
  await page.waitForFunction(
    () => document.querySelector(".discover-inspector-body").scrollTop > 30,
  );
  assert.equal(
    await expanded(),
    "true",
    "upward reading scroll stays expanded",
  );
  const offset = await body.evaluate((element) => element.scrollTop);
  const returning = await swipeSheet(page, session, body, offset - 12, {
    content: true,
    duration: 75,
  });
  assert.ok(Math.abs(returning.height - fullHeight) < 2);
  await page.waitForFunction(
    () => document.querySelector(".discover-inspector-body").scrollTop <= 1,
  );
  await settled(page);
  assert.equal(
    await expanded(),
    "true",
    "reading momentum reaches the top without moving the sheet",
  );
  await swipeSheet(page, session, body, 260, { content: true });
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "downward drag starting at the top collapses",
  );

  await swipeSheet(page, session, body, -260, { content: true });
  await settled(page);
  assert.equal(
    await expanded(),
    "true",
    "upward drag on collapsed content expands first",
  );
  const evidence = body.locator(".discover-evidence-row details").first();
  await swipeSheet(page, session, toggle, 230, { cancel: true });
  await settled(page);
  assert.equal(
    await expanded(),
    "true",
    "a cancelled collapse keeps the committed expansion",
  );
  await evidence.locator("summary").click();
  assert.equal(
    await evidence.evaluate((element) => element.open),
    true,
    "the first evidence tap after a cancelled drag is not swallowed",
  );
  await evidence.locator("summary").click();
  assert.equal(await evidence.evaluate((element) => element.open), false);
  await body.evaluate((element) => {
    element.scrollTop = 120;
  });
  await swipeSheet(page, session, toggle, 280);
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "header can collapse at any content scroll position",
  );
  assert.ok(
    (await body.evaluate((element) => element.scrollTop)) > 0,
    "resizing preserves reading position",
  );

  await swipeSheet(page, session, toggle, -20, { pause: 120 });
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "short slow drags return to the original detent",
  );
  await swipeSheet(page, session, toggle, -100, { steps: 4, duration: 64 });
  await settled(page);
  assert.equal(
    await expanded(),
    "true",
    "a short upward flick uses release momentum to expand",
  );
  await swipeSheet(page, session, toggle, 100, { steps: 4, duration: 64 });
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "a short downward flick uses release momentum to collapse",
  );
  await swipeSheet(page, session, toggle, -280, { reverse: 50 });
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "recent reversal beats the direction of the earlier drag",
  );
  await swipeSheet(page, session, toggle, -230, { cancel: true });
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "cancelled touch returns to its committed detent",
  );

  await toggle.click({ force: true });
  // Grab during the slower part of the spring, so the native touch lands on
  // the moving 44px handle rather than a different surface between CDP calls.
  await page.waitForTimeout(150);
  assert.ok(
    await inspector(page).evaluate((element) => element.style.height),
    "expansion is still running before it is grabbed",
  );
  const grabbed = await swipeSheet(page, session, toggle, 220);
  assert.ok(
    grabbed.height >= halfHeight - 1 && grabbed.height <= fullHeight + 1,
  );
  await settled(page);
  assert.equal(
    await expanded(),
    "false",
    "a new drag reverses an unfinished expansion",
  );
  await toggle.click({ force: true });
  await page.waitForFunction(
    () => document.querySelector(".discover-inspector").style.height,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await frames(page, 2);
  assert.equal(
    await inspector(page).evaluate((element) => element.style.height),
    "",
    "live reduced motion cancels the height spring",
  );
  assert.equal(await expanded(), "true");
  await toggle.click({ force: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await frames(page, 2);

  await toggle.click({ force: true });
  await page.waitForFunction(
    () => document.querySelector(".discover-inspector").style.height,
  );
  await page.setViewportSize({ width: 390, height: 700 });
  await frames(page, 2);
  assert.equal(
    await inspector(page).evaluate((element) => element.style.height),
    "",
    "viewport resize clears transient height",
  );
  await assertFooter(page, "resized viewport retains usable actions");
  await page.setViewportSize({ width: 390, height: 844 });
  await toggle.focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await expanded(), "false");
  assert.equal(
    await page.evaluate(() => window.scrollY),
    beforeScroll,
    "gestures preserve shortlist position",
  );
  assert.equal(
    await inspector(page).evaluate((element) =>
      element.matches("dialog:modal"),
    ),
    true,
  );
  await page.screenshot({
    path: path.join(output, "mobile-drag-collapsed.png"),
  });
  report.checks.push({
    label:
      "native touch detents, 1:1 tracking, scrolling handoff, cancellation and interruption",
    passed: true,
  });
}

async function bookmarkRollback(page, readState, label, mobile) {
  const initialSaved = (await readState()).jobs.find(
    (job) => job.title === "Cloud Software Engineer",
  ).saved;
  const bookmark = (saved) =>
    page
      .locator(".discover-card")
      .filter({ has: cloud(page) })
      .getByRole("button", {
        name: `${saved ? "Unsave" : "Save"} Cloud Software Engineer`,
        exact: true,
      });
  if (!initialSaved) {
    await bookmark(false).click();
    await page.locator("#notice").filter({ hasText: "Role saved." }).waitFor();
    await cloud(page).waitFor({ state: "detached" });
  }
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await cloud(page).click();
  if (mobile) {
    await page.waitForURL((url) => url.searchParams.has("opportunity"));
    const details = new URL(page.url());
    details.searchParams.set("view", "all");
    await page.goto(details.href);
  }
  await heading(page, "Cloud Software Engineer").waitFor();
  await settled(page);
  const arrived = deferred();
  const released = deferred();
  const failSave = async (route) => {
    arrived.resolve(route);
    await released.promise;
  };
  await page.route("**/api/save-job", failSave);
  const toggle = inspector(page).getByRole("button", {
    name: "Unsave Cloud Software Engineer",
    exact: true,
  });
  await startProbe(
    page,
    `${label}: pending bookmark / failure`,
    ".discover-icon-button svg",
  );
  await toggle.click();
  const route = await arrived.promise;
  try {
    if (mobile) {
      const pending = inspector(page).getByRole("button", {
        name: "Save Cloud Software Engineer",
        exact: true,
      });
      assert.equal(
        await pending.getAttribute("aria-pressed"),
        "false",
        "the pending button exposes the optimistic semantic value",
      );
      assert.equal(
        await pending.isDisabled(),
        true,
        "duplicate pending saves are disabled",
      );
    } else {
      await cloud(page).waitFor({ state: "detached" });
    }
    await frames(page);
    const pending = await stopProbe(page);
    assert.equal(
      pending.animatedFrames,
      0,
      "a pending request has no completed-bookmark animation",
    );
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fictional delayed bookmark failure" }),
    });
  } finally {
    released.resolve();
    await page.unroute("**/api/save-job", failSave);
  }
  const error = (mobile ? inspector(page) : page)
    .getByRole("alert")
    .filter({ hasText: "Fictional delayed bookmark failure" })
    .first();
  await error.waitFor();
  await cloud(page).waitFor({ state: mobile ? "detached" : "visible" });
  assert.equal(
    (await readState()).jobs.find(
      (job) => job.title === "Cloud Software Engineer",
    ).saved,
    true,
    "failure rolls back the persisted value",
  );
  assert.equal(
    await (mobile ? toggle : bookmark(true)).getAttribute("aria-pressed"),
    "true",
    "failure rolls back aria-pressed",
  );
  await assertFocused(error, `${label}: the announced failure receives focus`);
  await page.screenshot({
    path: path.join(output, `${label}-bookmark-failure.png`),
  });
  const retry = (await inspector(page).count())
    ? inspector(page).getByRole("button", {
        name: "Unsave Cloud Software Engineer",
        exact: true,
      })
    : bookmark(true);
  await retry.click();
  await page
    .locator("#notice")
    .filter({ hasText: "Role removed from Saved." })
    .waitFor();
  assert.equal(
    (await readState()).jobs.find(
      (job) => job.title === "Cloud Software Engineer",
    ).saved,
    false,
    "retry persists the confirmed value",
  );
  assert.equal(
    await page
      .getByRole("alert")
      .filter({ hasText: "Fictional delayed bookmark failure" })
      .count(),
    0,
    "retry clears the old error",
  );
  if (await inspector(page).count()) {
    await close(page).click();
    await inspector(page).waitFor({ state: "detached" });
  }
  if (!mobile) {
    await page.getByRole("button", { name: "Browse", exact: true }).click();
    await cloud(page).waitFor();
  }
  assert.equal(await bookmark(false).getAttribute("aria-pressed"), "false");
  if (initialSaved) {
    await bookmark(false).click();
    await page.locator("#notice").filter({ hasText: "Role saved." }).waitFor();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await bookmark(true).waitFor();
  }
  await assertRestingLayout(page, `${label}: bookmark retry`);
}

async function reducedMotion(page, label, mobile) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await frames(page);
  await startProbe(page, `${label}: reduced before open`);
  await cloud(page).click();
  await heading(page, "Cloud Software Engineer").waitFor();
  if (mobile) {
    const toggle = inspector(page).locator(".discover-sheet-expand");
    await inspector(page)
      .getByRole("button", { name: "Overview", exact: true })
      .click();
    const collapsed = await inspector(page).boundingBox();
    await toggle.click();
    const expanded = await inspector(page).boundingBox();
    await toggle.click();
    const session = await page.context().newCDPSession(page);
    const travel = expanded.height - collapsed.height;
    assert.ok(travel > 60, "the overview has two reachable detents");
    for (const distance of [-travel * 0.75, travel * 0.7]) {
      await swipeSheet(page, session, toggle, distance);
      await frames(page, 2);
      assert.equal(
        await inspector(page).evaluate((element) => element.style.height),
        "",
        "reduced motion snaps immediately after a direct drag",
      );
      assert.equal(
        await toggle.getAttribute("aria-expanded"),
        String(distance < 0),
      );
    }
    await session.detach();
  }
  await navigation(page, "Next").click();
  await settled(page);
  assert.equal(
    (await stopProbe(page)).animatedFrames,
    0,
    `${label}: reduced motion prevents new inspector motion`,
  );
  await assertRestingLayout(page, `${label}: reduced motion`);
  await assertFooter(page, `${label}: reduced motion`);
  await page.screenshot({ path: path.join(output, `${label}-reduced.png`) });
  await close(page).click();
  await inspector(page).waitFor({ state: "detached" });

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await frames(page);
  await startProbe(page, `${label}: reduced preference changes mid-flight`);
  await cloud(page).click();
  await waitForMotion(page);
  await page.evaluate(() => {
    window.__motionCancellation = Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.target instanceof Element &&
            animation.effect.target.closest(".discover-inspector") &&
            (animation.pending || animation.playState === "running"),
        )
        .map((animation) =>
          animation.finished.then(
            () => "finished",
            () => "cancelled",
          ),
        ),
    );
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const cancellation = await page.evaluate(() => window.__motionCancellation);
  assert.ok(
    cancellation.length > 0 && cancellation.includes("cancelled"),
    `${label}: changing the preference cancels in-flight motion`,
  );
  await settled(page);
  await assertRestingLayout(page, `${label}: mid-flight preference change`);
  await assertFooter(page, `${label}: mid-flight preference change`);
  await stopProbe(page);
  await close(page).click();
  await inspector(page).waitFor({ state: "detached" });
}

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(
    base && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base),
    "TEST_URL must point to a loopback disposable fictional fixture",
  );
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const contexts = [];
  let activePage;
  try {
    const preflight = await browser.newContext();
    const readState = async () => {
      const response = await preflight.request.get(base + "/api/state");
      assert.equal(response.status(), 200);
      const state = (await response.json()).state;
      assert.equal(state._workspace.demo, true, "refuse a non-demo workspace");
      assert.match(
        state._workspace.path,
        /(?:^|\/)ea-concept-a-preview-[^/]+\/workspace$/,
        "refuse a personal or unknown fixture path",
      );
      assert.equal(
        state.identity.name,
        "Alex Morgan",
        "refuse a personal profile",
      );
      return state;
    };
    const state = await readState();
    report.fixture = { demo: true, identity: state.identity.name };
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
        viewport,
        hasTouch: label === "mobile",
        isMobile: label === "mobile",
        reducedMotion: "no-preference",
        recordVideo: { dir: path.join(output, "recordings"), size: viewport },
      });
      contexts.push(context);
      const errors = [];
      const external = [];
      const unexpectedWrites = [];
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
      page.setDefaultTimeout(8000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          url.pathname.startsWith("/api/") &&
          request.method() !== "GET" &&
          !["/api/rank", "/api/save-job", "/api/file"].includes(url.pathname)
        )
          unexpectedWrites.push(url.pathname);
      });
      await page.goto(base + "/discover/?view=all");
      await cloud(page).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      if (label === "desktop") await rapidDesktop(page);
      else await mobileSheet(page, await context.newCDPSession(page));
      await keyboardJourney(page, label);
      await selectionBack(page, base, state, label);
      await bookmarkRollback(page, readState, label, label === "mobile");
      await reducedMotion(page, label, label === "mobile");
      assert.deepEqual(errors, [], `${label}: no page errors`);
      assert.deepEqual(external, [], `${label}: no external network requests`);
      assert.deepEqual(
        unexpectedWrites,
        [],
        `${label}: only read operations and fictional bookmarks may run`,
      );
      const video = page.video();
      await context.close();
      contexts.pop();
      const videoPath = path.join(output, `${label}-normal-motion.webm`);
      await video.saveAs(videoPath);
      report.recordings.push(videoPath);
      activePage = undefined;
    }
    await preflight.close();
    report.passed = true;
    console.log(
      "PASS: actual-frame desktop/mobile motion, rapid interruption, keyboard/native-dialog focus, URL Back, delayed failure rollback/retry and dynamic reduced motion.",
    );
    console.log(JSON.stringify(report.measurements, null, 2));
  } catch (error) {
    report.passed = false;
    report.error = error.stack;
    if (activePage && !activePage.isClosed()) {
      report.interruptedProbe = await activePage
        .evaluate(() => window.__motionProbe)
        .catch(() => undefined);
      await activePage
        .screenshot({ path: path.join(output, "failure.png") })
        .catch(() => {});
    }
    throw error;
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
