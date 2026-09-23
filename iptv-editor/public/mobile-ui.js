(()=>{
  const mobile=()=>window.matchMedia('(max-width:800px), (max-device-width:800px)').matches || Math.min(screen.width||9999,screen.height||9999)<=800;
  function init(){
    const sidebar=document.querySelector('.sidebar');
    const menu=document.getElementById('mobileMenu');
    if(!sidebar||!menu)return;
    let backdrop=document.getElementById('mobileSidebarBackdrop');
    if(!backdrop){backdrop=document.createElement('div');backdrop.id='mobileSidebarBackdrop';backdrop.className='mobile-sidebar-backdrop';document.body.appendChild(backdrop)}
    const close=()=>{sidebar.classList.remove('open');backdrop.classList.remove('show');document.body.classList.remove('mobile-sidebar-open')};
    const sync=()=>{if(!mobile()){close();return}const open=sidebar.classList.contains('open');backdrop.classList.toggle('show',open);document.body.classList.toggle('mobile-sidebar-open',open)};
    menu.addEventListener('click',()=>setTimeout(sync,0));
    backdrop.addEventListener('click',close);
    document.addEventListener('click',e=>{
      if(!mobile()||!sidebar.classList.contains('open'))return;
      if(e.target.closest('.sidebar')||e.target.closest('#mobileMenu'))return;
      close();
    });
    sidebar.addEventListener('click',e=>{
      if(!mobile())return;
      if(e.target.closest('.nexa-menu-item,[data-playlist],[data-nav="dashboard"],#logoutBtn'))setTimeout(close,0);
    });
    window.addEventListener('resize',sync,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(sync,100),{passive:true});
    new MutationObserver(sync).observe(sidebar,{attributes:true,attributeFilter:['class']});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();