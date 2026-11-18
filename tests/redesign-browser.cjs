// Production UI checks; run only through the disposable local fixture.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const { checkGooeyBurst, installGooeyTrace } = require("./gooey-nav-trace.cjs");
const { decideDialog } = require("./browser-dialog.cjs");
const fs = require("node:fs");

const primaryNavigation = (page) =>
  page.getByRole("navigation", { name: "Workspace sections", exact: true });
const primaryLink = (page, name) =>
  primaryNavigation(page).getByRole("link", { name, exact: true });
const currentLink = (navigation) =>
  navigation.getByRole("link").and(navigation.locator('[aria-current="page"]'));
const primaryBounds = (page) =>
  primaryNavigation(page)
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().toJSON()),
    );
const opportunityViews = (page) =>
  page.getByRole("group", { name: "Opportunity views", exact: true });
const workspaceOptions = (page) => page.getByLabel(/workspace options/i);
const animating = (group, page) =>
  group.and(page.locator("[data-gooey-animating]"));

async function assertStaticSelection(group, selected) {
  await selected.waitFor();
  assert.equal(await group.getAttribute("data-gooey-animating"), null);
  assert.equal(await group.getAttribute("data-gooey-rendering"), null);
  const area = await selected.evaluate((node) => {
    const selection = node.querySelector("[data-gooey-anchor]") ?? node;
    const style = getComputedStyle(selection);
    return [style.backgroundColor, style.outlineStyle];
  });
  assert.ok(
    area[0] !== "rgba(0, 0, 0, 0)" || area[1] === "solid",
    "The static selection has a visible fill or outline",
  );
}

async function checkCompactNavigation(page, width) {
  const header = await page.locator(".workspace-header").boundingBox();
  const navigation = await primaryNavigation(page).boundingBox();
  const viewportWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  assert.ok(
    navigation.x >= 0 && navigation.x + navigation.width <= viewportWidth,
    `Primary navigation remains within ${width}px`,
  );
  assert.ok(
    navigation.y >= header.y &&
      navigation.y + navigation.height <= header.y + header.height + 1 &&
      header.y < 10 &&
      header.height <= 156,
    `Navigation remains inside the masthead at ${width}px`,
  );
  const links = await primaryBounds(page);
  assert.equal(links.length, 5);
  for (const target of links) {
    assert.ok(
      target.width >= 44 &&
        target.height >= 44 &&
        target.left >= 0 &&
        target.right <= viewportWidth,
      `Touch target at ${width}px`,
    );
  }
}

async function checkViewSpacing(page, width) {
  const buttons = await opportunityViews(page)
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
  assert.equal(buttons.length, 3);
  for (const [index, button] of buttons.entries()) {
    assert.ok(
      button.width >= 44 && button.height >= 44,
      `Opportunity view touch target at ${width}px`,
    );
    if (index === 0) continue;
    const previous = buttons[index - 1];
    assert.ok(
      Math.abs(button.y - previous.y) <= 1,
      `Opportunity views share one row at ${width}px`,
    );
    assert.ok(
      button.x - previous.right >= -1 && button.x - previous.right <= 24,
      `Opportunity views remain adjacent without overlap at ${width}px`,
    );
  }
}

