// Record the deployed public demo in a fresh browser context for each clip.
const { chromium } = require('../frontend/node_modules/playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { showPanel } = require('../tests/browser-applications.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://employment-agency-demo.vercel.app';
const boardUrl = origin + '/discover/';
const output = path.join(root, 'output/readme-showcase');
const recorders = new WeakMap();
const pendingRecorders = new WeakMap();
const CAPTURE_SCALE = 2;
const CAPTURE_FPS = 20;
const selected = new Set((process.env.SHOWCASE_CLIPS || 'desktop,mobile,documents').split(','));
fs.mkdirSync(output, { recursive: true });

const wait = (page, ms) => page.waitForTimeout(ms);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const spotlightRole = 'Assess Senior / Lead Software Engineer, Anti-Scam Products at Open Government Products';

async function ready(page) {
  await page.getByText('Public demo', { exact: true }).filter({ visible: true }).first().waitFor();
  await page.locator('.discover-card').first().waitFor();
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

async function touchDrag(page, locator, distance, { fraction = 0.5, beforeEnd } = {}) {
  const client = await page.context().newCDPSession(page);
  try {
    const box = await locator.boundingBox();
    assert.ok(box, 'Drag surface must be visible');
    const x = box.x + box.width / 2;
    const y = box.y + box.height * fraction;
    const viewport = page.viewportSize();
    assert.ok(viewport && x > 0 && x < viewport.width &&
      Math.min(y, y + distance) > 0 && Math.max(y, y + distance) < viewport.height,
    'Published touch gestures must stay inside the visible viewport');
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 24; step++) {
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: y + distance * step / 24 }],
      });
      await wait(page, 16);
    }
    if (beforeEnd) await beforeEnd();
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
    const hash = sha256(data);
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
  page.setDefaultTimeout(15000);
  pendingRecorders.set(page, [context, page, directory, viewport, zero]);
  const errors = [];
  const blocked = [];
  const actions = [];
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      blocked.push(`${request.method()} ${url.href}`);
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
    assert.deepEqual(blocked, [], 'Capture must use only read requests to the public demo');
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
  await page.goto(boardUrl);
  await ready(page);
  const card = page.getByRole('button', { name: spotlightRole, exact: true });
  const start_ms = Date.now() - zero;
  note('Company shortlist');
  await wait(page, 1000);
  const filters = page.locator('.discover-filters > summary');
  await filters.click();
  await page.getByRole('combobox', { name: 'Location', exact: true }).selectOption({ label: 'Singapore' });
  note('Filter the company board to Singapore');
  await wait(page, 1200);
  await filters.click();
  await wait(page, 450);
  await card.hover();
  await wait(page, 350);
  await card.click();
  const inspector = page.locator('.discover-inspector');
  await inspector.waitFor();
  await inspector.getByRole('region', { name: 'Career evidence' }).waitFor();
  note('Assess a role without leaving the company board');
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
  const bookmark = inspector.getByRole('button', { name: /^(Apply later|Remove from To apply)$/ });
  assert.equal(await bookmark.getAttribute('aria-pressed'), 'false');
  await bookmark.click();
  await inspector.getByRole('button', { name: 'Remove from To apply', exact: true, pressed: true }).waitFor();
  note('Add a role to To apply in the demo browser');
  await wait(page, 1400);
  await inspector.getByRole('button', { name: 'Close opportunity details', exact: true }).click();
  note('Return to the preserved shortlist');
  await wait(page, 1700);
  return { start_ms, end_ms: Date.now() - zero, poster };
}

