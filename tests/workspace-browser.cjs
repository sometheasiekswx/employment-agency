// Run after browser.cjs against the same disposable synthetic workspace.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { applicationCard, openApplication, showPanel } = require("./browser-applications.cjs");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8769");
  const initial = await (
    await page.request.get(new URL("/api/state", page.url()).href)
  ).json();
  const root = initial.state._workspace.path;
  const portableRoot = root.replace(/\\/g, "/");
  assert.ok(
    /^\/(?:private\/)?tmp\/employment-agency-refactor-browser-/.test(
      portableRoot,
    ) ||
      /\/employment-agency-folder-browser-[^/]+\/primary$/.test(portableRoot),
    "Never mutate a real workspace in browser acceptance",
  );
  const active = initial.state.applications
    .filter(
      (app) =>
        !app.archived &&
        !["submitted", "rejected"].includes(app.status) &&
        !initial.state.applications.some(
          (sibling) =>
            sibling.job_id === app.job_id && sibling.status === "submitted",
        ),
    )
    .at(-1);
  assert.ok(
    active,
    "Seed an active fictional draft before workspace acceptance",
  );
  await openApplication(
    page,
    process.env.TEST_URL || "http://127.0.0.1:8769",
    active,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "output/playwright/shared-app-desktop.png",
    fullPage: true,
  });
  const visible = page.locator(".discover-card");
  const visibleCount = await visible.count();
  const originalId = active.id;
  const original = initial.state.applications.find((a) => a.id === originalId);
  assert.ok(
    original,
    "Seed an active synthetic draft before running workspace acceptance",
  );
  fs.appendFileSync(
    path.join(root, original.folder, original.documents["resume.pdf"]),
    "\n% Local edit\n",
  );
  await page.reload();
  await showPanel(page, "files");
  await page
    .getByRole("button", { name: "Validate edits as a new draft" })
    .click();
  await page.locator("#notice").filter({ hasText: "Saved." }).waitFor();
  const after = await (
    await page.request.get(new URL("/api/state", page.url()).href)
  ).json();
  const adopted = after.state.applications.at(-1);
  await applicationCard(page, adopted).waitFor();
  assert.equal(
    after.state.applications.length,
    initial.state.applications.length + 1,
    "Validation preserves the original and adds a version",
  );
  assert.equal(adopted.status, "draft");
  assert.equal(adopted.derived_from, original.id);
  await page.waitForURL(
    (url) =>
      url.searchParams.get("application") === adopted.id &&
      url.searchParams.get("panel") === "documents",
  );
  await showPanel(page, "files");
  assert.equal(
    await page
      .getByRole("combobox", { name: "Document version", exact: true })
      .inputValue(),
    adopted.id,
    "Validation opens its returned draft without manually selecting a version",
  );
  assert.equal(
    await visible.count(),
    visibleCount,
    "Editing changes the current version without increasing queue cards",
  );
  assert.equal(
    await applicationCard(page, original).count(),
    0,
    "The new draft replaces its earlier queue card",
  );
  assert.deepEqual(
    after.state.applications.find((a) => a.id === original.id).file_changes,
    [],
  );
  const adoptedPdf = path.join(
    root,
    adopted.folder,
    adopted.documents["resume.pdf"],
  );
  const verifiedPdf = fs.readFileSync(adoptedPdf);
  fs.appendFileSync(adoptedPdf, "\n% History validation edit\n");
  const folderParts = adopted.folder.split("/");
  const historyQuery = new URLSearchParams({
    role: folderParts[3],
    employer: folderParts[2],
  });
  await page.goto(new URL("/history/?" + historyQuery, page.url()).href);
  const historyEntry = page
    .locator(".history-version")
    .filter({ hasText: "Storage label: " + folderParts.slice(4).join("/") });
  await historyEntry.locator("summary").first().click();
  const [adoptionResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/history-adopt" &&
        response.request().method() === "POST",
    ),
    historyEntry
      .getByRole("button", {
        name: "Validate external edits as a new draft",
        exact: true,
      })
      .click(),
  ]);
  assert.equal(adoptionResponse.status(), 200);
  const historyDraft = (await adoptionResponse.json()).result;
  await historyEntry
    .getByRole("link", { name: "Review the new draft", exact: true })
    .click();
  await page.waitForURL(
    (url) =>
      url.searchParams.get("application") === historyDraft.id &&
      url.searchParams.get("view") === "applications" &&
      url.searchParams.get("panel") === "documents",
  );
  await applicationCard(page, historyDraft).waitFor();
  assert.equal(historyDraft.status, "draft");
  assert.ok(
    fs.readFileSync(adoptedPdf).equals(verifiedPdf),
    "History validation restores the verified original while publishing separate edits",
  );
  fs.mkdirSync(path.join(root, "master"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "master/main.tex"),
    "\\documentclass{article}\n\\begin{document}\nBuilt reliable distributed services.\n\\end{document}\n",
  );
  await page.reload();
  await page.getByRole("link", { name: "Career profile" }).click();
  await page
    .getByText("Changes need your review before generating applications.", {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Review master changes", exact: true })
    .click();
  await page
    .getByLabel("I reviewed the master changes and confirm the selected facts")
    .check();
  await page
    .getByRole("button", { name: "Confirm master updates", exact: true })
    .click();
  await page
    .getByText("Up to date with your confirmed source.", { exact: false })
    .waitFor();
  assert.ok(
    await page
      .getByText("Built Python APIs and automated integration tests.", {
        exact: true,
      })
      .count(),
  );
  await page.getByRole("link", { name: "Settings" }).click();
  // Substitute the OS dialog result; the protected switch still reaches the server.
  let selection = root + "-secondary";
  await page.route("**/api/workspace-browse", async (route) => {
    const action = fs.existsSync(path.join(selection, "state.json"))
      ? "workspace-open"
      : "workspace-create";
    const response = await route.fetch({
      url: new URL("/api/" + action, page.url()).href,
      postData: JSON.stringify({ path: selection }),
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Open Folder", exact: true }).click();
  await page.getByText(selection, { exact: true }).waitFor();
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("heading", { name: "No active applications", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Settings" }).click();
  selection = root;
  await page.getByRole("button", { name: "Open Folder", exact: true }).click();
  await page.getByText(root, { exact: true }).waitFor();
  await page.getByRole("link", { name: "Opportunities", exact: true }).click();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  await page
    .getByRole("heading", { name: "Software Engineer", exact: true })
    .first()
    .waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "output/playwright/shared-app-after-switch.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: external document edits, new draft validation, master changes/confirmation, supplemental facts, create/open/switch isolation, responsive views.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
