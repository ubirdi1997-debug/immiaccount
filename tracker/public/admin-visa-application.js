// Admin Visa Application Wizard - Connects to Tracker API
'use strict';

// Field specification matching the tracker
const fieldSpec = [
  ['name', 'Full name', 'text', true],
  ['dob', 'Date of birth', 'date', true],
  ['passport', 'Passport (or other travel document) number', 'text', true],
  ['country', 'Passport (or other travel document) country', 'text', true],
  ['trn', 'Transaction reference number (TRN)', 'text', true],
  ['applicationId', 'Application ID', 'text', false],
  ['visa', 'Visa / subclass', 'text', false],
  ['grantDate', 'Date of grant', 'date', false],
  ['grantNumber', 'Visa grant number', 'text', false],
  ['arrivalDeadline', 'Must not arrive after', 'date', false],
  ['lengthOfStay', 'Length of stay', 'text', false],
  ['travel', 'Travel', 'text', false],
  ['conditions', 'Visa conditions', 'textarea', false],
  ['note', 'Message to applicant', 'textarea', false]
];

// State
let csrf = null;
let currentStep = 1;
const totalSteps = 5;
const STORAGE_KEY = 'admin-visa-draft';

// DOM helpers
const $ = id => document.getElementById(id);
const notify = (text = '', error = false) => {
  const msg = $('message');
  msg.textContent = text;
  msg.className = error ? 'error' : text ? 'success' : '';
  if (text) setTimeout(() => { msg.textContent = ''; msg.className = ''; }, 5000);
};

// API helper - matches app.js pattern
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    if (response.status === 401) {
      showLoginRequired();
    }
    throw new Error(data.error || 'Request failed.');
  }
  
  return data;
}

// Check authentication
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    if (response.status === 401) {
      showLoginRequired();
      return null;
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    
    if (data.account.role !== 'admin') {
      showLoginRequired();
      notify('Administrator access required.', true);
      return null;
    }
    
    csrf = data.csrf;
    $('identity').textContent = `${data.account.login} · Administrator`;
    $('session').hidden = false;
    
    return data.account;
  } catch (e) {
    showLoginRequired();
    return null;
  }
}

function showLoginRequired() {
  $('login-required').hidden = false;
  $('admin-content').hidden = true;
}

function showAdminContent() {
  $('login-required').hidden = true;
  $('admin-content').hidden = false;
}

// Navigation
function setStep(step) {
  // Validate current step before moving forward
  if (step > currentStep && !validateStep(currentStep)) {
    return;
  }
  
  // Hide all steps
  document.querySelectorAll('.wizard-step').forEach(el => {
    if (el.dataset.step !== 'success') el.hidden = true;
  });
  
  // Show new step
  const target = document.querySelector(`.wizard-step[data-step="${step}"]`);
  if (target) target.hidden = false;
  
  // Update progress
  document.querySelectorAll('.step-indicator').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    const stepNum = i + 1;
    if (stepNum === step) el.classList.add('active');
    if (stepNum < step) el.classList.add('completed');
  });
  
  currentStep = step;
  
  // Populate review on step 5
  if (step === 5) populateReview();
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Save draft
  saveDraft();
}

function validateStep(step) {
  const stepEl = document.querySelector(`.wizard-step[data-step="${step}"]`);
  if (!stepEl) return true;
  
  const required = stepEl.querySelectorAll('[required]');
  let valid = true;
  
  required.forEach(field => {
    if (!field.value.trim()) {
      field.classList.add('invalid');
      valid = false;
    } else {
      field.classList.remove('invalid');
    }
  });
  
  if (!valid) {
    notify('Please fill in all required fields.', true);
  }
  
  return valid;
}

function populateReview() {
  const data = collectData();
  const review = $('reviewContent');
  
  review.innerHTML = `
    <div class="review-section">
      <h3>Account Access</h3>
      <div class="review-row"><span>Login ID:</span><code>${escapeHtml(data.login)}</code></div>
      <div class="review-row"><span>Password:</span><code>••••••••••••</code></div>
    </div>
    
    <div class="review-section">
      <h3>Personal Information</h3>
      <div class="review-row"><span>Full name:</span><span>${escapeHtml(data.record.name)}</span></div>
      <div class="review-row"><span>Date of birth:</span><span>${formatDate(data.record.dob)}</span></div>
    </div>
    
    <div class="review-section">
      <h3>Passport Details</h3>
      <div class="review-row"><span>Passport number:</span><code>${escapeHtml(data.record.passport)}</code></div>
      <div class="review-row"><span>Country:</span><span>${escapeHtml(data.record.country)}</span></div>
      <div class="review-row"><span>TRN:</span><code>${escapeHtml(data.record.trn)}</code></div>
      ${data.record.applicationId ? `<div class="review-row"><span>Application ID:</span><code>${escapeHtml(data.record.applicationId)}</code></div>` : ''}
    </div>
    
${Object.entries(data.record).filter(([k, v]) => v && !['name', 'dob', 'passport', 'country', 'trn', 'applicationId'].includes(k)).length ? `
    <div class="review-section">
      <h3>Visa Details</h3>
      ${data.record.visa ? `<div class="review-row"><span>Visa / Subclass:</span><span>${escapeHtml(data.record.visa)}</span></div>` : ''}
      ${data.record.grantDate ? `<div class="review-row"><span>Date of grant:</span><span>${formatDate(data.record.grantDate)}</span></div>` : ''}
      ${data.record.grantNumber ? `<div class="review-row"><span>Grant number:</span><code>${escapeHtml(data.record.grantNumber)}</code></div>` : ''}
      ${data.record.lengthOfStay ? `<div class="review-row"><span>Length of stay:</span><span>${escapeHtml(data.record.lengthOfStay)}</span></div>` : ''}
      ${data.record.conditions ? `<div class="review-row"><span>Conditions:</span><pre>${escapeHtml(data.record.conditions)}</pre></div>` : ''}
      ${data.record.note ? `<div class="review-row"><span>Message to applicant:</span><blockquote>${escapeHtml(data.record.note)}</blockquote></div>` : ''}
    </div>
` : ''}
  `;
}

