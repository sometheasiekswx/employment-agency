const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
const output = "output/playwright/desktop-role-details";
const stage = process.env.REPRODUCE_BASELINE ? "before" : "after";
const engine = process.env.BROWSER_ENGINE || "chromium";
const title =
  "Senior Cloud Platform Engineering Lead for Distributed Infrastructure, Resilience and Developer Productivity";
const removedTitle =
  "Distinguished Principal Platform Engineer for Developer Enablement, Identity and Infrastructure Modernisation";
const employer =
  "Fictional Consortium for Interoperable Infrastructure and Distributed Computing Research";
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 640 },
];

(async () => {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "webkit"
      ? {}
      : { channel: process.env.BROWSER_CHANNEL || "chrome" },
  );
  try {
    const setup = await browser.newContext();
    const { state, token } = await (
      await setup.request.get(base + "/api/state")
    ).json();
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");
    assert.match(
      state._workspace.path,
      /ea-concept-a-preview-[^/]+\/workspace$/,
    );
    const action = async (name, data) => {
      const response = await setup.request.post(base + "/api/" + name, {
        headers: { Origin: base, "X-Workspace-Token": token },
        data,
      });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    const seed = async (title) => {
      const job = await action("job", {
        title,
        employer,
        location: "Singapore",
        description:
          "Design reliable distributed services and clear operational processes. ".repeat(
            20,
          ),
        requirements: ["Python", "Cloud infrastructure"],
      });
      await action("save-job", { id: job.id, saved: true });
      return job;
    };
    await seed(title);
    const removed = await seed(removedTitle);
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === base
          ? route.continue()
          : route.abort(),
      );
      await page.goto(base + "/discover/?view=to-apply");
      const inspect = (name) =>
        page.getByRole("button", {
          name: `Assess ${name} at ${employer}`,
          exact: true,
        });
      const inspector = page.locator(".discover-inspector");
      const notice = page.locator(".removal-feedback-notice");
      const capture = async (label) => {
        const stem = `${stage}-${engine}-${viewport.width}x${viewport.height}-${label}`;
        const result = await page.evaluate(() => {
          const rect = ({ x, y, width, height }) => ({ x, y, width, height });
          const get = (selector) => {
            const element = document.querySelector(selector);
            return (
              element && {
                ...rect(element.getBoundingClientRect()),
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                containsHeading: Boolean(
                  element.querySelector(".role-workspace-heading"),
                ),
              }
            );
          };
          return {
            pageScroll: scrollY,
            panel: get(".discover-inspector"),
            body: get(".discover-inspector-body"),
            controls: get(".discover-toolbar"),
            footer: get(".discover-inspector-footer"),
            board: get(".discover-board"),
            notice: get(".removal-feedback-notice"),
            actions: [
              ...document.querySelectorAll(".discover-inspector-actions > *"),
            ].map((element) => {
              const text = [...element.childNodes].find(
                (node) =>
                  node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
              );
              const range = document.createRange();
              if (text) range.selectNodeContents(text);
              return {
                ...rect(element.getBoundingClientRect()),
                text: element.textContent.trim(),
                label: element.getAttribute("aria-label"),
                textLines: text ? range.getClientRects().length : 0,
              };
            }),
          };
        });
        await page.screenshot({ path: `${output}/${stem}.png` });
        results.push({ stem, ...result });
        console.log(stem, JSON.stringify(result));
        return result;
      };
      const assertDesktop = (geometry) => {
        assert.equal(geometry.pageScroll, 0);
        assert.ok(geometry.panel.y < 160, "Details begin near the top");
        assert.ok(
          geometry.panel.y + geometry.panel.height <= viewport.height,
          "Pane fits initially",
        );
        assert.ok(
          geometry.footer.y + geometry.footer.height <= viewport.height,
          "Pinned footer fits initially",
        );
        assert.ok(
          geometry.body.height >= viewport.height / 2,
          "Reading region has a useful height",
        );
        assert.ok(geometry.body.scrollHeight > geometry.body.clientHeight);
        assert.equal(
          geometry.body.containsHeading,
          true,
          "Heading and details share the scroll container",
        );
        for (const item of [
          geometry.controls,
          geometry.board,
          geometry.notice,
        ].filter(Boolean))
          assert.ok(
            item.x + item.width <= geometry.panel.x,
            "List, controls and feedback have their own column",
          );
        assert.equal(
          geometry.actions[0].textLines,
          1,
          "Prepare application stays on one line at default text size",
        );
        assert.equal(geometry.actions[1].text, "To apply");
        assert.equal(geometry.actions[1].label, "Remove from To apply");
        assert.ok(
          geometry.actions.every(
            (action) => action.y === geometry.actions[0].y,
          ),
          "All actions occupy the same row",
        );
      };
      await inspect(title).click();
      await inspector
        .getByRole("button", { name: "Remove from To apply", exact: true })
        .waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));
      const opened = await capture("opened");
      if (stage === "after") assertDesktop(opened);

      const current = await inspect(removedTitle).count();
      if (current) {
        await inspect(removedTitle).click();
      } else {
        await inspector
          .getByRole("button", { name: "Next opportunity" })
          .click();
        await inspector
          .getByRole("heading", { name: removedTitle, exact: true })
          .waitFor();
      }
      await inspector
        .getByRole("button", { name: `Remove ${removedTitle}`, exact: true })
        .click();
      await notice.getByRole("button", { name: "Undo", exact: true }).waitFor();
      await page.mouse.move(1, 1);
      await page.evaluate(() => {
        document.activeElement instanceof HTMLElement &&
          document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      const withNotice = await capture("removed");
      if (stage === "after") {
        assertDesktop(withNotice);
        assert.equal(withNotice.body.height, opened.body.height);
      }
      await new Promise((resolve) => setTimeout(resolve, 8400));
      if (stage === "before") {
        assert.equal(await notice.count(), 1);
      } else {
        assert.equal(await notice.count(), 0);
      }
      const expired = await capture("after-eight-seconds");
      if (stage === "after") {
        assertDesktop(expired);
        await page
          .getByRole("button", { name: "Close opportunity details" })
          .click();
        await page
          .getByRole("group", { name: "Opportunity views" })
          .getByRole("button", { name: "Jobs", exact: true })
          .click();
        await page.getByRole("button", { name: /^Removed \(\d+\)$/ }).click();
        await inspect(removedTitle).waitFor();
        await page
          .getByRole("button", {
            name: `Add removal reason for ${removedTitle}`,
          })
          .click();
        await page
          .getByRole("textbox", { name: "Removal reason (optional)" })
          .fill("Reason recorded after the notice expired.");
        await page
          .getByRole("button", { name: "Save reason", exact: true })
          .click();
        await page
          .getByText("Reason: Reason recorded after the notice expired.", {
            exact: true,
          })
          .waitFor();
        await inspect(removedTitle).click();
        await inspector
          .getByRole("button", { name: `Restore ${removedTitle}`, exact: true })
          .waitFor();
      }
      assert.deepEqual(errors, []);
      await context.close();
      const fresh = (
        await (await setup.request.get(base + "/api/state")).json()
      ).state;
      const event = fresh.jobs
        .find((job) => job.id === removed.id)
        .removals.at(-1);
      await action("restore-job", { id: removed.id, removal_id: event.id });
    }
    if (stage === "after") {
      const context = await browser.newContext({
        viewport: { width: 1024, height: 640 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const panel = page.locator(".discover-inspector");
      const geometry = () =>
        panel.evaluate((element) => {
          const body = element.querySelector(".discover-inspector-body");
          return {
            y: element.getBoundingClientRect().top,
            bottom: element.getBoundingClientRect().bottom,
            footer: element.querySelector("footer").getBoundingClientRect()
              .bottom,
            body: body.getBoundingClientRect().height,
            width: body.clientWidth,
            scrollingWidth: body.scrollWidth,
            viewportHeight: innerHeight,
            pageScroll: scrollY,
          };
        });
      const assertVisible = (bounds) => {
        assert.equal(bounds.pageScroll, 0);
        assert.ok(bounds.y < 170 && bounds.bottom <= bounds.viewportHeight);
        assert.ok(bounds.footer <= bounds.viewportHeight && bounds.body > 200);
        assert.ok(bounds.scrollingWidth <= bounds.width + 1);
      };
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: async () => {} },
        });
      });
      await page.goto(
        base + "/discover/?view=to-apply&q=Senior+Cloud+Platform",
      );
      await page
        .getByRole("button", {
          name: `Assess ${title} at ${employer}`,
          exact: true,
        })
        .click();
      assert.equal(await page.locator(".discover-card").count(), 1);
      await page.evaluate(() => scrollTo(0, 0));
      const original = await geometry();
      assertVisible(original);

      await page.getByRole("button", { name: "Copy job reference" }).click();
      const notice = page.locator(".notification-card:not([inert])").filter({ hasText: "Job reference copied." });
      await notice.waitFor();
      const afterNotice = await geometry();
      assert.deepEqual(afterNotice, original, "Floating feedback preserves pane position and size");
      await notice.getByRole("button", { name: "Dismiss notification" }).click();
      await notice.waitFor({ state: "detached" });
      assertVisible(afterNotice);
      await page.setViewportSize({ width: 1024, height: 580 });
      await page.waitForFunction(
        () =>
          document.querySelector(".discover-inspector").getBoundingClientRect()
            .bottom <=
          innerHeight - 15,
      );
      const afterResize = await geometry();
      assert.ok(
        afterResize.body < afterNotice.body,
        "Pane adapts to viewport resizing",
      );
      assertVisible(afterResize);

      await page.setViewportSize({ width: 1024, height: 640 });
      await panel.evaluate((element) => {
        const descendants = [...element.querySelectorAll("*")];
        const sizes = descendants.map((descendant) =>
          parseFloat(getComputedStyle(descendant).fontSize),
        );
        descendants.forEach((descendant, index) => {
          if (descendant instanceof HTMLElement)
            descendant.style.fontSize = `${sizes[index] * 2}px`;
        });
      });
      assertVisible(await geometry());
      await page.screenshot({
        path: `${output}/after-${engine}-1024x640-doubled-text.png`,
      });

      await page.goto(base + "/discover/?view=applications");
      await page
        .getByRole("button", {
          name: "Assess Cloud Software Engineer at Emberlane Systems",
          exact: true,
        })
        .click();
      await panel
        .getByRole("button", { name: "Overview", exact: true })
        .click();
      await page.waitForURL(
        (url) => url.searchParams.get("panel") === "overview",
      );
      await panel.getByRole("button", { name: "CV", exact: true }).click();
      await page.waitForURL(
        (url) => url.searchParams.get("panel") === "documents",
      );
      await page.evaluate(() => scrollTo(0, 0));
      assertVisible(await geometry());
      await context.close();
      console.log(
        "PASS: one-role view, floating feedback geometry, viewport resize, 200% pane text, and wide CV panel.",
      );
    }
    fs.writeFileSync(
      `${output}/${stage}-${engine}-geometry.json`,
      JSON.stringify(results, null, 2) + "\n",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
