// Run with PLAYWRIGHT_PATH pointing at an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8767");
  await page.getByRole('button', {name: 'Use this workspace', exact: true}).click();
  await page.getByRole('button', {name: 'Career evidence'}).click();
  await page.getByRole("heading", { name: "Your details" }).waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Alex Morgan");
  await page.getByLabel("Email", { exact: true }).fill("alex@example.test");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.locator("#notice").filter({ hasText: "Saved." }).waitFor();
  await page.getByText("Add experience or a skill", { exact: true }).click();
  await page
    .getByLabel("Statement", { exact: true })
    .fill("Built Python APIs and automated integration tests.");
  await page.getByRole("button", { name: "Save for confirmation" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByText("1 confirmed", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Search profiles" }).click();
  await page.getByText("Create another profile", { exact: true }).click();
  await page.getByLabel("Profile name").fill("Software engineering");
  await page.getByLabel("Roles, comma separated").fill("Engineer");
  await page.getByLabel("Locations, highest priority first").fill("Toronto");
  await page.getByLabel("Include stretch roles").check();
  await page.getByLabel("Prepare drafts when eligibility").check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByText("Edit Software engineering", { exact: true }).waitFor();
  await page
    .getByText("Paste an advert or add details manually", { exact: true })
    .click();
  await page.getByLabel("Job title", { exact: true }).fill("Software Engineer");
  await page.getByLabel("Employer", { exact: true }).fill("Fictional Systems");
  await page.getByLabel("Exact location").fill("Toronto");
  await page
    .getByLabel("Paste the job advert")
    .fill("Build Python APIs and integration tests.");
  await page.getByLabel("Requirements —").fill("Python APIs");
  await page.getByRole("button", { name: "Save job" }).click();
  await page.getByRole("button", { name: "Rank saved jobs" }).click();
  await page
    .getByRole("heading", { name: "Software Engineer · Fictional Systems" })
    .waitFor();
  await page.getByRole("button", { name: "Start a run", exact: true }).click();
  await page.getByLabel("Refresh configured live sources first").uncheck();
  await page.getByRole("button", { name: "Start bounded run" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#runs")?.textContent.includes(" · complete · "),
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: "Applications" }).click();
  await page
    .getByRole("heading", { name: "Software Engineer", exact: true })
    .waitFor();
  assert.equal(await page.locator('a[href^="/files/"]').count(), 8);
  const pdf = await page.request.get(new URL(await page.getByRole('link', {name:'CV PDF', exact:true}).getAttribute('href'),page.url()).href);
  assert.equal(pdf.status(),200); assert.match(pdf.url(),/history\/files/);
  assert.ok((await pdf.body()).subarray(0,4).toString()==='%PDF');
  assert.equal(await page.locator('select[name="status"]').count(), 0);
  assert.equal(await page.locator('.application-details dd').filter({hasText:/^unknown$/i}).count(),0);
  await page.locator('.fit-summary').waitFor();
  fs.mkdirSync('output/playwright',{recursive:true});
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
  await page.screenshot({path:'output/playwright/current-applications.png',fullPage:true});
  await page.getByLabel('Comments', {exact:true}).fill('Reviewed the tailored files.');
  await page.getByRole('button', {name:'Save comment',exact:true}).click();
  await page.getByText('Review history (1)', {exact:true}).waitFor();
  await page.getByRole('button', {name:'Reject',exact:true}).click();
  await page.getByRole('button', {name:'Rejected (1)',exact:true}).click();
  await page.getByRole('button', {name:'Return to Active',exact:true}).click();
  await page.getByRole('button', {name:'Active (1)',exact:true}).click();
  await page.getByRole('button', {name:'Submitted',exact:true}).click();
  await page.getByRole('button', {name:'Submitted (1)',exact:true}).click();
  await page.locator('article').waitFor();
  assert.equal(await page.getByRole('button', {name:'Reject',exact:true}).count(),0);
  await page.getByLabel('Comments', {exact:true}).fill('Saved after submission.');
  await page.getByRole('button', {name:'Save comment',exact:true}).click();
  await page.getByText('Review history (5)', {exact:true}).waitFor();
  await page.reload();
  await page.getByRole('button', {name:'Submitted (1)',exact:true}).click();
  await page.locator('article').waitFor();
  await page.getByText('Review history (5)', {exact:true}).click();
  await page.getByText('Saved after submission.', {exact:false}).waitFor();
  fs.mkdirSync("output/playwright", { recursive: true });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({
    path: "output/playwright/applications-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({
    path: "output/playwright/applications-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings & recovery" }).click();
  await page.getByRole("heading", { name: "AI disclosure consent" }).waitFor();
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(() => document.activeElement !== document.body),
  );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "Browser workflow passed: identity, fact confirmation, profile, job, rank, run, review, responsive layout, no console errors.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
