const http = require('http');
const fs = require('fs');
const path = require('path');
const playlistHandler = require('./api/playlist.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const base = `http://${req.headers.host || 'localhost'}`;
  let url;
  try { url = new URL(req.url, base); } catch { res.writeHead(400); return res.end('Bad request'); }

  if (url.pathname === '/api/playlist') {
    req.query = Object.fromEntries(url.searchParams.entries());
    res.status = function (code) { res.statusCode = code; return res; };
    res.json = function (payload) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      return res;
    };
    try { return await playlistHandler(req, res); }
    catch (error) {
      console.error('playlist handler error', error);
      if (!res.headersSent) res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'Internal server error.' }));
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }

  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const normalized = path.normalize(requestPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT, normalized);
  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}tests${path.sep}`) || filePath.includes(`${path.sep}api${path.sep}`)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  return sendFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NEXA IPTV listening on port ${PORT}`);
});
