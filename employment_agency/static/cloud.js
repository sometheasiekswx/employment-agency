/* Hosted authentication and file transport. Never sends private data to the local app. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  let config, session;
  const key = 'ea-cloud-session';
  const content = document.querySelector('#content');
  const say = text => { content.replaceChildren(); const p=document.createElement('p'); p.textContent=text; content.append(p); };
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  async function auth(path, body) {
    const response=await nativeFetch(config.url+'/auth/v1/'+path, {method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok) throw Error('Google session could not be established. Please sign in again.');
    return response.json();
  }
  function save(value) { session={access_token:value.access_token,refresh_token:value.refresh_token,expires_at:Date.now()+value.expires_in*1000}; sessionStorage.setItem(key,JSON.stringify(session)); }
  let refreshing;
  async function access() {
    if(!session) throw Error('Sign in again.');
    if(session.expires_at<Date.now()+60000) {
      refreshing ||= auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(save).finally(()=>refreshing=null);
      await refreshing;
    }
    return session.access_token;
  }
  window.fetch = async (input, options={}) => {
    const url = new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input,options);
    const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+await access());
    return nativeFetch(input,{...options,headers});
  };
  async function binary(action,args={}) {
    const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});
    if(!r.ok) throw Error((await r.json()).error);
    const name=decodeURIComponent((r.headers.get('Content-Disposition')||'').split("UTF-8''")[1]||'download');
    const url=URL.createObjectURL(await r.blob()); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  document.addEventListener('click',async e=>{
    const target=e.target.closest('a[href^="/files/"],button[data-cloud]');if(!target)return;
    e.preventDefault();e.stopImmediatePropagation();
    try{
      if(target.matches('a')){const [, ,id,name]=target.getAttribute('href').split('/');await binary('file',{id,name:decodeURIComponent(name)});}
      else if(target.dataset.cloud==='export')await binary('export');
      else if(target.dataset.cloud==='logout'){await nativeFetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+await access()}});sessionStorage.removeItem(key);location.reload();}
      else if(target.dataset.cloud==='delete'){
        const confirmation=document.querySelector('#delete-confirmation').value;
        const r=await fetch('/api/delete-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation})});
        if(!r.ok)throw Error((await r.json()).error);
        sessionStorage.removeItem(key);location.reload();
      }
    }catch(error){document.querySelector('#notice').textContent=error.message;}
  },true);
  async function login(){
    const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));sessionStorage.setItem('ea-pkce',verifier);
    const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const url=new URL(config.url+'/auth/v1/authorize');Object.entries({provider:'google',redirect_to:location.origin+'/',code_challenge:challenge,code_challenge_method:'s256'}).forEach(([k,v])=>url.searchParams.set(k,v));location.assign(url);
  }
  async function boot(){
    const r=await nativeFetch('/api/config');config=await r.json();if(!r.ok){say(config.error);return;}
    const params=new URLSearchParams(location.search);
    if(params.has('code')){
      const verifier=sessionStorage.getItem('ea-pkce');const code=params.get('code');history.replaceState(null,'','/');
      if(!verifier)throw Error('Sign in again from this browser.');
      save(await auth('token?grant_type=pkce',{auth_code:code,code_verifier:verifier}));sessionStorage.removeItem('ea-pkce');
    }else {try{session=JSON.parse(sessionStorage.getItem(key));}catch{session=null;}}
    if(!session){say('Invite-only pilot. Your confirmed career information and documents will be stored privately in your cloud account. Nothing is sent to employers.');const button=document.createElement('button');button.textContent='Continue with Google';button.addEventListener('click',()=>login().catch(e=>say(e.message)));content.append(button);return;}
    const state=await fetch('/api/state');if(!state.ok){sessionStorage.removeItem(key);throw Error((await state.json()).error+' Reload to try another account.');}
    for(const src of ['/app.js','/ui/workspace.js']){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.append(s);});}
    document.querySelector('.archive-link').hidden=true;
  }
  boot().catch(error=>say(error.message));
})();
