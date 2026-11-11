const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const {
  chromium,
  webkit,
  devices,
} = require("../frontend/node_modules/playwright");
const { unzipSync, strFromU8 } = require("../frontend/node_modules/fflate");
const AxeBuilder =
  require("../frontend/node_modules/@axe-core/playwright").default;

const base = process.env.TEST_URL;
const visitor = "Demo Visitor Privacy Check 71294";

async function prepare(page, role) {
  await page
    .getByRole("link", { name: "Employment Agency — Opportunities" })
    .click();
  await page.getByRole("button", { name: role, exact: true }).click();
  const inspector = page.locator(".discover-inspector");
  await inspector
    .getByRole("button", { name: "Prepare draft", exact: true })
    .click();
  await inspector
    .getByRole("link", { name: "Review documents", exact: true })
    .click();
  return page.getByRole("region", { name: "Edit demo draft" });
}

async function accessible(page, selector) {
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    result.violations.map((violation) => violation.id),
    [],
  );
}

async function documents(page, snapshot) {
  await page.goto(base + "/career/");
  const input = page.getByLabel("Your résumé file");
  if (snapshot.demo_resume) {
    await page
      .getByRole("heading", { name: snapshot.demo_resume.name, exact: true })
      .waitFor();
    const master = page.getByRole("link", { name: "View demo master PDF" });
    assert.equal(await master.getAttribute("href"), snapshot.demo_resume.pdf);
    const editor = await prepare(
      page,
      "Assess Full Stack Engineer at Paperwell Studio",
    );
    assert.equal(
      await editor.getByRole("textbox", { name: "CV draft" }).inputValue(),
      snapshot.demo_resume.text.trim(),
    );
    await page.goto(base + "/career/");
  }
  await input.waitFor();
  await accessible(page, ".demo-resume-panel");
  for (const ext of ["pdf", "docx"]) {
    const key = Object.keys(snapshot.files).find(
      (key) => key.startsWith("application:") && key.endsWith(":resume." + ext),
    );
    assert.ok(key, "A sample CV is available in " + ext);
    const asset = snapshot.files[key];
    const bytes = await (await page.request.get(base + asset)).body();
    await input.setInputFiles({
      name: "sample." + ext,
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    await page
      .getByRole("button", { name: "Read résumé", exact: true })
      .click();
    const review = page.getByLabel("Review extracted résumé text");
    await review.waitFor();
    const extracted = await review.inputValue();
    if (snapshot.demo_resume)
      assert.ok(
        extracted.replace(/\s+/g, " ").includes(snapshot.demo_resume.name),
      );
    else assert.match(extracted, /Fictional sample profile/i);
    await page
      .getByRole("button", { name: "Use this résumé", exact: true })
      .click();
    await review.waitFor({ state: "hidden" });
  }
  await input.setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("   "),
  });
  await page.getByRole("button", { name: "Read résumé", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "selectable text" })
    .waitFor();
  await input.setInputFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      visitor + "\nBuilt reliable Python APIs for a fictional employer.",
    ),
  });
  await page.getByRole("button", { name: "Read résumé", exact: true }).click();
  const review = page.getByLabel("Review extracted résumé text");
  await review.fill((await review.inputValue()) + "\nReviewed locally.");
  await page
    .getByRole("button", { name: "Use this résumé", exact: true })
    .click();
  const editor = await prepare(page, "Assess Backend Engineer at Bayform Labs");
  const cv = editor.getByRole("textbox", { name: "CV draft" });
  assert.match(await cv.inputValue(), new RegExp(visitor + ".*", "s"));
  await cv.fill((await cv.inputValue()) + "\nEdited in the current tab.");
  await accessible(page, ".demo-draft-editor");
  for (const [format, ext] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      editor
        .getByRole("button", { name: "Download " + format, exact: true })
        .click(),
    ]);
    assert.equal(download.suggestedFilename(), "cv-draft." + ext);
    const path = await download.path();
    const extracted =
      ext === "docx"
        ? strFromU8(
            unzipSync(new Uint8Array(await readFile(path)))[
              "word/document.xml"
            ],
          )
        : execFileSync(
            process.env.PYTHON_EXECUTABLE || "python3",
            [
              "-c",
              "import sys; from pypdf import PdfReader; print(' '.join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))",
              path,
            ],
            { encoding: "utf8" },
          );
    assert.match(extracted, /Edited in the current tab\./);
    assert.match(extracted, new RegExp(visitor));
  }
  await editor
    .getByRole("button", { name: "Cover letter", exact: true })
    .click();
  assert.match(
    await editor
      .getByRole("textbox", { name: "Cover letter draft" })
      .inputValue(),
    /Backend Engineer role/,
  );
  for (const [format, ext] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      editor
        .getByRole("button", { name: "Download " + format, exact: true })
        .click(),
    ]);
    assert.equal(download.suggestedFilename(), "cover-letter-draft." + ext);
    assert.ok((await readFile(await download.path())).length > 100);
  }
  assert.equal(
    await page.evaluate(
      (marker) =>
        [
          location.href,
          JSON.stringify(localStorage),
          JSON.stringify(sessionStorage),
        ].some((value) => value.includes(marker)),
      visitor,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Close application workspace" })
    .click();
  await page.getByRole("button", { name: "Applications", exact: true }).click();
  const active =
    snapshot.state.applications.filter(
      (app) => app.status === "draft" || app.status === "reviewed",
    ).length + 1;
  await page
    .getByRole("button", { name: `Active ${active}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Assess Backend Engineer at Bayform Labs" })
    .waitFor();
  await page.goto(base + "/discover/?view=applications&section=active");
  await page
    .getByRole("button", { name: "Applications", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("region", { name: "Edit demo draft" }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Assess Backend Engineer at Bayform Labs" })
      .count(),
    0,
  );
}

async function main() {
  const safari = process.env.TEST_DEMO_WEBKIT === "1";
  const browser = safari
    ? await webkit.launch()
    : await chromium.launch({ channel: "chrome" });
  try {
    const context = await browser.newContext(
      safari
        ? { ...devices["iPhone 15"] }
        : { viewport: { width: 390, height: 844 } },
    );
    let open = true;
    let reads = 0;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(url.href.includes(encodeURIComponent(visitor)), false);
      assert.equal(request.postData(), null);
      assert.ok(["GET", "HEAD"].includes(request.method()));
      if (url.origin === base) {
        assert.ok(!url.pathname.startsWith("/api/"));
        return route.continue();
      }
      assert.equal(url.origin, "https://api.smartrecruiters.com");
      assert.match(url.pathname, /^\/v1\/companies\/[A-Za-z0-9_-]+\/postings$/);
      assert.equal(request.headers().cookie, undefined);
      reads++;
      if (
        url.pathname.endsWith("/BoschGroup/postings") &&
        url.searchParams.get("country") === "sg"
      )
        return route.fulfill({
          headers: { "access-control-allow-origin": "*" },
          json: {
            content: open
              ? [
                  {
                    uuid: "21bff10a-e04f-4a13-892f-c89310e56144",
                    id: "744000111111111",
                    name: "Feed Test Engineer",
                    location: {
                      country: "sg",
                      city: "Singapore",
                      fullLocation: "Singapore",
                    },
                    releasedDate: "2026-11-12T00:00:00.000Z",
                  },
                ]
              : [],
          },
        });
      return route.abort();
    });
    const snapshot = await (
      await page.request.get(base + "/demo/preview.json")
    ).json();
    await page.goto(base + "/discover/?view=all");
    if (snapshot.demo_resume) {
      const header = page.getByRole("complementary", {
        name: "Public preview information",
      });
      await header
        .getByText(snapshot.demo_resume.name + " · Public demo", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await header
          .getByRole("link", { name: "View résumé (PDF)" })
          .getAttribute("href"),
        "/demo/master-resume.pdf",
      );
    }
    const role = page.getByRole("button", {
      name: "Assess Feed Test Engineer at Bosch Group",
    });
    const listing = page.getByRole("link", {
      name: "View listing for Feed Test Engineer at Bosch Group",
    });
    assert.equal(
      await listing.getAttribute("href"),
      "https://jobs.smartrecruiters.com/BoschGroup/744000111111111",
    );
    assert.equal(await listing.getAttribute("target"), "_blank");
    await role.click();
    const inspector = page.locator(".discover-inspector");
    assert.equal(
      await inspector
        .getByRole("link", { name: "Feed Test Engineer" })
        .getAttribute("href"),
      "https://jobs.smartrecruiters.com/BoschGroup/744000111111111",
    );
    assert.equal(
      await inspector
        .getByRole("link", { name: "Bosch Group", exact: true })
        .getAttribute("href"),
      "https://careers.smartrecruiters.com/BoschGroup",
    );
    await inspector
      .getByRole("button", { name: "Save Feed Test Engineer", exact: true })
      .click();
    await page.getByRole("status").filter({ hasText: "Role saved." }).waitFor();
    await inspector
      .getByRole("button", { name: "Close opportunity details", exact: true })
      .click();
    await page.waitForURL((url) => !url.searchParams.has("opportunity"));
    open = false;
    await page.reload();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await role.click();
    await page.getByText("Saved employer snapshot", { exact: true }).waitFor();
    await documents(page, snapshot);
    assert.ok(reads >= snapshot.job_sources.length);
    assert.deepEqual(errors, []);
    console.log(
      "Static demo passed employer refresh, preserved closed bookmark, PDF/DOCX imports, editable draft exports and tab privacy.",
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
