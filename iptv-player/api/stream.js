const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');

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
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Private or local network streams are not allowed.');
  }
  return url;
}

function cleanHeaderValue(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]/g, '').trim().slice(0, max);
}

async function requestValidated(startUrl, options, redirectCount = 0) {
  const current = await assertPublicUrl(startUrl);
  const transport = current.protocol === 'https:' ? https : http;

  return await new Promise((resolve, reject) => {
    const upstreamReq = transport.request(current, {
      method: options.method,
      headers: options.headers,
      signal: options.signal
    }, async (response) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        if (redirectCount >= MAX_REDIRECTS) return reject(new Error('Too many redirects.'));
        try {
          const next = new URL(location, current).href;
          return resolve(await requestValidated(next, options, redirectCount + 1));
        } catch (error) {
          return reject(error);
        }
      }
      resolve({ response, finalUrl: current });
    });

    upstreamReq.setTimeout(CONNECT_TIMEOUT_MS, () => {
      const error = new Error('Stream connection timed out');
      error.code = 'ETIMEDOUT';
      upstreamReq.destroy(error);
    });
    upstreamReq.once('error', reject);
    upstreamReq.end();
  });
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

async function readLimited(stream, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) {
      stream.destroy();
      throw new Error('Manifest too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = async function streamHandler(req, res) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Method not allowed');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
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
    'User-Agent': requestedUa || 'VLC/3.0.21 LibVLC/3.0.21',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive'
  };
  if (referrer) headers.Referer = referrer;
  if (req.headers.range) headers.Range = cleanHeaderValue(req.headers.range, 120);

  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.once('aborted', onClose);

  try {
    const { response: upstream, finalUrl } = await requestValidated(input, {
      method: req.method,
      headers,
      signal: controller.signal
    });

    const status = Number(upstream.statusCode || 502);
    const contentType = String(upstream.headers['content-type'] || '');
    const contentRange = upstream.headers['content-range'];
    const acceptRanges = upstream.headers['accept-ranges'];
    const contentLength = upstream.headers['content-length'];

    console.log(`[stream] host=${finalUrl.hostname} status=${status} type=${contentType || 'unknown'}`);

    res.statusCode = status;
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    const looksLikeManifest = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(?:$|\?)/i.test(finalUrl.href);
    const looksLikeTs = /mp2t|mpeg-?ts/i.test(contentType) || /\.ts(?:$|\?)/i.test(finalUrl.href) || /\/live\/[^/]+\/[^/]+\/\d+\/?$/i.test(finalUrl.pathname);

    if (looksLikeManifest) {
      const text = await readLimited(upstream, MAX_MANIFEST_BYTES);
      const rewritten = rewriteManifest(text, finalUrl.href, requestedUa, referrer);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(rewritten);
    }

    res.setHeader('Content-Type', contentType || (looksLikeTs ? 'video/mp2t' : 'application/octet-stream'));
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'HEAD') {
      if (contentLength) res.setHeader('Content-Length', contentLength);
      upstream.resume();
      return res.end();
    }

    // For ranged/static responses preserve the known length. For indefinite live streams,
    // omit Content-Length so Node/Render can stream chunks immediately.
    if ((status === 206 || req.headers.range) && contentLength) res.setHeader('Content-Length', contentLength);

    upstream.once('error', () => {
      if (!res.destroyed) res.destroy();
    });
    res.once('close', () => {
      if (!upstream.destroyed) upstream.destroy();
    });
    return upstream.pipe(res);
  } catch (error) {
    if (res.headersSent) {
      if (!res.destroyed) res.destroy();
      return;
    }
    const timedOut = error?.code === 'ETIMEDOUT' || error?.name === 'AbortError';
    console.error(`[stream-error] ${timedOut ? 'timeout' : (error?.code || error?.name || 'error')}: ${error?.message || 'unknown'}`);
    res.statusCode = timedOut ? 504 : 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(timedOut ? 'Stream request timed out' : (error?.message || 'Stream proxy failed'));
  } finally {
    req.off('aborted', onClose);
  }
};

module.exports.rewriteManifest = rewriteManifest;
