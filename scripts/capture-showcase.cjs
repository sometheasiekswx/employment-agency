// Record the real production UI in an explicitly fictional, disposable fixture.
// Start it with: .venv/bin/python tests/serve_concept_fixture.py --port 8788
const { chromium } = require('../frontend/node_modules/playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { showPanel } = require('../tests/browser-applications.cjs');

const root = path.resolve(__dirname, '..');
const origin = process.env.SHOWCASE_URL || 'http://127.0.0.1:8788';
const output = path.join(root, 'output/readme-showcase');
const media = path.join(root, 'docs/media');
const recorders = new WeakMap();
const pendingRecorders = new WeakMap();
const CAPTURE_SCALE = 2;
const CAPTURE_FPS = 20;
const selected = new Set((process.env.SHOWCASE_CLIPS || 'desktop,mobile,documents').split(','));
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(media, { recursive: true });

const wait = (page, ms) => page.waitForTimeout(ms);
const relative = file => path.relative(root, file).split(path.sep).join('/');

async function ready(page) {
  await page.locator('main#content').waitFor();
  await page.getByText('Demo · fictional profile', { exact: true }).filter({ visible: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await wait(page, 500);
  const pending = pendingRecorders.get(page);
  if (pending) {
    recorders.set(page, await startRecorder(...pending));
    pendingRecorders.delete(page);
    await recorders.get(page).capture();
  }
}

async function pacedScroll(page, locator, distance, steps = 18) {
  await locator.hover();
  for (let index = 0; index < steps; index++) {
    await page.mouse.wheel(0, distance / steps);
    await wait(page, 35);
  }
}

async function touchDrag(page, locator, distance, fraction = 0.5) {
  const client = await page.context().newCDPSession(page);
  try {
    const box = await locator.boundingBox();
    assert.ok(box, 'Drag surface must be visible');
    const x = box.x + box.width / 2;
    const y = box.y + box.height * fraction;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 24; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: y + distance * step / 24 }],
      });
      await wait(page, 16);
    }
    await wait(page, 120);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await client.detach(); }
}

async function capturePoster(page, file) {
  const frame = await recorders.get(page).capture();
  fs.copyFileSync(path.join(root, frame.file), file);
}

// CDP's screencast stream emits only CSS-resolution frames in current Chrome,
// even at DPR 2. Explicit captureScreenshot clips preserve real 2x raster detail.
async function startRecorder(context, page, directory, viewport, zero) {
  const client = await context.newCDPSession(page);
  const frames = [];
  const samples = [];
  let active = true;
  let previousHash = '';
  let previousFrame;
  let sequence = Promise.resolve();
  async function takeFrame() {
    const before = Date.now();
    const metrics = await client.send('Page.getLayoutMetrics');
    const view = metrics.cssVisualViewport;
    const image = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
      clip: { x: view.pageX, y: view.pageY, width: viewport.width,
        height: viewport.height, scale: CAPTURE_SCALE },
    });
    const after = Date.now();
    const data = Buffer.from(image.data, 'base64');
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    assert.equal(width, viewport.width * CAPTURE_SCALE, 'Never upscale a 1x source');
    assert.equal(height, viewport.height * CAPTURE_SCALE);
    const at_ms = Math.round((before + after) / 2 - zero);
    samples.push({ at_ms, latency_ms: after - before });
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (hash !== previousHash) {
      const file = path.join(directory, String(frames.length).padStart(5, '0') + '.png');
      fs.writeFileSync(file, data);
      previousFrame = { file: relative(file), at_ms, width, height, sha256: hash };
      frames.push(previousFrame);
      previousHash = hash;
    }
    return previousFrame;
  }
  const capture = () => {
    const frame = sequence.then(takeFrame);
    sequence = frame.then(() => {}, () => {});
    return frame;
  };
  let failure;
  const running = (async () => {
    while (active) {
      const started = Date.now();
      await capture();
      await wait(page, Math.max(0, 1000 / CAPTURE_FPS - (Date.now() - started)));
    }
  })().catch(error => { failure = error; active = false; });
  return {
    capture,
    async stop(start, end) {
      active = false;
      await running;
      if (failure) throw failure;
      const first = [...frames].reverse().find(frame => frame.at_ms <= start) || frames[0];
      const included = [
        { ...first, at_ms: start },
        ...frames.filter(frame => frame.at_ms > start && frame.at_ms < end),
      ];
      const timing = samples.filter(sample => sample.at_ms >= start && sample.at_ms <= end);
      const intervals = timing.slice(1).map((sample, index) => sample.at_ms - timing[index].at_ms);
      const sorted = [...intervals].sort((a, b) => a - b);
      await client.detach();
      return {
        frames: included.map((frame, index) => ({ ...frame,
          duration_ms: (included[index + 1]?.at_ms || end) - frame.at_ms })),
        capture_samples: timing.length,
        measured_capture_fps: +(timing.length / ((end - start) / 1000)).toFixed(2),
        median_capture_interval_ms: sorted[Math.floor(sorted.length / 2)] || 0,
        maximum_capture_interval_ms: intervals.length ? Math.max(...intervals) : 0,
      };
    },
  };
}

