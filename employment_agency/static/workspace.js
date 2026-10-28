/* Presentation only: every write action remains in the pinned application's handlers. */
(() => {
  const content = document.querySelector('#content');
  if (!content) return;
  let destination = 'All destinations';
  const descriptions = {
    applications: ['Applications', 'Your next chapter', 'A considered next move starts with a well-prepared application.'],
    career: ['Career evidence', 'The experience behind you', 'Your skills, your experience, and the facts that make each application yours.'],
    search: ['Search profiles', 'The possibilities ahead', 'Define where you want to go and what the right role looks like.'],
    settings: ['Your workspace', 'A little housekeeping', 'Manage provider consent, recovery and your private setup.']
  };
  function element(tag, cls, text) { const e=document.createElement(tag); if(cls)e.className=cls; if(text)e.textContent=text; return e; }
  function enhance() {
    if (typeof state === 'undefined' || !state || !state._workspace?.setup_complete) return;
    const label=state._workspace.label || 'My career workspace';
    document.querySelector('.rail-caption').textContent=label;
    const priority=state._workspace.preferred_locations?.[0] || '';
    const placeOrder=c=>{const i=(state._workspace.preferred_locations||[]).indexOf(c);return i<0?1000:i;};
    const selected=document.querySelector('[data-tab][aria-current="true"]')?.dataset.tab;
    if (!selected) return;
    const [title,context,description]=descriptions[selected];
    document.querySelector('#page-title').textContent=title;
    document.querySelector('#page-context').textContent=context;
    document.querySelector('#page-description').textContent=description;
    document.querySelector('.batch-count').hidden=selected!=='applications';
    document.querySelector('#package-count').textContent=String(state.applications.filter(a=>!a.archived).length).padStart(2,'0');
    document.title=title+" | "+label;
    if (selected!=='applications' || content.querySelector('.destination-board')) return;
    const intro=content.querySelector('section');
    if (!intro) return;
    intro.className='destination-board';
    intro.querySelector('h2').textContent='Choose your destination';
    intro.querySelector('p').textContent=(priority ? priority+' first. ' : '')+'Open the saved PDFs, review the details, then record your decision. Nothing is sent from here.';
    const cards=[...content.querySelectorAll('article')];
    cards.forEach((card,index)=>{
      const app=state.applications.find(a=>a.id===card.dataset.applicationId);
      const job=state.jobs.find(j=>j.id===app.job_id)||{};
      let city=job.city||job.location||'Location unconfirmed';
      const places=state._workspace.preferred_locations||[];
      city=places.find(p=>city.toLowerCase().includes(p.toLowerCase()))||city;
      card.classList.add('dossier');card.dataset.city=city;card.dataset.priority=String(city===priority);
      const label=element('div','destination-label');label.append(element('span','',city),element('span','',city===priority?'Priority destination':'Application dossier'));card.prepend(label);
      const actions=card.querySelector('.actions');
      const extra=element('details');extra.append(element('summary','','Supporting files & source evidence'));
      const extras=element('div','actions');[...actions.children].slice(2).forEach(link=>extras.append(link));extra.append(extras);
      const review=element('details');review.append(element('summary','','Review & add comments'));
      const form=card.querySelector('form[data-form="review"]');if(form){
        form.before(review);review.append(form);
        if(app.status==='draft'){
          const submitted=form.querySelector('option[value="submitted"]');
          if(submitted)submitted.disabled=true;
          const help=element('p','muted','Save Reviewed first. Then record Submitted after you have applied yourself.');
          form.prepend(help);
        }
      }
      review.before(extra);
      const notes=[];let next=review.nextElementSibling;
      while(next){const following=next.nextElementSibling;notes.push(next);next=following;}
      if(notes.length){const history=element('details');history.append(element('summary','',`Review history (${notes.length})`));notes.forEach(n=>history.append(n));card.append(history);}
      card.querySelectorAll('small').forEach(small=>{
        const raw=small.textContent;const match=raw.match(/^(\d{4}-\d{2}-\d{2}T[^ ·]+)/);
        if(match){const date=new Date(match[1]);if(!Number.isNaN(date.getTime())){small.title=raw;small.textContent=raw.replace(match[1],new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:state._workspace.timezone||'UTC'}).format(date));}}
      });
    });
    cards.sort((a,b)=>placeOrder(a.dataset.city)-placeOrder(b.dataset.city)||a.dataset.city.localeCompare(b.dataset.city)).forEach(c=>content.append(c));
    const cities=['All destinations',...[...new Set(cards.map(c=>c.dataset.city))].sort((a,b)=>placeOrder(a)-placeOrder(b)||a.localeCompare(b))];
    if(!cities.includes(destination))destination='All destinations';
    const filters=element('div','destinations');filters.setAttribute('role','group');filters.setAttribute('aria-label','Filter applications by destination');
    const count=element('p','result-count');count.setAttribute('role','status');
    function apply(){cards.forEach(c=>c.hidden=destination!=='All destinations'&&c.dataset.city!==destination);filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===destination)));const n=cards.filter(c=>!c.hidden).length;count.textContent=`${n} of ${cards.length} application packages shown`;}
    cities.forEach(city=>{const button=element('button','',city);button.type='button';button.addEventListener('click',()=>{destination=city;apply();});filters.append(button);});
    const mobileLabel=element('label','destination-select','Destination');
    const mobileSelect=element('select');mobileSelect.setAttribute('aria-label','Application destination');
    cities.forEach(city=>{const option=element('option','',city);option.value=city;mobileSelect.append(option);});mobileSelect.value=destination;
    mobileSelect.addEventListener('change',()=>{destination=mobileSelect.value;apply();});
    filters.addEventListener('click',()=>{mobileSelect.value=destination;});
    mobileLabel.append(mobileSelect);intro.append(filters,mobileLabel,count);apply();
  }
  const observer=new MutationObserver(()=>{observer.disconnect();enhance();observer.observe(content,{childList:true});});
  // Observe only engine render replacements, not form typing or disclosure toggles.
  observer.observe(content,{childList:true});enhance();
  document.addEventListener('click',e=>{if(e.target.closest('[data-tab]'))window.scrollTo({top:0,behavior:'instant'});});
})();
