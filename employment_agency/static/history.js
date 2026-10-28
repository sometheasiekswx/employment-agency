'use strict';
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-history-adopt]');
  if (!button) return;
  const note = button.nextElementSibling;
  button.disabled = true;
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw Error('Could not open the active workspace');
    const {token} = await response.json();
    const result = await fetch('/api/history-adopt', {
      method:'POST', headers:{'Content-Type':'application/json','X-Workspace-Token':token},
      body:JSON.stringify({id:button.dataset.historyAdopt})
    });
    const body = await result.json();
    if (!result.ok) throw Error(body.error || 'Validation failed');
    note.textContent = 'New draft saved in Applications. The previously verified version has been restored.';
    const link=document.createElement('a'); link.href='/'; link.textContent='Review the new draft';
    note.append(' ',link);
  } catch(error) { note.textContent=error.message; }
  finally { button.disabled=false; }
});
