import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: '5m' }));

function tokenFor(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '14d' });
}
function auth(req, res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
}
function clean(s, max = 5000) { return String(s ?? '').trim().slice(0, max); }
function randomToken() { return crypto.randomBytes(18).toString('hex'); }
function escAttr(v='') { return String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,' '); }
function validHttpUrl(value) {
  try { const u = new URL(value); return ['http:','https:'].includes(u.protocol); } catch { return false; }
}
function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0]===10 || p[0]===127 || p[0]===0 || (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) || (p[0]===192&&p[1]===168) || (p[0]===100&&p[1]>=64&&p[1]<=127) || p[0]>=224;
  }
  const x = ip.toLowerCase();
  return x==='::1' || x==='::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80:');
}
async function assertSafeRemote(url) {
  const u = new URL(url);
  if (!['http:','https:'].includes(u.protocol)) throw new Error('Only HTTP/HTTPS URLs are supported');
  const host = u.hostname.toLowerCase();
  if (host==='localhost' || host.endsWith('.local')) throw new Error('Local URLs are not allowed');
  const answers = await dns.lookup(host, { all: true });
  if (!answers.length || answers.some(a => isPrivateIp(a.address))) throw new Error('Private/local hosts are not allowed');
}
async function fetchText(url) {
  await assertSafeRemote(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'NEXA-IPTV-Editor/1.0', 'Accept': 'application/x-mpegURL,text/plain,*/*' } });
    if (!r.ok) throw new Error(`Source returned HTTP ${r.status}`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > 25 * 1024 * 1024) throw new Error('Playlist is larger than 25 MB');
    const text = await r.text();
    if (text.length > 25 * 1024 * 1024) throw new Error('Playlist is larger than 25 MB');
    return text;
  } finally { clearTimeout(timer); }
}
function parseAttrs(line) {
  const out = {};
  const re = /([\w-]+)="([^"]*)"/g; let m;
  while ((m = re.exec(line))) out[m[1].toLowerCase()] = m[2];
  return out;
}
function parseM3u(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const channels = [];
  let meta = null, userAgent = '', referrer = '';
  for (let i=0;i<lines.length;i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = parseAttrs(line);
      const comma = line.indexOf(',');
      meta = { attrs, name: comma >= 0 ? line.slice(comma+1).trim() : attrs['tvg-name'] || 'Unnamed channel' };
      userAgent=''; referrer='';
    } else if (/^#EXTVLCOPT:http-user-agent=/i.test(line)) userAgent = line.split('=').slice(1).join('=').trim();
    else if (/^#EXTVLCOPT:http-referrer=/i.test(line) || /^#EXTVLCOPT:http-referer=/i.test(line)) referrer = line.split('=').slice(1).join('=').trim();
    else if (meta && !line.startsWith('#')) {
      const a = meta.attrs;
      channels.push({
        name: clean(meta.name, 500), url: clean(line, 5000), group_title: clean(a['group-title'] || 'Other', 500),
        tvg_id: clean(a['tvg-id'], 500), tvg_name: clean(a['tvg-name'], 500), logo: clean(a['tvg-logo'], 5000),
        user_agent: clean(userAgent, 1000), referrer: clean(referrer, 5000), enabled: true
      });
      meta = null;
    }
  }
  return channels.filter(c => validHttpUrl(c.url));
}
function m3uFor(playlist, channels) {
  let out = '#EXTM3U';
  if (playlist.epg_url) out += ` x-tvg-url="${escAttr(playlist.epg_url)}"`;
  out += '\n';
  for (const c of channels) {
    const attrs = [
      c.tvg_id ? `tvg-id="${escAttr(c.tvg_id)}"` : '',
      c.tvg_name ? `tvg-name="${escAttr(c.tvg_name)}"` : '',
      c.logo ? `tvg-logo="${escAttr(c.logo)}"` : '',
      c.group_title ? `group-title="${escAttr(c.group_title)}"` : ''
    ].filter(Boolean).join(' ');
    out += `#EXTINF:-1 ${attrs},${String(c.name||'Unnamed').replace(/[\r\n]/g,' ')}\n`;
    if (c.user_agent) out += `#EXTVLCOPT:http-user-agent=${c.user_agent.replace(/[\r\n]/g,' ')}\n`;
    if (c.referrer) out += `#EXTVLCOPT:http-referrer=${c.referrer.replace(/[\r\n]/g,' ')}\n`;
    out += `${c.url}\n`;
  }
  return out;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, source_url TEXT DEFAULT '', epg_url TEXT DEFAULT '', public_token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS channels (
      id BIGSERIAL PRIMARY KEY, playlist_id BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      name TEXT NOT NULL, url TEXT NOT NULL, group_title TEXT DEFAULT 'Other', tvg_id TEXT DEFAULT '', tvg_name TEXT DEFAULT '', logo TEXT DEFAULT '',
      user_agent TEXT DEFAULT '', referrer TEXT DEFAULT '', enabled BOOLEAN DEFAULT TRUE, sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_channels_playlist ON channels(playlist_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id);
  `);
}

app.post('/api/auth/register', async (req,res) => {
  const email = clean(req.body.email, 320).toLowerCase(); const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Use a valid email and at least 8 characters for the password.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const q = await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email', [email,hash]);
    res.json({ token: tokenFor(q.rows[0]), user: q.rows[0] });
  } catch (e) { if (e.code==='23505') res.status(409).json({ error:'An account with this email already exists.' }); else throw e; }
});
app.post('/api/auth/login', async (req,res) => {
  const email = clean(req.body.email,320).toLowerCase(); const password = String(req.body.password || '');
  const q = await pool.query('SELECT id,email,password_hash FROM users WHERE email=$1',[email]);
  if (!q.rowCount || !await bcrypt.compare(password,q.rows[0].password_hash)) return res.status(401).json({ error:'Wrong email or password.' });
  res.json({ token: tokenFor(q.rows[0]), user:{ id:q.rows[0].id,email:q.rows[0].email } });
});
app.get('/api/me', auth, async (req,res) => {
  const q = await pool.query('SELECT id,email,created_at FROM users WHERE id=$1',[req.user.uid]);
  if (!q.rowCount) return res.status(401).json({error:'Account not found'});
  res.json(q.rows[0]);
});

app.get('/api/playlists', auth, async (req,res) => {
  const q = await pool.query(`SELECT p.*, COUNT(c.id)::int AS channel_count, COUNT(c.id) FILTER (WHERE c.enabled)::int AS enabled_count,
    COUNT(DISTINCT c.group_title)::int AS group_count FROM playlists p LEFT JOIN channels c ON c.playlist_id=p.id
    WHERE p.user_id=$1 GROUP BY p.id ORDER BY p.updated_at DESC`, [req.user.uid]);
  res.json(q.rows);
});
app.post('/api/playlists', auth, async (req,res) => {
  const name=clean(req.body.name,200) || 'My playlist'; const source=clean(req.body.sourceUrl,5000); const epg=clean(req.body.epgUrl,5000);
  let text=String(req.body.m3uText || '');
  if (!text && source) text=await fetchText(source);
  if (!text) return res.status(400).json({error:'Paste M3U content or provide a source URL.'});
  const channels=parseM3u(text); if (!channels.length) return res.status(400).json({error:'No HTTP/HTTPS channels were found in this playlist.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const p=await client.query('INSERT INTO playlists(user_id,name,source_url,epg_url,public_token) VALUES($1,$2,$3,$4,$5) RETURNING *',[req.user.uid,name,source,epg,randomToken()]);
    let order=0;
    for (const c of channels) await client.query(`INSERT INTO channels(playlist_id,name,url,group_title,tvg_id,tvg_name,logo,user_agent,referrer,enabled,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[p.rows[0].id,c.name,c.url,c.group_title,c.tvg_id,c.tvg_name,c.logo,c.user_agent,c.referrer,true,order++]);
    await client.query('COMMIT'); res.json({...p.rows[0],channel_count:channels.length});
  } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
app.get('/api/playlists/:id', auth, async (req,res) => {
  const p=await pool.query('SELECT * FROM playlists WHERE id=$1 AND user_id=$2',[req.params.id,req.user.uid]);
  if (!p.rowCount) return res.status(404).json({error:'Playlist not found'});
  const c=await pool.query('SELECT * FROM channels WHERE playlist_id=$1 ORDER BY sort_order,id',[req.params.id]);
  res.json({playlist:p.rows[0],channels:c.rows});
});
app.patch('/api/playlists/:id', auth, async (req,res) => {
  const name=clean(req.body.name,200), epg=clean(req.body.epgUrl,5000), source=clean(req.body.sourceUrl,5000);
  const q=await pool.query(`UPDATE playlists SET name=COALESCE(NULLIF($1,''),name), epg_url=$2, source_url=$3, updated_at=NOW()
    WHERE id=$4 AND user_id=$5 RETURNING *`,[name,epg,source,req.params.id,req.user.uid]);
  if(!q.rowCount) return res.status(404).json({error:'Playlist not found'}); res.json(q.rows[0]);
});
app.delete('/api/playlists/:id', auth, async (req,res) => {
  const q=await pool.query('DELETE FROM playlists WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.id,req.user.uid]);
  if(!q.rowCount) return res.status(404).json({error:'Playlist not found'}); res.json({ok:true});
});
app.post('/api/playlists/:id/refresh', auth, async (req,res) => {
  const p=await pool.query('SELECT * FROM playlists WHERE id=$1 AND user_id=$2',[req.params.id,req.user.uid]);
  if(!p.rowCount) return res.status(404).json({error:'Playlist not found'});
  if(!p.rows[0].source_url) return res.status(400).json({error:'This playlist has no source URL.'});
  const fresh=parseM3u(await fetchText(p.rows[0].source_url));
  const old=await pool.query('SELECT * FROM channels WHERE playlist_id=$1',[req.params.id]);
  const map=new Map(old.rows.map(c=>[c.url,c]));
  const client=await pool.connect();
  try{
    await client.query('BEGIN'); await client.query('DELETE FROM channels WHERE playlist_id=$1',[req.params.id]);
    let order=0;
    for(const c of fresh){ const o=map.get(c.url); await client.query(`INSERT INTO channels(playlist_id,name,url,group_title,tvg_id,tvg_name,logo,user_agent,referrer,enabled,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[req.params.id,o?.name||c.name,c.url,o?.group_title||c.group_title,o?.tvg_id||c.tvg_id,o?.tvg_name||c.tvg_name,o?.logo||c.logo,o?.user_agent||c.user_agent,o?.referrer||c.referrer,o?.enabled??true,order++]); }
    await client.query('UPDATE playlists SET updated_at=NOW() WHERE id=$1',[req.params.id]); await client.query('COMMIT'); res.json({ok:true,count:fresh.length});
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});

app.post('/api/playlists/:id/channels', auth, async (req,res) => {
  const own=await pool.query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[req.params.id,req.user.uid]); if(!own.rowCount)return res.status(404).json({error:'Playlist not found'});
  const max=await pool.query('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM channels WHERE playlist_id=$1',[req.params.id]);
  const q=await pool.query(`INSERT INTO channels(playlist_id,name,url,group_title,tvg_id,tvg_name,logo,user_agent,referrer,enabled,sort_order)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[req.params.id,clean(req.body.name,500)||'Unnamed channel',clean(req.body.url,5000),clean(req.body.groupTitle,500)||'Other',clean(req.body.tvgId,500),clean(req.body.tvgName,500),clean(req.body.logo,5000),clean(req.body.userAgent,1000),clean(req.body.referrer,5000),req.body.enabled!==false,max.rows[0].n]);
  res.json(q.rows[0]);
});
app.patch('/api/channels/:id', auth, async (req,res) => {
  const q=await pool.query(`UPDATE channels c SET name=$1,url=$2,group_title=$3,tvg_id=$4,tvg_name=$5,logo=$6,user_agent=$7,referrer=$8,enabled=$9,updated_at=NOW()
    FROM playlists p WHERE c.playlist_id=p.id AND c.id=$10 AND p.user_id=$11 RETURNING c.*`,[clean(req.body.name,500),clean(req.body.url,5000),clean(req.body.groupTitle,500)||'Other',clean(req.body.tvgId,500),clean(req.body.tvgName,500),clean(req.body.logo,5000),clean(req.body.userAgent,1000),clean(req.body.referrer,5000),req.body.enabled!==false,req.params.id,req.user.uid]);
  if(!q.rowCount)return res.status(404).json({error:'Channel not found'}); res.json(q.rows[0]);
});
app.post('/api/channels/bulk', auth, async (req,res) => {
  const ids=(Array.isArray(req.body.ids)?req.body.ids:[]).map(Number).filter(Number.isFinite); if(!ids.length)return res.json({ok:true,count:0});
  const action=req.body.action;
  if(action==='delete') { const q=await pool.query(`DELETE FROM channels c USING playlists p WHERE c.playlist_id=p.id AND p.user_id=$1 AND c.id=ANY($2::bigint[]) RETURNING c.id`,[req.user.uid,ids]); return res.json({ok:true,count:q.rowCount}); }
  if(action==='enable'||action==='disable') { const q=await pool.query(`UPDATE channels c SET enabled=$1,updated_at=NOW() FROM playlists p WHERE c.playlist_id=p.id AND p.user_id=$2 AND c.id=ANY($3::bigint[]) RETURNING c.id`,[action==='enable',req.user.uid,ids]); return res.json({ok:true,count:q.rowCount}); }
  return res.status(400).json({error:'Unknown bulk action'});
});
app.post('/api/playlists/:id/reorder', auth, async (req,res) => {
  const own=await pool.query('SELECT id FROM playlists WHERE id=$1 AND user_id=$2',[req.params.id,req.user.uid]); if(!own.rowCount)return res.status(404).json({error:'Playlist not found'});
  const ids=(Array.isArray(req.body.ids)?req.body.ids:[]).map(Number); const client=await pool.connect();
  try{await client.query('BEGIN'); for(let i=0;i<ids.length;i++)await client.query('UPDATE channels SET sort_order=$1 WHERE id=$2 AND playlist_id=$3',[i,ids[i],req.params.id]); await client.query('COMMIT'); res.json({ok:true});}
  catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
});
app.post('/api/playlists/:id/groups/rename', auth, async (req,res) => {
  const from=clean(req.body.from,500), to=clean(req.body.to,500)||'Other';
  const q=await pool.query(`UPDATE channels c SET group_title=$1,updated_at=NOW() FROM playlists p WHERE c.playlist_id=p.id AND p.user_id=$2 AND p.id=$3 AND c.group_title=$4 RETURNING c.id`,[to,req.user.uid,req.params.id,from]);
  res.json({ok:true,count:q.rowCount});
});

app.get('/p/:token.m3u', async (req,res) => {
  const p=await pool.query('SELECT * FROM playlists WHERE public_token=$1',[req.params.token]); if(!p.rowCount)return res.status(404).send('Playlist not found');
  const c=await pool.query('SELECT * FROM channels WHERE playlist_id=$1 AND enabled=TRUE ORDER BY sort_order,id',[p.rows[0].id]);
  res.set({'Content-Type':'application/x-mpegURL; charset=utf-8','Content-Disposition':`inline; filename="${p.rows[0].name.replace(/[^a-z0-9_-]+/gi,'_')}.m3u"`,'Cache-Control':'no-store'}).send(m3uFor(p.rows[0],c.rows));
});
app.get('/p/:token.json', async (req,res) => {
  const p=await pool.query('SELECT id,name,epg_url FROM playlists WHERE public_token=$1',[req.params.token]); if(!p.rowCount)return res.status(404).json({error:'Playlist not found'});
  const c=await pool.query('SELECT name,url,group_title,tvg_id,tvg_name,logo,user_agent,referrer FROM channels WHERE playlist_id=$1 AND enabled=TRUE ORDER BY sort_order,id',[p.rows[0].id]);
  res.json({playlist:p.rows[0],channels:c.rows});
});

app.get('/health', (req,res)=>res.json({ok:true}));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({error: err.name==='AbortError' ? 'Source request timed out.' : (err.message || 'Server error')}); });

await initDb();
app.listen(PORT, ()=>console.log(`NEXA IPTV Editor listening on ${PORT}`));
