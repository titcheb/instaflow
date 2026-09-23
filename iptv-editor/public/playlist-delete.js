(()=>{
  const STYLE_ID='nexa-playlist-delete-style';
  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .playlist-card-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:stretch;width:100%}
      .playlist-card-row>.playlist-card{min-width:0;width:100%}
      .playlist-delete-btn{width:46px;min-width:46px;border:1px solid rgba(255,73,112,.25);border-radius:14px;background:rgba(255,73,112,.08);color:#ff4970;font:inherit;font-size:18px;cursor:pointer;display:grid;place-items:center;transition:.18s ease}
      .playlist-delete-btn:hover,.playlist-delete-btn:focus-visible{background:rgba(255,73,112,.16);border-color:rgba(255,73,112,.55);outline:none;transform:translateY(-1px)}
      .playlist-delete-btn:disabled{opacity:.5;cursor:wait;transform:none}
      @media(max-width:800px){.playlist-card-row{gap:8px}.playlist-delete-btn{width:44px;min-width:44px;border-radius:12px}}
    `;
    document.head.appendChild(s);
  }

  async function removePlaylist(id,name,btn){
    if(!confirm(`Delete “${name}” and all its channels? This cannot be undone.`))return;
    btn.disabled=true;
    const token=localStorage.getItem('nexa_editor_token')||'';
    try{
      const r=await fetch(`/api/playlists/${encodeURIComponent(id)}`,{method:'DELETE',headers:token?{Authorization:`Bearer ${token}`}:{}});
      let data={};try{data=await r.json()}catch{}
      if(r.status===401){localStorage.removeItem('nexa_editor_token');location.reload();return}
      if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
      const row=btn.closest('.playlist-card-row');
      if(row)row.remove();
      setTimeout(()=>location.reload(),180);
    }catch(e){
      btn.disabled=false;
      alert(e.message||'Could not delete playlist.');
    }
  }

  function decorate(){
    const root=document.getElementById('dashboardPlaylists');
    if(!root)return;
    root.querySelectorAll('.playlist-card[data-id]:not([data-delete-ready])').forEach(card=>{
      card.dataset.deleteReady='1';
      const id=card.dataset.id;
      const name=card.querySelector('strong')?.textContent?.trim()||'playlist';
      const row=document.createElement('div');
      row.className='playlist-card-row';
      card.replaceWith(row);
      row.appendChild(card);
      const del=document.createElement('button');
      del.type='button';
      del.className='playlist-delete-btn';
      del.title=`Delete ${name}`;
      del.setAttribute('aria-label',`Delete ${name}`);
      del.textContent='🗑';
      del.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();removePlaylist(id,name,del)});
      row.appendChild(del);
    });
  }

  function init(){
    injectStyle();
    decorate();
    const root=document.getElementById('dashboardPlaylists');
    if(root)new MutationObserver(decorate).observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();