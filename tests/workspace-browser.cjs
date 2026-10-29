// Run after browser.cjs against the same disposable synthetic workspace.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8769');
 const initial=await (await page.request.get(new URL('/api/state',page.url()).href)).json();
 const root=initial.state._workspace.path;
 assert.ok((/^\/(?:private\/)?tmp\/employment-agency-refactor-browser-/.test(root)) || /\/employment-agency-folder-browser-[^/]+\/primary$/.test(root),'Never mutate a real workspace in browser acceptance');
 await page.getByRole('heading',{name:'Software Engineer',exact:true}).first().waitFor();
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'output/playwright/shared-app-desktop.png',fullPage:true});
 const active=initial.state.applications.filter(a=>!a.archived&&!['submitted','rejected'].includes(a.status));
 const original=active[0];
 assert.ok(original,'Seed an active synthetic draft before running workspace acceptance');
 fs.appendFileSync(path.join(root,original.folder,original.documents['resume.pdf']),'\n% Local edit\n');
 await page.reload();
 await page.getByRole('button',{name:'Validate edits as a new draft'}).click();
 await page.waitForFunction(count=>document.querySelectorAll('article[data-application-id]').length===count,active.length+1);
 const after=await (await page.request.get(new URL('/api/state',page.url()).href)).json();
 assert.equal(after.state.applications.at(-1).status,'draft');
 assert.deepEqual(after.state.applications.find(a=>a.id===original.id).file_changes,[]);
 fs.mkdirSync(path.join(root,'master'),{recursive:true});
 fs.writeFileSync(path.join(root,'master/main.tex'),'\\documentclass{article}\n\\begin{document}\nBuilt reliable distributed services.\n\\end{document}\n');
 await page.reload();
 await page.getByRole('button',{name:'Career evidence'}).click();
 await page.getByText('Changes need your review before generating applications.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Review master changes',exact:true}).click();
 await page.getByLabel('I reviewed these master changes').check();
 await page.getByRole('button',{name:'Confirm master updates',exact:true}).click();
 await page.getByText('Up to date with your confirmed source.',{exact:false}).waitFor();
 assert.ok(await page.getByText('Built Python APIs and automated integration tests.',{exact:true}).count());
 await page.getByRole('button',{name:'Settings & recovery'}).click();
 // Substitute the OS dialog result; the protected switch still reaches the server.
 let selection=root+'-secondary';
 await page.route('**/api/workspace-browse',async route=>{
  const action=fs.existsSync(path.join(selection,'state.json'))?'workspace-open':'workspace-create';
  const response=await route.fetch({url:new URL('/api/'+action,page.url()).href,postData:JSON.stringify({path:selection})});
  await route.fulfill({response});
 });
 await page.getByRole('button',{name:'Open Folder',exact:true}).click();
 await page.getByText('No active applications.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Settings & recovery'}).click();
 selection=root;
 await page.getByRole('button',{name:'Open Folder',exact:true}).click();
 await page.getByRole('heading',{name:'Software Engineer',exact:true}).first().waitFor();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'output/playwright/shared-app-after-switch.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await browser.close();
 console.log('PASS: external document edits, new draft validation, master changes/confirmation, supplemental facts, create/open/switch isolation, responsive views.');
})().catch(e=>{console.error(e);process.exit(1)});
