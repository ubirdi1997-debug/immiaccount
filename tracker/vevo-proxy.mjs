import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readStore, defaultFile, checkPassword } from './store.mjs';

const upstream = 'https://online.immi.gov.au';
const helper = readFileSync(new URL('../userscripts/vevo-helper.user.js', import.meta.url), 'utf8');
const injected = `(() => {
const GM_getValue = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const GM_setValue = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const notice = document.createElement('div');
notice.textContent = 'Private VEVO proxy • Autofill profiles are stored in this browser. Official service: online.immi.gov.au';
notice.style.cssText = 'padding:12px;background:#fff4cc;color:#222;font:14px system-ui;border-bottom:2px solid #aa7900';
document.body.prepend(notice);
${helper}
})();`;

export function createVevoProxy({ origin, file = defaultFile, fetcher = fetch } = {}) {
  if (!origin || new URL(origin).origin !== origin) throw new Error('VEVO origin must be an exact origin.');
  const attempts = new Map();
  return createServer(async (req, res) => {
    const reply = (status, message, extra = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
      res.end(message);
    };
    try {
      const key = req.socket.remoteAddress;
      const now = Date.now();
      for (const [id, entry] of attempts) if (entry.until < now) attempts.delete(id);
      const entry = attempts.get(key) || { count: 0, until: now + 900000 };
      if (entry.count >= 20) return reply(429, 'Too many failed logins. Try again in 15 minutes.');
      const auth = /^Basic ([A-Za-z0-9+/=]+)$/.exec(req.headers.authorization || '');
      const decoded = auth ? Buffer.from(auth[1], 'base64').toString('utf8') : '';
      const separator = decoded.indexOf(':');
      const login = decoded.slice(0, separator);
      const password = decoded.slice(separator + 1);
      const account = separator > 0 && password.length <= 128 && readStore(file).accounts.find(a => a.role === 'admin' && a.login.toLowerCase() === login.toLowerCase());
      if (!account || !checkPassword(password, account.passwordHash)) {
        if (auth) { entry.count++; attempts.set(key, entry); }
        return reply(401, 'Sign in with the tracker administrator credentials.', { 'WWW-Authenticate': 'Basic realm="Private VEVO proxy", charset="UTF-8"' });
      }
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) return reply(405, 'Method not allowed.');
      if (req.method === 'POST' && req.headers.origin !== origin) return reply(403, 'Request origin is not allowed.');
      if (!req.url.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) return reply(400, 'Invalid path.');
      const target = new URL(req.url, upstream);
      if (target.origin !== upstream) return reply(400, 'Invalid destination.');
      if (target.pathname === '/') {
        res.writeHead(302, { Location: '/evo/firstParty?actionType=query', 'Cache-Control': 'no-store' }); return res.end();
      }
      if (target.pathname === '/__local/vevo-helper.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(injected);
      }
      const headers = {};
      for (const name of ['accept', 'accept-language', 'content-type', 'user-agent', 'x-requested-with']) {
        if (req.headers[name]) headers[name] = req.headers[name];
      }
      const allowedCookies = (req.headers.cookie || '').split(';').filter(part => /^(?:PD-S-SESSION-ID|LB_lusc|_abck|bm_sz|ak_bmsc|bm_sv|bm_mi|bm_so|JSESSIONID)=/.test(part.trim())).join(';');
      if (allowedCookies) headers.cookie = allowedCookies;
      if (req.headers.origin) headers.origin = upstream;
      if (req.headers.referer) {
        const ref = new URL(req.headers.referer);
        if (ref.origin === origin) headers.referer = upstream + ref.pathname + ref.search;
      }
      let body;
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 131072) return reply(413, 'Request is too large.');
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const response = await fetcher(target, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      const outgoing = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow' };
      for (const name of ['content-type', 'content-disposition', 'content-security-policy']) {
        if (response.headers.has(name)) outgoing[name] = response.headers.get(name);
      }
      if (response.headers.has('location')) {
        const redirect = new URL(response.headers.get('location'), target);
        outgoing.Location = redirect.origin === upstream ? origin + redirect.pathname + redirect.search + redirect.hash : redirect.href;
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing['Set-Cookie'] = cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]*/gi, ''));
      const chunks = []; let size = 0;
      if (response.body) for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) throw new Error('Response too large');
        chunks.push(Buffer.from(chunk));
      }
      let output = Buffer.concat(chunks);
      if (response.headers.get('content-type')?.includes('text/html')) {
        let html = output.toString('utf8').replaceAll(upstream, origin).replaceAll('//online.immi.gov.au', '//' + new URL(origin).host);
        if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, '<script src="/__local/vevo-helper.js" defer></script></body>');
        output = Buffer.from(html);
      }
      res.writeHead(response.status, outgoing);
      res.end(req.method === 'HEAD' ? undefined : output);
    } catch {
      if (!res.headersSent) reply(502, 'The official service could not be reached. Retry or use https://online.immi.gov.au/evo/firstParty?actionType=query directly.');
      else res.end();
    }
  });
}
