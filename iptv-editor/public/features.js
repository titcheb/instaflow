(()=>{
  const $=id=>document.getElementById(id);
  const token=()=>localStorage.getItem('nexa_editor_token')||'';
  async function api(url,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};const t=token();if(t)headers.Authorization=`Bearer ${t}`;const r=await fetch(url,{...opts,headers});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}

  let importMode='m3u';
  function injectXtreamImport(){
    const form=$('importForm'),name=$('importName');if(!form||!name||$('importMethodTabs'))return;
    const nameLabel=name.closest('label');
    const tabs=document.createElement('div');tabs.id='importMethodTabs';tabs.className='segmented import-method-tabs';tabs.innerHTML='<button type="button" class="active" data-import-method="m3u">M3U / M3U Plus</button><button type="button" data-import-method="xtream">Xtream Codes</button>';
    nameLabel.insertAdjacentElement('afterend',tabs);

    const m3u=document.createElement('div');m3u.id='m3uImportFields';m3u.className='import-fields';
    const fieldIds=['importUrl','importEpg','importFile','importText'];
    for(const id of fieldIds){const el=$(id),label=el?.closest('label');if(label)m3u.appendChild(label)}
    tabs.insertAdjacentElement('afterend',m3u);
    const help=document.createElement('div');help.className='import-help';help.innerHTML='<b>M3U Plus + TS supported.</b> You can paste a <code>get.php?...&type=m3u_plus&output=ts</code> URL or upload the playlist file.';m3u.insertAdjacentElement('afterbegin',help);

    const xt=document.createElement('div');xt.id='xtreamImportFields';xt.className='import-fields hidden';xt.innerHTML=`
      <div class="import-help"><b>Xtream API import.</b> NEXA reads live categories and channels through <code>player_api.php</code> and builds the playlist automatically.</div>
      <label>Server URL <small>panel address, including port if required</small><input id="xtreamServer" type="url" placeholder="http://provider.example:8080"></label>
      <div class="xtream-grid"><label>Username<input id="xtreamUsername" autocomplete="username" placeholder="Username"></label><label>Password<input id="xtreamPassword" type="password" autocomplete="current-password" placeholder="Password"></label></div>
      <div class="xtream-grid"><label>Output<select id="xtreamOutput"><option value="ts">MPEG-TS (.ts)</option><option value="m3u8">HLS (.m3u8)</option></select></label><label>EPG / XMLTV URL <small>optional; auto-generated when empty</small><input id="xtreamEpg" type="url" placeholder="Optional custom XMLTV URL"></label></div>`;
    m3u.insertAdjacentElement('afterend',xt);

    tabs.querySelectorAll('[data-import-method]').forEach(b=>b.addEventListener('click',()=>{importMode=b.dataset.importMethod;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));m3u.classList.toggle('hidden',importMode!=='m3u');xt.classList.toggle('hidden',importMode!=='xtream');const submit=$('importSubmit');if(submit)submit.textContent=importMode==='xtream'?'Import Xtream':'Import playlist';$('importError').textContent=''}));

    form.addEventListener('submit',async e=>{
      if(importMode!=='xtream')return;
      e.preventDefault();e.stopImmediatePropagation();
      const err=$('importError'),submit=$('importSubmit');err.textContent='';submit.disabled=true;
      try{
        const payload={name:name.value.trim(),server:$('xtreamServer').value.trim(),username:$('xtreamUsername').value.trim(),password:$('xtreamPassword').value,output:$('xtreamOutput').value,epgUrl:$('xtreamEpg').value.trim()};
        if(!payload.name||!payload.server||!payload.username||!payload.password)throw new Error('Playlist name, server, username and password are required.');
        const p=await api('/api/xtream/import',{method:'POST',body:JSON.stringify(payload)});
        $('importDialog').close();sessionStorage.setItem('nexa_open_playlist',String(p.id));toast(`${p.channel_count} live channels imported`);setTimeout(()=>location.reload(),350);
      }catch(x){err.textContent=x.message}finally{submit.disabled=false}
    },true);
  }

  function requestedPlaylist(){const id=sessionStorage.getItem('nexa_open_playlist');if(!id)return;const b=document.querySelector(`#playlistNav [data-playlist="${CSS.escape(id)}"]`);if(b){sessionStorage.removeItem('nexa_open_playlist');b.click()}}

  let catTimer=null,dragEl=null,touchEl=null,currentCategoryPlaylist='';
  function playlistId(){return document.querySelector('#playlistNav .nav-btn.active[data-playlist]')?.dataset.playlist||''}
  function categoryName(item){return item?.querySelector('[data-group-filter]')?.dataset.groupFilter||''}
  function categoryOrderFromDom(){return [...document.querySelectorAll('#groupList .group-item')].map(categoryName).filter(Boolean)}
  async function saveCategoryOrder(){const id=playlistId();if(!id)return;const groups=categoryOrderFromDom();try{await api(`/api/playlists/${id}/groups/reorder`,{method:'POST',body:JSON.stringify({groups})});toast('Category order saved')}catch(e){toast(e.message)}}

  function arrangeCategories(order=[]){const list=$('groupList');if(!list)return;const items=[...list.querySelectorAll('.group-item')],map=new Map(items.map(x=>[categoryName(x),x]));for(const g of order){const item=map.get(g);if(item){list.appendChild(item);map.delete(g)}}for(const item of map.values())list.appendChild(item)}

  function bindCategoryItem(item){
    if(item.dataset.categoryDnd==='1')return;item.dataset.categoryDnd='1';item.draggable=true;
    if(!item.querySelector('.category-drag'))item.insertAdjacentHTML('afterbegin','<span class="category-drag" title="Drag to reorder">⋮⋮</span>');
    item.addEventListener('dragstart',e=>{dragEl=item;item.classList.add('category-dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',categoryName(item))}catch{}});
    item.addEventListener('dragover',e=>{if(!dragEl||dragEl===item)return;e.preventDefault();const list=$('groupList'),rect=item.getBoundingClientRect(),horizontal=getComputedStyle(list).display==='flex';const after=horizontal?e.clientX>rect.left+rect.width/2:e.clientY>rect.top+rect.height/2;list.insertBefore(dragEl,after?item.nextSibling:item)});
    item.addEventListener('drop',e=>{e.preventDefault()});
    item.addEventListener('dragend',()=>{if(!dragEl)return;dragEl.classList.remove('category-dragging');dragEl=null;saveCategoryOrder()});
    const handle=item.querySelector('.category-drag');
    handle.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touchEl=item;item.classList.add('category-dragging');handle.setPointerCapture?.(e.pointerId);e.preventDefault()});
    handle.addEventListener('pointermove',e=>{if(!touchEl)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('#groupList .group-item');if(!target||target===touchEl)return;const list=$('groupList'),rect=target.getBoundingClientRect(),horizontal=getComputedStyle(list).display==='flex';const after=horizontal?e.clientX>rect.left+rect.width/2:e.clientY>rect.top+rect.height/2;list.insertBefore(touchEl,after?target.nextSibling:target);e.preventDefault()});
    const finish=()=>{if(!touchEl)return;touchEl.classList.remove('category-dragging');touchEl=null;saveCategoryOrder()};
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
  }

  async function refreshCategoryEditor(){
    clearTimeout(catTimer);const list=$('groupList'),id=playlistId();if(!list||!id||$('editorView')?.classList.contains('hidden'))return;
    currentCategoryPlaylist=id;
    const panel=list.closest('.groups-panel');if(panel){const eye=panel.querySelector('.eyebrow'),h=panel.querySelector('h3');if(eye)eye.textContent='CATEGORY EDITOR';if(h)h.textContent='Drag to sort';if(!panel.querySelector('.category-hint'))h?.insertAdjacentHTML('afterend','<p class="category-hint">Drag categories to control their order in the editor and exported M3U.</p>')}
    try{const data=await api(`/api/playlists/${id}`);if(id!==playlistId())return;const actual=[...list.querySelectorAll('.group-item')].map(categoryName).filter(Boolean),saved=Array.isArray(data.playlist?.category_order)?data.playlist.category_order:[],order=[...saved.filter(g=>actual.includes(g)),...actual.filter(g=>!saved.includes(g))];arrangeCategories(order);[...list.querySelectorAll('.group-item')].forEach(bindCategoryItem)}catch{}
  }
  function scheduleCategory(){clearTimeout(catTimer);catTimer=setTimeout(refreshCategoryEditor,120)}

  function init(){injectXtreamImport();requestedPlaylist();const list=$('groupList');if(list)new MutationObserver(scheduleCategory).observe(list,{childList:true,subtree:true});const nav=$('playlistNav');if(nav)new MutationObserver(()=>{requestedPlaylist();scheduleCategory()}).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});document.addEventListener('click',e=>{if(e.target.closest('[data-playlist]'))setTimeout(scheduleCategory,150)});scheduleCategory()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();