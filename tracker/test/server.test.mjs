import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTracker, fields } from '../server.mjs';
import { hashPassword, writeStore } from '../store.mjs';

test('accounts, access control, record lifecycle, timestamps and persistence', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tracker-test-'));
  const file = join(dir, 'db.json');
  writeStore({ accounts: [{ id: 'admin', login: 'admin', role: 'admin', passwordHash: hashPassword('admin-password-123') }] }, file);
  let server = createTracker({ file });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  async function call(path, method = 'GET', body, auth = {}, headers = {}) {
    const res = await fetch(`${base}/api${path}`, { method, headers: { Origin: base, 'Content-Type': 'application/json', ...(auth.cookie ? { Cookie: auth.cookie } : {}), ...(auth.csrf ? { 'X-CSRF-Token': auth.csrf } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async (id, password) => {
    const r = await call('/login', 'POST', { login: id, password }); assert.equal(r.status, 200); return { cookie: r.cookie, csrf: r.body.csrf };
  };
  assert.equal((await call('/users')).status, 401);
  assert.equal((await call('/login', 'POST', { login: 'admin', password: 'wrong' })).status, 401);
  assert.equal((await call('/login', 'POST', { login: 'admin', password: 'admin-password-123' }, {}, { Origin: 'https://evil.example' })).status, 403);
  const admin = await login('admin', 'admin-password-123');
  const record = Object.fromEntries(fields.map(key => [key, '']));
  Object.assign(record, { name: 'Sample Person', dob: '1990-02-03', passport: 'TEST123', country: 'India', trn: 'TRN123', note: '<script>alert(1)</script>' });
  const create = { login: 'person.one', password: 'user-password-123', record };
  assert.equal((await call('/users', 'POST', create, { cookie: admin.cookie })).status, 403);
  assert.equal((await call('/users', 'POST', { ...create, record: { ...record, dob: '1990-02-31' } }, admin)).status, 400);
  let result = await call('/users', 'POST', create, admin);
  assert.equal(result.status, 201);
  const id = result.body.user.id;
  assert.equal(result.body.user.record.status, 'In progress');
  assert.ok(Date.parse(result.body.user.record.history[0].at));
  assert.equal(result.body.user.passwordHash, undefined);
  assert.equal((await call('/users', 'POST', create, admin)).status, 409);
  const user = await login('person.one', create.password);
  assert.equal((await call('/users', 'GET', undefined, user)).status, 403);
  assert.equal((await call(`/users/${id}`, 'PATCH', {}, user)).status, 403);
  const other = await call('/users', 'POST', { ...create, login: 'person.two' }, admin);
  assert.equal(other.status, 201);
  const me = await call('/me', 'GET', undefined, user);
  assert.equal(me.body.account.id, id);
  assert.equal(me.body.account.passwordHash, undefined);
  assert.equal(JSON.stringify(me.body).includes('person.two'), false);
  for (const [version, status] of [[1, 'Approved'], [2, 'Rejected'], [3, 'In progress']]) {
    result = await call(`/users/${id}`, 'PATCH', { record, version, status, updateNote: `Changed to ${status}` }, admin);
    assert.equal(result.status, 200);
    assert.equal(result.body.user.record.history.length, version + 1);
    const current = await call('/me', 'GET', undefined, user);
    assert.equal(current.body.account.record.status, status);
    assert.equal(current.body.account.record.version, version + 1);
  }
  assert.equal((await call(`/users/${id}`, 'PATCH', { record, version: 1, status: 'Approved', updateNote: '' }, admin)).status, 409);
  assert.equal((await call(`/users/${id}`, 'PATCH', { record, version: 4, status: 'Granted', updateNote: '' }, admin)).status, 400);
  result = await call(`/users/${id}`, 'PATCH', { record, version: 4, status: 'Approved', updateNote: 'Complete', password: 'replacement-pass-123' }, admin);
  assert.equal(result.status, 200);
  assert.equal((await call('/me', 'GET', undefined, user)).status, 401);
  const resetUser = await login('person.one', 'replacement-pass-123');
  assert.equal((await call('/password', 'POST', { currentPassword: 'replacement-pass-123', password: 'another-password-123' }, resetUser)).status, 200);
  const newUser = await login('person.one', 'another-password-123');
  assert.equal((await call('/logout', 'POST', {}, newUser)).status, 200);
  assert.equal((await call('/me', 'GET', undefined, newUser)).status, 401);
  const disk = readFileSync(file, 'utf8');
  assert.equal(disk.includes('another-password-123'), false);
  assert.equal(disk.includes('admin-password-123'), false);
  await new Promise(resolve => server.close(resolve));
  server = createTracker({ file });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const afterRestart = await login('person.one', 'another-password-123');
  const saved = await call('/me', 'GET', undefined, afterRestart);
  assert.equal(saved.body.account.record.status, 'Approved');
  assert.equal(saved.body.account.record.history.length, 5);
});
