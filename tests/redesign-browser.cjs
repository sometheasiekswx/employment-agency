// Production UI checks; run only through the disposable local fixture.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const { decideDialog } = require("./browser-dialog.cjs");
const fs = require("node:fs");
(async () => {
  const url = process.env.TEST_URL;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
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
    for (const width of [320, 768, 1024, 1440]) {
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
        const currentLink = page
          .getByRole("navigation", { name: "Workspace sections", exact: true })
          .locator('[aria-current="page"]');
        assert.equal(
          await currentLink.count(),
          1,
          "One current destination in the primary navigation",
        );
        assert.equal(await currentLink.getAttribute("href"), routePath);
        if (width <= 900 && routePath === "/search/") {
          const menuToggle = page.locator(".mobile-menu > summary");
          await menuToggle.click();
          const menu = page.getByRole("navigation", {
            name: "All workspace pages",
            exact: true,
          });
          assert.deepEqual(
            (await menu.getByRole("link").allTextContents()).map((text) =>
              text.trim(),
            ),
            [
              "Add opportunities",
              "Opportunities",
              "Career profile",
              "Search preferences",
              "History",
              "Settings",
            ],
            "All routes and the direct import shortcut remain available on phones",
          );
          assert.equal(
            await menu
              .getByRole("link", { name: "Add opportunities", exact: true })
              .getAttribute("href"),
            "/search/#add-opportunity",
          );
          const overflowCurrent = menu.locator('[aria-current="page"]');
          assert.equal(await overflowCurrent.count(), 1);
          assert.equal(await overflowCurrent.getAttribute("href"), routePath);
          assert.equal(
            await overflowCurrent.isVisible(),
            true,
            "The current overflow destination is visible",
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".mobile-menu").evaluate((node) => node.open),
            false,
          );
          await menuToggle.evaluate((node) => {
            if (document.activeElement !== node)
              throw new Error("Menu focus was not restored");
          });
        } else {
          assert.equal(
            await currentLink.isVisible(),
            true,
            "The current primary destination is visible",
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
        if (width === 1440)
          await page.screenshot({
            path: `output/playwright/redesign/${route === "/" ? "applications" : route.split("/")[1]}-desktop.png`,
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
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
      await page.locator(".brand-mark").getAttribute("src"),
      "/employment-mark.svg",
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
        .locator(".opportunities-workbench-header")
        .getByRole("button", removeRole)
        .count(),
      0,
      "Role removal stays away from the workbench's Close button",
    );
    await page
      .locator(".opportunities-role-actions")
      .getByRole("button", removeRole)
      .waitFor();
    assert.equal(
      await page.locator(".privacy-note, .workspace-footer").count(),
      0,
      "Repeated slogans stay removed",
    );
    await page.screenshot({ path: ".impeccable/review/desktop.png" });
    // The proximity spring must never shift a link's actual hit target.
    const link = page.getByRole("link", {
      name: "Career profile",
      exact: true,
    });
    const before = await link.boundingBox();
    await link.hover();
    await page.waitForTimeout(250);
    const after = await link.boundingBox();
    assert.deepEqual(after, before);
    assert.ok(
      (await link
        .locator(".dock-icon")
        .evaluate(
          (node) => new DOMMatrix(getComputedStyle(node).transform).a,
        )) > 1.02,
      "React Bits proximity spring responds to the pointer",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page
      .getByRole("heading", {
        name: "Software Engineer",
        exact: true,
        level: 2,
      })
      .waitFor();
    await link.hover();
    const icon = link.locator(".dock-icon");
    assert.equal(
      await icon.evaluate((node) => getComputedStyle(node).transform),
      "none",
    );
    await link.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("heading", { name: "Your details", exact: true })
      .waitFor();
    await page
      .getByLabel("Name", { exact: true })
      .fill("Unsaved synthetic draft");
    await decideDialog(
      page,
      () =>
        page.getByRole("link", { name: "Opportunities", exact: true }).click(),
      false,
    );
    assert.ok(
      page.url().endsWith("/career/"),
      "Draft guard cancelled navigation",
    );
    await decideDialog(
      page,
      () =>
        page.getByRole("link", { name: "Opportunities", exact: true }).click(),
      true,
    );
    await page
      .getByRole("heading", {
        name: "Software Engineer",
        exact: true,
        level: 3,
      })
      .waitFor();
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
    const dock = await page.locator(".dock-panel").boundingBox();
    assert.ok(
      dock.y > 700 && dock.y + dock.height <= 900,
      "Mobile dock belongs at viewport bottom",
    );
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
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".rail-context").waitFor();
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
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
    assert.deepEqual(errors, []);
    console.log(
      "PASS: six workspace views at four widths, dark brand tokens, WCAG axe checks, stable navigation targets, mobile overflow navigation, reduced motion, keyboard/draft guard, mobile dock and 200% text.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
