const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let refreshes = 0;
    let failRefresh = true;
    await page.route('https://example.supabase.co/auth/v1/token?grant_type=refresh_token', route => {
      if(route.request().method()!=='OPTIONS')refreshes++;
      return route.fulfill({ status: failRefresh && route.request().method()!=='OPTIONS' ? 401 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers':'apikey,content-type', 'Access-Control-Allow-Methods':'POST,OPTIONS' }, body: JSON.stringify({ access_token: 'fixture-session', refresh_token: 'fixture', expires_in: 3600 }) });
    });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('ea-fixture-started')) {
        sessionStorage.setItem('ea-fixture-started', 'true');
        sessionStorage.setItem('ea-cloud-session', JSON.stringify({ access_token: 'expired', refresh_token: 'fixture', expires_at: 1 }));
      }
    });
    const base = process.env.TEST_URL;
    await page.goto(base + '/history/');
    await page.getByRole('heading',{name:'Unable to open your workspace',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Sign in again',exact:true}).isVisible(),true);
    failRefresh = false;
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.getByRole('heading', { name: 'Toronto', exact: true }).waitFor();
    assert.equal(refreshes, 2);
    assert.equal((await page.request.get(base + '/api/state')).status(), 401);
    const company = page.locator('section > details').first();
    await company.locator('summary').first().click();
    await company.locator('details summary').first().click();
    const file = company.getByRole('link').filter({ hasText: /\.pdf$/ }).first();
    const download = page.waitForEvent('download'); await file.click();
    assert.match((await download).suggestedFilename(), /\.pdf$/);
    await page.getByRole('link', { name: 'Settings & recovery' }).click();
    assert.equal(await page.getByRole('button', { name: 'Open Folder', exact: true }).count(), 0);
    const exportDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export private workspace', exact: true }).click();
    assert.equal((await exportDownload).suggestedFilename(), 'career-workspace.zip');
    await page.getByLabel('Type DELETE', { exact: true }).fill('WRONG');
    await page.getByRole('button', { name: 'Delete account and data', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Type DELETE to confirm' }).waitFor();
    await page.getByLabel('Type DELETE', { exact: true }).fill('DELETE');
    await page.getByRole('button', { name: 'Delete account and data', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ea-cloud-session')), null);
    assert.deepEqual(errors, []);
    console.log('PASS: hosted refresh, unauthenticated rejection, history download, export, local capability restriction and fictional account deletion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
