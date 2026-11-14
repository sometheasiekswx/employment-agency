// Exercise the production-export role journey in a disposable local SQLite workspace.
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const { chromium, devices } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const { default: AxeBuilder } = require(
  require.resolve("@axe-core/playwright", {
    paths: [
      process.env.PLAYWRIGHT_PATH ||
        require.resolve("../frontend/node_modules/playwright"),
    ],
  }),
);

const base = process.env.TEST_URL;
assert.match(base || "", /^http:\/\/127\.0\.0\.1:\d+$/);
const employer = "Fictional Journey Company " + randomUUID().slice(0, 8);
const listing = "https://journey.example.test/roles/platform";
const applicationAddress =
  "https://journey.example.test/apply/ការងារ?city=ភ្នំពេញ";
const applicationSite = new URL(applicationAddress).href;
const output = process.env.EA_JOURNEY_SCREENSHOTS;

async function responseResult(response) {
  const body = await response.json();
  assert.ok(
    response.ok(),
    body.error || `${response.status()} ${response.url()}`,
  );
  return body.result;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const panel = (page) => page.locator(".discover-inspector");
const exact = (scope, role, name) =>
  scope.getByRole(role, { name, exact: true });
const actionButton = (page, name) => exact(panel(page), "button", name);
const choose = (page, job) =>
  exact(page, "button", `Assess ${job.title} at ${job.employer}`);
const listingLink = (page) => exact(panel(page), "link", "View job listing");

async function screenshot(page, file) {
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({
      path: `${output}/${file}.png`,
      animations: "disabled",
    });
  }
}

