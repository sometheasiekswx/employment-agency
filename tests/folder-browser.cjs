// Native chooser results are supplied by serve_folder_fixture.py, not a production hook.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8774');
  const read=async()=> (await (await page.request.get(new URL('/api/state',page.url()).href)).json()).state;
  const initial=await read();
  const primary=initial._workspace.path;
  const root=path.dirname(primary);
  assert.match(root,/employment-agency-folder-browser-/,'Never mutate a real workspace');
  const queue=choices=>fs.writeFileSync(path.join(root,'picker.json'),JSON.stringify(choices));
  const open=()=>page.getByRole('button',{name:'Open Folder',exact:true});
  const settings=()=>page.getByRole('button',{name:'Settings & recovery'}).click();
  assert.equal(await page.getByLabel('Workspace name',{exact:true}).count(),0);
  assert.equal(await page.getByText('Use another folder',{exact:true}).count(),0);
  await open().waitFor();
  queue([null]);await open().focus();await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText:'Folder selection cancelled.'}).waitFor();
  assert.equal(await open().isEnabled(),true);
  assert.equal(await open().evaluate(b=>b===document.activeElement),true);
  assert.equal((await read())._workspace.path,primary);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(()=>state?._workspace.setup_complete===true);
  await settings();
  await page.getByLabel('Timezone for version dates').fill('Australia/Melbourne');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Saved.'}).waitFor();
  assert.equal((await read())._workspace.timezone,'Australia/Melbourne');
  assert.equal((await read())._workspace.label,initial._workspace.label);
  queue([{error:'Folder chooser unavailable'}]);await open().click();
  await page.getByRole('status').filter({hasText:'Folder chooser unavailable'}).waitFor();
  assert.equal(await open().isEnabled(),true);
  const unrelated=path.join(root,'unrelated');fs.mkdirSync(unrelated);fs.writeFileSync(path.join(unrelated,'notes.txt'),'Preserve me');
  queue([unrelated]);await open().click();
  await page.getByRole('status').filter({hasText:'This folder has files but no career workspace'}).waitFor();
  assert.equal(fs.existsSync(path.join(unrelated,'state.json')),false);
  const second=path.join(root,'Career café '+ 'long-location-'.repeat(12));fs.mkdirSync(second);
  queue([second]);await open().click();
  await page.waitForFunction(expected=>state?._workspace.path===expected,second);
  assert.equal((await read()).identity.name,undefined);
  await settings();
  for(const width of [320,768,1024,1440]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
  }
  queue([primary]);await open().click();
  await page.waitForFunction(expected=>state?._workspace.path===expected,primary);
  assert.equal((await read())._workspace.timezone,'Australia/Melbourne');
  await settings();
  fs.mkdirSync('output/playwright',{recursive:true});
  for(const width of [1440,320]){
   await page.setViewportSize({width,height:1000});
   await page.screenshot({path:`output/playwright/workspace-folder-${width}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: setup, location-only settings, Save, cancellation/focus, picker error, invalid folder, create/reopen, preserved settings, responsive layout.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
