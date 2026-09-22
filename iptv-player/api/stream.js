const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 4;

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  const value = ip.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
}

async function assertPublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid stream URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP/HTTPS streams are supported.');
  if (url.username || url.password) throw new Error('Credentials inside the stream URL are not supported.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === 'localhost.localdomain') throw new Error('Local network streams are not allowed.');

  let addresses;
  try { addresses = await dns.lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw new Error('Stream host could not be resolved.'); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error('Private or local network streams are not allowed.');
  return url;
}

function cleanHeaderValue(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]/g, '').trim().slice(0, max);
}

async function fetchValidated(startUrl, options) {
  let current = await assertPublicUrl(startUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(current, { ...options, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current };
    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: current };
    current = await assertPublicUrl(new URL(location, current).href);
  }
  throw new Error('Too many redirects.');
}

function proxyUrl(target, userAgent, referrer) {
  const params = new URLSearchParams({ url: target });
  if (userAgent) params.set('ua', userAgent);
  if (referrer) params.set('ref', referrer);
  return `/api/stream?${params.toString()}`;
}

function rewriteManifest(text, baseUrl, userAgent, referrer) {
  return text.split(/\r?\n/).map((line) => {
    if (!line) return line;
    if (line.startsWith('#')) {
      return line.replace(/URI=("|')([^"']+)(\1)/g, (_match, q, uri) => {
        try {
          const absolute = new URL(uri, baseUrl).href;
          return `URI=${q}${proxyUrl(absolute, userAgent, referrer)}${q}`;
        } catch { return _match; }
      });
    }
    try {
      const absolute = new URL(line.trim(), baseUrl).href;
      return proxyUrl(absolute, userAgent, referrer);
    } catch { return line; }
  }).join('\n');
}

module.exports = async function streamHandler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Method not allowed');
  }

  const input = typeof req.query?.url === 'string' ? req.query.url.trim() : '';
  if (!input) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Missing stream URL');
  }

  const requestedUa = cleanHeaderValue(req.query.ua, 350);
  const requestedRef = cleanHeaderValue(req.query.ref, 1200);
  let referrer = '';
  if (requestedRef) {
    try {
      const parsed = new URL(requestedRef);
      if (['http:', 'https:'].includes(parsed.protocol)) referrer = parsed.href;
    } catch {}
  }

  const headers = {
    'User-Agent': requestedUa || cleanHeaderValue(req.headers['user-agent'], 350) || 'Mozilla/5.0',
    'Accept': '*/*',
    'Accept-Encoding': 'identity'
  };
  if (referrer) headers.Referer = referrer;
  if (req.headers.range) headers.Range = cleanHeaderValue(req.headers.range, 120);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  const onClose = () => controller.abort();
  req.once('aborted', onClose);

  try {
    const { response: upstream, finalUrl } = await fetchValidated(input, {
      method: req.method,
      headers,
      signal: controller.signal
    });
    clearTimeout(timer);

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const looksLikeManifest = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(finalUrl.href);
    if (req.method === 'HEAD') return res.end();

    if (looksLikeManifest) {
      const text = await upstream.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_MANIFEST_BYTES) {
        res.statusCode = 413;
        return res.end('Manifest too large');
      }
      const rewritten = rewriteManifest(text, finalUrl.href, requestedUa, referrer);
      res.statusCode = upstream.ok ? 200 : upstream.status;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.removeHeader('Content-Length');
      return res.end(rewritten);
    }

    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'private, max-age=20');

    if (!upstream.body) return res.end();
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on('error', () => { if (!res.destroyed) res.destroy(); });
    nodeStream.pipe(res);
  } catch (error) {
    clearTimeout(timer);
    if (res.headersSent) {
      if (!res.destroyed) res.destroy();
      return;
    }
    res.statusCode = error?.name === 'AbortError' ? 504 : 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(error?.name === 'AbortError' ? 'Stream request timed out' : (error?.message || 'Stream proxy failed'));
  } finally {
    req.off('aborted', onClose);
  }
};

module.exports.rewriteManifest = rewriteManifest;