async function record(browser, slug, viewport, story, mobile = false) {
  const directory = path.join(output, 'png-' + slug);
  fs.mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: CAPTURE_SCALE,
    isMobile: mobile,
    hasTouch: mobile,
    reducedMotion: 'no-preference',
  });
  const zero = Date.now();
  const page = await context.newPage();
  pendingRecorders.set(page, [context, page, directory, viewport, zero]);
  const errors = [];
  const external = [];
  const actions = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      external.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => errors.push(error.message));
  const note = name => actions.push({ name, at_ms: Date.now() - zero });
  let result;
  let recording;
  try {
    result = await story(page, note, zero);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'Published walkthroughs must not contact external sites');
    result.body_font_css_px = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    recording = await recorders.get(page).stop(result.start_ms, result.end_ms);
  } finally {
    if (!recording && recorders.has(page)) await recorders.get(page).stop(0, Date.now() - zero).catch(() => {});
    await context.close();
  }
  return {
    slug,
    source_pipeline: 'Lossless Chromium captureScreenshot PNGs with an explicit 2x clip',
    viewport,
    device_scale_factor: CAPTURE_SCALE,
    display_width: viewport.width,
    output_width: viewport.width * CAPTURE_SCALE,
    target_capture_fps: CAPTURE_FPS,
    body_font_at_display_width_px: result.body_font_css_px,
    duration_seconds: (result.end_ms - result.start_ms) / 1000,
    poster: result.poster,
    actions,
    ...recording,
  };
}

async function desktop(page, note, zero) {
  await page.goto(origin + '/discover/?view=all');
  await ready(page);
  const card = page.getByRole('button', { name: 'Assess Cloud Software Engineer at Emberlane Systems', exact: true });
  const start_ms = Date.now() - zero;
  note('Location shortlist');
  await capturePoster(page, path.join(output, 'discover-board-poster.png'));
  await wait(page, 1900);
  await card.hover();
  await wait(page, 350);
  await card.click();
  const inspector = page.locator('.discover-inspector');
  await inspector.waitFor();
  note('Assess a role without leaving the location board');
  await wait(page, 1500);
  const poster = relative(path.join(output, 'discover-review-poster.png'));
  await capturePoster(page, path.join(root, poster));
  await inspector.getByText('Related evidence (1 fact)', { exact: true }).first().click();
  note('Open supporting career evidence');
  await wait(page, 1100);
  await pacedScroll(page, inspector.locator('.discover-inspector-body'), 390);
  note('Review gaps and requirements');
  await wait(page, 1700);
  await inspector.getByRole('button', { name: 'Next opportunity', exact: true }).click();
  note('Move to the next opportunity in place');
  await wait(page, 1600);
  const bookmark = inspector.locator('.discover-inspector-actions button[aria-pressed]');
  const originalSaved = await bookmark.getAttribute('aria-pressed') === 'true';
  const selectedTitle = await inspector.locator('.discover-inspector-body > h2').innerText();
  await bookmark.click();
  note(originalSaved ? 'Unsave a sample role' : 'Save a sample role');
  await wait(page, 1400);
  await inspector.getByRole('button', { name: 'Close opportunity details', exact: true }).click();
  note('Return to the preserved shortlist');
  await wait(page, 1700);
  const end_ms = Date.now() - zero;
  // Restore the disposable fixture outside the published clip, so reruns agree.
  const restoreLabel = `${originalSaved ? 'Save' : 'Unsave'} ${selectedTitle}`;
  await page.getByRole('button', { name: restoreLabel, exact: true }).click();
  await wait(page, 700);
  return { start_ms, end_ms, poster };
}

