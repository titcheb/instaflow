(()=>{
  const TOKEN_KEY='nexa_editor_token';
  const OPEN_KEY='nexa_open_playlist';
  const $=id=>document.getElementById(id);

  function hasToken(){return !!localStorage.getItem(TOKEN_KEY)}
  function hideAuthDuringRestore(){
    if(!hasToken())return;
    const auth=$('authView');
    if(auth)auth.style.visibility='hidden';
  }
  function revealWhenReady(){
    const auth=$('authView'),app=$('appView');
    let ticks=0;
    const timer=setInterval(()=>{
      ticks++;
      if(app&&!app.classList.contains('hidden')){
        if(auth)auth.style.visibility='';
        clearInterval(timer);
        return;
      }
      if(!hasToken()||ticks>30){
        if(auth)auth.style.visibility='';
        clearInterval(timer);
      }
    },100);
  }
  function forceImportedPlaylistOpen(){
    const wanted=sessionStorage.getItem(OPEN_KEY);
    if(!wanted)return;
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const app=$('appView'),editor=$('editorView');
      if(editor&&!editor.classList.contains('hidden')){
        const active=document.querySelector(`#playlistNav [data-playlist="${CSS.escape(wanted)}"].active`);
        if(active){sessionStorage.removeItem(OPEN_KEY);clearInterval(timer);return}
      }
      if(app&&!app.classList.contains('hidden')){
        const button=document.querySelector(`#playlistNav [data-playlist="${CSS.escape(wanted)}"]`);
        if(button)button.click();
      }
      if(tries>40){clearInterval(timer)}
    },150);
  }
  function bindAuthUX(){
    const form=$('authForm'),button=$('authSubmit');
    if(!form||!button)return;
    form.addEventListener('submit',()=>{
      button.dataset.originalText=button.textContent;
      button.textContent='Signing in…';
    },true);
    const observer=new MutationObserver(()=>{
      if(!button.disabled&&button.textContent==='Signing in…')button.textContent=button.dataset.originalText||'Enter dashboard';
    });
    observer.observe(button,{attributes:true,attributeFilter:['disabled']});
  }
  function init(){
    hideAuthDuringRestore();
    revealWhenReady();
    forceImportedPlaylistOpen();
    bindAuthUX();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
