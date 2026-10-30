// Capture the real production UI. Never point this at personal career data.
const { chromium } = require('../frontend/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const url = process.env.DEMO_URL || 'http://127.0.0.1:8777';
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 840 }, reducedMotion: 'reduce' });
    const state = (await (await page.request.get(url + '/api/state')).json()).state;
    assert.equal(state._workspace.demo, true);
    assert.equal(state.identity.email, 'alex.morgan@example.test');
    assert.equal(state.jobs.length, 14);
    assert.equal(state.applications.length, 12);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const directory = 'output/demo-frames'; fs.mkdirSync(directory, { recursive: true });
    const frames = [];
    async function capture(name, duration = 1500) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = `${directory}/${String(frames.length).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: file, animations: 'disabled' });
      frames.push({ file, duration, name });
    }
    await page.goto(url);
    await page.getByRole('heading', { name: 'Applications', exact: true }).waitFor();
    await page.getByText('Demo · fictional profile', { exact: true }).waitFor();
    await capture('applications', 2200);
    await page.getByRole('button', { name: 'Toronto', exact: true }).click();
    await page.locator('article').first().waitFor();
    await capture('canada', 1800);
    for (const city of ['Boston', 'San Francisco']) {
      await page.getByRole('button', { name: city, exact: true }).click();
      await page.locator('article').first().waitFor();
      await capture(city.toLowerCase().replaceAll(' ', '-'), 1800);
    }
    await page.getByRole('button', { name: 'Toronto', exact: true }).click();
    await page.getByRole('button', { name: 'View / edit CV', exact: true }).first().click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.locator('iframe').waitFor();
    await page.waitForTimeout(500); // Allow the native PDF viewer to render its first page.
    await capture('resume-preview', 2200);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('link', { name: 'Career evidence', exact: true }).click();
    await page.getByRole('heading', { name: 'Your details', exact: true }).waitFor();
    await capture('career', 1800);
    await page.getByRole('link', { name: 'Search profiles', exact: true }).click();
    await page.getByLabel('Active profile', { exact: true }).selectOption({ label: 'All destinations' });
    await page.getByRole('button', { name: 'Rank saved jobs', exact: true }).click();
    await page.locator('article').first().waitFor();
    await page.locator('article').first().scrollIntoViewIfNeeded();
    await capture('real-job-matches', 2400);
    await page.getByRole('link', { name: 'Application history', exact: true }).click();
    await page.getByRole('heading', { name: 'New York', exact: true }).waitFor();
    await page.locator('#content summary').first().click();
    await capture('history', 1800);
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('heading', { name: 'Applications', exact: true }).waitFor();
    await capture('queue', 1800);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload(); await page.getByRole('heading', { name: 'Applications', exact: true }).waitFor();
    await page.screenshot({ path: 'output/demo-frames/mobile.png', animations: 'disabled' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(directory + '/manifest.json', JSON.stringify({ source: 'Playwright screenshots of the actual local production export', fictional_candidate: true, real_job_snapshots: true, frames }, null, 2));
    console.log('Captured demo: queue, Canada filter, generated PDF, career source, ranking, version history and mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
