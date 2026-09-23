(()=>{
  const nativeFetch=window.fetch.bind(window);
  const state={playlistId:null,page:1,limit:250,pagination:null,groups:[],timer:null};

  function isPlaylistRead(url,method){
    return method==='GET'&&/^\/api\/playlists\/[^/]+$/.test(url.pathname);
  }
  function activeFilters(){
    return {
      q:(document.getElementById('search')?.value||'').trim(),
      group:document.getElementById('groupFilter')?.value||'',
      status:document.getElementById('statusFilter')?.value||''
    };
  }
  function token(){return localStorage.getItem('nexa_editor_token')||''}
  async function jsonApi(url,opts={}){
    const headers={'Content-Type':'application/json',...(opts.headers||{})};
    const t=token();if(t)headers.Authorization=`Bearer ${t}`;
    const r=await nativeFetch(url,{...opts,headers,cache:'no-store'});let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;
  }
  function toast(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2300)}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function triggerReload(){
    if(!state.playlistId)return;
    const btn=document.querySelector(`#playlistNav [data-playlist="${CSS.escape(String(state.playlistId))}"]`);
    if(btn)btn.click();
  }
  function syncGroupFilter(){
    const sel=document.getElementById('groupFilter');
    if(!sel||!state.groups.length)return;
    const prev=sel.value;
    sel.innerHTML='';
    const all=document.createElement('option');all.value='';all.textContent='All groups';sel.appendChild(all);
    for(const g of state.groups){const o=document.createElement('option');o.value=g.name;o.textContent=`${g.name} (${g.count})`;sel.appendChild(o)}
    if(state.groups.some(g=>g.name===prev))sel.value=prev;
  }
  function renderFullCategoryList(){
    const list=document.getElementById('groupList');
    if(!list||!state.groups.length)return;
    list.innerHTML=state.groups.map(g=>`<div class="group-item"><button data-group-filter="${esc(g.name)}" title="Filter">${esc(g.name)}</button><span>${Number(g.count||0).toLocaleString()}</span><button data-group-rename="${esc(g.name)}" title="Rename">✎</button></div>`).join('');
    list.querySelectorAll('[data-group-filter]').forEach(b=>b.addEventListener('click',()=>{
      const sel=document.getElementById('groupFilter');if(!sel)return;sel.value=b.dataset.groupFilter;state.page=1;sel.dispatchEvent(new Event('change',{bubbles:true}));
    }));
    list.querySelectorAll('[data-group-rename]').forEach(b=>b.addEventListener('click',async()=>{
      const from=b.dataset.groupRename;const to=prompt('New category name',from);if(!to||to.trim()===from)return;
      try{await jsonApi(`/api/playlists/${encodeURIComponent(state.playlistId)}/groups/rename`,{method:'POST',body:JSON.stringify({from,to:to.trim()})});toast('Category renamed');triggerReload()}catch(e){toast(e.message)}
    }));
  }
  function renderPager(){
    const p=state.pagination;
    const panel=document.querySelector('#editorView .channel-panel');
    if(!p||!panel)return;
    let bar=document.getElementById('largePlaylistPager');
    if(!bar){
      bar=document.createElement('div');bar.id='largePlaylistPager';bar.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid rgba(120,140,160,.16)';
      const head=panel.querySelector('.panel-head');(head?.parentNode||panel).insertBefore(bar,head?.nextSibling||panel.firstChild);
    }
    if(!p.paged||p.total_channels<=2000){bar.style.display='none'}else{
      bar.style.display='flex';
      bar.innerHTML='';
      const info=document.createElement('span');info.style.cssText='font-weight:700;flex:1;min-width:180px';
      info.textContent=`${p.total.toLocaleString()} matched · ${p.total_channels.toLocaleString()} total · Page ${p.page}/${p.pages}`;
      const prev=document.createElement('button');prev.className='ghost';prev.textContent='← Prev';prev.disabled=p.page<=1;
      const next=document.createElement('button');next.className='ghost';next.textContent='Next →';next.disabled=p.page>=p.pages;
      const size=document.createElement('select');size.setAttribute('aria-label','Channels per page');
      for(const n of [100,250,500]){const o=document.createElement('option');o.value=String(n);o.textContent=`${n} / page`;if(n===p.limit)o.selected=true;size.appendChild(o)}
      prev.addEventListener('click',()=>{if(state.page>1){state.page--;triggerReload()}});
      next.addEventListener('click',()=>{if(state.page<p.pages){state.page++;triggerReload()}});
      size.addEventListener('change',()=>{state.limit=Number(size.value)||250;state.page=1;triggerReload()});
      bar.append(info,prev,next,size);
    }
    const meta=document.getElementById('playlistMeta');
    if(meta)meta.textContent=`${p.total_channels.toLocaleString()} channels · ${state.groups.length} groups`;
    syncGroupFilter();
    renderFullCategoryList();
  }

  window.fetch=async function(input,opts={}){
    let url;
    try{url=new URL(typeof input==='string'?input:input.url,location.origin)}catch{return nativeFetch(input,opts)}
    const method=String(opts.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    if(isPlaylistRead(url,method)){
      const id=url.pathname.split('/').pop();
      const changed=state.playlistId!==id;
      if(changed){state.playlistId=id;state.page=1}
      const f=changed?{q:'',group:'',status:''}:activeFilters();
      url.searchParams.set('paged','1');
      url.searchParams.set('page',String(state.page));
      url.searchParams.set('limit',String(state.limit));
      if(f.q)url.searchParams.set('q',f.q);else url.searchParams.delete('q');
      if(f.group)url.searchParams.set('group',f.group);else url.searchParams.delete('group');
      if(f.status)url.searchParams.set('status',f.status);else url.searchParams.delete('status');
      const response=await nativeFetch(url.pathname+url.search,opts);
      try{
        const data=await response.clone().json();
        if(data?.pagination){state.pagination=data.pagination;state.page=data.pagination.page;state.groups=Array.isArray(data.groups)?data.groups:[];window.__nexaFullGroups=state.groups;setTimeout(renderPager,0);setTimeout(renderPager,120)}
      }catch{}
      return response;
    }
    return nativeFetch(input,opts);
  };

  function scheduleFilterReload(){
    if(!state.pagination?.paged||state.pagination.total_channels<=2000)return;
    clearTimeout(state.timer);state.timer=setTimeout(()=>{state.page=1;triggerReload()},300);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('search')?.addEventListener('input',scheduleFilterReload,true);
    document.getElementById('groupFilter')?.addEventListener('change',scheduleFilterReload,true);
    document.getElementById('statusFilter')?.addEventListener('change',scheduleFilterReload,true);
    new MutationObserver(()=>{if(state.pagination)setTimeout(renderPager,0)}).observe(document.body,{childList:true,subtree:true});
  });
})();