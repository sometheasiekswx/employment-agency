// Production UI checks; run only through the disposable local fixture.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../frontend/node_modules/playwright');
const AxeBuilder = require('../frontend/node_modules/@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const url = process.env.TEST_URL;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const initial = await (await page.request.get(url + '/api/state')).json();
    assert.ok(initial.state._workspace.path.includes('employment-agency-folder-browser-'), 'Refuse a real workspace');
    const token = initial.token;
    async function action(operation, body) {
      const response = await page.request.post(url + '/api/' + operation, { data: body, headers: { Origin: url, 'X-Workspace-Token': token } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    }
    await action('workspace-settings', { setup_complete: true });
    await action('identity', { name: 'Alex Morgan', email: 'alex@example.test' });
    const fact = await action('fact', { text: 'Built reliable Python APIs and integration tests.', category: 'experience' });
    await action('confirm', { id: fact.id });
    const profile = await action('profile', { name: 'Engineering', roles: ['Engineer'], locations: ['Toronto'], hard: ['roles', 'locations'], include_unknown: true, include_stretch: true });
    const job = await action('job', { title: 'Software Engineer', employer: 'Fictional Systems', location: 'Toronto', description: 'Build Python APIs', requirements: ['Python APIs'] });
    await action('local-package', { profile_id: profile.id, job_id: job.id });
    fs.mkdirSync('output/playwright/redesign', { recursive: true });
    fs.mkdirSync('.impeccable/review', { recursive: true });
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [route, title] of [['/', 'Applications'], ['/career/', 'Career evidence'], ['/search/', 'Search profiles'], ['/history/', 'Application history'], ['/settings/', 'Your workspace']]) {
        await page.goto(url + route);
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}`);
        assert.equal(await page.locator('nav [aria-current="page"]').count(), 1);
        const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations;
        assert.deepEqual(violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${route} accessibility at ${width}`);
        if (width === 1440) await page.screenshot({ path: `output/playwright/redesign/${route === '/' ? 'applications' : route.split('/')[1]}-desktop.png` });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(url);
    await page.getByRole('heading', { name: 'Software Engineer', exact: true }).waitFor();
    await page.screenshot({ path: '.impeccable/review/desktop.png' });
    // The proximity spring must never shift a link's actual hit target.
    const link = page.getByRole('link', { name: 'Career evidence', exact: true });
    const before = await link.boundingBox();
    await link.hover();
    await page.waitForTimeout(250);
    const after = await link.boundingBox();
    assert.deepEqual(after, before);
    assert.ok(await link.locator('.dock-icon').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).a) > 1.02, 'React Bits proximity spring responds to the pointer');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.getByRole('heading', { name: 'Software Engineer', exact: true }).waitFor();
    await link.hover();
    const icon = link.locator('.dock-icon');
    assert.equal(await icon.evaluate(node => getComputedStyle(node).transform), 'none');
    await link.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Your details', exact: true }).waitFor();
    await page.getByLabel('Name', { exact: true }).fill('Unsaved synthetic draft');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    assert.ok(page.url().endsWith('/career/'), 'Draft guard cancelled navigation');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await page.getByRole('heading', { name: 'Software Engineer', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('heading', { name: 'Software Engineer', exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: '.impeccable/review/mobile.png' });
    await page.setViewportSize({ width: 320, height: 900 });
    const dock = await page.locator('.dock-panel').boundingBox();
    assert.ok(dock.y > 700 && dock.y + dock.height <= 900, 'Mobile dock belongs at viewport bottom');
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > innerWidth + 1).map(n => ({tag:n.tagName, cls:n.className, width:n.getBoundingClientRect().width, right:n.getBoundingClientRect().right})));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '200% text overflow: ' + JSON.stringify(overflow));
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    assert.deepEqual(errors, []);
    console.log('PASS: five routes at four widths, WCAG axe checks, stable navigation targets, reduced motion, keyboard/draft guard, mobile dock and 200% text.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
