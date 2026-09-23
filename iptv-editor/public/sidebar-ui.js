(()=>{
  const $=id=>document.getElementById(id);
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)};
  const icons={playlist:'▣',channels:'▤',basic:'✎',number:'↕',logo:'▧',epg:'▦',category:'▥',refresh:'⟳',trash:'♲',movies:'▦',series:'▰',users:'♣',auto:'⚙',player:'▶'};

  function currentPlaylist(){return document.querySelector('#playlistNav .nav-btn.active[data-playlist]')}
  function requirePlaylist(action){if(currentPlaylist()){action();return true}toast('Open a playlist first');return false}
  function flash(el){if(!el)return;el.classList.remove('nexa-focus-flash');void el.offsetWidth;el.classList.add('nexa-focus-flash');setTimeout(()=>el.classList.remove('nexa-focus-flash'),1200)}

  function setTheme(night){
    document.body.classList.toggle('nexa-light',!night);
    localStorage.setItem('nexa_night_mode',night?'1':'0');
    const input=$('nexaNightToggle');if(input)input.checked=night;
    const label=$('nexaThemeLabel');if(label)label.textContent=night?'NIGHT MODE':'LIGHT MODE';
  }

  function makeButton({icon,label,cls='',soon=false}){
    const b=document.createElement('button');b.type='button';b.className=`nexa-menu-item ${cls}`;b.innerHTML=`<span class="nexa-menu-icon">${icon}</span><span class="nexa-menu-label">${label}</span>${soon?'<small class="nexa-soon">SOON</small>':''}`;return b;
  }

  function inject(){
    const sidebar=document.querySelector('.sidebar'),nav=sidebar?.querySelector('nav');if(!sidebar||!nav||sidebar.dataset.nexaMenu==='1')return;
    sidebar.dataset.nexaMenu='1';
    const originalDashboard=document.querySelector('[data-nav="dashboard"]');
    const playlistNav=$('playlistNav');
    const adminNav=$('adminNav');
    nav.innerHTML='';
    nav.classList.add('nexa-sidebar-nav');

    const manager=makeButton({icon:icons.playlist,label:'Playlist manager',cls:'nexa-manager'});
    manager.onclick=()=>originalDashboard?.click();
    nav.appendChild(manager);

    const channelsWrap=document.createElement('div');channelsWrap.className='nexa-menu-group open';
    const channelsBtn=makeButton({icon:icons.channels,label:'Channels',cls:'nexa-group-head active'});
    channelsBtn.insertAdjacentHTML('beforeend','<span class="nexa-chevron">⌄</span>');
    const sub=document.createElement('div');sub.className='nexa-submenu';

    const basic=makeButton({icon:icons.basic,label:'Basic editor',cls:'nexa-subitem active'});
    basic.onclick=()=>requirePlaylist(()=>{document.querySelector('.channel-panel')?.scrollIntoView({behavior:'smooth',block:'start'});flash(document.querySelector('.channel-panel'))});
    const number=makeButton({icon:icons.number,label:'Number editor',cls:'nexa-subitem',soon:true});number.onclick=()=>toast('Number editor is next module');
    const logo=makeButton({icon:icons.logo,label:'Logo editor',cls:'nexa-subitem',soon:true});logo.onclick=()=>toast('Logo editor is next module');
    const epg=makeButton({icon:icons.epg,label:'EPG editor',cls:'nexa-subitem'});
    epg.onclick=()=>requirePlaylist(()=>{ $('playlistSettings')?.click();setTimeout(()=>{const x=$('settingsEpg');x?.focus();flash(x?.closest('label'))},80)});
    const category=makeButton({icon:icons.category,label:'Category editor',cls:'nexa-subitem'});
    category.onclick=()=>requirePlaylist(()=>{const el=document.querySelector('.groups-panel');el?.scrollIntoView({behavior:'smooth',block:'start'});flash(el)});
    const manual=makeButton({icon:icons.refresh,label:'Manual updater',cls:'nexa-subitem'});
    manual.onclick=()=>requirePlaylist(()=>$('refreshSource')?.click());
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
    users.onclick=()=>{const a=$('adminNav')||adminNav;if(a&&!a.classList.contains('hidden'))a.click();else toast('Admin access required')};
    const auto=makeButton({icon:icons.auto,label:'Auto updater',cls:'nexa-top-item',soon:true});auto.onclick=()=>toast('Scheduled auto updater is next module');
    const player=makeButton({icon:icons.player,label:'IPTV Web Player',cls:'nexa-top-item'});player.onclick=()=>window.open('https://nexa-iptv-player.onrender.com','_blank','noopener');
    nav.append(movies,series,users,auto,player);

    const bottom=sidebar.querySelector('.sidebar-bottom');
    if(bottom&&!$('nexaThemeRow')){
      const row=document.createElement('label');row.id='nexaThemeRow';row.className='nexa-theme-row';row.innerHTML='<span id="nexaThemeLabel">NIGHT MODE</span><input id="nexaNightToggle" type="checkbox"><i></i>';
      const version=document.createElement('div');version.className='nexa-version';version.textContent='V1.4.0';
      bottom.insertAdjacentElement('afterbegin',version);bottom.insertAdjacentElement('afterbegin',row);
      $('nexaNightToggle').addEventListener('change',e=>setTheme(e.target.checked));
    }

    document.addEventListener('click',e=>{
      if(e.target.closest('[data-playlist]')){basic.classList.add('active');channelsBtn.classList.add('active')}
    });
    const saved=localStorage.getItem('nexa_night_mode');setTheme(saved===null?false:saved==='1');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
})();
