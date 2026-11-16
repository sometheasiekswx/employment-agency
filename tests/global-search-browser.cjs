// Cross-source search against a disposable SQLite workspace.
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");

const sources = ["All sources", "Jobs", "To apply", "Applications", "Removed"];
const roles = {
  "Atlas Rail Engineer": ["Jobs"],
  "Atlas Support Engineer": ["To apply"],
  "Atlas Platform Engineer": ["Applications", "To apply"],
  "Atlas Systems Engineer": ["Applications"],
  "Atlas Migration Engineer": ["Applications"],
  "Atlas Test Engineer": ["Removed"],
};
const expectedTitles = (source) =>
  Object.keys(roles)
    .filter(
      (title) => source === "All sources" || roles[title].includes(source),
    )
    .sort();

(async () => {
  const base = process.env.TEST_URL;
  assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const output = "output/playwright/global-search";
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(10000);
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === base
        ? route.continue()
        : route.abort(),
    );
    const errors = [];
    let rankings = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/rank") rankings++;
    });
    const read = async () => {
      const response = await page.request.get(base + "/api/state");
      assert.ok(response.ok(), await response.text());
      return (await response.json()).state;
    };
    const original = await read();
    assert.match(original._workspace.path, /ea-sqlite-browser-/);
    const listing = (title) => original.jobs.find((job) => job.title === title);
    const removed = listing("Atlas Test Engineer");
    const scoped = listing("Atlas Support Engineer");
    assert.equal(
      listing("Grove Engineer").saved,
      true,
      "The removed role retains its bookmark in storage",
    );
    const submitted = original.applications.find(
      ({ status }) => status === "submitted",
    );
    const earlier = original.applications.find(
      (app) => app.title === "Atlas Migration Engineer" && app.archived,
    );
    const activeRemoval = (state) =>
      state.jobs
        .find((job) => job.id === removed.id)
        .removals.findLast((event) => !event.restored_at);
    assert.ok(activeRemoval(original));
    assert.equal(listing("Atlas Migration Engineer"), undefined);
    assert.ok(earlier && submitted);

    const search = page.getByRole("searchbox", {
      name: "Filter roles",
      exact: true,
    });
    const sourceGroup = page.getByRole("group", {
      name: "Search sources",
      exact: true,
    });
    const sourceButton = (source, count = expectedTitles(source).length) =>
      sourceGroup.getByRole("button", {
        name: `${source} ${count}`,
        exact: true,
      });
    const stages = page.getByRole("group", {
      name: "Application stage",
      exact: true,
    });
    const pages = page.getByRole("group", {
      name: "To apply pages",
      exact: true,
    });
    const card = (title) =>
      page.locator(".discover-card").filter({
        has: page.getByRole("heading", { name: title, exact: true }),
      });
    const opener = (title) =>
      card(title).getByRole("button", { name: /^Assess / });
    const inspector = page.locator("dialog.discover-inspector[open]");
    const clear = page.getByRole("button", {
      name: "Clear search",
      exact: true,
    });

    const assertMatches = async (source) => {
      await sourceButton(source)
        .and(sourceGroup.getByRole("button", { pressed: true }))
        .waitFor();
      for (const name of sources) await sourceButton(name).waitFor();
      const expected = expectedTitles(source);
      const titles = await page.locator(".discover-card h3").allTextContents();
      assert.deepEqual(
        titles.sort(),
        expected,
        `${source} returns one card per matching role`,
      );
      for (const title of expected) {
        const labels = await card(title)
          .locator(".discover-source-badge")
          .allTextContents();
        assert.deepEqual(
          labels
            .map((value) => value.trim())
            .filter((value) => sources.includes(value))
            .sort(),
          roles[title],
        );
      }
      assert.equal(await stages.count(), 0);
      assert.equal(await pages.count(), 0);
    };
    const enterSearch = async () => {
      await search.fill("aTlAs");
      await page.waitForURL((url) => url.searchParams.get("q") === "aTlAs");
      await assertMatches("All sources");
    };
    const clearSearch = async () => {
      await clear.click();
      await sourceGroup.waitFor({ state: "hidden" });
      assert.equal(await search.inputValue(), "");
      assert.equal(
        await search.evaluate((element) => element === document.activeElement),
        true,
      );
      const params = new URL(page.url()).searchParams;
      assert.equal(params.has("q"), false);
      assert.equal(params.has("source"), false);
    };

    await page.goto(base + "/discover/?view=to-apply");
    const nextPage = pages.getByRole("button", {
      name: "Next page",
      exact: true,
    });
    await nextPage.click();
    await page.waitForURL((url) => url.searchParams.get("offset") === "50");
    await pages.getByText("51–53 of 53", { exact: true }).waitFor();
    assert.ok(
      expectedTitles("To apply").length >
        (await page.getByRole("heading", { name: /^Atlas / }).count()),
    );
    await enterSearch();
    const ranksBeforeTyping = rankings;
    await search.fill("");
    await search.pressSequentially("Atlas", { delay: 40 });
    await page.waitForURL((url) => url.searchParams.get("q") === "Atlas");
    await assertMatches("All sources");
    assert.equal(
      await search.evaluate((element) => element === document.activeElement),
      true,
    );
    assert.equal(
      rankings,
      ranksBeforeTyping,
      "Typing searches loaded records without re-ranking",
    );

    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 844 : 1000 });
      assert.ok(await search.isVisible());
      if (width === 320) {
        // The board recomputes its explicit grid placements on ResizeObserver.
        await page.waitForFunction(() => {
          const columns = [...document.querySelectorAll(".discover-column")];
          return (
            columns.length > 0 &&
            columns.every((column) => column.style.gridColumnStart === "1")
          );
        });
      }
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - innerWidth,
        controls: [
          ...document.querySelectorAll(
            '.discover-source-badge, [aria-label="Search sources"] button',
          ),
        ].flatMap((element) => {
          const { left, right } = element.getBoundingClientRect();
          return left < -1 || right > innerWidth + 1
            ? [{ label: element.textContent, left, right }]
            : [];
        }),
      }));
      assert.ok(
        overflow.page <= 1 && !overflow.controls.length,
        `${width}px search results fit the viewport: ${JSON.stringify(overflow)}`,
      );
      await page.screenshot({
        path: `${output}/results-${width}.png`,
        animations: "disabled",
      });
    }
    await opener("Atlas Rail Engineer").click();
    await page.locator("dialog.discover-inspector:modal").waitFor();
    await inspector
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await inspector.waitFor({ state: "hidden" });
    await opener("Atlas Rail Engineer").and(page.locator(":focus")).waitFor();
    await assertMatches("All sources");
    await page.setViewportSize({ width: 1440, height: 1000 });

    for (const source of sources.slice(1)) {
      await sourceButton(source).click();
      await assertMatches(source);
    }
    await opener(removed.title).click();
    await inspector
      .getByRole("heading", { name: removed.title, exact: true })
      .waitFor();
    await inspector
      .getByRole("button", { name: `Restore ${removed.title}`, exact: true })
      .waitFor();
    assert.ok(
      activeRemoval(await read()),
      "Opening a removed match does not restore the role",
    );
    await page.goBack();
    await inspector.waitFor({ state: "hidden" });
    await assertMatches("Removed");
    assert.equal(await search.inputValue(), "Atlas");
    await opener(removed.title).and(page.locator(":focus")).waitFor();
    await clearSearch();
    await pages.waitFor();
    assert.equal(new URL(page.url()).searchParams.get("offset"), "50");

    await page.goto(
      base + `/discover/?view=to-apply&employer=${scoped.company.id}`,
    );
    const companyScope = page.getByRole("button", {
      name: `Clear company filter: ${scoped.employer}`,
      exact: true,
    });
    await companyScope.waitFor();
    await enterSearch();
    await clearSearch();
    await companyScope.waitFor();
    assert.equal(await card("Atlas Platform Engineer").count(), 0);

    for (const [stage, name] of [
      ["submitted", "Submitted"],
      ["removed", "Removed"],
    ]) {
      await page.goto(
        base + `/discover/?view=applications&section=${stage}&location=Berlin`,
      );
      const current = stages.getByRole("button", {
        name: new RegExp(`^${name} \\d+$`),
        pressed: true,
      });
      await current.waitFor();
      await enterSearch();
      await clearSearch();
      await current.waitFor();
      assert.equal(new URL(page.url()).searchParams.get("location"), "Berlin");
    }

    await search.fill("Grove");
    await sourceButton("All sources", 1).waitFor();
    await sourceButton("To apply", 0).waitFor();
    const removedBookmark = card("Grove Engineer");
    await removedBookmark.getByText("Removed", { exact: true }).waitFor();
    assert.equal(
      await removedBookmark.getByText("To apply", { exact: true }).count(),
      0,
    );
    await clearSearch();

    await enterSearch();
    await sourceButton("Applications").click();
    await opener(submitted.title).click();
    await inspector
      .locator(`[data-application-id="${submitted.id}"]`)
      .waitFor();
    await page.goBack();
    await inspector.waitFor({ state: "hidden" });
    await assertMatches("Applications");
    await card(earlier.title)
      .getByText("Earlier queue", { exact: true })
      .waitFor();
    await opener("Atlas Migration Engineer").click();
    await inspector
      .getByRole("heading", { name: "Atlas Migration Engineer", exact: true })
      .waitFor();
    await inspector.locator(`[data-application-id="${earlier.id}"]`).waitFor();
    await page.goBack();
    await inspector.waitFor({ state: "hidden" });
    await assertMatches("Applications");
    await sourceButton("Removed").click();
    assert.ok(
      activeRemoval(await read()),
      "Searching and narrowing keep the removal decision",
    );
    const restored = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/restore-job" &&
        response.ok(),
    );
    await card(removed.title)
      .getByRole("button", { name: `Restore ${removed.title}`, exact: true })
      .click();
    await restored;
    await sourceButton("Removed", 0).waitFor();
    await card(removed.title).waitFor({ state: "hidden" });
    assert.equal(activeRemoval(await read()), undefined);
    await sourceButton("All sources").click();
    await opener(removed.title).waitFor();
    assert.equal(
      await card(removed.title).getByText("Removed", { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: search spans the paginated and employer-scoped To apply queues, Submitted and Removed. Counts, source labels, archived versions, inspector Back/focus, clear, live typing, restore and 320/1440px layouts passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
