import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createVevoProxy } from '../vevo-proxy.mjs';
import { writeStore, hashPassword } from '../store.mjs';

test('VEVO proxy protects access, isolates credentials, injects helper and rewrites cookies/redirects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vevo-test-'));
  const file = join(dir, 'db.json');
  writeStore({ accounts: [{ login: 'admin', role: 'admin', passwordHash: hashPassword('test-password-123') }, { login: 'user', role: 'user', passwordHash: hashPassword('test-password-123') }] }, file);
  const origin = 'https://private.example';
  let captured;
  const server = createVevoProxy({ file, origin, fetcher: async (url, options) => {
    captured = { url, options };
    return new Response('<html><body><a href="https://online.immi.gov.au/evo/firstParty">Form</a></body></html>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'PD-S-SESSION-ID=test; Domain=.online.immi.gov.au; Path=/; Secure; HttpOnly', Location: 'https://online.immi.gov.au/evo/firstParty' } });
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const authorization = 'Basic ' + Buffer.from('admin:test-password-123').toString('base64');
  try {
    assert.equal((await fetch(base + '/evo/firstParty')).status, 401);
    assert.equal(captured, undefined);
    assert.equal((await fetch(base + '/evo/firstParty', { headers: { authorization: 'Basic ' + Buffer.from('user:test-password-123').toString('base64') } })).status, 401);
    assert.equal((await fetch(base + '/evo/firstParty', { method: 'POST', headers: { authorization, origin: 'https://evil.example' } })).status, 403);
    const response = await fetch(base + '/evo/firstParty?actionType=query', { headers: { authorization, cookie: 'tracker_session=secret; github_secret=secret; PD-S-SESSION-ID=upstream', referer: origin + '/evo/firstParty' } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /\/__local\/vevo-helper.js/);
    assert.ok(html.includes(origin + '/evo/firstParty'));
    assert.equal(captured.url.origin, 'https://online.immi.gov.au');
    assert.equal(captured.options.headers.authorization, undefined);
    assert.equal(captured.options.headers.cookie.trim(), 'PD-S-SESSION-ID=upstream');
    assert.equal(captured.options.headers.referer, 'https://online.immi.gov.au/evo/firstParty');
    assert.equal(response.headers.get('location'), origin + '/evo/firstParty');
    assert.equal(response.headers.get('set-cookie'), 'PD-S-SESSION-ID=test; Path=/; Secure; HttpOnly');
    const script = await fetch(base + '/__local/vevo-helper.js', { headers: { authorization } });
    assert.match(await script.text(), /const GM_getValue/);
    assert.equal((await fetch(base + '//evil.example/path', { headers: { authorization }, redirect: 'manual' })).status, 400);
    assert.equal((await fetch(base + '/evo/firstParty', { method: 'POST', headers: { authorization, origin }, body: 'test=value' })).status, 200);
    assert.equal(captured.options.body.toString(), 'test=value');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true }); }
});
