const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 10000);
const DIST = path.join(__dirname, 'dist');

function sendFile(res, file, type, downloadName) {
  const filePath = path.join(DIST, file);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('Artifact not found');
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/NEXA-IPTV.apk') {
    return sendFile(res, 'NEXA-IPTV.apk', 'application/vnd.android.package-archive', 'NEXA-IPTV.apk');
  }
  if (url.pathname === '/NEXA-IPTV-Android-Source.zip') {
    return sendFile(res, 'NEXA-IPTV-Android-Source.zip', 'application/zip', 'NEXA-IPTV-Android-Source.zip');
  }
  const apkExists = fs.existsSync(path.join(DIST, 'NEXA-IPTV.apk'));
  res.writeHead(apkExists ? 200 : 503, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEXA IPTV Android</title><style>body{margin:0;background:#050914;color:#f4f8ff;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.c{max-width:520px;margin:24px;padding:32px;border:1px solid #1e3648;border-radius:28px;background:#09101e;box-shadow:0 0 60px rgba(48,230,255,.08)}h1{letter-spacing:.16em;margin:0 0 8px}.cyan{color:#30e6ff}.muted{color:#8497ae;line-height:1.6}a{display:block;margin-top:18px;padding:16px;border:1px solid #30e6ff;border-radius:16px;color:white;text-decoration:none;text-align:center;background:#134252;font-weight:800}</style></head><body><div class="c"><h1>NEXA</h1><div class="cyan">IPTV PLAYER · ANDROID</div><p class="muted">Native Media3/ExoPlayer build. Stream playback happens directly from your Android device.</p>${apkExists ? '<a href="/NEXA-IPTV.apk">DOWNLOAD APK</a><a href="/NEXA-IPTV-Android-Source.zip">DOWNLOAD SOURCE</a>' : '<p>Build artifact is not ready.</p>'}</div></body></html>`);
}).listen(PORT, '0.0.0.0', () => console.log(`NEXA Android artifact server listening on ${PORT}`));
