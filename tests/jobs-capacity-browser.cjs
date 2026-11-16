const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_PATH || "../frontend/node_modules/playwright",
);
const AxeBuilder = require("../frontend/node_modules/@axe-core/playwright").default;

(async () => {
  const base = process.env.TEST_URL;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const engine = process.env.BROWSER_ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 930 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    if (engine === chromium) await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
    const readClipboard = () => engine === chromium
      ? page.evaluate(() => navigator.clipboard.readText())
      : readClipboardByPaste();
    async function readClipboardByPaste() {
      // Paste through a real keyboard event to exercise WebKit without a
      // readText permission prompt. This field exists only in the test.
      await page.evaluate(() => {
        const field = document.createElement("textarea");
        field.setAttribute("aria-label", "Clipboard reader");
        field.style.position = "fixed";
        field.style.inset = "0 auto auto 0";
        document.body.append(field);
        field.focus();
      });
      const field = page.getByRole("textbox", { name: "Clipboard reader" });
      await field.press(process.platform === "darwin" ? "Meta+v" : "Control+v");
      const value = await field.inputValue();
      await field.evaluate((element) => element.remove());
      return value;
    }
    const trigger = page.getByRole("button", { name: "Copy agent instructions", exact: true });
    const rowStyle = () => trigger.evaluate((button) => {
      const row = button.closest(".agent-instructions");
      const { left } = button.getBoundingClientRect();
      const { padding, borderTopWidth } = getComputedStyle(row.parentElement);
      const control = getComputedStyle(button.parentElement);
      return {
        left,
        padding,
        borderTopWidth,
        gap: control.gap,
        scopeFontSize: control.fontSize,
        buttonHeight: button.getBoundingClientRect().height,
      };
    });
    const visualWidths = [1440, 390];
    const rowEvidence = {};
    async function captureRow(board) {
      for (const width of visualWidths) {
        await page.setViewportSize({ width, height: 930 });
        const style = await rowStyle();
        if (board === "jobs") rowEvidence[width] = style;
        else assert.deepEqual(style, rowEvidence[width]);
        if (process.env.EA_COPY_SCREENSHOTS && engine === chromium) {
          fs.mkdirSync(process.env.EA_COPY_SCREENSHOTS, { recursive: true });
          await trigger.locator("../..").screenshot({
            path: path.join(process.env.EA_COPY_SCREENSHOTS, board + "-" + width + ".png"),
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 930 });
    }
    async function copyPrompt() {
      const url = page.url();
      await trigger.click();
      const copied = page.getByText("Agent instructions copied.", { exact: true });
      const fallback = page.getByRole("dialog", { name: "Agent instructions", exact: true });
      await copied.or(fallback).waitFor();
      assert.equal(await fallback.count(), 0, await fallback.textContent({ timeout: 100 }).catch(() => ""));
      assert.equal(page.url(), url);
      return readClipboard();
    }
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
    );
    const initial = await (await page.request.get(base + "/api/state")).json();
    assert.match(initial.state._workspace.path, /ea-sqlite-browser-/);
    const action = async (name, data) => {
      const response = await page.request.post(base + "/api/" + name, {
        data,
        headers: { Origin: base, "X-Workspace-Token": initial.token },
      });
      assert.ok(response.ok(), await response.text());
      return (await response.json()).result;
    };
    const [first, second, third] = initial.state.jobs;
    const employer = second.employer;
    const employerId = second.company.id;
    const relate = (role, id) =>
      action("company-map", { job_id: role.id, employer_id: id, confirmed: true });
    const save = (role) => action("save-job", { id: role.id, saved: true });
    await relate(first, employerId);
    await relate(third, employerId);
    await save(first);
    await save(second);

    const makeRole = (title, company, location, slug, availability = "retrieved") =>
      action("job", {
        title, employer: company, location, availability,
        description: "Maintain fictional Python services.",
        requirements: ["Python services"],
        url: "https://employer.example.test/opportunities/" + slug,
      });
    const fourth = await makeRole("Senior Observability and Production Reliability Engineer",
      employer, "Berlin", "observability");
    const closed = await makeRole("Closed Systems Engineer", employer, "Berlin", "closed", "closed");
    await relate(fourth, employerId);
    await relate(closed, employerId);
    const otherName = "Fictional Harbour Partners International Engineering and Platform Services";
    const otherPending = await makeRole("Backend Engineer", otherName, "Toronto", "backend");
    const otherEmployer = await action("company-map", { job_id: otherPending.id, confirmed: true });
    await save(otherPending);
    const available = await makeRole("Data Platform Engineer", otherName, "Toronto", "data");
    await relate(available, otherEmployer.employer_id);

    const jobsUrl = base + "/discover/?view=jobs";
    const company = page.getByRole("region", { name: employer + " opportunities", exact: true });
    const role = (job) => page.getByRole("button", {
      name: "Assess " + job.title + " at " + job.employer,
      exact: true,
    });
    const compact = company.locator(".discover-compact-role");
    const change = company.getByRole("link", { name: "Change selections" });
    const chip = page.getByRole("button", { name: "Clear company filter: " + employer });
    const inspect = (job) => page.getByRole("dialog", { name: job.title, exact: true });
    await page.goto(jobsUrl);
    await company.getByText("2 of 2 selected", { exact: true }).waitFor();
    await captureRow("jobs");
    assert.match(await copyPrompt(), /^Find five additional eligible hiring companies/);
    assert.equal(await compact.count(), 2);
    assert.equal(await company.getByText("2 of 2 selected", { exact: true }).count(), 1);
    assert.ok(await role(third).isVisible() && await role(fourth).isVisible());
    assert.equal(await company.getByRole("button", { name: "Apply later · " + fourth.title }).count(), 0);
    await company.getByText("This vacancy is closed or its deadline has passed").waitFor();
    assert.ok(await page.getByRole("button", { name: "Apply later · " + available.title }).isEnabled());

    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const targets = await compact.locator("button").evaluateAll((buttons) => {
        const bounds = buttons.map(button => button.getBoundingClientRect());
        return bounds.every((box, index) =>
          box.height >= 44 && (!index || bounds[index - 1].bottom <= box.top));
      });
      assert.ok(targets, "compact role controls stay large and do not overlap");
    }
    await page.setViewportSize({ width: 1440, height: 930 });
    if (engine === chromium) {
      const audit = await new AxeBuilder({ page }).include(".discover-stack-heading")
        .include(".discover-compact-role").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(audit.violations.map(({ id }) => id), []);
    }
    const firstVisible = compact.locator("button").first();
    const firstTitle = (await firstVisible.locator("h3").innerText()).trim();
    const secondTitle = (await compact.locator("button h3").nth(1).innerText()).trim();
    const ordinaryTitles = await company.locator("article h3").allTextContents();
    const expectedSecond = ordinaryTitles[ordinaryTitles.indexOf(firstTitle) + 1];
    await firstVisible.focus();
    await firstVisible.press("Enter");
    await page.getByRole("dialog", { name: firstTitle, exact: true }).waitFor();
    await page.getByRole("button", { name: "Next opportunity" }).click();
    const nextInspector = page.getByRole("dialog", { name: expectedSecond, exact: true });
    await nextInspector.waitFor();
    await nextInspector.getByRole("button", { name: "Close opportunity details" }).click();
    await page.getByRole("dialog", { name: expectedSecond, exact: true }).waitFor({ state: "hidden" });
    assert.ok(await page.locator(".discover-card-open[aria-label]").evaluateAll(
      (buttons, title) => buttons.some(button => button === document.activeElement && button.querySelector("h3").textContent === title),
      expectedSecond,
    ));
    assert.notEqual(firstTitle, secondTitle);

    await page.getByRole("searchbox", { name: "Filter roles" }).fill(fourth.title);
    await role(fourth).waitFor();
    assert.equal(await compact.count(), 0);
    assert.equal(await company.locator(".discover-compact-layers").count(), 0);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await change.waitFor();
    assert.equal(await compact.count(), 2);
    await change.click();
    await chip.waitFor();
    await page.waitForURL(url => url.searchParams.get("employer") === employerId);
    assert.equal(new URL(page.url()).searchParams.has("q"), false);
    assert.ok(await chip.evaluate(button => button === document.activeElement));
    assert.ok(await role(first).isVisible() && await role(second).isVisible());
    assert.equal(await role(otherPending).count(), 0);
    await page.getByText("All To apply (3)", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Select", exact: true }).count(), 0);
    assert.equal(await page.locator(".discover-card input[type=checkbox]").count(), 0);
    await captureRow("to-apply");
    const requests = [];
    const captureRequest = (request) => {
      if (request.method() === "POST") requests.push(new URL(request.url()).pathname);
    };
    page.on("request", captureRequest);
    const instructions = await copyPrompt();
    page.off("request", captureRequest);
    assert.deepEqual(requests.filter((request) => request !== "/api/agent-application-status"), ["/api/application-handoff"]);
    for (const pending of [first, second, otherPending]) assert.ok(instructions.includes(pending.id));
    await page.goBack();
    await change.waitFor();
    assert.equal(await compact.count(), 2);
    await page.goForward();
    await chip.waitFor();

    await page.getByRole("button", { name: "Remove from To apply · " + first.title }).click();
    await role(first).waitFor({ state: "hidden" });
    await chip.click();
    await role(otherPending).waitFor();
    await page.getByRole("button", { name: "Jobs", exact: true }).click();
    await page.getByRole("button", { name: "Apply later · " + fourth.title }).waitFor();
    assert.equal(await compact.count(), 0);
    await role(fourth).click();
    await inspect(fourth).getByRole("link", { name: fourth.title, exact: true }).waitFor();
    assert.equal(await inspect(fourth).getByRole("link", { name: fourth.title, exact: true }).getAttribute("href"), fourth.url);
    assert.ok(await inspect(fourth).getByRole("button", { name: "Remove " + fourth.title }).isVisible());
    assert.deepEqual(errors, []);

    console.log("PASS: Jobs shows readable compact rows, exact employer navigation, scoped queue with all-pending instructions, and full cards after capacity is released.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
