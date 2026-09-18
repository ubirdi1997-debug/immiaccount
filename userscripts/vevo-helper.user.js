// ==UserScript==
// @name         VEVO Local Details Helper
// @namespace    local.vevo.helper
// @version      1.0.0
// @description  Local profiles and a compact editor for VEVO passport enquiries.
// @match        https://online.immi.gov.au/evo/firstParty*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (location.pathname !== '/evo/firstParty') return;
  const KEY = 'vevo-helper-v1';
  let state = GM_getValue(KEY, { profiles: [], selected: '' });
  if (!state || !Array.isArray(state.profiles)) state = { profiles: [], selected: '' };
  let running = false;
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;font:14px/1.45 system-ui,sans-serif;color:#172535}
      *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #c7d2df;border-radius:8px;padding:9px 12px;background:#fff;color:#172535}button:hover{background:#eaf1f7}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #63a7f0;outline-offset:2px}
      #toggle,.primary{background:#164d7a;color:white;border-color:#164d7a}#toggle:hover,.primary:hover{background:#103c61}
      section{width:340px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 90px);overflow:auto;background:#fff;border:1px solid #c7d2df;border-radius:12px;box-shadow:0 8px 30px #10243b30;padding:16px;margin-bottom:8px}
      h2{font-size:17px;margin:0 0 8px}p{margin:8px 0}label{display:block;margin-top:10px;font-weight:600}input,select{width:100%;padding:8px;border:1px solid #aab9c9;border-radius:6px;background:white;color:#172535;margin-top:4px}small{display:block;color:#526171;font-size:12px} .actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}#message{font-size:13px;overflow-wrap:anywhere}#times{white-space:pre-line;margin-top:10px}button:disabled{opacity:.6;cursor:wait}[hidden]{display:none!important}@media(max-width:400px){:host{right:12px;bottom:12px}section{width:calc(100vw - 24px)}}
    </style>
    <section id="panel" aria-label="VEVO details admin">
      <h2>VEVO details admin</h2>
      <small>Saved on this browser. Anyone using this browser profile can access these details.</small>
      <label>Saved profile<select id="profiles"></select></label>
      <form id="editor">
        <label>Profile name<input id="name" maxlength="80" required autocomplete="off"></label>
        <label>Passport number<input id="passport" maxlength="40" required autocomplete="off" spellcheck="false"></label>
        <label>TRN<input id="trn" maxlength="40" required autocomplete="off" spellcheck="false"></label>
        <label>Date of birth<input id="dob" type="date" required></label>
        <label>Country of passport (optional)<input id="country" maxlength="80" autocomplete="off" placeholder="As shown in the official dropdown"></label>
        <label>Your status note<input id="status" maxlength="160" autocomplete="off" placeholder="e.g. Ready to check"></label>
        <small>This is your note, not a verified visa status.</small>
        <div class="actions"><button class="primary" type="submit">Save & fill</button><button id="new" type="button">New</button><button id="delete" type="button">Delete</button></div>
      </form>
      <div class="actions"><button id="fill" type="button">Fill saved details</button></div>
      <small id="times"></small><p id="message" role="status" aria-live="polite"></p>
      <small>Review the official form, complete any remaining fields and submit it yourself.</small>
    </section>
    <button id="toggle" type="button" aria-expanded="true" aria-controls="panel">VEVO admin</button>`;
  const $ = id => root.getElementById(id);
  const fields = ['name', 'passport', 'trn', 'dob', 'country', 'status'];
  $('dob').max = new Date().toLocaleDateString('en-CA');
  const selected = () => state.profiles.find(p => p.id === state.selected);
  const message = text => { $('message').textContent = text; };
  function persist() {
    try { GM_setValue(KEY, state); return true; }
    catch { message('Could not save to userscript storage. Try again before leaving this page.'); return false; }
  }
  function times() {
    const p = selected();
    $('times').textContent = p ? `Saved: ${new Date(p.updated).toLocaleString()}\nLast filled: ${p.filled ? new Date(p.filled).toLocaleString() : 'Never'}` : '';
  }
  function render() {
    $('profiles').replaceChildren(new Option('New profile', ''));
    for (const p of state.profiles) $('profiles').add(new Option(p.name, p.id));
    $('profiles').value = state.selected;
    const p = selected();
    fields.forEach(key => { $(key).value = p?.[key] || ''; });
    times();
  }
  $('toggle').onclick = () => {
    $('panel').hidden = !$('panel').hidden;
    $('toggle').setAttribute('aria-expanded', String(!$('panel').hidden));
  };
  $('profiles').onchange = () => { state.selected = $('profiles').value; persist(); render(); message('Profile selected. Use Fill saved details to apply it.'); };
  $('new').onclick = () => { state.selected = ''; render(); message('Enter a new profile and save.'); $('name').focus(); };
  $('delete').onclick = () => {
    const p = selected();
    if (!p || !confirm(`Delete saved profile “${p.name}” from this browser?`)) return;
    state.profiles = state.profiles.filter(item => item.id !== p.id);
    state.selected = ''; persist(); render(); message('Profile deleted. Already-filled website fields are unchanged.');
  };
  $('editor').onsubmit = event => {
    event.preventDefault();
    if (fields.slice(0, 4).some(key => !$(key).value.trim())) { message('Enter a name, passport number, TRN and date of birth.'); return; }
    const p = selected() || { id: crypto.randomUUID() };
    fields.forEach(key => { p[key] = $(key).value.trim(); });
    p.updated = new Date().toISOString();
    if (!state.profiles.includes(p)) state.profiles.push(p);
    state.selected = p.id;
    if (persist()) { render(); void fill(); }
  };
  $('fill').onclick = () => void fill();

  // Match accessible labels instead of session-dependent WComponents IDs.
  function label(el) {
    return [...(el.labels || [])].map(l => l.textContent).join(' ') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
  }
  function find(pattern, tag = 'input,select') {
    return [...document.querySelectorAll(tag)].find(el => !el.disabled && el.type !== 'hidden' && el.getClientRects().length && pattern.test(label(el)));
  }
  function set(el, value) {
    if (el.value === value) return;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  function choose(pattern, optionPattern) {
    const el = find(pattern, 'select');
    const option = el && [...el.options].find(o => !o.disabled && optionPattern.test(o.textContent));
    if (option) set(el, option.value);
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 350));
  async function fill() {
    const p = selected();
    if (!p || running) { if (!p) message('Save a profile first.'); return; }
    // Snapshot avoids mixing profiles if selection changes while fields load.
    const details = { ...p };
    running = true;
    root.querySelectorAll('form button, #fill, #profiles').forEach(el => { el.disabled = true; });
    message('Waiting for the official form fields…');
    let missing = [];
    let stable = 0;
    try {
      for (let attempt = 0; attempt < 45; attempt++) {
        choose(/document type/i, /^passport$/i);
        choose(/reference (type|number type)|type of reference/i, /transaction reference|\bTRN\b/i);
        await pause();
        missing = [];
        const items = [
          ['passport number', /passport (number|no\b)|document (number|no\b)/i, details.passport],
          ['TRN', /transaction reference|\bTRN\b|^\s*reference number\s*\*?\s*$/i, details.trn],
          ['date of birth', /date of birth|\bDOB\b/i, details.dob]
        ];
        for (const [name, pattern, value] of items) {
          const el = find(pattern, 'input');
          if (!el) { missing.push(name); continue; }
          const [year, month, day] = details.dob.split('-');
          set(el, name === 'date of birth' && el.type !== 'date' ? `${day}/${month}/${year}` : value);
          if (!el.value) missing.push(name);
        }
        if (details.country) {
          const el = find(/country.*(passport|document)|nationality/i, 'select');
          const option = el && [...el.options].find(o => o.textContent.trim().toLowerCase() === details.country.toLowerCase());
          if (option) set(el, option.value); else missing.push('country of passport');
        }
        stable = missing.length ? 0 : stable + 1;
        if (stable >= 3) break;
      }
      if (missing.length) {
        message(`Partially filled. Could not find or fill: ${missing.join(', ')}. Select Passport and the TRN reference type on the page, then retry or complete manually.`);
      } else {
        p.filled = new Date().toISOString();
        if (persist()) message('Details filled. Review all fields and submit on the official page.');
        times();
      }
    } catch {
      message('Could not finish filling this form. Review the page and complete missing fields manually.');
    } finally {
      running = false;
      root.querySelectorAll('form button, #fill, #profiles').forEach(el => { el.disabled = false; });
    }
  }
  render();
  if (selected() && new URLSearchParams(location.search).get('actionType') === 'query') void fill();
})();
