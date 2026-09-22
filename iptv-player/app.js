(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    welcomeView: $('welcomeView'), appView: $('appView'), playlistForm: $('playlistForm'), playlistUrl: $('playlistUrl'),
    pasteBtn: $('pasteBtn'), loadBtn: $('loadBtn'), formError: $('formError'), sidebar: $('sidebar'), sidebarBackdrop: $('sidebarBackdrop'),
    openSidebar: $('openSidebar'), closeSidebar: $('closeSidebar'), searchInput: $('searchInput'), categoryList: $('categoryList'),
    allCount: $('allCount'), favCount: $('favCount'), categoryCount: $('categoryCount'), changePlaylistBtn: $('changePlaylistBtn'),
    sectionTitle: $('sectionTitle'), listTitle: $('listTitle'), visibleCount: $('visibleCount'), channelList: $('channelList'), emptyState: $('emptyState'),
    video: $('video'), playerFrame: $('playerFrame'), videoBackdrop: $('videoBackdrop'), videoLoader: $('videoLoader'), videoError: $('videoError'),
    videoErrorText: $('videoErrorText'), retryBtn: $('retryBtn'), liveBadge: $('liveBadge'), playerFavoriteBtn: $('playerFavoriteBtn'),
    playerControls: $('playerControls'), nowLogo: $('nowLogo'), nowTitle: $('nowTitle'), nowGroup: $('nowGroup'), playPauseBtn: $('playPauseBtn'),
    muteBtn: $('muteBtn'), volumeSlider: $('volumeSlider'), pipBtn: $('pipBtn'), fullscreenBtn: $('fullscreenBtn'),
    currentStreamTitle: $('currentStreamTitle'), streamType: $('streamType'), streamStatus: $('streamStatus'), clock: $('clock'),
    themeGlowBtn: $('themeGlowBtn'), toast: $('toast')
  };

  const state = {
    channels: [], categories: [], activeView: 'all', activeCategory: null, search: '', current: null,
    favorites: new Set(JSON.parse(localStorage.getItem('nexaFavorites') || '[]')),
    hls: null, mpegts: null, playlistUrl: localStorage.getItem('nexaPlaylistUrl') || '', controlsTimer: null
  };

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  }

  function safeImage(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function setLoading(on) {
    els.loadBtn.disabled = on;
    els.loadBtn.classList.toggle('loading', on);
    els.loadBtn.querySelector('.button-label').textContent = on ? 'Loading playlist…' : 'Load playlist';
  }

  async function loadPlaylist(url) {
    setLoading(true);
    els.formError.textContent = '';
    try {
      const response = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`, { headers: { 'Accept': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load this playlist.');
      if (!Array.isArray(data.channels) || !data.channels.length) throw new Error('No playable channels were found in this playlist.');

      state.channels = data.channels.map((c, i) => ({ ...c, id: c.id || `ch-${i}` }));
      state.categories = data.categories || [];
      state.playlistUrl = url;
      localStorage.setItem('nexaPlaylistUrl', url);
      hydrateApp();
      els.welcomeView.classList.add('hidden');
      els.appView.classList.remove('hidden');
      toast(`${state.channels.length} channels loaded`);
    } catch (error) {
      els.formError.textContent = error.message || 'Something went wrong.';
    } finally {
      setLoading(false);
    }
  }

  function hydrateApp() {
    els.allCount.textContent = state.channels.length;
    els.categoryCount.textContent = state.categories.length;
    renderCategories();
    updateFavoriteCount();
    renderChannels();
  }

  function renderCategories() {
    const counts = new Map();
    state.channels.forEach(ch => counts.set(ch.group || 'Other', (counts.get(ch.group || 'Other') || 0) + 1));
    els.categoryList.innerHTML = state.categories.map(category => `
      <button class="category-item" data-category="${escapeHtml(category)}">
        <span class="category-bullet"></span>
        <span class="category-name">${escapeHtml(category)}</span>
        <b>${counts.get(category) || 0}</b>
      </button>
    `).join('');
  }

  function filteredChannels() {
    let list = state.channels;
    if (state.activeView === 'favorites') list = list.filter(ch => state.favorites.has(ch.id));
    if (state.activeCategory) list = list.filter(ch => (ch.group || 'Other') === state.activeCategory);
    if (state.search) {
      const q = state.search.toLocaleLowerCase();
      list = list.filter(ch => `${ch.name} ${ch.group || ''}`.toLocaleLowerCase().includes(q));
    }
    return list;
  }

  function renderChannels() {
    const list = filteredChannels();
    els.visibleCount.textContent = `${list.length} channel${list.length === 1 ? '' : 's'}`;
    els.channelList.classList.toggle('hidden', list.length === 0);
    els.emptyState.classList.toggle('hidden', list.length !== 0);

    els.channelList.innerHTML = list.map(channel => {
      const logo = safeImage(channel.logo);
      const active = state.current?.id === channel.id;
      const favorite = state.favorites.has(channel.id);
      return `
        <button class="channel-card ${active ? 'active' : ''}" data-channel-id="${escapeHtml(channel.id)}">
          <span class="channel-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.textContent='TV'">` : 'TV'}</span>
          <span class="channel-copy">
            <strong>${escapeHtml(channel.name || 'Unnamed channel')}</strong>
            <span>${escapeHtml(channel.group || 'Other')} <em class="channel-live">• LIVE</em></span>
          </span>
          <span class="channel-actions">
            <span class="channel-fav ${favorite ? 'active' : ''}" data-fav-id="${escapeHtml(channel.id)}" role="button" aria-label="Favorite">${favorite ? '♥' : '♡'}</span>
          </span>
        </button>
      `;
    }).join('');
  }

  function destroyPlayer() {
    if (state.hls) { try { state.hls.destroy(); } catch {} state.hls = null; }
    if (state.mpegts) {
      try { state.mpegts.pause(); state.mpegts.unload(); state.mpegts.detachMediaElement(); state.mpegts.destroy(); } catch {}
      state.mpegts = null;
    }
    els.video.pause();
    els.video.removeAttribute('src');
    els.video.load();
  }

  async function playChannel(channel) {
    if (!channel?.url) return;
    state.current = channel;
    destroyPlayer();
    updateNowPlaying(channel);
    renderChannels();
    els.videoBackdrop.classList.add('hidden');
    els.videoError.classList.add('hidden');
    els.videoLoader.classList.remove('hidden');
    els.playerFrame.classList.add('active', 'controls-visible');
    els.playerControls.classList.remove('hidden');
    els.liveBadge.classList.remove('hidden');
    els.playerFavoriteBtn.classList.remove('hidden');
    els.streamStatus.textContent = 'Connecting';

    const url = channel.url;
    const isHls = channel.type === 'hls';
    const isMpegTs = channel.type === 'mpegts';
    els.streamType.textContent = isHls ? 'HLS' : (isMpegTs ? 'MPEG-TS' : 'STREAM');

    try {
      if (isMpegTs && window.mpegts?.isSupported?.()) {
        const player = mpegts.createPlayer({
          type: 'mpegts',
          isLive: true,
          url,
          hasAudio: true,
          hasVideo: true
        }, {
          enableWorker: true,
          enableStashBuffer: false,
          lazyLoad: false,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMaxLatency: 4,
          liveBufferLatencyMinRemain: 1
        });
        state.mpegts = player;
        player.attachMediaElement(els.video);
        player.load();
        if (window.mpegts?.Events?.ERROR) {
          player.on(mpegts.Events.ERROR, (_type, _detail, info) => {
            const code = info?.code || info?.status || '';
            showVideoError(`MPEG-TS stream could not be played${code ? ` (HTTP ${code})` : ''}.`);
          });
        }
        await player.play();
      } else if (isHls && window.Hls?.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          manifestLoadingTimeOut: 15000,
          levelLoadingTimeOut: 15000,
          fragLoadingTimeOut: 20000
        });
        state.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(els.video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => attemptPlay());
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { hls.startLoad(); } catch { showVideoError('The stream server could not be reached or rejected the request.'); }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch { showVideoError('The stream format is not supported by this browser.'); }
          } else {
            showVideoError('The HLS stream could not be loaded.');
          }
        });
      } else if (els.video.canPlayType('application/vnd.apple.mpegurl') && isHls) {
        els.video.src = url;
        await attemptPlay();
      } else {
        els.video.src = url;
        await attemptPlay();
      }
    } catch (error) {
      showVideoError(error.message || 'The stream could not start.');
    }
  }

  async function attemptPlay() {
    try {
      await els.video.play();
      els.streamStatus.textContent = 'Playing';
      updatePlayIcon();
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        els.streamStatus.textContent = 'Tap play';
        toast('Tap the player to start playback');
      } else {
        showVideoError('Playback failed. The stream may be offline or use an unsupported format.');
      }
    }
  }

  function updateNowPlaying(channel) {
    els.nowTitle.textContent = channel.name || 'Unnamed channel';
    els.nowGroup.textContent = channel.group || 'Other';
    els.currentStreamTitle.textContent = channel.name || 'Unnamed channel';
    const logo = safeImage(channel.logo);
    els.nowLogo.style.backgroundImage = logo ? `url("${logo.replace(/"/g, '%22')}")` : '';
    els.nowLogo.textContent = logo ? '' : 'TV';
    updatePlayerFavorite();
  }

  function showVideoError(message) {
    els.videoLoader.classList.add('hidden');
    els.videoErrorText.textContent = message;
    els.videoError.classList.remove('hidden');
    els.streamStatus.textContent = 'Unavailable';
    updatePlayIcon();
  }

  function updatePlayIcon() {
    const paused = els.video.paused;
    els.playPauseBtn.querySelector('.play-icon').classList.toggle('hidden', !paused);
    els.playPauseBtn.querySelector('.pause-icon').classList.toggle('hidden', paused);
  }

  function toggleFavorite(id) {
    if (!id) return;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    localStorage.setItem('nexaFavorites', JSON.stringify([...state.favorites]));
    updateFavoriteCount();
    updatePlayerFavorite();
    renderChannels();
  }

  function updateFavoriteCount() {
    const count = state.channels.reduce((n, ch) => n + (state.favorites.has(ch.id) ? 1 : 0), 0);
    els.favCount.textContent = count;
  }

  function updatePlayerFavorite() {
    const active = state.current && state.favorites.has(state.current.id);
    els.playerFavoriteBtn.classList.toggle('active', !!active);
    els.playerFavoriteBtn.textContent = active ? '♥' : '♡';
  }

  function setView(view, category = null) {
    state.activeView = view;
    state.activeCategory = category;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view && !category));
    document.querySelectorAll('.category-item').forEach(btn => btn.classList.toggle('active', btn.dataset.category === category));
    const title = category || (view === 'favorites' ? 'Favorites' : 'All channels');
    els.sectionTitle.textContent = title;
    els.listTitle.textContent = title;
    renderChannels();
    closeSidebar();
  }

  function openSidebar() { els.sidebar.classList.add('open'); els.sidebarBackdrop.classList.add('open'); }
  function closeSidebar() { els.sidebar.classList.remove('open'); els.sidebarBackdrop.classList.remove('open'); }

  function resetToWelcome() {
    destroyPlayer();
    state.current = null;
    state.channels = [];
    state.categories = [];
    state.activeView = 'all';
    state.activeCategory = null;
    state.search = '';
    els.searchInput.value = '';
    els.playlistUrl.value = state.playlistUrl;
    els.appView.classList.add('hidden');
    els.welcomeView.classList.remove('hidden');
    setTimeout(() => els.playlistUrl.focus(), 60);
  }

  function updateClock() {
    els.clock.textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  els.playlistForm.addEventListener('submit', e => {
    e.preventDefault();
    const url = els.playlistUrl.value.trim();
    if (!url) return;
    loadPlaylist(url);
  });

  els.pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) els.playlistUrl.value = text.trim();
    } catch { toast('Clipboard permission was not granted'); }
  });

  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  els.categoryList.addEventListener('click', e => {
    const btn = e.target.closest('.category-item');
    if (btn) setView('all', btn.dataset.category);
  });

  els.channelList.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav-id]');
    if (fav) { e.preventDefault(); e.stopPropagation(); toggleFavorite(fav.dataset.favId); return; }
    const card = e.target.closest('[data-channel-id]');
    if (!card) return;
    const channel = state.channels.find(ch => ch.id === card.dataset.channelId);
    if (channel) playChannel(channel);
  });

  els.searchInput.addEventListener('input', e => { state.search = e.target.value.trim(); renderChannels(); });
  els.openSidebar.addEventListener('click', openSidebar);
  els.closeSidebar.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.changePlaylistBtn.addEventListener('click', resetToWelcome);
  els.retryBtn.addEventListener('click', () => state.current && playChannel(state.current));
  els.playerFavoriteBtn.addEventListener('click', () => state.current && toggleFavorite(state.current.id));

  els.playPauseBtn.addEventListener('click', async () => {
    if (!state.current) return;
    try { els.video.paused ? await els.video.play() : els.video.pause(); } catch {}
    updatePlayIcon();
  });
  els.video.addEventListener('play', () => { els.videoLoader.classList.add('hidden'); els.videoError.classList.add('hidden'); els.streamStatus.textContent = 'Playing'; updatePlayIcon(); });
  els.video.addEventListener('playing', () => { els.videoLoader.classList.add('hidden'); els.streamStatus.textContent = 'Playing'; });
  els.video.addEventListener('waiting', () => { if (state.current) { els.videoLoader.classList.remove('hidden'); els.streamStatus.textContent = 'Buffering'; } });
  els.video.addEventListener('pause', updatePlayIcon);
  els.video.addEventListener('error', () => { if (!state.hls && state.current) showVideoError('This stream could not be decoded or reached by the browser.'); });

  els.muteBtn.addEventListener('click', () => { els.video.muted = !els.video.muted; toast(els.video.muted ? 'Muted' : 'Sound on'); });
  els.volumeSlider.addEventListener('input', e => { els.video.volume = Number(e.target.value); els.video.muted = false; });
  els.fullscreenBtn.addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await els.playerFrame.requestFullscreen(); else await document.exitFullscreen(); } catch {}
  });
  els.pipBtn.addEventListener('click', async () => {
    if (!document.pictureInPictureEnabled || !state.current) return toast('Picture-in-picture is not available');
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await els.video.requestPictureInPicture(); } catch { toast('Picture-in-picture could not start'); }
  });

  let controlsTimeout;
  function revealControls() {
    if (!state.current) return;
    els.playerFrame.classList.add('controls-visible');
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => els.playerFrame.classList.remove('controls-visible'), 2600);
  }
  els.playerFrame.addEventListener('mousemove', revealControls);
  els.playerFrame.addEventListener('touchstart', revealControls, { passive: true });
  els.playerFrame.addEventListener('dblclick', () => els.fullscreenBtn.click());

  els.themeGlowBtn.addEventListener('click', () => {
    document.body.classList.toggle('glow-off');
    localStorage.setItem('nexaGlowOff', document.body.classList.contains('glow-off') ? '1' : '0');
  });

  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== els.searchInput && !els.appView.classList.contains('hidden')) { e.preventDefault(); els.searchInput.focus(); }
    if (e.code === 'Space' && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName) && state.current) { e.preventDefault(); els.playPauseBtn.click(); }
    if (e.key.toLowerCase() === 'f' && state.current && document.activeElement?.tagName !== 'INPUT') els.fullscreenBtn.click();
    if (e.key.toLowerCase() === 'm' && state.current && document.activeElement?.tagName !== 'INPUT') els.muteBtn.click();
  });

  if (state.playlistUrl) els.playlistUrl.value = state.playlistUrl;
  if (localStorage.getItem('nexaGlowOff') === '1') document.body.classList.add('glow-off');
  updateClock(); setInterval(updateClock, 15000);
})();
