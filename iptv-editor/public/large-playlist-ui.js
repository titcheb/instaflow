(()=>{
  const nativeFetch=window.fetch.bind(window);
  const state={playlistId:null,page:1,limit:250,pagination:null,groups:[],openGroup:'',timer:null,searching:false};

  function isPlaylistRead(url,method){return method==='GET'&&/^\/api\/playlists\/[^/]+$/.test(url.pathname)}
  function token(){return localStorage.getItem('nexa_editor_token')||''}
  function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function searchValue(){return (document.getElementById('search')?.value||'').trim()}
  function statusValue(){return document.getElementById('statusFilter')?.value||''}
  function triggerReload(){
    if(!state.playlistId)return;
    const btn=document.querySelector(`#playlistNav [data-playlist="${CSS.escape(String(state.playlistId))}"]`);
    if(btn)btn.click();
  }
  function syncGroupFilter(){
    const sel=document.getElementById('groupFilter');if(!sel)return;
    const current=state.openGroup;
    sel.innerHTML='<option value="">All groups</option>';
    for(const g of state.groups){const o=document.createElement('option');o.value=g.name;o.textContent=`${g.name} (${Number(g.count||0).toLocaleString()})`;sel.appendChild(o)}
    if(current&&state.groups.some(g=>g.name===current))sel.value=current;
  }
  function setEditorMode(){
    const grid=document.querySelector('#editorView .editor-grid');if(!grid)return;
    grid.classList.add('nexa-accordion-editor');
    grid.classList.toggle('nexa-collapsed',!state.openGroup&&!state.searching);
  }
  function setHeading(){
    const panel=document.querySelector('#editorView .channel-panel');if(!panel)return;
    const eyebrow=panel.querySelector('.panel-head .eyebrow');
    const h=panel.querySelector('.panel-head h3');
    if(eyebrow)eyebrow.textContent='BASIC EDITOR';
    if(!h)return;
    if(state.searching){h.innerHTML=`<span id="visibleCount">${Number(state.pagination?.total||0).toLocaleString()}</span> search results`}
    else if(state.openGroup){h.innerHTML=`<span id="visibleCount">${Number(state.pagination?.total||0).toLocaleString()}</span> channels`}
    else h.innerHTML=`<span id="visibleCount">${state.groups.length.toLocaleString()}</span> categories`;
  }
  function renderPager(){
    const panel=document.querySelector('#editorView .channel-panel'),p=state.pagination;if(!panel||!p)return;
    let bar=document.getElementById('largePlaylistPager');
    if(!bar){bar=document.createElement('div');bar.id='largePlaylistPager';bar.className='nexa-accordion-pager';const head=panel.querySelector('.panel-head');(head?.parentNode||panel).insertBefore(bar,head?.nextSibling||panel.firstChild)}
    const shouldShow=(state.openGroup||state.searching)&&p.pages>1;
    if(!shouldShow){bar.style.display='none';return}
    bar.style.display='flex';bar.innerHTML='';
    const info=document.createElement('span');info.className='nexa-page-info';info.textContent=`${Number(p.total||0).toLocaleString()} channels · Page ${p.page}/${p.pages}`;
    const prev=document.createElement('button');prev.className='ghost';prev.type='button';prev.textContent='← Prev';prev.disabled=p.page<=1;
    const next=document.createElement('button');next.className='ghost';next.type='button';next.textContent='Next →';next.disabled=p.page>=p.pages;
    const size=document.createElement('select');size.setAttribute('aria-label','Channels per page');
    for(const n of [100,250,500]){const o=document.createElement('option');o.value=String(n);o.textContent=`${n} / page`;if(n===p.limit)o.selected=true;size.appendChild(o)}
    prev.onclick=()=>{if(state.page>1){state.page--;triggerReload()}};
    next.onclick=()=>{if(state.page<p.pages){state.page++;triggerReload()}};
    size.onchange=()=>{state.limit=Number(size.value)||250;state.page=1;triggerReload()};
    bar.append(info,prev,next,size);
  }
  function categoryRow(group){
    const tr=document.createElement('tr');tr.className='nexa-category-row'+(state.openGroup===group.name?' open':'');tr.dataset.group=group.name;
    const td=document.createElement('td');td.colSpan=7;
    const b=document.createElement('button');b.type='button';b.className='nexa-category-toggle';b.setAttribute('aria-expanded',state.openGroup===group.name?'true':'false');
    b.innerHTML=`<span class="nexa-category-arrow">›</span><span class="nexa-category-name">${esc(group.name)}</span><span class="nexa-category-count">${Number(group.count||0).toLocaleString()}</span>`;
    b.onclick=()=>{state.openGroup=state.openGroup===group.name?'':group.name;state.page=1;const search=document.getElementById('search');if(search&&search.value)search.value='';state.searching=false;syncGroupFilter();triggerReload()};
    td.appendChild(b);tr.appendChild(td);return tr;
  }
  function renderAccordion(){
    if(document.getElementById('editorView')?.classList.contains('hidden'))return;
    setEditorMode();syncGroupFilter();setHeading();renderPager();
    const meta=document.getElementById('playlistMeta');if(meta&&state.pagination)meta.textContent=`${Number(state.pagination.total_channels||0).toLocaleString()} channels · ${state.groups.length} categories`;
    const empty=document.getElementById('emptyChannels');if(empty)empty.classList.add('hidden');
    if(state.searching)return;
    const body=document.getElementById('channelRows');if(!body)return;
    const channelRows=[...body.querySelectorAll('tr[data-id]')];
    body.innerHTML='';
    for(const group of state.groups){
      body.appendChild(categoryRow(group));
      if(state.openGroup===group.name){
        if(channelRows.length){for(const row of channelRows){row.classList.add('nexa-channel-child');body.appendChild(row)}}
        else{const tr=document.createElement('tr');tr.className='nexa-category-empty';tr.innerHTML='<td colspan="7">No channels match the current filter in this category.</td>';body.appendChild(tr)}
      }
    }
  }

  window.fetch=async function(input,opts={}){
    let url;try{url=new URL(typeof input==='string'?input:input.url,location.origin)}catch{return nativeFetch(input,opts)}
    const method=String(opts.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    if(!isPlaylistRead(url,method))return nativeFetch(input,opts);

    const id=url.pathname.split('/').pop(),changed=state.playlistId!==id;
    if(changed){state.playlistId=id;state.page=1;state.openGroup='';state.searching=false}
    const q=changed?'':searchValue(),status=changed?'':statusValue();
    state.searching=!!q;
    url.searchParams.set('paged','1');url.searchParams.set('page',String(state.page));url.searchParams.set('limit',String(state.limit));
    if(q){url.searchParams.set('q',q);url.searchParams.delete('group')}
    else{url.searchParams.delete('q');url.searchParams.set('group',state.openGroup||'__nexa_collapsed__')}
    if(status)url.searchParams.set('status',status);else url.searchParams.delete('status');

    const response=await nativeFetch(url.pathname+url.search,opts);
    try{
      const data=await response.clone().json();
      if(data?.pagination){state.pagination=data.pagination;state.page=data.pagination.page;state.groups=Array.isArray(data.groups)?data.groups:[];window.__nexaFullGroups=state.groups;setTimeout(renderAccordion,0);setTimeout(renderAccordion,100)}
    }catch{}
    return response;
  };

  function scheduleReload(){
    if(!state.playlistId)return;
    clearTimeout(state.timer);state.timer=setTimeout(()=>{state.page=1;triggerReload()},280);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('search')?.addEventListener('input',scheduleReload,true);
    document.getElementById('statusFilter')?.addEventListener('change',scheduleReload,true);
    new MutationObserver(()=>{if(state.pagination)setTimeout(renderAccordion,0)}).observe(document.body,{childList:true,subtree:true});
  });
})();