async function verifyNoHorizontalOverflow(page, label) {
  const overflowing = await panel(page).evaluate((surface) => {
    const body = surface.querySelector(".discover-inspector-body");
    return [surface, body].some(
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
  });
  assert.equal(overflowing, false, label);
}

(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
  });
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  try {
    const page = await desktop.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const initial = await (
      await desktop.request.get(base + "/api/state")
    ).json();
    assert.equal(initial.state._workspace.agent_queue, true);
    assert.match(
      initial.state._workspace.path,
      /(?:tmp|var\/folders|Temp)/i,
      "Use a disposable fixture",
    );
    const headers = { Origin: base, "X-Workspace-Token": initial.token };
    const api = async (name, data = {}) =>
      responseResult(
        await desktop.request.post(base + "/api/" + name, { data, headers }),
      );
    const readState = async () =>
      (await (await desktop.request.get(base + "/api/state")).json()).state;
    const job = await api("job", {
      title: "Journey Platform Engineer",
      employer,
      location: initial.state.profiles[0]?.locations?.[0] || "Toronto",
      description: "Maintain fictional HTTP APIs and Python integration tests.",
      requirements: ["Python services"],
      availability: "retrieved",
      eligibility: "confirmed",
      url: listing,
    });
    const second = await api("job", {
      title: "Journey Software Engineer",
      employer,
      location: job.location,
      description: "Build fictional Python services.",
      requirements: ["Python services"],
      availability: "retrieved",
      eligibility: "confirmed",
      url: "https://journey.example.test/roles/software",
    });
    let profile = initial.state.profiles[0];
    if (
      !profile ||
      !(await api("rank", { profile_id: profile.id })).some(
        (row) => row.job.id === job.id && row.match.eligible_for_preparation,
      )
    ) {
      profile = await api("profile", {
        name: "Journey Engineering",
        roles: ["Engineer"],
        locations: [job.location],
        include_unknown: true,
        include_stretch: true,
      });
    }
    const ranked = await api("rank", { profile_id: profile.id });
    assert.ok(
      ranked.some(
        (row) => row.job.id === job.id && row.match.eligible_for_preparation,
      ),
    );
    const initialVersionCount = initial.state.applications.length;

    // Route only fictional destinations. The test never reaches any employer or agent network.
    async function protect(context) {
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === base
          ? route.continue()
          : route.abort(),
      );
      await context.route(listing, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<h1>Fictional platform listing</h1>",
        }),
      );
      // Playwright intercepts the initial request, but Chrome skips its route
      // handler after a real external redirect. Check the actual server's 302
      // and deliver the fictional form to this popup without any external I/O.
      await context.route("**/api/application-site/**", async (route) => {
        const redirect = await route.fetch({ maxRedirects: 0 });
        assert.equal(redirect.status(), 302);
        assert.equal(redirect.headers().location, applicationSite);
        assert.equal(redirect.headers()["referrer-policy"], "no-referrer");
        assert.equal(redirect.headers()["cache-control"], "no-store");
        await route.fulfill({
          contentType: "text/html",
          body: "<h1>Fictional platform application form</h1>",
        });
      });
      await context.route("**/api/agent-capabilities", (route) =>
        route.fulfill({
          json: {
            result: {
              available: false,
              reason: "No connected executor in this browser fixture",
              channels: {},
            },
          },
        }),
      );
    }
    await protect(desktop);
    // Force manual clipboard fallback; its text must describe the same selection.
    await desktop.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async () => {
            throw new Error("Clipboard access denied");
          },
        },
      });
    });
    const openBoard = async (page, role = job) => {
      await page.goto(base + "/discover/?view=all");
      const selected = await page
        .locator("select[aria-label='Search profile']")
        .inputValue();
      if (selected !== profile.id) {
        await page.locator(".discover-filters > summary").click();
        await page
          .getByRole("combobox", { name: "Search profile", exact: true })
          .selectOption(profile.id);
      }
      await choose(page, role).waitFor();
    };
    await openBoard(page);
    await choose(page, job).click();
    await actionButton(page, "Prepare application").waitFor();
    const roleElement = await panel(page).elementHandle();
    const listingElement = await listingLink(page).elementHandle();
    assert.equal(await listingLink(page).getAttribute("href"), listing);
    const listed = await Promise.all([
      page.waitForEvent("popup"),
      listingLink(page).click(),
    ]);
    await listed[0]
      .getByRole("heading", { name: "Fictional platform listing" })
      .waitFor();
    await listed[0].close();
    assert.deepEqual(
      await api("company-submission-status", { job_id: job.id }),
      [],
    );

    await actionButton(page, "For my agent").click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button[aria-pressed=true]")].some(
        (button) => button.textContent.trim() === "For my agent",
      ),
    );
    await screenshot(page, "before-desktop");
    await actionButton(page, "Close opportunity details").click();
    await choose(page, second).click();
    await actionButton(page, "For my agent").click();
    await actionButton(page, "Close opportunity details").click();
    await exact(page, "button", "Applications").click();
    await exact(page, "button", "For my agent 2").click();
    await page.reload();
    await choose(page, job).waitFor();
    await choose(page, second).waitFor();
    assert.equal((await readState()).applications.length, initialVersionCount);
    assert.deepEqual(
      await api("company-submission-status", { job_id: job.id }),
      [],
    );
    await page
      .getByRole("checkbox", { name: `Select ${job.title} at ${employer}` })
      .check();
    await page
      .getByRole("checkbox", { name: `Select ${second.title} at ${employer}` })
      .check();
    await exact(page, "button", "Copy agent instructions").click();
    const handoff = await exact(
      page,
      "textbox",
      "Select and copy the agent instructions",
    ).inputValue();
    assert.ok(handoff.includes(job.id) && handoff.includes(second.id));
    assert.match(handoff, /grants no authority/i);
    assert.ok(!handoff.includes(initial.token));
    assert.deepEqual(
      (await api("agent-application-status", { job_ids: [job.id, second.id] }))
        .runs,
      [],
    );
    await screenshot(page, "queue-desktop");

    await exact(page, "button", "Browse").click();
    await choose(page, job).click();
    let fail = true;
    await page.route("**/api/local-package", async (route) => {
      if (!fail) return route.continue();
      fail = false;
      await route.fulfill({
        status: 400,
        json: { error: "The fictional preparation failed. Retry the draft." },
      });
    });
    await actionButton(page, "Prepare application").click();
    await panel(page)
      .getByRole("alert")
      .getByText(/fictional preparation failed/)
      .waitFor();
    assert.equal((await readState()).applications.length, initialVersionCount);

    let denyPreview = true;
    await page.route("**/api/file", async (route) => {
      if (!denyPreview || route.request().postDataJSON()?.name !== "resume.pdf")
        return route.continue();
      denyPreview = false;
      await route.fulfill({
        status: 500,
        json: { error: "Fictional preview temporarily unavailable" },
      });
    });
    const [preparation] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/local-package") && response.ok(),
      ),
      actionButton(page, "Prepare application").click(),
    ]);
    const draft = await responseResult(preparation);
    await page.waitForURL(
      (url) => url.searchParams.get("application") === draft.id,
    );
    await panel(page)
      .getByRole("alert")
      .getByText(/PDF preview unavailable/)
      .waitFor();
    assert.equal(
      await exact(panel(page), "link", "Download CV").getAttribute("href"),
      `/files/${draft.id}/resume.pdf`,
    );
    const before = sha256(
      await (
        await desktop.request.get(base + `/files/${draft.id}/resume.pdf`)
      ).body(),
    );
    await actionButton(page, "Retry preview").click();
    await panel(page)
      .getByRole("img", { name: /^PDF page 1 of/ })
      .waitFor();
    assert.equal(await page.locator("dialog.document-editor").count(), 0);
    const stableRole = await panel(page).elementHandle();
    const stableListing = await listingLink(page).elementHandle();
    assert.ok(roleElement && listingElement);
    await actionButton(page, "Documents").click();
    await exact(panel(page), "link", "Cover letter PDF").waitFor();
    assert.equal(
      await stableListing.evaluate((link) => link.isConnected && link.href),
      listing,
    );
    await actionButton(page, "Activity").click();
    const comments = exact(panel(page), "textbox", "Comments");
    await comments.fill("Fictional unfinished comment");
    await actionButton(page, "CV").click();
    await actionButton(page, "Activity").click();
    assert.equal(await comments.inputValue(), "Fictional unfinished comment");
    await actionButton(page, "Save comment").click();
    await page.waitForFunction(
      () => document.querySelector("textarea[name=comment]")?.value === "",
    );
    await actionButton(page, "CV").click();
    assert.equal(
      await stableRole.evaluate((surface) => surface.isConnected),
      true,
    );
    await actionButton(page, "Open application site").waitFor();
    assert.equal(await actionButton(page, "Apply for me").count(), 0);
    await screenshot(page, "cv-desktop");
    assert.equal(await listingLink(page).getAttribute("href"), listing);

    // With the employer unresolved the CV stays visible. Completing the
    // exception continues the same manual path and preserves the warning-free draft.
    await page.evaluate(() => {
      window.open = () => null;
    });
    await actionButton(page, "Open application site").click();
    await exact(panel(page), "textbox", "Hiring employer name").fill(employer);
    await actionButton(page, "Confirm employer").click();
    await actionButton(page, "I've applied").waitFor();
    assert.deepEqual(
      (await api("company-submission-status", { job_id: job.id })).map(
        (row) => row.status,
      ),
      ["handed_off"],
    );
    const continuation = exact(
      panel(page),
      "link",
      "Continue to application site",
    );
    const continuationUrl = await continuation.getAttribute("href");
    assert.match(
      continuationUrl,
      /^\/api\/application-site\/[a-f0-9]{32}\/[a-f0-9]{64}$/,
    );
    let redirect = await desktop.request.get(base + continuationUrl, {
      maxRedirects: 0,
    });
    assert.equal(redirect.status(), 302);
    assert.equal(redirect.headers().location, listing);
    await api("application-destination", {
      job_id: job.id,
      channel: "website",
      value: applicationAddress,
      source_url: listing,
      evidence: "Fictional listing points to this form.",
      confirmed: true,
    });
    redirect = await desktop.request.get(base + continuationUrl, {
      maxRedirects: 0,
    });
    assert.equal(redirect.status(), 409);
    assert.equal(redirect.headers().location, undefined);
    assert.match(await redirect.text(), /destination changed/i);
    await actionButton(page, "Close without submitting").click();
    await exact(panel(page), "textbox", "Confirmation evidence").fill(
      "Fictional applicant closed the page without submitting.",
    );
    await actionButton(page, "Release application slot").click();
    await actionButton(page, "Open application site").waitFor();
    await page.reload();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      actionButton(page, "Open application site").click(),
    ]);
    await popup.waitForURL((url) =>
      url.pathname.startsWith("/api/application-site/"),
    );
    await popup
      .getByRole("heading", { name: "Fictional platform application form" })
      .waitFor();
    assert.equal(await popup.evaluate(() => window.opener === null), true);
    await popup.close();
    await actionButton(page, "I've applied").click();
    await exact(panel(page), "textbox", "Destination").waitFor();
    assert.equal(
      await exact(panel(page), "textbox", "Destination").inputValue(),
      applicationSite,
    );
    assert.equal(
      (await readState()).applications.find((app) => app.id === draft.id)
        .status,
      "draft",
    );
    await panel(page)
      .locator("input[name=occurred_at]")
      .fill("2025-11-14T09:45");
    await exact(
      panel(page),
      "combobox",
      "Did you use the reserved documents?",
    ).selectOption("yes");
    await exact(panel(page), "textbox", "Confirmation evidence").fill(
      "Fictional receipt EA-JOURNEY-123.",
    );
    await panel(page).getByText("Add follow-up", { exact: true }).click();
    await exact(
      panel(page),
      "textbox",
      "Pending supporting documents or follow-up",
    ).fill("Send the fictional reference only if requested.");

    let failOutcome = true;
    await page.route("**/api/company-submission-resolve", async (route) => {
      if (!failOutcome) return route.continue();
      failOutcome = false;
      await route.fulfill({
        status: 500,
        json: { error: "Fictional receipt save failed. Retry." },
      });
    });
    await actionButton(page, "Record submission").click();
    await panel(page)
      .getByRole("alert")
      .getByText(/Fictional receipt save failed/)
      .waitFor();
    assert.equal(
      await exact(panel(page), "textbox", "Confirmation evidence").inputValue(),
      "Fictional receipt EA-JOURNEY-123.",
    );
    await actionButton(page, "Record submission").click();
    await page.waitForURL(
      (url) => url.searchParams.get("section") === "submitted",
    );
    const submission = exact(panel(page), "region", "Submission record");
    await submission
      .getByText("Fictional receipt EA-JOURNEY-123.", { exact: true })
      .waitFor();
    await submission.getByText("Reported by you", { exact: true }).waitFor();
    assert.equal(await listingLink(page).getAttribute("href"), listing);
    assert.equal(await actionButton(page, "For my agent").count(), 0);
    const sentState = await readState();
    assert.equal(
      sentState.applications.find((app) => app.id === draft.id).status,
      "submitted",
    );
    assert.ok(
      sentState.application_queue.some(
        (entry) => entry.job_id === job.id && entry.stage === "submitted",
      ),
    );
    assert.equal(
      sha256(
        await (
          await desktop.request.get(base + `/files/${draft.id}/resume.pdf`)
        ).body(),
      ),
      before,
    );
    assert.ok(
      !(await api("agent-queue")).rows.some((row) => row.role_id === job.id),
    );
    await screenshot(page, "submitted-desktop");
    assert.deepEqual(errors, []);

    const mobile = await browser.newContext({
      ...devices["Pixel 7"],
      viewport: { width: 320, height: 820 },
      reducedMotion: "reduce",
    });
    try {
      await protect(mobile);
      const phone = await mobile.newPage();
      phone.setDefaultTimeout(10000);
      await openBoard(phone, second);
      await choose(phone, second).click();
      await actionButton(phone, "Prepare application").waitFor();
      await verifyNoHorizontalOverflow(phone, "320px overview fits");
      await screenshot(phone, "before-mobile");
      await actionButton(phone, "Prepare application").click();
      await panel(phone)
        .getByRole("img", { name: /^PDF page 1 of/ })
        .waitFor();
      await actionButton(phone, "Open application site").waitFor();
      assert.equal(
        await panel(phone).evaluate((node) => node.matches(":modal")),
        true,
      );
      await verifyNoHorizontalOverflow(phone, "320px CV and footer fit");
      await screenshot(phone, "cv-mobile");
      assert.deepEqual(
        (
          await new AxeBuilder({ page: phone })
            .include(".discover-inspector")
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations.map(({ id }) => id),
        [],
      );
      await phone.evaluate(() => {
        const nodes = [
          ...document.querySelectorAll(
            ".discover-inspector :is(h2,h3,p,a,button,span)",
          ),
        ];
        const sizes = nodes.map((node) =>
          parseFloat(getComputedStyle(node).fontSize),
        );
        nodes.forEach((node, index) => {
          node.style.fontSize = `${sizes[index] * 2}px`;
        });
      });
      await verifyNoHorizontalOverflow(phone, "200% role text fits");
      await screenshot(phone, "cv-mobile-200");
      await actionButton(phone, "Close opportunity details").focus();
      await phone.keyboard.press("Escape");
      await panel(phone).waitFor({ state: "detached" });
      assert.equal(
        await choose(phone, second).evaluate(
          (node) => document.activeElement === node,
        ),
        true,
      );
    } finally {
      await mobile.close();
    }
    console.log(
      "PASS SQLite application journey: exact CV reading and fallback, persistent listing, queued selection, manual outcome, immutable bytes, keyboard and narrow layout.",
    );
  } finally {
    await desktop.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
