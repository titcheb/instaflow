(()=>{
  const $=id=>document.getElementById(id);
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)};
  const icons={playlist:'▣',channels:'▤',basic:'✎',number:'↕',logo:'▧',epg:'▦',category:'▥',refresh:'⟳',trash:'♲',movies:'▦',series:'▰',users:'♣',auto:'⚙',player:'▶'};
  const COLLAPSE_KEY='nexa_sidebar_collapsed';

  function currentPlaylist(){return document.querySelector('#playlistNav .nav-btn.active[data-playlist]')}
  function requirePlaylist(action){if(currentPlaylist()){action();return true}toast('Open a playlist first');return false}
  function flash(el){if(!el)return;el.classList.remove('nexa-focus-flash');void el.offsetWidth;el.classList.add('nexa-focus-flash');setTimeout(()=>el.classList.remove('nexa-focus-flash'),1200)}
  function closeMobile(){if(innerWidth<=800)document.querySelector('.sidebar')?.classList.remove('open')}
  function hideNativeAdmin(){const a=$('adminNav');if(a)a.style.display='none'}

  function setTheme(night){
    document.body.classList.toggle('nexa-light',!night);
    localStorage.setItem('nexa_night_mode',night?'1':'0');
    const input=$('nexaNightToggle');if(input)input.checked=night;
    const label=$('nexaThemeLabel');if(label)label.textContent=night?'NIGHT MODE':'LIGHT MODE';
  }

  function setSidebarCollapsed(collapsed){
    document.body.classList.toggle('nexa-sidebar-collapsed',collapsed);
    localStorage.setItem(COLLAPSE_KEY,collapsed?'1':'0');
    const btn=$('nexaCollapseBtn');
    if(btn){btn.textContent=collapsed?'›':'‹';btn.title=collapsed?'Expand sidebar':'Minimize sidebar';btn.setAttribute('aria-label',btn.title)}
  }

  function setSubActive(target){document.querySelectorAll('.nexa-subitem').forEach(x=>x.classList.toggle('active',x===target))}

  function ensureCategoryHeader(){
    const list=$('groupList');if(!list)return;
    if(!list.previousElementSibling?.classList.contains('nexa-category-table-head')){
      list.insertAdjacentHTML('beforebegin','<div class="nexa-category-table-head"><span></span><span>Category</span><span>Channels</span><span>Actions</span></div>');
    }
  }

  function showCategoryMode(categoryButton){
    document.body.classList.add('nexa-category-mode');
    setSubActive(categoryButton);
    $('addChannelTop')?.classList.add('hidden');
    if($('pageTitle'))$('pageTitle').textContent='Category editor';
    if($('pageEyebrow'))$('pageEyebrow').textContent='PLAYLIST CATEGORIES';
    ensureCategoryHeader();
    setTimeout(()=>{const el=document.querySelector('.groups-panel');el?.scrollIntoView({behavior:'smooth',block:'start'});flash(el)},40);
    closeMobile();
  }

  function showBasicMode(basicButton){
    document.body.classList.remove('nexa-category-mode');
    if(basicButton)setSubActive(basicButton);
    if(currentPlaylist())$('addChannelTop')?.classList.remove('hidden');
    const active=currentPlaylist();
    if(active&&$('pageTitle'))$('pageTitle').textContent=(active.title||active.textContent||'Playlist').trim();
    if($('pageEyebrow'))$('pageEyebrow').textContent='PLAYLIST EDITOR';
  }

  function makeButton({icon,label,cls='',soon=false}){
    const b=document.createElement('button');b.type='button';b.className=`nexa-menu-item ${cls}`;b.title=label;b.innerHTML=`<span class="nexa-menu-icon">${icon}</span><span class="nexa-menu-label">${label}</span>${soon?'<small class="nexa-soon">SOON</small>':''}`;return b;
  }

  function inject(){
    const sidebar=document.querySelector('.sidebar'),nav=sidebar?.querySelector('nav');if(!sidebar||!nav||sidebar.dataset.nexaMenu==='1')return;
    sidebar.dataset.nexaMenu='1';
    const originalDashboard=document.querySelector('[data-nav="dashboard"]');
    const playlistNav=$('playlistNav');
    const adminNav=$('adminNav');

    const sideTop=sidebar.querySelector('.side-top');
    if(sideTop&&!$('nexaCollapseBtn')){
      const actions=document.createElement('div');actions.className='nexa-side-actions';
      const collapse=document.createElement('button');collapse.id='nexaCollapseBtn';collapse.type='button';collapse.className='nexa-collapse-btn';collapse.textContent='‹';collapse.onclick=()=>setSidebarCollapsed(!document.body.classList.contains('nexa-sidebar-collapsed'));
      const plus=$('newPlaylistBtn');
      if(plus){plus.parentNode.insertBefore(actions,plus);actions.append(collapse,plus)}else actions.append(collapse);
    }

    nav.innerHTML='';
    nav.classList.add('nexa-sidebar-nav');

    const manager=makeButton({icon:icons.playlist,label:'Playlist manager',cls:'nexa-manager'});
    manager.dataset.nav='dashboard';
    manager.onclick=()=>{document.body.classList.remove('nexa-category-mode');originalDashboard?.click();closeMobile()};
    nav.appendChild(manager);

    const channelsWrap=document.createElement('div');channelsWrap.className='nexa-menu-group open';
    const channelsBtn=makeButton({icon:icons.channels,label:'Channels',cls:'nexa-group-head active'});
    channelsBtn.insertAdjacentHTML('beforeend','<span class="nexa-chevron">⌄</span>');
    const sub=document.createElement('div');sub.className='nexa-submenu';

    const basic=makeButton({icon:icons.basic,label:'Basic editor',cls:'nexa-subitem active'});
    basic.onclick=()=>requirePlaylist(()=>{showBasicMode(basic);document.querySelector('.channel-panel')?.scrollIntoView({behavior:'smooth',block:'start'});flash(document.querySelector('.channel-panel'));closeMobile()});
    const number=makeButton({icon:icons.number,label:'Number editor',cls:'nexa-subitem',soon:true});number.onclick=()=>toast('Number editor is next module');
    const logo=makeButton({icon:icons.logo,label:'Logo editor',cls:'nexa-subitem',soon:true});logo.onclick=()=>toast('Logo editor is next module');
    const epg=makeButton({icon:icons.epg,label:'EPG editor',cls:'nexa-subitem'});
    epg.onclick=()=>requirePlaylist(()=>{showBasicMode(epg);$('playlistSettings')?.click();setTimeout(()=>{const x=$('settingsEpg');x?.focus();flash(x?.closest('label'))},80);closeMobile()});
    const category=makeButton({icon:icons.category,label:'Category editor',cls:'nexa-subitem'});
    category.onclick=()=>requirePlaylist(()=>showCategoryMode(category));
    const manual=makeButton({icon:icons.refresh,label:'Manual updater',cls:'nexa-subitem'});
    manual.onclick=()=>requirePlaylist(()=>{showBasicMode(manual);$('refreshSource')?.click();closeMobile()});
    const recycle=makeButton({icon:icons.trash,label:'Recycle bin',cls:'nexa-subitem',soon:true});recycle.onclick=()=>toast('Recycle bin is next module');
    sub.append(basic,number,logo,epg,category,manual,recycle);
    channelsBtn.onclick=()=>channelsWrap.classList.toggle('open');
    channelsWrap.append(channelsBtn,sub);nav.appendChild(channelsWrap);

    const playlistsSection=document.createElement('div');playlistsSection.className='nexa-playlists-section';
    playlistsSection.innerHTML='<div class="nexa-section-title">MY PLAYLISTS</div>';
    if(playlistNav){playlistNav.classList.add('nexa-playlist-nav');playlistsSection.appendChild(playlistNav)}
    nav.appendChild(playlistsSection);

    const movies=makeButton({icon:icons.movies,label:'Movies',cls:'nexa-top-item',soon:true});movies.onclick=()=>toast('Movies editor is next module');
    const series=makeButton({icon:icons.series,label:'TV series',cls:'nexa-top-item',soon:true});series.onclick=()=>toast('TV series editor is next module');
    const users=makeButton({icon:icons.users,label:'User management',cls:'nexa-top-item'});
    users.onclick=()=>{document.body.classList.remove('nexa-category-mode');const a=$('adminNav')||adminNav;if(a&&!a.classList.contains('hidden')){a.click();closeMobile()}else toast('Admin access required')};
    const auto=makeButton({icon:icons.auto,label:'Auto updater',cls:'nexa-top-item',soon:true});auto.onclick=()=>toast('Scheduled auto updater is next module');
    const player=makeButton({icon:icons.player,label:'IPTV Web Player',cls:'nexa-top-item'});player.onclick=()=>window.open('https://nexa-iptv-player.onrender.com','_blank','noopener');
    nav.append(movies,series,users,auto,player);

    const bottom=sidebar.querySelector('.sidebar-bottom');
    if(bottom&&!$('nexaThemeRow')){
      const row=document.createElement('label');row.id='nexaThemeRow';row.className='nexa-theme-row';row.innerHTML='<span id="nexaThemeLabel">NIGHT MODE</span><input id="nexaNightToggle" type="checkbox"><i></i>';
      const version=document.createElement('div');version.className='nexa-version';version.textContent='V1.4.1';
      bottom.insertAdjacentElement('afterbegin',version);bottom.insertAdjacentElement('afterbegin',row);
      $('nexaNightToggle').addEventListener('change',e=>setTheme(e.target.checked));
    }

    new MutationObserver(hideNativeAdmin).observe(nav,{childList:true,subtree:true});hideNativeAdmin();
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-playlist]')){showBasicMode(basic);channelsBtn.classList.add('active')}
      if(e.target.closest('[data-nav="dashboard"]'))document.body.classList.remove('nexa-category-mode');
    });
    const saved=localStorage.getItem('nexa_night_mode');setTheme(saved===null?false:saved==='1');
    setSidebarCollapsed(localStorage.getItem(COLLAPSE_KEY)==='1');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
})();
