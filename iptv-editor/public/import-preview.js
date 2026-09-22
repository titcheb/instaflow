(()=>{
  const $=id=>document.getElementById(id);
  const token=()=>localStorage.getItem('nexa_editor_token')||'';
  const state={previewToken:'',categories:[],totalChannels:0,mode:'m3u'};
  async function api(url,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};const t=token();if(t)headers.Authorization=`Bearer ${t}`;const r=await fetch(url,{...opts,headers});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
  function mode(){return document.querySelector('#importMethodTabs [data-import-method].active')?.dataset.importMethod||'m3u'}
  function inject(){
    if(!$('categoryPreviewDialog'))document.body.insertAdjacentHTML('beforeend',`<dialog id="categoryPreviewDialog" class="modal glass import-preview-modal"><div class="modal-head"><div><p class="eyebrow">IMPORT PREVIEW</p><h3>Choose categories</h3></div><button id="previewClose" type="button" class="icon-btn">×</button></div><div class="preview-summary"><div><strong id="previewCategoryCount">0</strong><span>categories selected</span></div><div><strong id="previewChannelCount">0</strong><span>channels selected</span></div></div><div class="preview-tools"><input id="previewSearch" placeholder="Search categories…"><button id="previewAll" type="button" class="ghost">Select all</button><button id="previewNone" type="button" class="ghost">Clear</button></div><div id="previewCategoryList" class="preview-category-list"></div><div id="previewError" class="error-text"></div><div class="modal-actions preview-actions"><button id="previewBack" type="button" class="ghost">← Back</button><span></span><button id="previewCommit" type="button" class="primary">Import selected</button></div></dialog>`);
    bind();
  }
  function bind(){
    const form=$('importForm');if(form&&!form.dataset.previewBound){form.dataset.previewBound='1';form.addEventListener('submit',startPreview,true)}
    $('previewSearch')?.addEventListener('input',renderCategories);
    $('previewAll')?.addEventListener('click',()=>setVisible(true));
    $('previewNone')?.addEventListener('click',()=>setVisible(false));
    $('previewCommit')?.addEventListener('click',commitImport);
    $('previewBack')?.addEventListener('click',backToImport);
    $('previewClose')?.addEventListener('click',backToImport);
    $('previewCategoryList')?.addEventListener('change',updateSummary);
  }
  async function startPreview(e){
    e.preventDefault();e.stopImmediatePropagation();
    const err=$('importError'),submit=$('importSubmit');if(err)err.textContent='';if(submit)submit.disabled=true;
    try{
      state.mode=mode();let payload;
      if(state.mode==='xtream'){
        payload={mode:'xtream',name:$('importName')?.value.trim(),server:$('xtreamServer')?.value.trim(),username:$('xtreamUsername')?.value.trim(),password:$('xtreamPassword')?.value||'',output:$('xtreamOutput')?.value||'ts',epgUrl:$('xtreamEpg')?.value.trim()||''};
        if(!payload.name||!payload.server||!payload.username||!payload.password)throw new Error('Playlist name, server, username and password are required.');
      }else{
        payload={mode:'m3u',name:$('importName')?.value.trim(),sourceUrl:$('importUrl')?.value.trim()||'',epgUrl:$('importEpg')?.value.trim()||'',m3uText:$('importText')?.value||''};
        if(!payload.name)throw new Error('Playlist name is required.');if(!payload.sourceUrl&&!payload.m3uText)throw new Error('Add an M3U URL, upload a file, or paste M3U content.');
      }
      const d=await api('/api/import/preview',{method:'POST',body:JSON.stringify(payload)});state.previewToken=d.previewToken;state.categories=Array.isArray(d.categories)?d.categories:[];state.totalChannels=Number(d.totalChannels||0);
      if(!state.categories.length)throw new Error('No categories were found in this playlist.');
      $('importDialog')?.close();$('previewSearch').value='';renderCategories(true);$('categoryPreviewDialog').showModal();
    }catch(x){if(err)err.textContent=x.message}finally{if(submit)submit.disabled=false}
  }
  function renderCategories(reset=false){
    const list=$('previewCategoryList'),q=($('previewSearch')?.value||'').trim().toLowerCase();if(!list)return;
    const selected=new Set(reset?state.categories.map(c=>c.name):[...list.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value));list.innerHTML='';
    for(const c of state.categories){if(q&&!String(c.name).toLowerCase().includes(q))continue;const row=document.createElement('label');row.className='preview-category-row';const cb=document.createElement('input');cb.type='checkbox';cb.value=String(c.name);cb.checked=selected.has(String(c.name));const grip=document.createElement('span');grip.className='preview-checkmark';const name=document.createElement('span');name.className='preview-category-name';name.textContent=String(c.name);const count=document.createElement('span');count.className='preview-category-count';count.textContent=`${Number(c.count||0)} ch`;row.append(cb,grip,name,count);list.appendChild(row)}
    if(!list.children.length)list.innerHTML='<div class="empty preview-empty">No categories match your search.</div>';updateSummary();
  }
  function setVisible(on){$('previewCategoryList')?.querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=on);updateSummary()}
  function selectedNames(){return [...$('previewCategoryList').querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value)}
  function updateSummary(){
    const selected=new Set(selectedNames());const count=selected.size,channels=state.categories.reduce((n,c)=>n+(selected.has(String(c.name))?Number(c.count||0):0),0);if($('previewCategoryCount'))$('previewCategoryCount').textContent=count;if($('previewChannelCount'))$('previewChannelCount').textContent=channels;const btn=$('previewCommit');if(btn){btn.disabled=!count;btn.textContent=count?`Import ${channels} channels`:'Select categories'}
  }
  function backToImport(){$('categoryPreviewDialog')?.close();$('previewError').textContent='';setTimeout(()=>{try{$('importDialog')?.showModal()}catch{}},40)}
  async function commitImport(){
    const categories=selectedNames(),btn=$('previewCommit'),err=$('previewError');if(!categories.length)return;if(err)err.textContent='';btn.disabled=true;
    try{const p=await api('/api/import/commit',{method:'POST',body:JSON.stringify({previewToken:state.previewToken,categories})});$('categoryPreviewDialog').close();$('importForm')?.reset();sessionStorage.setItem('nexa_open_playlist',String(p.id));toast(`${p.channel_count} channels from ${p.group_count} categories imported`);setTimeout(()=>location.reload(),350)}catch(x){if(err)err.textContent=x.message;btn.disabled=false}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
})();