async function checkResizePaint(page) {
  const layer = primaryNavigation(page).locator(".gooey-selection");
  const rightBleed = "--gooey-right-bleed";
  const desktopBleed = await layer.evaluate(
    (node, property) => node.style.getPropertyValue(property),
    rightBleed,
  );
  assert.ok(
    parseFloat(desktopBleed) > 20,
    "Desktop canvas has room to paint beyond the phone gutter",
  );
  await page.setViewportSize({ width: 320, height: 1000 });
  const overflow = await layer.evaluate(
    (node, { property, desktop }) => {
      const measured = node.style.getPropertyValue(property);
      // Hold the desktop measurement for one read to cover the gap before the resize observer runs.
      node.style.setProperty(property, desktop);
      const overflow = document.documentElement.scrollWidth - innerWidth;
      node.style.setProperty(property, measured);
      return overflow;
    },
    { property: rightBleed, desktop: desktopBleed },
  );
  assert.equal(
    overflow,
    0,
    "Desktop canvas measurements cannot make the phone masthead overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}

(async () => {
  const url = process.env.TEST_URL;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(new URL(url).port, "8766", "Never use the private workspace");
  const browser =
    process.env.BROWSER_ENGINE === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          channel: process.env.BROWSER_CHANNEL || "chrome",
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    await page.addInitScript(installGooeyTrace);
    await page.clock.install();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const initial = await (await page.request.get(url + "/api/state")).json();
    assert.ok(
      initial.state._workspace.path.includes(
        "employment-agency-folder-browser-",
      ),
      "Refuse a real workspace",
    );
    const token = initial.token;
    async function action(operation, body) {
      const response = await page.request.post(url + "/api/" + operation, {
        data: body,
        headers: { Origin: url, "X-Workspace-Token": token },
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    }
    await action("workspace-settings", { setup_complete: true });
    await action("identity", {
      name: "Alex Morgan",
      email: "alex@example.test",
    });
    const fact = await action("fact", {
      text: "Built reliable Python APIs and integration tests.",
      category: "experience",
    });
    await action("confirm", { id: fact.id });
    const profile = await action("profile", {
      name: "Engineering",
      roles: ["Engineer"],
      locations: ["Toronto"],
      hard: ["roles", "locations"],
      include_unknown: true,
      include_stretch: true,
    });
    const job = await action("job", {
      title: "Software Engineer",
      employer: "Fictional Systems",
      location: "Toronto",
      description: "Build Python APIs",
      requirements: ["Python APIs"],
    });
    const application = await action("local-package", {
      profile_id: profile.id,
      job_id: job.id,
    });
    fs.mkdirSync("output/playwright/redesign", { recursive: true });
    fs.mkdirSync(".impeccable/review", { recursive: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [route, title] of [
        ["/discover/?view=all", "Opportunities"],
        ["/discover/?view=applications", "Opportunities"],
        ["/career/", "Career profile"],
        ["/search/", "Search preferences"],
        ["/history/", "History"],
        ["/settings/", "Settings"],
      ]) {
        await page.goto(url + route);
        const heading = page.getByRole("heading", {
          name: title,
          exact: true,
          level: 1,
        });
        await heading.waitFor();
        assert.ok(
          (await heading.boundingBox()).height >= 20,
          `${route} has a visible page title at ${width}px`,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${route} overflow at ${width}`,
        );
        const routePath = new URL(url + route).pathname;
        const primary = primaryNavigation(page);
        const current = currentLink(primary);
        assert.equal(await primary.getByRole("link").count(), 5);
        if (width <= 900 && route === "/discover/?view=all") {
          await checkCompactNavigation(page, width);
        }
        assert.equal(await current.count(), 1, "One current workspace link");
        assert.equal(await current.getAttribute("href"), routePath);
        if (routePath === "/discover/") {
          await checkViewSpacing(page, width);
          if (width <= 390) {
            const add = page.getByRole("link", {
              name: "Add opportunities",
              exact: true,
            });
            const hitArea = await add.boundingBox();
            assert.ok(
              hitArea.width >= 44 && hitArea.height >= 44,
              `Direct import target at ${width}px`,
            );
            assert.equal(
              await add.getAttribute("href"),
              "/search/#add-opportunity",
            );
          }
        }
        if (width <= 900 && routePath === "/search/") {
          const options = workspaceOptions(page);
          const header = page.locator(".workspace-header");
          const add = header.getByRole("link", {
            name: "Add opportunities",
            exact: true,
          });
          await options.press("Enter");
          await add.waitFor();
          assert.equal(
            await add.getAttribute("href"),
            "/search/#add-opportunity",
          );
          assert.equal(await current.getAttribute("href"), routePath);
          await add.focus();
          await page.keyboard.press("Escape");
          await add.waitFor({ state: "hidden" });
          assert.ok(
            await options.evaluate((node) => document.activeElement === node),
          );
        }
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
          `${route} accessibility at ${width}`,
        );
        if (width === 1440) {
          const name = route.includes("view=applications")
            ? "applications"
            : routePath.split("/")[1];
          await page.screenshot({
            path: `output/playwright/redesign/${name}-desktop.png`,
          });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const hasWebGL = await page.evaluate(() =>
      Boolean(document.createElement("canvas").getContext("webgl2")),
    );
    if (process.env.BROWSER_ENGINE !== "webkit")
      assert.ok(hasWebGL, "Chromium must exercise the WebGL2 transition");
    if (hasWebGL) {
      await primaryNavigation(page)
        .and(page.locator("[data-gooey-rendering]"))
        .waitFor();
      await checkResizePaint(page);
    }
    await page.goto(
      `${url}/discover/?view=applications&section=active&application=${application.id}&panel=activity`,
    );
    await page
      .getByRole("heading", {
        name: "Software Engineer",
        exact: true,
        level: 2,
      })
      .waitFor();
    assert.equal(
      await page
        .locator(".workspace-header")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(23, 24, 25)",
    );
    assert.equal(
      await page
        .locator("body")
        .evaluate((node) => getComputedStyle(node).backgroundColor),
      "rgb(30, 31, 33)",
    );
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim(),
      ),
      "#c994f3",
    );
    assert.match(
      await page
        .locator("body")
        .evaluate((node) => getComputedStyle(node).fontFamily),
      /Inter/,
    );
    assert.equal(
      await page.locator(".review-pane button[value=reviewed]").count(),
      0,
      "Reviewed action moved into the status tag",
    );
    await page
      .getByRole("button", { name: "Draft — switch to Reviewed", exact: true })
      .waitFor();
    const tokenColour = async (token) =>
      page.evaluate((token) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, token);
    const confirmationColors = await page
      .locator(".review-pane .record-submission")
      .evaluate((button) => {
        const style = getComputedStyle(button);
        return [style.backgroundColor, style.color];
      });
    assert.deepEqual(confirmationColors, [
      await tokenColour("--confirm-bg"),
      await tokenColour("--confirm-ink"),
    ]);
    const luminance = (color) => {
      const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
      assert.ok(rgb, `Expected an opaque RGB color: ${color}`);
      const [red, green, blue] = rgb.slice(1).map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const [background, foreground] = confirmationColors.map(luminance);
    assert.ok(
      (background + 0.05) / (foreground + 0.05) >= 4.5,
      "Dark appearance uses readable dark text on the confirmation fill",
    );
    assert.equal(
      await page.getByRole("button", { name: "Reject", exact: true }).count(),
      0,
      "Removal replaces the separate rejection action",
    );
    const removeRole = { name: "Remove Software Engineer", exact: true };
    assert.equal(
      await page
        .locator(".discover-inspector-toolbar")
        .getByRole("button", removeRole)
        .count(),
      0,
      "Role removal stays away from the workbench's Close button",
    );
    await page
      .locator(".discover-inspector-footer")
      .getByRole("button", removeRole)
      .waitFor();
    await page.screenshot({ path: ".impeccable/review/desktop.png" });
    const navigation = primaryNavigation(page);
    const activeRoutes = animating(navigation, page);
    const views = opportunityViews(page);
    const activeViews = animating(views, page);
    const career = primaryLink(page, "Career profile");
    const opportunities = primaryLink(page, "Opportunities");
    const history = primaryLink(page, "History");
    assert.equal(
      await activeRoutes.count(),
      0,
      "Direct route load starts at rest",
    );
    assert.equal(
      await activeViews.count(),
      0,
      "Direct view load starts at rest",
    );
    let departingView;
    if (hasWebGL) {
      await views.and(page.locator("[data-gooey-rendering]")).waitFor();
      departingView = await views
        .locator(".gooey-selection-canvas")
        .evaluateHandle((canvas) => {
          const context = canvas.getContext("webgl2");
          const releaseSupported = Boolean(
            context?.getExtension("WEBGL_lose_context"),
          );
          return { canvas, context, releaseSupported };
        });
    }
    const before = await primaryBounds(page);
    await career.hover();
    assert.deepEqual(
      await primaryBounds(page),
      before,
      "Hover keeps the same hit targets",
    );

    const pickCareer = async (activate) => {
      await activate();
      await page.waitForURL(url + "/career/");
      await career.and(currentLink(navigation)).waitFor();
      if (hasWebGL) await activeRoutes.waitFor({ state: "attached" });
      assert.deepEqual(
        await primaryBounds(page),
        before,
        "Route selection keeps the same hit targets",
      );
    };
    if (hasWebGL) {
      const measurements = await checkGooeyBurst(page, {
        canvasSelector: ".workspace-header .gooey-selection-canvas",
        from: opportunities,
        to: career,
        select: () => pickCareer(() => career.evaluate((link) => link.click())),
        settled: () => activeRoutes.waitFor({ state: "detached" }),
      });
      console.log("Workspace navigation Classic measurements", measurements);
    } else {
      await pickCareer(() => career.click());
      assert.equal(await activeRoutes.count(), 0);
    }
    assert.deepEqual(
      await primaryBounds(page),
      before,
      "Settling keeps the same hit targets",
    );
    if (departingView) {
      const releaseSupported = await departingView.evaluate(
        ({ releaseSupported }) => releaseSupported,
      );
      if (process.env.BROWSER_ENGINE !== "webkit") assert.ok(releaseSupported);
      if (releaseSupported) {
        await page.waitForFunction(
          ({ canvas, context }) =>
            !canvas.isConnected && context.isContextLost(),
          departingView,
        );
      }
      await departingView.dispose();
    }

    await history.click();
    await page.waitForURL(url + "/history/");
    if (hasWebGL) await activeRoutes.waitFor({ state: "attached" });
    await opportunities.click();
    await page.waitForURL(url + "/discover/");
    await activeRoutes.waitFor({ state: "detached" });
    if (hasWebGL) {
      await navigation.and(page.locator("[data-gooey-rendering]")).waitFor();
      await views.and(page.locator("[data-gooey-rendering]")).waitFor();
    }
    assert.equal(
      await currentLink(navigation).getAttribute("href"),
      "/discover/",
    );

    const all = views.getByRole("button", { name: "Jobs", exact: true });
    const toApply = views.getByRole("button", {
      name: "To apply",
      exact: true,
    });
    const applications = views.getByRole("button", {
      name: "Applications",
      exact: true,
    });
    const pickView = async (activate) => {
      await activate();
      await page.waitForURL(
        (url) => url.searchParams.get("view") === "to-apply",
      );
      await views
        .getByRole("button", { name: "To apply", exact: true, pressed: true })
        .waitFor();
      if (hasWebGL) await activeViews.waitFor({ state: "attached" });
    };
    if (hasWebGL) {
      const measurements = await checkGooeyBurst(page, {
        canvasSelector: ".discover-views .gooey-selection-canvas",
        from: all,
        to: toApply,
        select: () =>
          pickView(() => toApply.evaluate((button) => button.click())),
        settled: () => activeViews.waitFor({ state: "detached" }),
      });
      console.log("Opportunity views Classic measurements", measurements);
    } else {
      await pickView(() => toApply.press("Enter"));
      assert.equal(await activeViews.count(), 0);
    }

    await all.click();
    if (hasWebGL) await activeViews.waitFor({ state: "attached" });
    await page.setViewportSize({ width: 390, height: 844 });
    await activeViews.waitFor({ state: "detached" });
    await views
      .getByRole("button", { name: "Jobs", exact: true, pressed: true })
      .waitFor();
    await checkViewSpacing(page, 390);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await applications.click();
    await page.waitForURL(
      (url) => url.searchParams.get("view") === "applications",
    );
    if (hasWebGL) await activeViews.waitFor({ state: "attached" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await activeViews.waitFor({ state: "detached" });
    await assertStaticSelection(
      views,
      views.getByRole("button", {
        name: "Applications",
        exact: true,
        pressed: true,
      }),
    );
    await toApply.press("Space");
    await views
      .getByRole("button", { name: "To apply", exact: true, pressed: true })
      .waitFor();
    assert.equal(
      await activeViews.count(),
      0,
      "Reduced motion skips new view animations",
    );

    await career.press("Enter");
    await page
      .getByRole("heading", { name: "Your details", exact: true })
      .waitFor();
    await assertStaticSelection(navigation, currentLink(navigation));
    assert.equal(
      await currentLink(navigation).getAttribute("href"),
      "/career/",
    );
    await page
      .getByLabel("Name", { exact: true })
      .fill("Unsaved synthetic draft");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const popupPromise = context.waitForEvent("page");
    await opportunities.click({ modifiers: [modifier] });
    const popup = await popupPromise;
    await popup.waitForURL(url + "/discover/");
    await popup.close();
    assert.equal(
      await currentLink(navigation).getAttribute("href"),
      "/career/",
    );
    assert.equal(
      await activeRoutes.count(),
      0,
      "Opening a route in another tab leaves selection still",
    );
    await decideDialog(page, () => opportunities.click(), false);
    assert.ok(
      page.url().endsWith("/career/"),
      "Draft guard cancelled navigation",
    );
    assert.equal(
      await activeRoutes.count(),
      0,
      "Cancelled navigation keeps the indicator still",
    );
    assert.equal(
      await currentLink(navigation).getAttribute("href"),
      "/career/",
    );
    await decideDialog(page, () => opportunities.click(), true);
    await page
      .getByRole("heading", {
        name: "Software Engineer",
        exact: true,
        level: 3,
      })
      .waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Software Engineer",
        exact: true,
        level: 3,
      })
      .waitFor();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.screenshot({ path: ".impeccable/review/mobile.png" });
    await page.setViewportSize({ width: 320, height: 900 });
    await checkCompactNavigation(page, 320);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((n) => n.getBoundingClientRect().right > innerWidth + 1)
        .map((n) => ({
          tag: n.tagName,
          cls: n.className,
          width: n.getBoundingClientRect().width,
          right: n.getBoundingClientRect().right,
        })),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "200% text overflow: " + JSON.stringify(overflow),
    );
    await primaryLink(page, "Settings").focus();
    const mobileSettings = await primaryLink(page, "Settings").boundingBox();
    assert.ok(
      mobileSettings.x >= 0 && mobileSettings.x + mobileSettings.width <= 320,
    );
    assert.ok(
      await primaryLink(page, "Settings").evaluate((link) =>
        link.matches(":focus-visible"),
      ),
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".rail-context").waitFor();
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    const disclosure = page.locator(".rail-context summary");
    await disclosure.focus();
    await page.keyboard.press("Enter");
    assert.ok(
      await page
        .locator(".rail-context details")
        .evaluate((details) => details.open),
    );
    const collisions = await page
      .locator(".rail-context dl > div")
      .evaluateAll((rows) =>
        rows
          .filter((row) => {
            const term = row.querySelector("dt").getBoundingClientRect();
            const value = row.querySelector("dd").getBoundingClientRect();
            return (
              term.left < value.right &&
              value.left < term.right &&
              term.top < value.bottom &&
              value.top < term.bottom
            );
          })
          .map((row) => row.textContent),
      );
    assert.equal(
      await page.locator(".rail-context dl > div:visible").count(),
      4,
    );
    assert.deepEqual(
      collisions,
      [],
      "Enlarged sidebar labels and values must not collide",
    );
    const rail = page.locator(".workspace-header");
    await rail.getByRole("link", { name: "Settings", exact: true }).focus();
    const settingsBox = await rail
      .getByRole("link", { name: "Settings", exact: true })
      .boundingBox();
    assert.ok(
      settingsBox.y >= 0 && settingsBox.y + settingsBox.height <= 900,
      "All rail destinations remain reachable by keyboard with enlarged text",
    );
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page
      .getByRole("button", {
        name: "Color theme: Dark. Switch to Light",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "light",
    );
    const lightResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      lightResults.violations.map(({ id, nodes }) => [
        id,
        nodes.map((node) => node.target),
      ]),
      [],
      "Light desktop accessibility",
    );
    if (process.env.BROWSER_ENGINE !== "webkit") {
      await page.emulateMedia({
        reducedMotion: "no-preference",
        forcedColors: "active",
      });
      await history.click();
      await page.waitForURL(url + "/history/");
      await assertStaticSelection(
        navigation,
        history.and(currentLink(navigation)),
      );
    }

    const fallback = await browser.newContext();
    await fallback.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return kind === "webgl2"
          ? null
          : getContext.call(this, kind, ...options);
      };
    });
    const fallbackPage = await fallback.newPage();
    await fallbackPage.goto(url + "/career/");
    const fallbackNav = primaryNavigation(fallbackPage);
    const fallbackHistory = primaryLink(fallbackPage, "History");
    await fallbackHistory.click();
    await fallbackPage.waitForURL(url + "/history/");
    await assertStaticSelection(
      fallbackNav,
      fallbackHistory.and(currentLink(fallbackNav)),
    );
    await primaryLink(fallbackPage, "Opportunities").click();
    const fallbackViews = opportunityViews(fallbackPage);
    await fallbackViews
      .getByRole("button", { name: "To apply", exact: true })
      .click();
    await assertStaticSelection(
      fallbackViews,
      fallbackViews.getByRole("button", {
        name: "To apply",
        exact: true,
        pressed: true,
      }),
    );
    await fallback.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: six workspace views at five widths, dark brand tokens, WCAG axe checks, Classic GooeyNav, stable masthead and tabs, workspace options, reduced motion, modified links, keyboard/draft guard and 200% text.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
