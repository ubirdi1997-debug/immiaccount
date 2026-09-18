import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { readStore, writeStore, hashPassword } from '../store.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = resolve(root, 'data/runtime');
const appPid = resolve(runtime, 'app.pid');
const proxyPid = resolve(runtime, 'nginx.pid');
const config = resolve(root, 'deploy/nginx.conf');
const credentialFile = resolve(root, 'data/admin-credentials.json');
const command = process.argv[2] || 'status';
mkdirSync(runtime, { recursive: true, mode: 0o700 });
const origin = process.env.PUBLIC_ORIGIN || (process.env.CODESPACE_NAME ? `https://${process.env.CODESPACE_NAME}-8080.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}` : 'http://127.0.0.1:8080');
const vevoOrigin = process.env.VEVO_PUBLIC_ORIGIN || (process.env.CODESPACE_NAME ? `https://${process.env.CODESPACE_NAME}-8081.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}` : 'http://127.0.0.1:8081');
function pid(file) {
  try {
    const id = Number(readFileSync(file, 'utf8'));
    if (!Number.isInteger(id) || id < 2) return null;
    process.kill(id, 0);
    const cmdline = readFileSync(`/proc/${id}/cmdline`, 'utf8');
    if (!cmdline.includes(file === appPid ? resolve(root, 'server.mjs') : config)) return null;
    return id;
  } catch { return null; }
}
function run(bin, args) {
  const result = spawnSync(bin, args, { stdio: 'inherit', cwd: root });
  if (result.error || result.status !== 0) throw new Error(`${bin} failed: ${result.error?.message || result.status}`);
}
async function waitFor(url, status = 200) {
  for (let i = 0; i < 40; i++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.status === status) return; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Service did not start: ${url}. Check ${runtime}`);
}
async function stop() {
  const proxy = pid(proxyPid); if (proxy) process.kill(proxy, 'SIGQUIT');
  const app = pid(appPid); if (app) process.kill(app, 'SIGTERM');
  for (let i = 0; i < 40 && (pid(appPid) || pid(proxyPid)); i++) await new Promise(r => setTimeout(r, 100));
  if (pid(appPid) || pid(proxyPid)) throw new Error('A service is still stopping. Retry status shortly.');
  for (const file of [appPid, proxyPid]) if (existsSync(file)) unlinkSync(file);
}
async function start() {
  if (spawnSync('nginx', ['-v']).error) throw new Error('nginx is missing. Run: sudo apt-get update && sudo apt-get install -y nginx');
  const db = readStore();
  if (!db.accounts.some(a => a.role === 'admin')) {
    const password = randomBytes(24).toString('base64url');
    db.accounts.push({ id: randomUUID(), login: 'admin', role: 'admin', passwordHash: hashPassword(password) });
    writeStore(db);
    writeFileSync(credentialFile, JSON.stringify({ login: 'admin', password, createdAt: new Date().toISOString(), note: 'Initial credentials only; changing the password does not update this file.' }, null, 2), { mode: 0o600 });
    console.log(`Created admin. Initial credentials are stored privately in ${credentialFile}`);
  }
  if (!pid(appPid)) {
    const log = openSync(resolve(runtime, 'app.log'), 'a', 0o600);
    const child = spawn(process.execPath, [resolve(root, 'server.mjs')], { cwd: root, env: { ...process.env, HOST: '127.0.0.1', PORT: '3000', PUBLIC_ORIGIN: origin, VEVO_PUBLIC_ORIGIN: vevoOrigin }, detached: true, stdio: ['ignore', log, log] });
    await new Promise((yes, no) => { child.once('spawn', yes); child.once('error', no); });
    writeFileSync(appPid, String(child.pid), { mode: 0o600 });
    child.unref(); closeSync(log);
  }
  await waitFor('http://127.0.0.1:3000/');
  await waitFor('http://127.0.0.1:3001/', 401);
  if (!pid(proxyPid)) {
    run('nginx', ['-t', '-p', `${runtime}/`, '-c', config]);
    run('nginx', ['-p', `${runtime}/`, '-c', config]);
  }
  await waitFor('http://127.0.0.1:8080/');
  await waitFor('http://127.0.0.1:8081/', 401);
  console.log(`VEVO proxy: ${vevoOrigin}/evo/firstParty?actionType=query`);
  console.log(`Tracker ready: ${origin}\nAdmin: ${origin}/admin\nUserscript: ${origin}/downloads/vevo-helper.user.js`);
}
const lockFile = resolve(runtime, 'manage.lock');
let ownsLock = false;
async function acquireLock() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const fd = openSync(lockFile, 'wx', 0o600);
      writeFileSync(fd, String(process.pid)); closeSync(fd); ownsLock = true; return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = Number(readFileSync(lockFile, 'utf8'));
        if (owner > 1) process.kill(owner, 0);
      } catch (error) {
        if (error.code === 'ESRCH' && existsSync(lockFile)) unlinkSync(lockFile);
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error('Another deployment command is still running. Try again shortly.');
}
try {
  await acquireLock();
  if (command === 'restart') { await stop(); await start(); }
  else if (command === 'start') await start();
  else if (command === 'stop') { await stop(); console.log('Tracker stopped.'); }
  else if (command !== 'status') throw new Error('Use start, stop, restart or status.');
  console.log(`App: ${pid(appPid) ? 'running' : 'stopped'} | nginx: ${pid(proxyPid) ? 'running' : 'stopped'}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (ownsLock && existsSync(lockFile)) unlinkSync(lockFile); }