function collectData() {
  const record = {};
  fieldSpec.forEach(([key]) => {
    record[key] = $(key)?.value?.trim() || '';
  });
  
  return {
    login: $('login').value.trim(),
    password: $('password').value,
    record
  };
}

// Draft persistence
function saveDraft() {
  const data = collectData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...data,
    step: currentStep,
    savedAt: new Date().toISOString()
  }));
  
  showAutosave();
}

function loadDraft() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return false;
  
  try {
    const data = JSON.parse(saved);
    
    // Restore fields
    if (data.login) $('login').value = data.login;
    if (data.record) {
      Object.entries(data.record).forEach(([key, value]) => {
        const el = $(key);
        if (el) el.value = value;
      });
    }
    
    // Restore step
    if (data.step && data.step <= totalSteps) {
      // Stay on step 1 initially, but saved draft is there
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

function clearDraft() {
  localStorage.removeItem(STORAGE_KEY);
}

function showAutosave() {
  const el = $('autosave');
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2000);
}

// Submit
async function submitApplication() {
  const btn = $('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  
  try {
    const data = collectData();
    
    // Call API to create user
    const result = await api('/users', 'POST', data);
    
    // Show success
    clearDraft();
    $('successLogin').textContent = data.login;
    $('successPassword').textContent = data.password;
    
    document.querySelectorAll('.wizard-step').forEach(el => el.hidden = true);
    document.querySelector('.wizard-step[data-step="success"]').hidden = false;
    document.querySelectorAll('.step-indicator').forEach(el => el.classList.add('completed'));
    
    notify('Account created successfully!');
  } catch (e) {
    notify(e.message, true);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

// VEVO lookup
function openVevoLookup() {
  const trn = $('trn').value.trim();
  const passport = $('passport').value.trim();
  const country = $('country').value.trim();
  const dob = $('dob').value;
  
  // Build VEVO URL with pre-filled params if available
  const params = new URLSearchParams();
  if (trn) params.set('trn', trn);
  
  // Open VEVO proxy in new tab
  const vevoUrl = `https://vevo.usafe.in/evo/firstParty?actionType=query${params.toString() ? '&' + params.toString() : ''}`;
  window.open(vevoUrl, '_blank');
  
  notify('VEVO opened in new tab. Use the userscript to autofill details back to this form.');
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// Event handlers
document.addEventListener('DOMContentLoaded', async () => {
  // Check auth first
  const account = await checkAuth();
  if (!account) return;
  
  showAdminContent();
  loadDraft();
  
  // Set max date for DOB
  $('dob').max = new Date().toISOString().split('T')[0];
  
  // Navigation buttons
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => setStep(currentStep + 1));
  });
  
  document.querySelectorAll('[data-prev]').forEach(btn => {
    btn.addEventListener('click', () => setStep(currentStep - 1));
  });
  
  // Step indicators
  document.querySelectorAll('.step-indicator').forEach((el, i) => {
    el.addEventListener('click', () => {
      const targetStep = i + 1;
      if (targetStep < currentStep || validateStep(currentStep)) {
        setStep(targetStep);
      }
    });
  });
  
  // VEVO lookup button
  $('vevoLookup')?.addEventListener('click', openVevoLookup);
  
  // Confirm checkbox
  $('confirm')?.addEventListener('change', (e) => {
    $('submitBtn').disabled = !e.target.checked;
  });
  
  // Submit
  $('submitBtn')?.addEventListener('click', submitApplication);
  
  // Create another
  $('createAnother')?.addEventListener('click', () => {
    document.querySelector('form')?.reset();
    clearDraft();
    setStep(1);
  });
  
  // Logout
  $('logout')?.addEventListener('click', async () => {
    try {
      await api('/logout', 'POST', {});
      window.location.href = '/admin';
    } catch (e) {
      window.location.href = '/admin';
    }
  });
  
  // Autosave on input
  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', saveDraft);
  });
  
  // Validate on blur
  document.querySelectorAll('[required]').forEach(el => {
    el.addEventListener('blur', () => {
      if (!el.value.trim()) {
        el.classList.add('invalid');
      } else {
        el.classList.remove('invalid');
      }
    });
  });
});

// Listen for messages from userscript (VEVO autofill)
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  
  if (e.data?.type === 'vevo-fill') {
    const data = e.data.data;
    
    // Autofill form fields from VEVO data
    if (data.name) $('name').value = data.name;
    if (data.dob) $('dob').value = data.dob;
    if (data.passport) $('passport').value = data.passport;
    if (data.country) $('country').value = data.country;
    if (data.visa) $('visa').value = data.visa;
    if (data.grantDate) $('grantDate').value = data.grantDate;
    if (data.grantNumber) $('grantNumber').value = data.grantNumber;
    if (data.lengthOfStay) $('lengthOfStay').value = data.lengthOfStay;
    if (data.conditions) $('conditions').value = data.conditions;
    
    notify('Form autofilled from VEVO data');
    saveDraft();
  }
});