async function mobile(page, note, zero) {
  await page.goto(boardUrl);
  await ready(page);
  const start_ms = Date.now() - zero;
  note('Mobile company shortlist');
  await wait(page, 1000);
  const search = page.getByRole('search', { name: 'Filter opportunities' }).getByRole('searchbox');
  await search.pressSequentially('Anti-Scam', { delay: 120 });
  await page.waitForFunction(() => document.querySelectorAll('.discover-card').length === 1);
  note('Filter roles live while typing');
  await wait(page, 700);
  const role = page.getByRole('button', { name: spotlightRole, exact: true });
  await role.tap();
  const inspector = page.locator('.discover-inspector');
  await inspector.waitFor();
  note('Open the mobile opportunity sheet');
  const evidence = inspector.getByText('Related evidence (1 fact)', { exact: true }).first();
  await evidence.waitFor();
  await wait(page, 800);
  const poster = relative(path.join(output, 'mobile-review-poster.png'));
  await capturePoster(page, path.join(root, poster));
  const grip = inspector.getByRole('button', { name: 'Resize opportunity details', exact: true });
  const body = inspector.locator('.discover-inspector-body');
  const company = inspector.locator('.discover-inspector-company');
  const footer = inspector.locator('.discover-inspector-footer');
  await touchDrag(page, body, -470, {
    fraction: 0.88,
    beforeEnd: async () => assert.ok(await body.evaluate(element => element.scrollTop) > 90,
      'The same contact must expand the partial sheet and scroll before lifting'),
  });
  note('Expand from the content and keep reading in one swipe');
  await wait(page, 750);
  assert.equal(await grip.getAttribute('aria-expanded'), 'true');
  const previousScroll = await body.evaluate(element => element.scrollTop);
  await touchDrag(page, body, -140, { fraction: 0.75 });
  await wait(page, 350);
  assert.ok(await body.evaluate(element => element.scrollTop) > previousScroll + 40,
    'The next expanded contact must continue scrolling the body');
  note('Continue reading in the expanded sheet');
  await wait(page, 550);
  await touchDrag(page, company, 320);
  note('Drag the company header down to the partial sheet');
  await wait(page, 600);
  assert.equal(await grip.getAttribute('aria-expanded'), 'false');
  const bookmark = footer.getByRole('button', { name: /^(Apply later|Remove from To apply)$/ });
  const originalSaved = await bookmark.getAttribute('aria-pressed');
  await touchDrag(page, bookmark, -330);
  await wait(page, 600);
  assert.equal(await grip.getAttribute('aria-expanded'), 'true');
  assert.equal(await bookmark.getAttribute('aria-pressed'), originalSaved,
    'Swiping from the footer must preserve the To apply choice');
  note('Swipe up from the footer control to expand');
  await touchDrag(page, company, 320);
  await wait(page, 500);
  assert.equal(await grip.getAttribute('aria-expanded'), 'false');
  await touchDrag(page, body, 155, { fraction: 0.15 });
  await inspector.waitFor({ state: 'detached' });
  note('Drag the partial-sheet content down to close');
  await wait(page, 650);
  await role.tap();
  await inspector.waitFor();
  await wait(page, 550);
  await evidence.tap();
  assert.equal(await evidence.evaluate(element => element.parentElement.open), true,
    'An ordinary disclosure tap must still work after footer dragging');
  note('Tap supporting evidence normally');
  await wait(page, 500);
  await page.touchscreen.tap(180, 220);
  await inspector.waitFor({ state: 'detached' });
  note('Tap outside to dismiss');
  await search.waitFor();
  assert.equal(await search.inputValue(), 'Anti-Scam', 'Closing the sheet must preserve the search');
  await wait(page, 1000);
  return { start_ms, end_ms: Date.now() - zero, poster };
}

