// Run after browser.cjs on the same disposable local fixture.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('400 (Bad Request)') && !(message.text().includes('404') && message.location().url.endsWith('/missing-page/'))) errors.push(message.text() + " [" + message.location().url + "]"); });
    const base = process.env.TEST_URL || 'http://127.0.0.1:8774';
    await page.goto(base);
    const read = async () => (await (await page.request.get(base + '/api/state')).json());
    const initial = (await read()).state;
    const root = initial._workspace.path;
    assert.match(root, /employment-agency-folder-browser-/);
    const submitted = initial.applications.find(app => app.status === 'submitted');
    assert.ok(submitted, 'Run browser.cjs first to seed a submitted synthetic version');
    const pdf = path.join(root, submitted.folder, submitted.documents['resume.pdf']);
    const hash = () => crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');
    const originalHash = hash();
    const action = async (name, data) => {
      const token = (await read()).token;
      const response = await page.request.post(base + '/api/' + name, { data, headers: { Origin: base, 'X-Workspace-Token': token } });
      assert.equal(response.status(), 200, await response.text());
      return (await response.json()).result;
    };
    const job = await action('job', { title: 'Software Engineer', employer: 'Fictional Expansion', location: 'Toronto', description: 'Build Python APIs', requirements: ['Python APIs'], availability: 'retrieved' });
    await action('local-package', { profile_id: initial.profiles[0].id, job_id: job.id });
    await page.reload();

    await page.getByRole('link', { name: 'Career evidence' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Unsaved name');
    await page.waitForTimeout(8500); // Exercise the actual local polling interval.
    assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Unsaved name');
    assert.equal((await read()).state.identity.name, initial.identity.name);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link', { name: 'Search profiles' }).click();
    assert.match(page.url(), /\/career\/$/);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Search profiles' }).click();
    await page.waitForURL('**/search/');
    await page.goBack();
    await page.getByRole('heading', { name: 'Your details' }).waitFor();
    assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), initial.identity.name);

    await page.route('**/api/identity', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Rejected fixture save' }) }));
    await page.getByLabel('Name', { exact: true }).fill('Retained draft');
    await page.getByRole('button', { name: 'Save details' }).click();
    await page.getByRole('alert').filter({ hasText: 'Rejected fixture save' }).waitFor();
    assert.equal(await page.getByLabel('Name', { exact: true }).inputValue(), 'Retained draft');
    await page.unroute('**/api/identity');
    await page.getByRole('button', { name: 'Save details' }).click();
    await page.locator('#notice').filter({ hasText: 'Saved.' }).waitFor();
    await page.getByText('Add experience or a skill', { exact: true }).click();
    const malicious = '<img src=x onerror=window.__injected=true>';
    await page.getByLabel('Statement', { exact: true }).first().fill(malicious);
    await page.getByRole('button', { name: 'Save for confirmation' }).first().click();
    await page.locator('.fact > p').filter({ hasText: malicious }).waitFor();
    assert.equal(await page.locator('img[src=x]').count(), 0);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    await page.getByLabel('Resume file', { exact: true }).setInputFiles({ name: 'supplement.txt', mimeType: 'text/plain', buffer: Buffer.from('Built reliable dashboards for fictional systems.') });
    await page.getByLabel('Use this file as my master resume', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Import for review' }).click();
    await page.locator('#notice').filter({ hasText: 'candidate facts imported' }).waitFor();

    await page.getByRole('link', { name: 'Search profiles' }).click();
    await page.getByText('Saved jobs (2)', { exact: true }).click();
    const row = page.locator('p').filter({ hasText: 'Software Engineer · Fictional Expansion' });
    await row.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('Listing posted — exact or approximate, if stated').fill('about a week ago');
    await page.getByText('Salary evidence and expectation', { exact: true }).click();
    await page.getByLabel('Advertised maximum', { exact: true }).fill('6000');
    await page.getByLabel('Proposed expectation', { exact: true }).fill('5500');
    await page.getByRole('button', { name: 'Save job', exact: true }).click();
    await page.locator('#notice').filter({ hasText: 'Saved.' }).waitFor();
    const saved = (await read()).state.jobs.find(item => item.id === job.id);
    assert.equal(saved.posted_at, 'about a week ago');
    assert.equal(saved.salary.max, 6000);
    assert.equal(saved.expectation.target, '5500');

    await page.getByLabel('Employer board identifier',{exact:true}).fill('fictional-fixture-board');
    await page.getByRole('button',{name:'Add source',exact:true}).click();
    await page.getByText('greenhouse: fictional-fixture-board',{exact:false}).waitFor();
    await page.route('**/api/discover', route=>route.fulfill({contentType:'application/json',body:JSON.stringify({result:{error:'Fixture source unavailable'}})}));
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Fixture source unavailable'}).waitFor();
    assert.equal((await read()).state.jobs.length,2);
    await page.unroute('**/api/discover');
    await page.route('**/api/url', route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Fixture listing unavailable'})}));
    await page.getByLabel('Job URL with JobPosting structured data',{exact:true}).fill('https://example.test/unavailable');
    await page.getByRole('button',{name:'Import URL',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Fixture listing unavailable'}).waitFor();
    assert.equal(await page.getByLabel('Job URL with JobPosting structured data',{exact:true}).inputValue(),'https://example.test/unavailable');
    await page.unroute('**/api/url');
    // Explicitly discard this rejected URL draft before moving to consent settings.
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('link',{name:'Settings & recovery'}).click();
    await page.getByRole('button',{name:'Grant consent',exact:true}).first().click();
    await page.getByText('Consent granted',{exact:true}).waitFor();
    await page.getByRole('link',{name:'Search profiles'}).click();
    await page.getByRole('button',{name:'Rank saved jobs',exact:true}).click();
    const match = page.locator('article').filter({has:page.getByRole('heading',{name:'Software Engineer · Fictional Expansion',exact:true})});
    const handoff = page.waitForEvent('download');
    await match.getByRole('button',{name:'Download agent handoff',exact:true}).click();
    assert.equal((await handoff).suggestedFilename(),'agent-handoff.json');
    await match.getByText('Import agent fact selection',{exact:true}).click();
    const factId = (await read()).state.facts.find(fact=>fact.confirmed&&!fact.retired&&!fact.conflict).id;
    await match.getByLabel('JSON response containing fact_ids',{exact:true}).fill(JSON.stringify({fact_ids:[factId]}));
    await match.getByRole('button',{name:'Prepare from selected facts',exact:true}).click();
    await page.locator('#notice').filter({hasText:'Saved.'}).waitFor();
    assert.equal((await read()).state.applications.length,3);

    await page.getByRole('link',{name:'Settings & recovery'}).click();
    const backupDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export private workspace',exact:true}).click();
    assert.equal((await backupDownload).suggestedFilename(),'career-workspace.zip');

    await page.getByRole('link', { name: 'Application history' }).click();
    await page.getByRole('heading', { name: 'Toronto', exact: true }).waitFor();
    const company = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Fictional Systems' }) }).first();
    await company.locator('summary').first().click();
    await company.locator('details summary').first().click();
    const link = company.getByRole('link', { name: submitted.documents['resume.pdf'], exact: true });
    const response = await page.request.get(new URL(await link.getAttribute('href'), base).href);
    assert.equal(response.status(), 200);
    assert.ok((await response.body()).subarray(0, 4).toString() === '%PDF');
    await page.reload();
    await page.getByRole('heading', { name: 'Toronto', exact: true }).waitFor();

    await page.goto(base + '/?section=submitted&destination=Toronto');
    await page.getByRole('button', { name: 'Submitted (1)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Submitted (1)', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(hash(), originalHash, 'Submitted PDF bytes must remain unchanged');
    await page.route('**/api/state', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.state.applications = data.state.applications.map(app => app.id === submitted.id ? {...app,archived:true} : app);
      await route.fulfill({response,body:JSON.stringify(data)});
    });
    await page.reload();
    await page.getByRole('button',{name:'Submitted (0)',exact:true}).waitFor();
    await page.getByLabel('Include earlier review queues').check();
    await page.getByRole('button',{name:'Submitted (1)',exact:true}).waitFor();
    await page.unroute('**/api/state');
    for (const route of ['/career/', '/search/', '/settings/', '/history/']) {
      await page.goto(base + route);
      await page.locator('#content section').first().waitFor();
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, route + ' overflow at ' + width);
      }
    }
    const missing=await page.goto(base+'/missing-page/');
    assert.equal(missing.status(),404);
    await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();
    await page.getByRole('link',{name:'Return to applications',exact:true}).click();
    await page.getByRole('button',{name:'Active (2)',exact:true}).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: draft preservation, navigation/back, failed-save/source/URL retry, safe text, imports, job edits, agent handoff/selection, history integrity, historical queues, deep links and responsive routes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
