(()=>{
  const token=()=>localStorage.getItem('nexa_editor_token')||'';
  async function json(url){
    const headers={};const t=token();if(t)headers.Authorization=`Bearer ${t}`;
    const r=await fetch(url,{headers,cache:'no-store'});let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;
  }
  function toast(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
  function safeName(v){return String(v||'playlist').replace(/[^a-z0-9._-]+/gi,'_').replace(/^_+|_+$/g,'')||'playlist'}
  async function downloadM3u(){
    const active=document.querySelector('#playlistNav .nav-btn.active[data-playlist]');
    if(!active)throw new Error('Open a playlist first.');
    const data=await json(`/api/playlists/${encodeURIComponent(active.dataset.playlist)}`);
    const p=data.playlist;if(!p?.public_token)throw new Error('Playlist export URL is missing.');
    const r=await fetch(`/p/${encodeURIComponent(p.public_token)}.m3u`,{cache:'no-store'});
    if(!r.ok)throw new Error(`Export failed (HTTP ${r.status}).`);
    const text=await r.text();
    if(!text.trim().startsWith('#EXTM3U'))throw new Error('Export did not return a valid M3U playlist.');
    const blob=new Blob([text],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`${safeName(p.name)}.m3u`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
    toast('M3U downloaded');
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest('#downloadM3u');if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    btn.disabled=true;downloadM3u().catch(x=>toast(x.message)).finally(()=>{btn.disabled=false});
  },true);
})();