async function documents(page, note, zero) {
  await page.goto(boardUrl + '?view=applications&section=active');
  await ready(page);
  const start_ms = Date.now() - zero;
  note('Review application packages');
  await wait(page, 1300);
  await page.getByRole('button', { name: 'Assess Operations Engineer I at Oscar Health', exact: true }).click();
  await showPanel(page, 'files');
  await page.getByRole('combobox', { name: 'Document version', exact: true }).waitFor();
  assert.match(await page.getByRole('link', { name: 'CV PDF', exact: true }).first().getAttribute('href'),
    /^\/demo\/files\/[a-f0-9]+\.pdf$/);
  note('Review sample document files and their preserved version');
  await wait(page, 1100);
  const poster = relative(path.join(output, 'application-documents-poster.png'));
  await capturePoster(page, path.join(root, poster));
  await page.getByText('Supporting files & source evidence', { exact: true }).first().click();
  await pacedScroll(page, page.locator('.discover-inspector-body'), 280, 12);
  const sourceEvidence = page.getByRole('link', { name: 'Source evidence', exact: true }).first();
  await sourceEvidence.scrollIntoViewIfNeeded();
  const evidenceFile = await sourceEvidence.boundingBox();
  assert.ok(evidenceFile && evidenceFile.y > 0 &&
    evidenceFile.y + evidenceFile.height < page.viewportSize().height,
  'The supporting source-evidence file must be visible in the recording');
  note('Inspect supporting files and source evidence');
  await wait(page, 1000);
  await page.getByRole('link', { name: 'View application history', exact: true }).click();
  await page.getByRole('heading', { name: 'History', level: 1, exact: true }).waitFor();
  note('Find preserved document versions in History');
  await wait(page, 1400);
  const version = page.locator('.history-version summary').first();
  await version.click();
  note('Expand the preserved sample version');
  await wait(page, 1200);
  await page.getByRole('link', { name: 'Opportunities', exact: true }).click();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await page.getByRole('group', { name: 'Application stage', exact: true }).waitFor();
  await wait(page, 1100);
  return { start_ms, end_ms: Date.now() - zero, poster };
}

async function deployedSource(browser) {
  const context = await browser.newContext();
  try {
    async function read(pathname) {
      const url = origin + pathname;
      const response = await context.request.get(url, { maxRedirects: 0 });
      assert.equal(response.status(), 200, url);
      return response;
    }
    const release = await (await read('/release.json')).json();
    assert.match(release.commit, /^[a-f0-9]{40}$/);
    const bundle = await read('/demo/preview.json');
    const snapshot = await bundle.json();
    assert.equal(snapshot.public_preview, true);
    assert.equal(snapshot.state._workspace.demo, true);
    assert.equal(snapshot.listing_mode, 'reviewed');
    assert.equal(snapshot.revision, release.fixtureRevision);
    assert.equal(snapshot.demo_resume?.pdf, '/demo/master-resume.pdf');
    return {
      origin,
      release,
      served_html_sha256: sha256(await (await read('/discover/')).body()),
      preview_sha256: sha256(await bundle.body()),
    };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const source = await deployedSource(browser);
    const clips = [];
    if (selected.has('desktop')) clips.push(await record(browser, 'discover-review', { width: 1120, height: 840 }, desktop));
    if (selected.has('mobile')) clips.push(await record(browser, 'mobile-review', { width: 390, height: 844 }, mobile, true));
    if (selected.has('documents')) clips.push(await record(browser, 'application-documents', { width: 1120, height: 840 }, documents));
    assert.deepEqual(await deployedSource(browser), source, 'The public deployment must stay consistent during capture');
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
      captured_at: new Date().toISOString(),
      source: 'Lossless 2x Chromium PNG capture of the deployed public demo using browser clicks, scrolling and touch input',
      deployment: source,
      deployment_unchanged_before_after_capture: true,
      content: 'Reviewed employer listing snapshots, the approved public profile and sample application documents.',
      browser_state: 'Each clip ran in a fresh context. The desktop To apply selection was discarded when its context closed.',
      network: 'Only GET and HEAD requests to the public demo origin were allowed.',
      clips,
    }, null, 2) + '\n');
    console.log('Recorded:', clips.map(clip => `${clip.slug} (${clip.duration_seconds.toFixed(1)}s)`).join(', '));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
