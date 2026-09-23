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
  function apply(){wire('createUserDialog');wire('resetPasswordDialog')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();setTimeout(apply,100)});else{apply();setTimeout(apply,100)}
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();