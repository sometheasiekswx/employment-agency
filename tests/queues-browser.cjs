// Production frontend acceptance with preserved fictional application versions.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  roleCard,
  removalControl,
  selectApplication,
  workbench,
} = require("./browser-applications.cjs");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.TEST_URL;
    assert.ok(base, "Use the disposable queue fixture");
    const read = async () =>
      await (await page.request.get(base + "/api/state")).json();
    const initial = await read();
    const root = initial.state._workspace.path;
    assert.match(root, /employment-agency-queue-fixture-/);
    const fixture = JSON.parse(
      fs.readFileSync(path.join(root, "queue-fixture.json")),
    );
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
    const originalHash = hash();
    fs.mkdirSync("output/playwright/queues", { recursive: true });
    const card = (app) => page.locator(`[data-application-id="${app.id}"]`);
    const tab = (name, count) =>
      page
        .getByRole("group", { name: "Application stage" })
        .getByRole("button", { name: `${name} ${count}`, exact: true });
    const role = (app) => roleCard(page, app);
    await page.goto(base + "/discover/?view=applications&section=active");
    await tab("Active", 3).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 3);
    assert.equal(await role(fixture.sent).count(), 0);
    assert.equal(await role(fixture.legacy_sent).count(), 0);
    assert.equal(await role(fixture.active).count(), 1);
    assert.equal(await role(fixture.reopened).count(), 1);
    assert.equal(
      await role(fixture.separate).count(),
      1,
      "identical title/employer in a different requisition stays distinct",
    );
    assert.deepEqual(
      await page
        .locator(".discover-filters select[aria-label='Location'] option")
        .allTextContents(),
      ["All locations", "Montreal", "Toronto"],
    );
    await page.screenshot({ path: "output/playwright/queues/active.png" });
    await page.locator(".discover-filters summary").click();
    await page
      .getByRole("combobox", { name: "Location", exact: true })
      .selectOption("Toronto");
    await page.locator(".discover-filters summary").click();
    await page.getByText("2 roles · 1 location", { exact: true }).waitFor();
    await tab("Submitted", 1).click();
    await selectApplication(page, fixture.sent);
    await card(fixture.sent).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 1);
    assert.equal(
      await card(fixture.sent).locator(".pill").innerText(),
      "submitted",
    );
    assert.equal(
      await card(fixture.sent)
        .getByRole("button", { name: "Apply For Me", exact: true })
        .count(),
      0,
    );
    await page.screenshot({ path: "output/playwright/queues/submitted.png" });
    await page.getByLabel("Include earlier review queues").check();
    await tab("Submitted", 2).waitFor();
    await role(fixture.legacy_sent).waitFor();
    await tab("Active", 3).click();
    await role(fixture.active).waitFor();
    assert.equal(
      await page.locator(".discover-card").count(),
      3,
      "earlier queues never resurrect submitted siblings",
    );
    await page.getByLabel("Include earlier review queues").uncheck();

    await page.goto(
      base + "/?section=rejected&application=" + fixture.declined.id,
    );
    await tab("Removed", 1).waitFor();
    await card(fixture.declined).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 1);
    await removalControl(page, fixture.declined, true).click();
    await tab("Active", 4).click();
    await selectApplication(page, fixture.declined);
    await removalControl(page, fixture.declined).click();
    await tab("Active", 3).waitFor();
    assert.equal(
      await role(fixture.declined).count(),
      0,
      "A removed application leaves the active board",
    );
    await workbench(page).waitFor({ state: "hidden" });

    await selectApplication(page, fixture.active);
    const active = card(fixture.active);
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.waitForFunction(
        ({ id, mobile }) => {
          const surface = document.querySelector(
            ".opportunities-workbench:not([hidden])",
          );
          return (
            surface?.matches("dialog:modal") === mobile &&
            surface.querySelector(`[data-application-id="${id}"]`)
          );
        },
        { id: fixture.active.id, mobile: width <= 1000 },
      );
      await active.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "page overflow",
      );
      const geometry = await active.locator(".review-header").evaluate((el) => {
        const heading = el.querySelector("h3").getBoundingClientRect();
        const button = el.querySelector("button").getBoundingClientRect();
        return {
          heading: {
            top: heading.top,
            bottom: heading.bottom,
            right: heading.right,
          },
          button: { top: button.top, left: button.left },
          gap: parseFloat(getComputedStyle(el).rowGap),
        };
      });
      assert.ok(geometry.gap >= 12);
      assert.ok(
        geometry.button.top >= geometry.heading.bottom ||
          geometry.button.left - geometry.heading.right >= 12,
        "header has separation on either layout",
      );
      assert.deepEqual(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations.map((v) => v.id),
        [],
      );
      fs.mkdirSync("output/playwright/queues", { recursive: true });
      await active.screenshot({
        path: `output/playwright/queues/review-${width}.png`,
      });
    }
    const reviewed = active.locator(".review-status .bell-toggle__button");
    assert.equal(
      await reviewed.getAttribute("aria-label"),
      "Draft — switch to Reviewed",
    );
    assert.equal(
      await active.locator('.review-pane button[value="reviewed"]').count(),
      0,
    );
    const submitted = active.getByRole("button", {
      name: "Record submission…",
      exact: true,
    });
    const tokenColour = (control, token) =>
      control.evaluate((node, token) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        node.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      }, token);
    assert.equal(
      await submitted.evaluate((e) => getComputedStyle(e).backgroundColor),
      await tokenColour(submitted, "--positive-ink"),
    );
    assert.equal(await removalControl(page, fixture.active).isEnabled(), true);
    await reviewed.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await reviewed.evaluate((e) => e === document.activeElement),
      true,
    );
    assert.equal(
      await reviewed.evaluate(
        (e) => getComputedStyle(e.parentElement, "::after").borderTopStyle,
      ),
      "solid",
    );
    await reviewed.click();
    await active
      .locator('.bell-toggle__button[data-status="reviewed"]')
      .waitFor();
    await page.mouse.move(0, 0);
    await reviewed.evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    assert.equal(
      await reviewed.evaluate((e) => getComputedStyle(e).backgroundColor),
      await tokenColour(reviewed, "--accent-soft"),
    );
    assert.equal(
      await reviewed.evaluate((e) => getComputedStyle(e).color),
      await tokenColour(reviewed, "--link"),
    );
    await active
      .getByLabel("Comments", { exact: true })
      .fill("Checked the fictional evidence.");
    await active
      .getByRole("button", { name: "Save comment", exact: true })
      .click();
    await active.getByText("Review history (2)", { exact: false }).waitFor();
    await submitted.click();
    await active
      .getByLabel("Where or how you submitted")
      .fill("Fictional employer website");
    await active
      .getByLabel("I have already submitted this application.", { exact: true })
      .check();
    await active
      .getByRole("button", { name: "Confirm submission record", exact: true })
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get("section") === "submitted" &&
        url.searchParams.get("application") === fixture.active.id &&
        url.searchParams.get("panel") === "activity",
    );
    await tab("Active", 2).click();
    assert.equal(
      await role(fixture.active).count(),
      0,
      "submission does not reveal the previous draft",
    );
    await tab("Submitted", 2).click();
    await selectApplication(page, fixture.active);
    await card(fixture.active).waitFor();
    assert.equal(await page.locator(".discover-card").count(), 2);
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.waitForURL("**/history/");
    const versions = initial.state.applications.filter(
      (app) => app.folder,
    ).length;
    assert.ok(versions > 6);
    await page.locator(".history-files").first().waitFor({ state: "attached" });
    assert.equal(
      await page.locator(".history-files").count(),
      versions,
      "History retains every preserved version",
    );
    assert.equal(
      (await read()).state.applications.length,
      initial.state.applications.length,
    );
    assert.equal(hash(), originalHash, "submitted PDF unchanged");
    assert.deepEqual(errors, []);
    console.log(
      "Queue browser PASS: one card per job, submission/rejection/history precedence, counts/destinations, preserved versions, live decisions/comments, semantic colours, keyboard focus and four-width axe/spacing checks.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
