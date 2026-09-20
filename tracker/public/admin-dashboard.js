/* VEVO Admin Dashboard JavaScript */

// API URL
const API_URL = window.location.origin;

// State
let currentUser = null;
let visas = [];
let currentVisa = null;

// DOM Elements
const loginPanel = document.getElementById('login-panel');
const visasPanel = document.getElementById('visas-panel');
const createPanel = document.getElementById('create-panel');
const auditPanel = document.getElementById('audit-panel');
const loginForm = document.getElementById('login-form');
const visaForm = document.getElementById('visa-form');
const messageEl = document.getElementById('message');
const adminNameEl = document.getElementById('admin-name');

// Initialize
async function init() {
  // Check session
  try {
    const res = await fetch(`${API_URL}/api/me`, { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      showDashboard();
    } else {
      showLogin();
    }
  } catch (e) {
    showLogin();
  }
  
  // Event listeners
  document.getElementById('logout').addEventListener('click', logout);
  document.getElementById('search-btn').addEventListener('click', searchVisas);
  document.getElementById('clear-search').addEventListener('click', clearSearch);
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchVisas();
  });
  document.getElementById('delete-btn').addEventListener('click', deleteVisa);
  
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Form submission
  loginForm.addEventListener('submit', handleLogin);
  visaForm.addEventListener('submit', handleSaveVisa);
}

// Auth functions
async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    
    if (res.ok) {
      currentUser = await res.json();
      showDashboard();
      showMessage('Signed in successfully');
    } else {
      const data = await res.json();
      errorEl.textContent = data.error || 'Invalid credentials';
      errorEl.hidden = false;
    }
  } catch (e) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.hidden = false;
  }
}

async function logout() {
  try {
    await fetch(`${API_URL}/api/logout`, { 
      method: 'POST',
      credentials: 'include' 
    });
    currentUser = null;
    showLogin();
    showMessage('Signed out');
  } catch (e) {
    showMessage('Error signing out');
  }
}

// UI functions
function showLogin() {
  hideAllPanels();
  loginPanel.classList.add('active');
  adminNameEl.textContent = '';
  document.querySelector('.nav-tabs').style.display = 'none';
}

function showDashboard() {
  hideAllPanels();
  adminNameEl.textContent = `Welcome, ${currentUser?.username || 'Admin'}`;
  document.querySelector('.nav-tabs').style.display = 'flex';
  switchTab('visas');
  loadVisas();
}

function hideAllPanels() {
  [loginPanel, visasPanel, createPanel, auditPanel].forEach(p => p.classList.remove('active'));
}

function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  hideAllPanels();
  
  switch (tab) {
    case 'visas':
      visasPanel.classList.add('active');
      loadVisas();
      break;
    case 'create':
      createPanel.classList.add('active');
      resetForm();
      break;
    case 'audit':
      auditPanel.classList.add('active');
      loadAudit();
      break;
  }
}

// Visa CRUD functions
async function loadVisas() {
  try {
    const res = await fetch(`${API_URL}/api/visas`, { credentials: 'include' });
    visas = await res.json();
    renderVisaList(visas);
  } catch (e) {
    showMessage('Failed to load visas');
  }
}

function renderVisaList(list) {
  const container = document.getElementById('visa-list');
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No visa records found</p>
        <button class="primary" onclick="switchTab('create')" style="margin-top:16px;">+ Create First Record</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = list.map(v => `
    <div class="visa-item" data-id="${v.id}">
      <div class="visa-item-info">
        <strong>${v.given_names} ${v.family_name}</strong>
        <small>${v.visa_class_subclass} · ${v.passport_number} · ${v.reference_number}</small>
      </div>
      <span class="status-badge status-${v.visa_status.replace(/ /g, '-')}">${v.visa_status}</span>
    </div>
  `).join('');
  
  container.querySelectorAll('.visa-item').forEach(item => {
    item.addEventListener('click', () => loadVisa(item.dataset.id));
  });
}

