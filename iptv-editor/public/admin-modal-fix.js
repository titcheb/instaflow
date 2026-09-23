(()=>{
  function wire(dialogId){
    const dialog=document.getElementById(dialogId);
    if(!dialog||dialog.dataset.nexaCloseFixed==='1')return;
    dialog.dataset.nexaCloseFixed='1';
    dialog.querySelectorAll('button[value="cancel"]').forEach(btn=>{
      btn.type='button';
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(dialog.open)dialog.close('cancel')});
    });
    dialog.addEventListener('click',e=>{
      if(e.target===dialog&&dialog.open)dialog.close('cancel');
    });
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(dialog.open)dialog.close('cancel')});
  }

  function injectPlaylistDeleteStyle(){
    if(document.getElementById('nexaPlaylistDeleteStyle'))return;
    const style=document.createElement('style');
    style.id='nexaPlaylistDeleteStyle';
    style.textContent=`
      .playlist-card-row{display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:10px;align-items:stretch;width:100%}
      .playlist-card-row>.playlist-card{width:100%;min-width:0}
      .playlist-delete-btn{border:1px solid rgba(255,73,112,.28);border-radius:14px;background:rgba(255,73,112,.08);color:#ff4970;font:inherit;font-size:18px;cursor:pointer;display:grid;place-items:center;transition:.18s ease}
      .playlist-delete-btn:hover,.playlist-delete-btn:focus-visible{background:rgba(255,73,112,.17);border-color:rgba(255,73,112,.55);outline:none}
      .playlist-delete-btn:disabled{opacity:.5;cursor:wait}
      @media(max-width:800px){.playlist-card-row{grid-template-columns:minmax(0,1fr) 44px;gap:8px}.playlist-delete-btn{border-radius:12px}}
    `;
    document.head.appendChild(style);
  }

  async function deletePlaylist(id,name,button){
    if(!confirm(`Delete “${name}” and all its channels? This cannot be undone.`))return;
    button.disabled=true;
    const token=localStorage.getItem('nexa_editor_token')||'';
    try{
      const response=await fetch(`/api/playlists/${encodeURIComponent(id)}`,{
        method:'DELETE',
        headers:token?{Authorization:`Bearer ${token}`}:{},
        cache:'no-store'
      });
      let data={};try{data=await response.json()}catch{}
      if(response.status===401){localStorage.removeItem('nexa_editor_token');location.reload();return}
      if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
      button.closest('.playlist-card-row')?.remove();
      setTimeout(()=>location.reload(),180);
    }catch(error){
      button.disabled=false;
      alert(error.message||'Could not delete playlist.');
    }
  }

  function decoratePlaylistCards(){
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
      del.textContent='🗑';
      del.title=`Delete ${name}`;
      del.setAttribute('aria-label',`Delete ${name}`);
      del.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();deletePlaylist(id,name,del)});
      row.appendChild(del);
    });
  }

  function apply(){
    wire('createUserDialog');
    wire('resetPasswordDialog');
    injectPlaylistDeleteStyle();
    decoratePlaylistCards();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();setTimeout(apply,100)});else{apply();setTimeout(apply,100)}
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();