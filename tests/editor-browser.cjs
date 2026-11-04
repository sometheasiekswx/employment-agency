const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const {decideDialog}=require('./browser-dialog.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage(); const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
 if(process.env.HOSTED) await page.addInitScript(()=>window===window.top&&sessionStorage.setItem('ea-cloud-session',JSON.stringify({access_token:'fixture-session',refresh_token:'fixture',expires_at:Date.now()+3600000})));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8773');
 await page.getByRole('heading',{level:1}).first().waitFor();
 const setup=page.getByRole('button',{name:'Save',exact:true});
 if(await setup.isVisible()) await setup.click();
 try { await page.getByRole('button',{name:'View / edit CV',exact:true}).first().waitFor(); } catch (error) {
  console.error('Editor readiness failure:', await page.locator('body').innerText(), errors); throw error;
 }
 const count=await page.getByRole('button',{name:'View / edit CV',exact:true}).count();
 const readState=async()=> (await (await page.request.get((process.env.TEST_URL||'http://127.0.0.1:8773')+'/api/state',{
  headers:process.env.HOSTED?{Authorization:'Bearer fixture-session'}:{}
 })).json()).state;
 const before=(await readState()).applications;
 const editedId=await page.getByRole('button',{name:'View / edit CV',exact:true}).first().evaluate(e=>e.closest('article').dataset.applicationId);
 await page.getByRole('button',{name:'View / edit CV',exact:true}).first().click();
 const dialog=page.getByRole('dialog'); await dialog.waitFor();
 assert.match(await dialog.locator('iframe').getAttribute('src'),/^blob:/);
 for(const width of [320,768,1440]){
  await page.setViewportSize({width,height:1000});
  assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 }
 await dialog.getByLabel('Text',{exact:true}).last().fill('Built reliable Python APIs with integration tests.');
 await dialog.getByRole('button',{name:'Update preview'}).click();
 await dialog.getByRole('status').filter({hasText:'Preview updated'}).waitFor();
 await dialog.evaluate(d=>d.scrollTop=0);
 await page.waitForTimeout(1000);
 await page.screenshot({path:'output/playwright/document-editor.png',fullPage:false});
 await dialog.getByRole('button',{name:'Save as new draft'}).click();
 await page.locator('#notice').filter({hasText:'Saved as a new draft'}).waitFor();
 const after=(await readState()).applications;
 assert.equal(after.length,before.length+1,'Editing preserves the original and appends a version');
 const draft=after.find(app=>!before.some(old=>old.id===app.id));
 assert.equal(draft.derived_from,editedId);
 await page.locator(`[data-application-id="${draft.id}"]`).waitFor();
 assert.equal(await page.locator(`[data-application-id="${editedId}"]`).count(),0,'Only the latest current version appears');
 await page.getByRole('button',{name:`Active (${count})`,exact:true}).waitFor();
 await page.reload();
 await page.getByRole('button',{name:`Active (${count})`,exact:true}).waitFor();
 await page.locator(`[data-application-id="${draft.id}"]`).waitFor();
 await page.getByRole('button',{name:'View / edit cover letter',exact:true}).first().click();
 await page.getByRole('dialog').getByLabel('Text',{exact:true}).last().fill('Unsaved draft text');
 const decideDiscard=accept=>decideDialog(page,()=>page.keyboard.press('Escape'),accept,'Discard unsaved document edits?');
 await decideDiscard(false);
 assert(await page.getByRole('dialog').isVisible());
 await decideDiscard(true);
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.waitForFunction(()=>document.activeElement?.textContent==='View / edit cover letter');
 assert.deepEqual(errors,[]); await browser.close(); console.log('Document editor browser checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
