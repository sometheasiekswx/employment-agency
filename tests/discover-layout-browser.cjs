// Verify the rendered shortlist composition, not a particular CSS implementation.
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");

(async () => {
  const base = process.env.TEST_URL;
  assert.ok(
    base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
    "Use the disposable fictional fixture",
  );
  const useWebKit = process.env.BROWSER_ENGINE === "webkit";
  const browser = await (useWebKit ? webkit : chromium).launch({
    ...(useWebKit ? {} : { channel: process.env.BROWSER_CHANNEL || "chrome" }),
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const state = (await (await page.request.get(base + "/api/state")).json())
      .state;
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.name, "Alex Morgan");
    const output = `output/playwright/card-layout${useWebKit ? "-webkit" : ""}`;
    fs.mkdirSync(output, { recursive: true });
    const settle = () =>
      page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
    const bounds = async (label) => {
      await settle();
      const layout = await page.locator(".discover-board").evaluate((board) => {
        const rect = board.getBoundingClientRect();
        return {
          horizontalOverflow: board.scrollWidth > board.clientWidth + 1,
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          columns: [...board.querySelectorAll(".discover-column")].map(
            (column) => {
              const bounds = column.getBoundingClientRect();
              return {
                width: bounds.width,
                left: bounds.left - rect.left,
                right: bounds.right - rect.left,
              };
            },
          ),
          width: rect.width,
        };
      });
      assert.equal(
        layout.horizontalOverflow,
        false,
        `${label}: all location columns fit horizontally`,
      );
      assert.equal(
        layout.pageOverflow,
        false,
        `${label}: no page-wide overflow`,
      );
      for (const column of layout.columns) {
        assert.ok(
          column.left >= -1 && column.right <= layout.width + 1,
          `${label}: no partial location column`,
        );
        assert.ok(
          column.width >= Math.min(272, layout.width - 8) - 1,
          `${label}: readable card width`,
        );
      }
    };
    const cloud = () =>
      page.getByRole("button", {
        name: "Assess Cloud Software Engineer at Emberlane Systems",
        exact: true,
      });
    for (const width of [
      320, 390, 768, 901, 930, 1000, 1001, 1024, 1150, 1151, 1280, 1440, 1920,
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/discover/?view=all");
      await cloud().waitFor();
      await bounds(`${width}px shortlist`);
      await cloud().click();
      const inspector = page.locator(".discover-inspector");
      await inspector
        .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
        .waitFor();
      await bounds(`${width}px assessment`);
      assert.equal(
        await page.locator("dialog[open]").count(),
        width <= 1000 ? 1 : 0,
        `${width}px appropriate review mode`,
      );
      const footer = await inspector
        .locator(".discover-inspector-footer")
        .boundingBox();
      assert.ok(
        footer.y >= 0 && footer.y + footer.height <= 1001,
        `${width}px assessment actions fit`,
      );
      if ([390, 1024, 1280, 1440].includes(width)) {
        await page.screenshot({ path: `${output}/assessment-${width}.png` });
      }
      for (let step = 0; step < 3; step++)
        await inspector
          .getByRole("button", { name: "Next opportunity", exact: true })
          .click();
      await inspector
        .getByRole("button", { name: "Close opportunity details", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute("aria-label") ===
          "Assess Platform Engineer at Fernbridge Digital",
      );
      const opener = await page
        .locator(".discover-card-open:focus")
        .boundingBox();
      assert.ok(
        opener.y >= 0 && opener.y < 1000,
        `${width}px current card is visible after close`,
      );
    }
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.goto(base + "/discover/?view=all");
    await cloud().click();
    await page.setViewportSize({ width: 930, height: 1000 });
    await page
      .getByRole("dialog", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.waitForFunction(
      () =>
        document.querySelector(".discover-layout.has-inspector") &&
        !document.querySelector("dialog[open]"),
    );
    await page
      .locator(".discover-inspector")
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await bounds("Selection retained across review-mode boundary");
    await page
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/discover/?view=all&location=Berlin");
    await page
      .getByRole("button", {
        name: "Assess DevOps Engineer at Northglass Works",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".discover-column").count(), 1);
    assert.ok(
      (await page.locator(".discover-card").boundingBox()).width <= 385,
      "A single location never stretches across the whole workspace",
    );
    await page.locator(".discover-column h2").evaluate((node) => {
      node.lastChild.textContent =
        "VeryLongLocationNameWithoutWhitespace".repeat(4);
    });
    await page.locator(".discover-card-open h3").evaluate((node) => {
      node.textContent =
        "Principal platform and reliability engineering lead for distributed systems";
    });
    await page.locator(".discover-card-company").evaluate((node) => {
      node.lastChild.textContent = "LongEmployerNameWithoutWhitespace".repeat(
        5,
      );
    });
    await bounds("Long location, role and employer names");
    assert.equal(
      await page
        .locator(".discover-card")
        .evaluate((card) => card.scrollWidth > card.clientWidth + 1),
      false,
      "Long content stays inside the card",
    );
    await page.screenshot({ path: `${output}/long-content.png` });
    await page.locator(".discover-card").evaluate((card) => {
      const sizes = [...card.querySelectorAll("*")].map((node) => [
        node,
        parseFloat(getComputedStyle(node).fontSize),
      ]);
      for (const [node, size] of sizes) node.style.fontSize = `${size * 2}px`;
    });
    await bounds("Doubled card text with long content");
    assert.equal(
      await page
        .locator(".discover-card")
        .evaluate((card) => card.scrollWidth > card.clientWidth + 1),
      false,
      "Enlarged text remains readable inside the card",
    );
    await page.goto(
      base + "/discover/?view=all&q=NoMatchingFictionalOpportunity",
    );
    await page
      .getByRole("heading", { name: "No roles match these filters" })
      .waitFor();
    assert.equal(await page.locator(".discover-column").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Discover layout passed: complete readable columns, responsive inspector, wrapped-row focus, single/empty locations and long content.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
