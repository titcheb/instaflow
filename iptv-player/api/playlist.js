const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const MAX_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 15000;

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
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized === '::';
}

async function assertPublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid playlist URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP/HTTPS playlist URLs are supported.');
  if (url.username || url.password) throw new Error('Credentials inside the URL are not supported.');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) throw new Error('Local network URLs are not allowed.');

  let addresses;
  try { addresses = await dns.lookup(url.hostname, { all: true, verbatim: true }); }
  catch { throw new Error('Playlist host could not be resolved.'); }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new Error('Private or local network playlist hosts are not allowed.');
  return url;
}

function parseAttrs(line) {
  const attrs = {};
  const pattern = /([\w-]+)=("[^"]*"|'[^']*'|[^\s,]*)/g;
  let match;
  while ((match = pattern.exec(line))) {
    const key = match[1].toLowerCase();
    let val = match[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    attrs[key] = val.trim();
  }
  return attrs;
}

function makeId(name, group, url) {
  return crypto.createHash('sha1').update(`${name}|${group}|${url}`).digest('hex').slice(0, 16);
}

function setHeaderHint(target, key, value) {
  if (!value) return;
  const normalized = String(key || '').toLowerCase().replace(/_/g, '-');
  const clean = String(value).replace(/[\r\n]/g, '').trim();
  if (!clean) return;
  if (['user-agent', 'http-user-agent', 'useragent'].includes(normalized)) target.userAgent = clean.slice(0, 350);
  if (['referer', 'referrer', 'http-referrer', 'http-referer'].includes(normalized)) target.referrer = clean.slice(0, 1200);
}

function parsePipeOptions(raw) {
  const out = {};
  for (const part of raw.split('&')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = decodeURIComponent(part.slice(0, idx).trim());
    let value = part.slice(idx + 1).trim();
    try { value = decodeURIComponent(value); } catch {}
    setHeaderHint(out, key, value);
  }
  return out;
}

function splitStreamLine(line) {
  const pipeIndex = line.indexOf('|');
  if (pipeIndex <= 0) return { urlPart: line, hints: {} };
  const optionPart = line.slice(pipeIndex + 1);
  if (!/(?:^|&)(?:user-agent|useragent|referer|referrer)=/i.test(optionPart)) return { urlPart: line, hints: {} };
  return { urlPart: line.slice(0, pipeIndex), hints: parsePipeOptions(optionPart) };
}

function buildStreamProxyPath(streamUrl, headers = {}) {
  const params = new URLSearchParams({ url: streamUrl });
  if (headers.userAgent) params.set('ua', headers.userAgent);
  if (headers.referrer) params.set('ref', headers.referrer);
  return `/api/stream?${params.toString()}`;
}

function parseM3u(text, baseUrl) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim());
  if (!lines.some(line => line.startsWith('#EXTM3U')) && !lines.some(line => line.startsWith('#EXTINF'))) {
    throw new Error('The response does not look like an M3U playlist.');
  }

  const channels = [];
  let pending = null;

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const attrs = parseAttrs(line);
      const comma = line.lastIndexOf(',');
      const fallbackName = comma >= 0 ? line.slice(comma + 1).trim() : '';
      pending = {
        name: attrs['tvg-name'] || fallbackName || 'Unnamed channel',
        logo: attrs['tvg-logo'] || '',
        group: attrs['group-title'] || 'Other',
        tvgId: attrs['tvg-id'] || '',
        headers: {}
      };
      continue;
    }
    if (line.startsWith('#EXTGRP:') && pending) {
      pending.group = line.slice(8).trim() || pending.group;
      continue;
    }
    if (line.startsWith('#EXTVLCOPT:') && pending) {
      const option = line.slice(11);
      const idx = option.indexOf('=');
      if (idx > 0) setHeaderHint(pending.headers, option.slice(0, idx), option.slice(idx + 1));
      continue;
    }
    if (line.startsWith('#EXTHTTP:') && pending) {
      try {
        const obj = JSON.parse(line.slice(9));
        for (const [key, value] of Object.entries(obj || {})) setHeaderHint(pending.headers, key, value);
      } catch {}
      continue;
    }
    if (line.startsWith('#')) continue;

    if (pending) {
      const { urlPart, hints } = splitStreamLine(line);
      Object.assign(pending.headers, hints);
      let streamUrl;
      try { streamUrl = new URL(urlPart, baseUrl).href; } catch { pending = null; continue; }
      if (!/^https?:/i.test(streamUrl)) { pending = null; continue; }
      let type = /\.m3u8(?:$|\?)/i.test(streamUrl) ? 'hls' : (/\.ts(?:$|\?)/i.test(streamUrl) ? 'mpegts' : 'stream');
      if (type === 'stream') {
        try {
          const path = new URL(streamUrl).pathname;
          if (/\/live\/[^/]+\/[^/]+\/\d+\/?$/i.test(path)) type = 'mpegts';
        } catch {}
      }
      const headers = {};
      if (pending.headers.userAgent) headers.userAgent = pending.headers.userAgent;
      if (pending.headers.referrer) headers.referrer = pending.headers.referrer;
      channels.push({
        id: makeId(pending.name, pending.group, streamUrl),
        name: pending.name.slice(0, 180),
        logo: pending.logo.slice(0, 1200),
        group: (pending.group || 'Other').slice(0, 120),
        tvgId: pending.tvgId.slice(0, 160),
        url: buildStreamProxyPath(streamUrl, headers),
        type
      });
      pending = null;
    }
  }

  const unique = [];
  const seen = new Set();
  for (const ch of channels) {
    const key = `${ch.name}\n${ch.url}`;
    if (!seen.has(key)) { seen.add(key); unique.push(ch); }
  }
  return unique.slice(0, 25000);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const input = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!input) return res.status(400).json({ error: 'Missing playlist URL.' });

  try {
    const url = await assertPublicUrl(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const upstream = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Safari/537.36 NEXA-IPTV/1.1',
        'Accept': 'application/x-mpegURL, application/vnd.apple.mpegurl, text/plain, */*'
      }
    }).finally(() => clearTimeout(timer));

    if (!upstream.ok) return res.status(502).json({ error: `Playlist server returned HTTP ${upstream.status}.` });
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return res.status(413).json({ error: 'Playlist is too large.' });

    const text = await upstream.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return res.status(413).json({ error: 'Playlist is too large.' });

    const channels = parseM3u(text, upstream.url || url.href);
    if (!channels.length) return res.status(422).json({ error: 'No valid HTTP/HTTPS channels were found.' });
    const categories = [...new Set(channels.map(ch => ch.group || 'Other'))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).json({ channels, categories, count: channels.length });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Playlist request timed out.' : (error?.message || 'Could not load playlist.');
    return res.status(400).json({ error: message });
  }
};

module.exports.parseM3u = parseM3u;
module.exports.assertPublicUrl = assertPublicUrl;
