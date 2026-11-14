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
          clientWidth: board.clientWidth,
        };
      });
      assert.equal(
        layout.horizontalOverflow,
        false,
        `${label}: all company columns fit horizontally`,
      );
      assert.equal(
        layout.pageOverflow,
        false,
        `${label}: no page-wide overflow`,
      );
      for (const column of layout.columns) {
        assert.ok(
          column.left >= -1 && column.right <= layout.width + 1,
          `${label}: no partial company column`,
        );
        assert.ok(
          column.width >= Math.min(272, layout.width - 8) - 1,
          `${label}: readable card width (${column.width}px card, ${layout.width}px board, ${layout.clientWidth}px scrollport)`,
        );
      }
    };
    const cloud = () =>
      page.getByRole("button", {
        name: "Assess Cloud Software Engineer at Emberlane Systems",
        exact: true,
      });
    for (const width of [
      320, 390, 768, 900, 901, 930, 1000, 1001, 1024, 1150, 1151, 1280, 1440, 1920,
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
      // Measure destination geometry after the mobile bottom-entry animation.
      await page.waitForFunction(
        () =>
          !document
            .getAnimations()
            .some(
              (a) =>
                a.effect?.target instanceof Element &&
                a.effect.target.closest(".discover-inspector") &&
                (a.pending || a.playState === "running"),
            ),
      );
      await bounds(`${width}px assessment`);
      assert.equal(
        await page.locator("dialog:modal").count(),
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
        !document.querySelector("dialog:modal"),
    );
    await page
      .locator(".discover-inspector")
      .getByRole("heading", { name: "Cloud Software Engineer", exact: true })
      .waitFor();
    await bounds("Selection retained across review-mode boundary");
    await page
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await page.waitForURL(base + "/discover/?view=all");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/discover/?view=saved&location=Berlin");
    await page
      .getByRole("button", {
        name: "Assess DevOps Engineer at Northglass Works",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".discover-column").count(), 1);
    assert.ok(
      (await page.locator(".discover-card").boundingBox()).width <= 385,
      "A single company never stretches across the whole workspace",
    );
    await page.locator(".discover-column h2").evaluate((node) => {
      node.lastChild.textContent =
        "VeryLongEmployerNameWithoutWhitespace".repeat(4);
    });
    await page.locator(".discover-card-open h3").evaluate((node) => {
      node.textContent =
        "Principal platform and reliability engineering lead for distributed systems";
    });
    await page.locator(".discover-card-location").evaluate((node) => {
      node.textContent = "LongLocationNameWithoutWhitespace".repeat(5);
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

    // Exercise uneven city groups entirely in the browser. The disposable
    // service and its application records retain their original fixture data.
    const cities = [
      "Toronto",
      "Berlin",
      "Singapore",
      "Melbourne",
      "Oslo",
      "Helsinki",
      "Dublin",
      "Stockholm",
      "Prague",
      "Vienna",
      "Zurich",
    ];
    const cityCounts = [10, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1];
    const firstJob = state.jobs.find(
      (job) =>
        job.title === "Cloud Software Engineer" &&
        job.employer === "Emberlane Systems",
    );
    assert.ok(firstJob, "The original fictional cloud role is available");
    const layoutState = JSON.parse(JSON.stringify(state));
    const companyNames = cities.map((_, index) =>
      index === 0 ? firstJob.employer : `Fictional Company ${index + 1}`,
    );
    layoutState.jobs = cities.flatMap((city, cityIndex) =>
      Array.from({ length: cityCounts[cityIndex] }, (_, index) => ({
        ...firstJob,
        id:
          cityIndex === 0 && index === 0
            ? firstJob.id
            : `layout-city-${cityIndex}-role-${index}`,
        title:
          cityIndex === 0 && index === 0
            ? firstJob.title
            : `Layout Engineer ${cityIndex + 1}.${index + 1}`,
        employer: companyNames[cityIndex],
        city: index % 2 ? "Remote" : city,
        location: index % 2 ? "Remote" : city,
        saved: false,
      })),
    );
    layoutState.profiles = layoutState.profiles.map((profile) => ({
      ...profile,
      locations: cities,
    }));
    layoutState._workspace.preferred_locations = cities;
    layoutState.applications = [];
    const longJob = layoutState.jobs.find((job) => job.city === "Helsinki");
    longJob.title =
      "Senior Platform Engineer for Cloud Reliability and Developer Enablement";
    const layoutRows = layoutState.jobs.map((job) => ({
      job,
      match: {
        eligible_for_preparation: true,
        hard_conflicts: [],
        unknowns:
          job === longJob
            ? ["Work rights need confirmation", "Availability not verified"]
            : [],
        gaps: job === longJob ? ["Kubernetes"] : [],
        evidence: [],
        preferences: [],
        salary_expectation: {},
      },
    }));
    await page.route("**/api/state", (route) =>
      route.fulfill({
        json: { state: layoutState, token: "fictional-layout-only" },
      }),
    );
    await page.route("**/api/rank", (route) =>
      route.fulfill({
        json: { result: layoutRows },
      }),
    );
    const packedGroups = async (label) => {
      await page.waitForFunction(
        () =>
          document.querySelector(".discover-board")?.dataset.compact === "true",
      );
      await settle();
      await settle();
      await bounds(label);
      const groups = await page
        .locator(".discover-column")
        .evaluateAll((columns) =>
          columns.map((column) => {
            const rect = column.getBoundingClientRect();
            return {
              city: column.querySelector(".discover-company-name").textContent.trim(),
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              cards: column.querySelectorAll(".discover-card").length,
            };
          }),
        );
      assert.deepEqual(
        groups.map((group) => group.city),
        companyNames,
        `${label}: company order and DOM order are retained`,
      );
      assert.deepEqual(
        groups.map((group) => group.cards),
        cityCounts,
        `${label}: every company keeps its complete card group`,
      );
      for (let index = 0; index < groups.length; index++) {
        if (index > 0)
          assert.ok(
            groups[index].top >= groups[index - 1].top - 1,
            `${label}: later companies never backfill ahead of earlier priorities`,
          );
        for (const other of groups.slice(index + 1)) {
          const group = groups[index];
          assert.ok(
            group.right <= other.left + 1 ||
              other.right <= group.left + 1 ||
              group.bottom <= other.top + 1 ||
              other.bottom <= group.top + 1,
            `${label}: ${group.city} and ${other.city} do not overlap`,
          );
        }
      }
      return groups;
    };
    await page.setViewportSize({ width: 1640, height: 1000 });
    await page.goto(base + "/discover/?view=all");
    await cloud().waitFor();
    const desktopGroups = await packedGroups("Uneven desktop city groups");
    for (const group of desktopGroups.slice(0, 4))
      assert.ok(
        Math.abs(group.top - desktopGroups[0].top) <= 1,
        "The first four companies start in the first desktop row",
      );
    assert.ok(
      desktopGroups[4].top >= desktopGroups[1].bottom + 15,
      "The next company starts below a complete shorter group with a gutter",
    );
    assert.ok(
      desktopGroups[4].top < desktopGroups[0].bottom / 2,
      "Later companies fill the shorter columns before the ten-card company ends",
    );
    assert.deepEqual(
      await page.locator(".discover-card-open h3").allTextContents(),
      layoutState.jobs.map((job) => job.title),
      "Card DOM and inspector navigation order retain the original company sequence",
    );
    await page.screenshot({ path: `${output}/uneven-cities-1640.png` });
    await cloud().click();
    await page
      .locator(".discover-inspector")
      .getByRole("heading", {
        name: firstJob.title,
        exact: true,
      })
      .waitFor();
    const assessmentGroups = await packedGroups("Uneven cities with inspector");
    assert.ok(
      assessmentGroups[4].top < assessmentGroups[0].bottom / 2,
      "The inspector retains compact shorter columns",
    );
    await page.screenshot({
      path: `${output}/uneven-cities-inspector-1640.png`,
    });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await packedGroups("Uneven cities after inspector width change");
    await page
      .locator(".discover-inspector")
      .getByRole("button", {
        name: "Close opportunity details",
        exact: true,
      })
      .click();
    await packedGroups("Uneven cities after closing inspector");

    await page.setViewportSize({ width: 1640, height: 1000 });
    const beforeGrowth = await packedGroups("Uneven cities before text growth");
    await page
      .locator(".discover-column")
      .nth(1)
      .locator(".discover-card-open h3")
      .evaluate((heading) => {
        heading.textContent =
          "Senior platform and reliability engineer ".repeat(18);
      });
    const afterGrowth = await packedGroups(
      "Uneven cities after live text growth",
    );
    assert.ok(
      afterGrowth[1].bottom - afterGrowth[1].top >
        beforeGrowth[1].bottom - beforeGrowth[1].top + 100,
      "Live content growth changes the city height and repacks subsequent cities",
    );

    // Reload the intercepted fixture to restore the original short title.
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/discover/?view=all");
      await cloud().waitFor();
      const mobileGroups = await packedGroups(`${width}px uneven city groups`);
      for (let index = 1; index < mobileGroups.length; index++) {
        assert.ok(
          Math.abs(mobileGroups[index].left - mobileGroups[0].left) <= 1,
          `${width}px: city groups form one readable column`,
        );
        assert.ok(
          mobileGroups[index].top >= mobileGroups[index - 1].bottom + 21,
          `${width}px: complete city groups retain the mobile gutter`,
        );
      }
      if (width === 390)
        await page.screenshot({ path: `${output}/uneven-cities-390.png` });
    }
    await cloud().click();
    const mobileInspector = page.locator(".discover-inspector");
    for (let index = 0; index < 10; index++)
      await mobileInspector
        .getByRole("button", {
          name: "Next opportunity",
          exact: true,
        })
        .click();
    const nextCityJob = layoutState.jobs[10];
    await mobileInspector
      .getByRole("heading", {
        name: nextCityJob.title,
        exact: true,
      })
      .waitFor();
    await mobileInspector
      .getByRole("button", {
        name: "Close opportunity details",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (label) => document.activeElement?.getAttribute("aria-label") === label,
      `Assess ${nextCityJob.title} at ${nextCityJob.employer}`,
    );
    const restoredCard = await page
      .locator(".discover-card-open:focus")
      .boundingBox();
    assert.ok(
      restoredCard.y >= 0 && restoredCard.y < 1000,
      "Closing mobile assessment restores visible focus across packed city groups",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("combobox", { name: "Filter by city" })
      .selectOption("Helsinki");
    await page
      .getByRole("button", {
        name: `Assess ${longJob.title} at ${longJob.employer}`,
        exact: true,
      })
      .click();
    const specificWarning = mobileInspector.getByText("Missing evidence: Kubernetes", { exact: true });
    await specificWarning.scrollIntoViewIfNeeded();
    assert.ok(await specificWarning.isVisible());
    assert.equal(await mobileInspector.getByText("Check before applying", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "Discover layout passed: compact uneven cities, complete readable groups, responsive inspector, focus restoration, single/empty locations and long content.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
