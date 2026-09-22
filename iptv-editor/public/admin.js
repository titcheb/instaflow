(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const ctx={me:null,users:[],stats:null,lastToken:'',resetUser:null};
  const token=()=>localStorage.getItem('nexa_editor_token')||'';
  async function api(url,opts={}){const t=token();const headers={'Content-Type':'application/json',...(opts.headers||{})};if(t)headers.Authorization=`Bearer ${t}`;const r=await fetch(url,{...opts,headers});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}

  function inject(){
    const dash=document.querySelector('[data-nav="dashboard"]');
    if(dash&&!$('adminNav'))dash.insertAdjacentHTML('afterend','<button id="adminNav" class="nav-btn hidden" data-admin-nav><span>⚙</span> Admin</button>');
    const email=$('userEmail');
    if(email&&!$('adminRole'))email.insertAdjacentHTML('beforebegin','<div id="adminRole" class="user-role hidden"></div>');
    const main=document.querySelector('.main');
    if(main&&!$('adminView')){
      const editor=$('editorView');
      const html=`<section id="adminView" class="content hidden">
        <div class="admin-hero glass"><div><p class="eyebrow">CONTROL CENTER</p><h3>User management</h3><p>Manage accounts, access, roles and usage from one place.</p></div><button id="createUserBtn" class="primary">+ Create user</button></div>
        <div class="stats-grid"><div class="stat glass"><span>Total users</span><strong id="adminStatUsers">0</strong></div><div class="stat glass"><span>Active users</span><strong id="adminStatActive">0</strong></div><div class="stat glass"><span>Total playlists</span><strong id="adminStatPlaylists">0</strong></div><div class="stat glass"><span>Total channels</span><strong id="adminStatChannels">0</strong></div></div>
        <div class="panel glass"><div class="panel-head admin-panel-head"><div><p class="eyebrow">ACCOUNTS</p><h3>Users</h3></div><input id="adminSearch" class="admin-search" placeholder="Search email…"></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Role</th><th>Playlists</th><th>Channels</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody id="adminUserRows"></tbody></table></div><div id="adminEmpty" class="empty hidden">No users found.</div></div>
      </section>`;
      (editor||main.lastElementChild)?.insertAdjacentHTML(editor?'beforebegin':'beforeend',html);
    }
    if(!$('createUserDialog'))document.body.insertAdjacentHTML('beforeend',`<dialog id="createUserDialog" class="modal glass small"><form method="dialog" id="createUserForm"><div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>Create user</h3></div><button value="cancel" class="icon-btn">×</button></div><label>Email<input id="newUserEmail" type="email" required placeholder="user@example.com"></label><label>Password<input id="newUserPassword" type="password" minlength="8" required placeholder="Minimum 8 characters"></label><label>Role<select id="newUserRole"><option value="user">User</option><option value="admin">Admin</option></select></label><div id="createUserError" class="error-text"></div><div class="modal-actions"><button value="cancel" class="ghost">Cancel</button><button type="submit" class="primary">Create user</button></div></form></dialog>
    <dialog id="resetPasswordDialog" class="modal glass small"><form method="dialog" id="resetPasswordForm"><div class="modal-head"><div><p class="eyebrow">ADMIN</p><h3>Reset password</h3></div><button value="cancel" class="icon-btn">×</button></div><p id="resetPasswordUser" class="muted"></p><label>New password<input id="resetPasswordValue" type="password" minlength="8" required placeholder="Minimum 8 characters"></label><div id="resetPasswordError" class="error-text"></div><div class="modal-actions"><button value="cancel" class="ghost">Cancel</button><button type="submit" class="primary">Update password</button></div></form></dialog>`);
    injectM3uFile();
    bind();
  }

  function injectM3uFile(){
    const text=$('importText');if(!text||$('importFile'))return;
    const label=text.closest('label');if(!label)return;
    label.insertAdjacentHTML('beforebegin','<label>Upload M3U file <small>use this if provider blocks cloud import</small><input id="importFile" type="file" accept=".m3u,.m3u8,text/plain,application/x-mpegURL"></label>');
    $('importFile').addEventListener('change',async()=>{const f=$('importFile').files?.[0];if(!f)return;const err=$('importError');if(f.size>25*1024*1024){err.textContent='File is larger than 25 MB.';return}try{text.value=await f.text();err.textContent=`Loaded ${f.name} from this device.`}catch{err.textContent='Could not read this file.'}});
  }

  function bind(){
    $('adminNav')?.addEventListener('click',showAdmin);
    $('createUserBtn')?.addEventListener('click',()=>{ $('createUserForm').reset();$('createUserError').textContent='';$('createUserDialog').showModal() });
    $('adminSearch')?.addEventListener('input',renderUsers);
    $('createUserForm')?.addEventListener('submit',createUser);
    $('resetPasswordForm')?.addEventListener('submit',resetPassword);
    document.addEventListener('click',e=>{if(e.target.closest('[data-nav="dashboard"],[data-playlist]'))hideAdmin()},{capture:true});
  }

  function hideAdmin(){$('adminView')?.classList.add('hidden');$('adminNav')?.classList.remove('active')}
  async function showAdmin(){if(ctx.me?.role!=='admin')return;$('dashboardView')?.classList.add('hidden');$('editorView')?.classList.add('hidden');$('addChannelTop')?.classList.add('hidden');$('adminView')?.classList.remove('hidden');document.querySelectorAll('.nav-btn').forEach(x=>x.classList.remove('active'));$('adminNav')?.classList.add('active');if($('pageTitle'))$('pageTitle').textContent='Admin';if($('pageEyebrow'))$('pageEyebrow').textContent='USER MANAGEMENT';await loadAdmin()}
  async function sync(){const t=token();if(!t){ctx.me=null;ctx.lastToken='';$('adminNav')?.classList.add('hidden');$('adminRole')?.classList.add('hidden');hideAdmin();return}if(t===ctx.lastToken&&ctx.me)return;ctx.lastToken=t;try{ctx.me=await api('/api/me');const admin=ctx.me.role==='admin';$('adminNav')?.classList.toggle('hidden',!admin);$('adminRole').textContent=(ctx.me.role||'user').toUpperCase();$('adminRole').classList.remove('hidden');if(!admin)hideAdmin()}catch{ctx.me=null}}
  async function loadAdmin(){try{const [users,stats]=await Promise.all([api('/api/admin/users'),api('/api/admin/stats')]);ctx.users=users;ctx.stats=stats;$('adminStatUsers').textContent=stats.users;$('adminStatActive').textContent=stats.active_users;$('adminStatPlaylists').textContent=stats.playlists;$('adminStatChannels').textContent=stats.channels;renderUsers()}catch(e){toast(e.message)}}
  function renderUsers(){const q=($('adminSearch')?.value||'').trim().toLowerCase();const list=ctx.users.filter(u=>!q||u.email.toLowerCase().includes(q)||u.role.includes(q));$('adminEmpty')?.classList.toggle('hidden',list.length>0);$('adminUserRows').innerHTML=list.map(u=>{const self=String(u.id)===String(ctx.me?.id),d=u.created_at?new Date(u.created_at).toLocaleDateString():'—';return `<tr><td><div class="admin-user"><span class="avatar">${esc((u.email||'?')[0].toUpperCase())}</span><div><b>${esc(u.email)}</b><small>#${u.id}${self?' · You':''}</small></div></div></td><td><span class="role-chip ${u.role==='admin'?'admin':''}">${esc(u.role)}</span></td><td>${u.playlist_count}</td><td>${u.channel_count}</td><td>${esc(d)}</td><td><span class="status ${u.disabled?'':'on'}">${u.disabled?'Suspended':'Active'}</span></td><td><div class="row-actions admin-actions"><button class="tiny" data-role="${u.id}" ${self?'disabled':''}>${u.role==='admin'?'Make user':'Make admin'}</button><button class="tiny" data-status="${u.id}" ${self?'disabled':''}>${u.disabled?'Activate':'Suspend'}</button><button class="tiny" data-reset="${u.id}">Password</button><button class="tiny danger-text" data-delete="${u.id}" ${self?'disabled':''}>Delete</button></div></td></tr>`}).join('');
    $('adminUserRows').querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>toggleRole(b.dataset.role));$('adminUserRows').querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>toggleStatus(b.dataset.status));$('adminUserRows').querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>openReset(b.dataset.reset));$('adminUserRows').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteUser(b.dataset.delete));
  }
  async function createUser(e){e.preventDefault();$('createUserError').textContent='';try{await api('/api/admin/users',{method:'POST',body:JSON.stringify({email:$('newUserEmail').value.trim(),password:$('newUserPassword').value,role:$('newUserRole').value})});$('createUserDialog').close();await loadAdmin();toast('User created')}catch(err){$('createUserError').textContent=err.message}}
  async function toggleRole(id){const u=ctx.users.find(x=>String(x.id)===String(id));if(!u)return;try{await api(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify({role:u.role==='admin'?'user':'admin'})});await loadAdmin();toast('Role updated')}catch(e){toast(e.message)}}
  async function toggleStatus(id){const u=ctx.users.find(x=>String(x.id)===String(id));if(!u)return;try{await api(`/api/admin/users/${id}`,{method:'PATCH',body:JSON.stringify({disabled:!u.disabled})});await loadAdmin();toast(u.disabled?'User activated':'User suspended')}catch(e){toast(e.message)}}
  function openReset(id){const u=ctx.users.find(x=>String(x.id)===String(id));if(!u)return;ctx.resetUser=u;$('resetPasswordUser').textContent=u.email;$('resetPasswordValue').value='';$('resetPasswordError').textContent='';$('resetPasswordDialog').showModal()}
  async function resetPassword(e){e.preventDefault();if(!ctx.resetUser)return;try{await api(`/api/admin/users/${ctx.resetUser.id}/reset-password`,{method:'POST',body:JSON.stringify({password:$('resetPasswordValue').value})});$('resetPasswordDialog').close();toast('Password updated')}catch(err){$('resetPasswordError').textContent=err.message}}
  async function deleteUser(id){const u=ctx.users.find(x=>String(x.id)===String(id));if(!u||!confirm(`Delete ${u.email}, all playlists and all channels?`))return;try{await api(`/api/admin/users/${id}`,{method:'DELETE'});await loadAdmin();toast('User deleted')}catch(e){toast(e.message)}}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
  setInterval(sync,1200);setTimeout(sync,100);
})();