async function mobile(page, note, zero) {
  await page.goto(origin + '/discover/?view=all');
  await ready(page);
  const start_ms = Date.now() - zero;
  note('Mobile location shortlist');
  await wait(page, 1000);
  const search = page.getByRole('search', { name: 'Filter opportunities' }).getByRole('searchbox');
  await search.pressSequentially('Cloud', { delay: 90 });
  await page.waitForFunction(() => document.querySelectorAll('.discover-card').length === 1);
  note('Filter roles live while typing');
  await wait(page, 700);
  await page.getByRole('button', { name: 'Clear search', exact: true }).tap();
  await wait(page, 600);
  const role = page.getByRole('button', { name: 'Assess Cloud Software Engineer at Emberlane Systems', exact: true });
  await role.tap();
  const inspector = page.locator('.discover-inspector');
  await inspector.waitFor();
  note('Slide the native review sheet up from the bottom');
  await wait(page, 1200);
  const poster = relative(path.join(output, 'mobile-review-poster.png'));
  await capturePoster(page, path.join(root, poster));
  const grip = inspector.getByRole('button', { name: 'Resize opportunity details', exact: true });
  await touchDrag(page, grip, -280);
  note('Drag the grip upward to expand');
  await wait(page, 900);
  await inspector.getByText('Related evidence (1 fact)', { exact: true }).first().tap();
  await wait(page, 650);
  await touchDrag(page, inspector.locator('.discover-inspector-body'), -240, 0.72);
  note('Read evidence and requirements with native touch scrolling');
  await wait(page, 900);
  await touchDrag(page, grip, 320);
  note('Drag back to the peek position');
  await wait(page, 700);
  assert.equal(await grip.getAttribute('aria-expanded'), 'false');
  await touchDrag(page, grip, 350);
  await inspector.waitFor({ state: 'detached' });
  note('Drag all the way down to dismiss');
  await wait(page, 650);
  await role.tap();
  await inspector.waitFor();
  await wait(page, 750);
  await page.touchscreen.tap(180, 220);
  await inspector.waitFor({ state: 'detached' });
  note('Tap outside to dismiss');
  note('Return to the same shortlist position');
  await wait(page, 1000);
  return { start_ms, end_ms: Date.now() - zero, poster };
}

async function documents(page, note, zero) {
  await page.goto(origin + '/discover/?view=applications');
  await ready(page);
  const start_ms = Date.now() - zero;
  note('Review application packages');
  await wait(page, 1800);
  await page.getByRole('button', { name: 'Assess Cloud Software Engineer at Emberlane Systems', exact: true }).click();
  await showPanel(page, 'documents');
  await wait(page, 1000);
  await page.getByRole('button', { name: 'View / edit CV', exact: true }).first().click();
  const editor = page.getByRole('dialog');
  await editor.waitFor();
  await editor.locator('iframe').waitFor();
  note('View the generated sample CV and document blocks');
  await wait(page, 1900);
  const poster = relative(path.join(output, 'application-documents-poster.png'));
  await capturePoster(page, path.join(root, poster));
  await wait(page, 1700);
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await wait(page, 600);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('heading', { name: 'History', level: 1, exact: true }).waitFor();
  note('Find preserved document versions in History');
  await wait(page, 2000);
  await page.locator('.history-version summary').first().click();
  await wait(page, 1300);
  await page.getByRole('link', { name: 'Opportunities', exact: true }).click();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await page.getByRole('group', { name: 'Application stage', exact: true }).waitFor();
  await wait(page, 1400);
  return { start_ms, end_ms: Date.now() - zero, poster };
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const check = await browser.newContext();
    const response = await check.request.get(origin + '/api/state');
    assert.equal(response.status(), 200);
    const { state } = await response.json();
    assert.equal(state._workspace.demo, true, 'Capture only a marked demo');
    assert.equal(state.identity.name, 'Alex Morgan');
    assert.equal(state.identity.email, 'alex@example.test');
    assert.equal(state.jobs.length, 6);
    assert.equal(state.applications.length, 3);
    assert.ok(state.jobs.every(job => job.url.startsWith('https://example.test/concept/')));
    const served = await check.request.get(origin + '/discover/?view=all');
    assert.equal(served.status(), 200);
    const servedHtmlHash = crypto.createHash('sha256').update(await served.body()).digest('hex');
    await check.close();
    const clips = [];
    if (selected.has('desktop')) clips.push(await record(browser, 'discover-review', { width: 1120, height: 840 }, desktop));
    if (selected.has('mobile')) clips.push(await record(browser, 'mobile-review', { width: 390, height: 844 }, mobile, true));
    if (selected.has('documents')) clips.push(await record(browser, 'application-documents', { width: 1120, height: 840 }, documents));
    const after = await browser.newContext();
    const servedAfter = await after.request.get(origin + '/discover/?view=all');
    assert.equal(crypto.createHash('sha256').update(await servedAfter.body()).digest('hex'), servedHtmlHash,
      'The served application must not change during capture');
    await after.close();
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
      captured_at: new Date().toISOString(),
      source: 'Lossless 2x Chromium PNG capture of the actual built application; real clicks, hover and scrolling with measured frame timestamps',
      fixture: 'tests/serve_concept_fixture.py',
      candidate: 'Alex Morgan — fictional',
      opportunities: 'Six invented illustrative roles and employers, not live vacancies',
      application_mode: 'Normal local application on a disposable fictional workspace; the public preview is a separate read-only mode',
      mutations: 'One sample bookmark toggle, restored outside the published clip; no drafts edited, documents saved, messages sent or applications submitted',
      external_requests: 'No employer links or external accounts opened',
      served_html_sha256: servedHtmlHash,
      served_html_unchanged_before_after_capture: true,
      source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      source_working_tree_dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
      clips,
    }, null, 2) + '\n');
    console.log('Recorded:', clips.map(clip => `${clip.slug} (${clip.duration_seconds.toFixed(1)}s)`).join(', '));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
