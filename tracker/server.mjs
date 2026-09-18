import { createServer } from 'node:http';
import { createVevoProxy } from './vevo-proxy.mjs';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readStore, writeStore, defaultFile, hashPassword, checkPassword, validLogin, validPassword } from './store.mjs';

export const fields = ['name', 'dob', 'passport', 'country', 'trn', 'applicationId', 'visa', 'grantDate', 'grantNumber', 'arrivalDeadline', 'lengthOfStay', 'travel', 'conditions', 'note'];
const statuses = ['In progress', 'Approved', 'Rejected'];
const dateFields = ['dob', 'grantDate', 'arrivalDeadline'];
const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]
].map(([route, [file, type]]) => [route, { body: readFileSync(new URL(`./public/${file}`, import.meta.url)), type }]));
assets.set('/downloads/vevo-helper.user.js', { body: readFileSync(new URL('../userscripts/vevo-helper.user.js', import.meta.url)), type: 'text/javascript' });
assets.set('/admin', assets.get('/'));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function recordInput(input) {
  const result = {};
  for (const field of fields) {
    if (typeof input[field] !== 'string' || input[field].length > (['conditions', 'note'].includes(field) ? 2000 : 200)) fail(400, `Invalid ${field}.`);
    result[field] = input[field].trim();
  }
  for (const key of ['name', 'dob', 'passport', 'trn', 'country']) if (!result[key]) fail(400, `${key} is required.`);
  for (const key of dateFields) {
    const value = result[key];
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail(400, `Invalid ${key}.`);
  }
  if (result.dob > new Date().toISOString().slice(0, 10)) fail(400, 'Date of birth cannot be in the future.');
  return result;
}
const publicAccount = a => ({ id: a.id, login: a.login, role: a.role, record: a.record });
export function createTracker({ file = defaultFile, origin, secure = false } = {}) {
  let db = readStore(file);
  const sessions = new Map();
  const limits = new Map();
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const commit = next => { writeStore(next, file); db = next; };
  const prune = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
    for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
  }, 60_000);
  prune.unref();
  const server = createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    };
    const send = (status, value, extra = {}) => {
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra });
      res.end(JSON.stringify(value));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const asset = assets.get(path);
        res.writeHead(200, { ...headers, 'Content-Type': `${asset.type}; charset=utf-8` });
        return res.end(asset.body);
      }
      if (!path.startsWith('/api/')) fail(404, 'Not found.');
      if (!['GET', 'POST', 'PATCH'].includes(req.method)) fail(405, 'Method not allowed.');
      let body = {};
      if (req.method !== 'GET') {
        const allowedOrigin = origin || `http://127.0.0.1:${server.address().port}`;
        if (req.headers.origin !== allowedOrigin) fail(403, 'Request origin is not allowed.');
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON is required.');
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 24_000) fail(413, 'Request is too large.');
        }
        try { body = JSON.parse(raw); } catch { fail(400, 'Invalid JSON.'); }
        if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'Invalid request.');
      }
      if (path === '/api/login' && req.method === 'POST') {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        let limit = limits.get(key);
        if (!limit || limit.until < now) { limit = { count: 0, until: now + 15 * 60_000 }; limits.set(key, limit); }
        if (++limit.count > 20) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.');
        if (!validLogin(body.login) || typeof body.password !== 'string' || body.password.length > 128) fail(401, 'Incorrect login ID or password.');
        const account = db.accounts.find(a => a.login.toLowerCase() === body.login.toLowerCase());
        const matches = checkPassword(body.password, account?.passwordHash || dummyHash);
        if (!account || !matches) fail(401, 'Incorrect login ID or password.');
        const token = randomBytes(32).toString('hex');
        const csrf = randomBytes(32).toString('hex');
        const previous = /(?:^|;\s*)tracker_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
        if (previous) sessions.delete(previous);
        sessions.set(token, { accountId: account.id, csrf, expires: now + 8 * 60 * 60_000 });
        return send(200, { account: publicAccount(account), csrf }, { 'Set-Cookie': `tracker_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure ? '; Secure' : ''}` });
      }
      const token = /(?:^|;\s*)tracker_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const session = sessions.get(token);
      if (!session || session.expires <= Date.now()) fail(401, 'Please sign in.');
      const account = db.accounts.find(a => a.id === session.accountId);
      if (!account) fail(401, 'Please sign in.');
      if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) fail(403, 'Invalid session token. Reload and try again.');
      if (path === '/api/me' && req.method === 'GET') return send(200, { account: publicAccount(account), csrf: session.csrf });
      if (path === '/api/logout' && req.method === 'POST') {
        sessions.delete(token);
        return send(200, { ok: true }, { 'Set-Cookie': `tracker_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}` });
      }
      if (path === '/api/password' && req.method === 'POST') {
        if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || !checkPassword(body.currentPassword, account.passwordHash)) fail(400, 'Current password is incorrect.');
        if (!validPassword(body.password)) fail(400, 'Use a password with 12–128 characters.');
        const next = structuredClone(db);
        next.accounts.find(a => a.id === account.id).passwordHash = hashPassword(body.password);
        commit(next);
        for (const [key, value] of sessions) if (value.accountId === account.id && key !== token) sessions.delete(key);
        return send(200, { ok: true });
      }
      if (account.role !== 'admin') fail(403, 'Administrator access is required.');
      if (path === '/api/users' && req.method === 'GET') return send(200, { users: db.accounts.filter(a => a.role === 'user').map(publicAccount) });
      if (path === '/api/users' && req.method === 'POST') {
        if (!validLogin(body.login)) fail(400, 'Use a login ID with 3–64 letters, numbers, dots, underscores or hyphens.');
        if (db.accounts.some(a => a.login.toLowerCase() === body.login.toLowerCase())) fail(409, 'That login ID is already in use.');
        if (!validPassword(body.password)) fail(400, 'Use a password with 12–128 characters.');
        const details = recordInput(body.record || {});
        const now = new Date().toISOString();
        const user = { id: randomUUID(), login: body.login, role: 'user', passwordHash: hashPassword(body.password), record: { ...details, status: 'In progress', createdAt: now, updatedAt: now, version: 1, history: [{ status: 'In progress', at: now, by: account.login, note: 'Account created' }] } };
        commit({ accounts: [...db.accounts, user] });
        return send(201, { user: publicAccount(user) });
      }
      const match = /^\/api\/users\/([a-f0-9-]+)$/.exec(path);
      if (match && req.method === 'PATCH') {
        const user = db.accounts.find(a => a.id === match[1] && a.role === 'user');
        if (!user) fail(404, 'User not found.');
        if (body.version !== user.record.version) fail(409, 'This record changed. Select the user again to reload before saving.');
        const details = recordInput(body.record || {});
        if (!statuses.includes(body.status)) fail(400, 'Invalid review status.');
        if (body.password && !validPassword(body.password)) fail(400, 'Use a password with 12–128 characters.');
        if (typeof body.updateNote !== 'string' || body.updateNote.length > 1000) fail(400, 'Invalid update note.');
        const next = structuredClone(db);
        const updated = next.accounts.find(a => a.id === user.id);
        const now = new Date().toISOString();
        updated.record = { ...user.record, ...details, status: body.status, updatedAt: now, version: user.record.version + 1, history: [...user.record.history, { status: body.status, at: now, by: account.login, note: body.updateNote.trim() || (body.status === user.record.status ? 'Record updated' : 'Review status updated') }] };
        if (body.password) updated.passwordHash = hashPassword(body.password);
        commit(next);
        if (body.password) for (const [key, value] of sessions) if (value.accountId === user.id) sessions.delete(key);
        return send(200, { user: publicAccount(updated) });
      }
      fail(404, 'Not found.');
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      if (!res.headersSent) send(error.status || 500, { error: error.status ? error.message : 'Could not save or load data. Please try again.' });
      else res.end();
    }
  });
  server.on('close', () => clearInterval(prune));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!readStore().accounts.some(a => a.role === 'admin')) {
    console.error('Create an admin first: npm run setup');
    process.exit(1);
  }
  if (process.env.VEVO_PUBLIC_ORIGIN) createVevoProxy({ origin: process.env.VEVO_PUBLIC_ORIGIN }).listen(3001, '127.0.0.1', () => console.log(`Private VEVO proxy: ${process.env.VEVO_PUBLIC_ORIGIN}`));
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  createTracker({ origin, secure: origin.startsWith('https://') }).listen(port, host, () => console.log(`Application tracker: ${origin}`));
}
