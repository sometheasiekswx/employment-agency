/* Document drafts are versioned; viewing and previewing never mutate the workspace. */
(() => {
  let dialog, current, dirty = false, busy = false, pdfUrl;
  const styles = ['title', 'contact', 'heading', 'bullet', 'text'];
  function pdf(data) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], {type:'application/pdf'}));
    dialog.querySelector('iframe').src = pdfUrl;
    dialog.querySelector('[data-pdf-link]').href = pdfUrl;
  }
  function row(kind, text) {
    return `<div class="edit-block"><label>Style<select aria-label="Style">${styles.map(s=>`<option ${s===kind?'selected':''}>${s}</option>`).join('')}</select></label><label>Text<textarea aria-label="Text" rows="3">${esc(text)}</textarea></label><button type="button" data-remove aria-label="Remove text block">Remove</button></div>`;
  }
  function close() {
    if (busy || (dirty && !confirm('Discard unsaved document edits?'))) return;
    dialog.close(); dialog.remove(); dialog = null;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
  }
  document.addEventListener('click', async e => {
    const button = e.target.closest('[data-editor]');
    if (!button || dialog) return;
    button.disabled = true;
    try {
      current = await api('document-editor', {id:button.dataset.id, document:button.dataset.editor});
      dirty = false; busy = false;
      dialog = document.createElement('dialog'); dialog.className = 'document-editor';
      dialog.setAttribute('aria-labelledby', 'document-editor-title');
      dialog.innerHTML = `<header><h2 id="document-editor-title">${current.document==='resume'?'CV':'Cover letter'}</h2><button data-close autofocus>Close</button></header><p>Save creates a new draft application. The original and confirmed career facts stay unchanged. Review your wording before applying.</p><p role="status" class="editor-status"></p><div class="editor-columns"><section aria-label="Edit document">${current.mode==='tex'?'<p>Edit LaTeX source to preserve your custom layout.</p><label>LaTeX source<textarea class="tex-source" spellcheck="false"></textarea></label>':current.mode==='blocks'?'<div class="edit-blocks"></div><button data-add>Add text block</button>':`<p>${esc(current.notice)}</p>`}</section><section aria-label="PDF preview"><a data-pdf-link target="_blank" rel="noopener">Open preview in another tab</a><iframe title="Document PDF preview"></iframe></section></div><footer>${current.mode!=='view'?'<button data-preview>Update preview</button><button data-save>Save as new draft</button>':''}</footer>`;
      document.body.append(dialog);
      if(current.mode==='tex') dialog.querySelector('textarea').value = current.source;
      if(current.mode==='blocks') dialog.querySelector('.edit-blocks').innerHTML = current.blocks.map(b=>row(...b)).join('');
      pdf(current.pdf); dialog.showModal();
      dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
      dialog.addEventListener('input', () => {dirty=true; dialog.querySelector('.editor-status').textContent='Unsaved changes. Update preview to see them.';});
      dialog.addEventListener('click', async event => {
        if(event.target.closest('[data-close]')) return close();
        if(busy) return;
        if(event.target.closest('[data-add]')) {dialog.querySelector('.edit-blocks').insertAdjacentHTML('beforeend',row('text','')); dirty=true; return;}
        if(event.target.closest('[data-remove]')) {event.target.closest('.edit-block').remove(); dirty=true; return;}
        const save = event.target.closest('[data-save]');
        if(!save && !event.target.closest('[data-preview]')) return;
        const args = {id:current.id, document:current.document, base:current.base};
        if(current.mode==='tex') args.source = dialog.querySelector('textarea').value;
        else args.blocks = [...dialog.querySelectorAll('.edit-block')].map(b=>[b.querySelector('select').value,b.querySelector('textarea').value]);
        busy=true; dialog.querySelectorAll('button,textarea,select').forEach(b=>b.disabled=true);
        const status = dialog.querySelector('.editor-status'); status.textContent=save?'Saving a new draft…':'Building preview…';
        try {
          const result = await api(save?'save-document':'preview-document',args);
          if(save) {dirty=false; busy=false; close(); applicationSection='active'; await refresh(); render(); document.querySelector('#notice').textContent='Saved as a new draft. The original application is preserved.';}
          else {pdf(result.pdf); status.textContent='Preview updated. Changes are not saved yet.';}
        } catch(error) {status.textContent=error.message;}
        finally {busy=false; if(dialog) dialog.querySelectorAll('button,textarea,select').forEach(b=>b.disabled=false);}
      });
    } catch(error) {document.querySelector('#notice').textContent=error.message; if(dialog){dirty=false;close();}}
    finally {button.disabled=false;}
  });
  window.addEventListener('beforeunload', e=>{if(dirty || busy){e.preventDefault();e.returnValue='';}});
})();