async function loadVisa(id) {
  try {
    const res = await fetch(`${API_URL}/api/visas/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Not found');
    currentVisa = await res.json();
    populateForm(currentVisa);
    switchTab('create');
  } catch (e) {
    showMessage('Failed to load visa');
  }
}

function populateForm(visa) {
  document.getElementById('visa-id').value = visa.id || '';
  document.getElementById('visa-version').value = visa.version || '0';
  document.getElementById('ref-type').value = visa.reference_type;
  document.getElementById('ref-number').value = visa.reference_number;
  document.getElementById('passport').value = visa.passport_number;
  document.getElementById('country').value = visa.country_of_passport;
  document.getElementById('dob').value = visa.date_of_birth;
  document.getElementById('given-names').value = visa.given_names;
  document.getElementById('family-name').value = visa.family_name;
  document.getElementById('visa-class').value = visa.visa_class_subclass;
  document.getElementById('visa-desc').value = visa.visa_description;
  document.getElementById('visa-status').value = visa.visa_status;
  document.getElementById('applicant-status').value = visa.applicant_status;
  document.getElementById('grant-date').value = visa.grant_date || '';
  document.getElementById('expiry-date').value = visa.expiry_date || '';
  document.getElementById('arrival-deadline').value = visa.must_not_arrive_after || '';
  document.getElementById('period-stay').value = visa.period_of_stay;
  document.getElementById('entries').value = visa.entries_allowed;
  document.getElementById('location').value = visa.location_at_grant;
  document.getElementById('internal-notes').value = visa.internal_notes || '';
  
  // Arrays
  renderArray('work-ents', visa.work_entitlements);
  renderArray('study-ents', visa.study_entitlements);
  renderArray('conditions', visa.other_conditions);
  
  // Update UI
  document.getElementById('save-btn').textContent = 'Update Record';
  document.getElementById('delete-btn').hidden = false;
}

function renderArray(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = items.map(item => `
    <div class="array-item">
      <input type="text" value="${item}">
      <button type="button" class="quiet" onclick="this.parentElement.remove()">×</button>
    </div>
  `).join('');
}

function addArrayItem(containerId) {
  const container = document.getElementById(containerId);
  const div = document.createElement('div');
  div.className = 'array-item';
  div.innerHTML = `
    <input type="text" placeholder="Enter value...">
    <button type="button" class="quiet" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(div);
}

function resetForm() {
  visaForm.reset();
  document.getElementById('visa-id').value = '';
  document.getElementById('visa-version').value = '';
  document.getElementById('save-btn').textContent = 'Create Record';
  document.getElementById('delete-btn').hidden = true;
  currentVisa = null;
  
  // Reset arrays
  renderArray('work-ents', ['8105 - Work limitation (48 hours per fortnight during study session)']);
  renderArray('study-ents', ['8202 - Meet course requirements']);
  renderArray('conditions', ['8501 - Maintain adequate health insurance']);
}

function getArrayValues(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .array-item input`))
    .map(i => i.value.trim())
    .filter(v => v);
}

async function handleSaveVisa(e) {
  e.preventDefault();
  const id = document.getElementById('visa-id').value;
  const version = parseInt(document.getElementById('visa-version').value) || 0;
  
  const data = {
    reference_type: document.getElementById('ref-type').value,
    reference_number: document.getElementById('ref-number').value,
    passport_number: document.getElementById('passport').value,
    country_of_passport: document.getElementById('country').value,
    date_of_birth: document.getElementById('dob').value,
    given_names: document.getElementById('given-names').value,
    family_name: document.getElementById('family-name').value,
    visa_class_subclass: document.getElementById('visa-class').value,
    visa_description: document.getElementById('visa-desc').value,
    visa_status: document.getElementById('visa-status').value,
    applicant_status: document.getElementById('applicant-status').value,
    grant_date: document.getElementById('grant-date').value || null,
    expiry_date: document.getElementById('expiry-date').value || null,
    must_not_arrive_after: document.getElementById('arrival-deadline').value || null,
    period_of_stay: document.getElementById('period-stay').value || 'Until Visa Expiry',
    entries_allowed: document.getElementById('entries').value,
    location_at_grant: document.getElementById('location').value,
    work_entitlements: getArrayValues('work-ents'),
    study_entitlements: getArrayValues('study-ents'),
    other_conditions: getArrayValues('conditions'),
    internal_notes: document.getElementById('internal-notes').value
  };
  
  // Validate required
  if (!data.reference_number || !data.passport_number || !data.dob || !data.given_names || !data.family_name) {
    showMessage('Please fill in all required fields');
    return;
  }
  
  try {
    let res;
    if (id) {
      // Update
      res = await fetch(`${API_URL}/api/visas/${id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-Expected-Version': version.toString()
        },
        credentials: 'include',
        body: JSON.stringify(data)
      });
    } else {
      // Create
      res = await fetch(`${API_URL}/api/visas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
    }
    
    if (res.ok) {
      showMessage(id ? 'Visa updated' : 'Visa created');
      resetForm();
      switchTab('visas');
      loadVisas();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to save');
    }
  } catch (e) {
    showMessage('Network error');
  }
}

async function deleteVisa() {
  const id = document.getElementById('visa-id').value;
  if (!id) return;
  if (!confirm('Are you sure you want to delete this visa record?')) return;
  
  try {
    const res = await fetch(`${API_URL}/api/visas/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (res.ok) {
      showMessage('Visa deleted');
      resetForm();
      switchTab('visas');
      loadVisas();
    } else {
      const err = await res.json();
      showMessage(err.error || 'Failed to delete');
    }
  } catch (e) {
    showMessage('Network error');
  }
}

async function searchVisas() {
  const query = document.getElementById('search-input').value.toLowerCase();
  if (!query) {
    renderVisaList(visas);
    return;
  }
  
  const filtered = visas.filter(v => 
    v.given_names.toLowerCase().includes(query) ||
    v.family_name.toLowerCase().includes(query) ||
    v.passport_number.toLowerCase().includes(query) ||
    v.reference_number.toLowerCase().includes(query)
  );
  
  renderVisaList(filtered);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  renderVisaList(visas);
}

// Audit log
async function loadAudit() {
  try {
    const res = await fetch(`${API_URL}/api/audit`, { credentials: 'include' });
    const logs = await res.json();
    const container = document.getElementById('audit-list');
    
    if (!logs.length) {
      container.innerHTML = '<div class="empty-state">No audit logs yet</div>';
      return;
    }
    
    container.innerHTML = logs.map(log => `
      <div class="audit-entry">
        <div class="audit-header">
          <span class="audit-action">${log.action}</span>
          <span class="audit-time">${new Date(log.timestamp).toLocaleString()}</span>
        </div>
        <p>${log.message || ''}</p>
      </div>
    `).join('');
  } catch (e) {
    showMessage('Failed to load audit log');
  }
}

// Utility
function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.add('active');
  setTimeout(() => messageEl.classList.remove('active'), 3000);
}

// Start
init();