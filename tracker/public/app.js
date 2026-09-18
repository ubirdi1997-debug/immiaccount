'use strict';
const $ = id => document.getElementById(id);
const fieldSpec = [
  ['name', 'Full name', 'text', true], ['dob', 'Date of birth', 'date', true],
  ['passport', 'Passport (or other travel document) number', 'text', true], ['country', 'Passport (or other travel document) country', 'text', true],
  ['trn', 'Transaction reference number (TRN)', 'text', true], ['applicationId', 'Application ID', 'text', false],
  ['visa', 'Visa / subclass', 'text', false], ['grantDate', 'Date of grant', 'date', false],
  ['grantNumber', 'Visa grant number', 'text', false], ['arrivalDeadline', 'Must not arrive after', 'date', false],
  ['lengthOfStay', 'Length of stay', 'text', false], ['travel', 'Travel', 'text', false], ['conditions', 'Visa conditions', 'textarea', false]
];
let account, csrf, users = [], editing = null, busy = false;
const fmt = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateFmt = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not supplied';
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function notify(text = '', error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') signedOut();
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}
async function action(fn, button) {
  if (button) button.disabled = true;
  try { await fn(); } catch (e) { notify(e.message, true); }
  finally { if (button) button.disabled = false; }
}
function signedOut() {
  account = null; csrf = null; users = []; editing = null;
  ['admin-view', 'user-view', 'session', 'password-panel'].forEach(id => { $(id).hidden = true; });
  $('login-view').hidden = false;
  $('record-form').reset(); $('password-form').reset(); $('login-form').reset();
  ['user-list', 'user-result', 'preview-result'].forEach(id => $(id).replaceChildren());
  $('identity').textContent = '';
}
for (const [key, title, type, required] of fieldSpec) {
  const label = node('label', title + (required ? ' *' : ''));
  const input = node(type === 'textarea' ? 'textarea' : 'input');
  input.id = `field-${key}`;
  if (type !== 'textarea') input.type = type;
  input.required = required; input.maxLength = type === 'textarea' ? 2000 : 200;
  if (key === 'dob') input.max = new Date().toISOString().slice(0, 10);
  label.append(input);
  $(fieldSpec.findIndex(x => x[0] === key) < 6 ? 'personal-fields' : 'visa-fields').append(label);
}
function badge(status) { return node('span', status, `badge ${status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : ''}`); }
function listUsers() {
  const query = $('search').value.toLowerCase();
  $('count').textContent = users.length;
  $('user-list').replaceChildren();
  const matches = users.filter(u => `${u.login} ${u.record.name}`.toLowerCase().includes(query));
  if (!matches.length) $('user-list').append(node('p', users.length ? 'No matching accounts.' : 'No accounts yet. Create your first user.', 'muted small'));
  for (const user of matches) {
    const button = node('button', undefined, 'user-item');
    button.type = 'button'; button.setAttribute('aria-current', String(user.id === editing?.id));
    button.append(node('strong', user.record.name), node('small', user.login), badge(user.record.status));
    button.onclick = () => action(async () => {
      if (busy) return;
      // Fetch again so choosing a user resolves a stale-version conflict.
      await loadUsers(); edit(users.find(u => u.id === user.id));
    });
    $('user-list').append(button);
  }
}
function edit(user = null) {
  editing = user;
  $('record-form').reset();
  $('editor-title').textContent = user ? 'Edit user record' : 'Create user';
  $('editing-id').textContent = user ? `Updated ${fmt(user.record.updatedAt)}` : '';
  $('user-login').value = user?.login || ''; $('user-login').disabled = !!user;
  $('user-password').required = !user;
  $('password-label').textContent = user ? 'Reset password (optional)' : 'Password';
  $('password-hint').textContent = user ? 'Leave blank to keep the current password.' : 'At least 12 characters. Share securely with the user.';
  for (const [key] of fieldSpec) $(`field-${key}`).value = user?.record[key] || '';
  $('record-note').value = user?.record.note || '';
  $('review-status').value = user?.record.status || 'In progress';
  $('review-status').disabled = !user; $('update-note').disabled = !user;
  $('status-hint').textContent = user ? 'Internal review status, visible to this user.' : 'New accounts always start In progress.';
  $('save-user').textContent = user ? 'Save changes' : 'Create account';
  $('admin-preview').hidden = !user;
  if (user) renderResult(user, $('preview-result'));
  listUsers();
}
function summaryCard(title, keys, record) {
  const card = node('section', undefined, 'card');
  card.append(node('h2', title));
  const dl = node('dl');
  for (const key of keys) {
    const spec = fieldSpec.find(f => f[0] === key);
    const row = node('div');
    row.append(node('dt', spec[1]), node('dd', spec[2] === 'date' ? dateFmt(record[key]) : record[key] || 'Not supplied'));
    dl.append(row);
  }
  card.append(dl); return card;
}
function renderResult(user, target) {
  const r = user.record;
  target.replaceChildren();
  const head = node('section', undefined, 'result-head');
  const title = node('div'); title.append(node('div', 'INTERNAL REVIEW STATUS', 'eyebrow'), node('h2', r.name), node('p', 'Administrator-maintained tracking record', 'muted small'));
  const state = node('div'); state.append(badge(r.status), node('p', `Last updated ${fmt(r.updatedAt)}`, 'muted small'));
  head.append(title, state); target.append(head);
  const layout = node('div', undefined, 'result-layout');
  const details = node('div');
  details.append(summaryCard('Personal and reference details', ['name', 'dob', 'passport', 'country', 'trn', 'applicationId'], r));
  details.append(summaryCard('Visa details · supplied information', ['visa', 'grantDate', 'grantNumber', 'arrivalDeadline', 'lengthOfStay', 'travel', 'conditions'], r));
  const aside = node('div');
  if (r.note) { const note = node('section', undefined, 'card'); note.append(node('h2', 'Message from your administrator'), node('p', r.note, 'user-note')); aside.append(note); }
  const history = node('section', undefined, 'card'); history.append(node('h2', 'Update history'), node('p', 'Times are shown in your local timezone.', 'muted small'));
  const list = node('ol', undefined, 'history');
  for (const event of [...r.history].reverse()) {
    const li = node('li');
    const time = node('time', fmt(event.at)); time.dateTime = event.at;
    li.append(badge(event.status), time, node('p', event.note), node('small', `Updated by ${event.by}`)); list.append(li);
  }
  history.append(list); aside.append(history); layout.append(details, aside); target.append(layout);
}
async function loadUsers() { users = (await api('/users')).users; listUsers(); }
async function signedIn(data) {
  account = data.account; csrf = data.csrf;
  $('login-form').reset(); $('login-view').hidden = true; $('session').hidden = false; $('password-panel').hidden = false;
  $('identity').textContent = `${account.login} · ${account.role === 'admin' ? 'Administrator' : 'User'}`;
  $('admin-view').hidden = account.role !== 'admin'; $('user-view').hidden = account.role !== 'user';
  if (account.role === 'admin') { await loadUsers(); edit(); } else renderResult(account, $('user-result'));
}
$('login-form').onsubmit = event => {
  event.preventDefault();
  void action(async () => { const data = await api('/login', 'POST', Object.fromEntries(new FormData(event.target))); await signedIn(data); notify(); }, event.submitter);
};
$('logout').onclick = () => action(async () => { await api('/logout', 'POST', {}); signedOut(); notify('Signed out.'); }, $('logout'));
$('new-user').onclick = () => { if (!busy) { edit(); notify(); $('user-login').focus(); } };
$('search').oninput = listUsers;
$('record-form').onsubmit = event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  void action(async () => {
    const record = Object.fromEntries(fieldSpec.map(([key]) => [key, $(`field-${key}`).value])); record.note = $('record-note').value;
    const data = editing
      ? await api(`/users/${editing.id}`, 'PATCH', { record, version: editing.record.version, status: $('review-status').value, password: $('user-password').value, updateNote: $('update-note').value })
      : await api('/users', 'POST', { record, login: $('user-login').value, password: $('user-password').value });
    const index = users.findIndex(u => u.id === data.user.id);
    if (index < 0) users.push(data.user); else users[index] = data.user;
    edit(data.user); notify('Saved. The user can see this update in their account.');
  }, event.submitter).finally(() => { busy = false; });
};
async function refresh() {
  const data = await api('/me'); account = data.account; csrf = data.csrf;
  if (account.role === 'user') renderResult(account, $('user-result'));
}
$('refresh').onclick = () => action(async () => { await refresh(); notify('Status is up to date.'); }, $('refresh'));
$('password-form').onsubmit = event => {
  event.preventDefault(); void action(async () => { await api('/password', 'POST', Object.fromEntries(new FormData(event.target))); event.target.reset(); notify('Password updated.'); }, event.submitter);
};
setInterval(() => { if (account?.role === 'user' && !document.hidden) void action(refresh); }, 30_000);
void action(async () => {
  const response = await fetch('/api/me');
  if (response.status === 401) return;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load your account.');
  await signedIn(data);
});
