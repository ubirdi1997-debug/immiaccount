// Visa Application Flow Controller
(() => {
  'use strict';

  let currentStep = 1;
  const totalSteps = 5;
  const formData = loadFromStorage() || {};

  // Country list for dropdowns
  const countries = [
    'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Armenia', 'Australia',
    'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Belarus',
    'Belgium', 'Benin', 'Bhutan', 'Bolivia', 'Botswana', 'Brazil',
    'Brunei', 'Bulgaria', 'Cambodia', 'Cameroon', 'Canada', 'Chile',
    'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
    'Czech Republic', 'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt',
    'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France',
    'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Haiti',
    'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'India', 'Indonesia',
    'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan',
    'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Laos', 'Latvia',
    'Lebanon', 'Libya', 'Lithuania', 'Luxembourg', 'Macau', 'Madagascar',
    'Malaysia', 'Maldives', 'Malta', 'Mauritius', 'Mexico', 'Mongolia',
    'Morocco', 'Myanmar', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
    'Nigeria', 'North Korea', 'Norway', 'Oman', 'Pakistan', 'Panama',
    'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland',
    'Portugal', 'Qatar', 'Romania', 'Russia', 'Saudi Arabia', 'Senegal',
    'Serbia', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa',
    'South Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland',
    'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Tunisia',
    'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela',
    'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
  ];

  // DOM Elements
  const els = {
    progressBar: document.getElementById('progressBar'),
    stepLabel: document.getElementById('stepLabel'),
    currentStep: document.getElementById('currentStep'),
    autosave: document.getElementById('autosave'),
    autosaveTime: document.getElementById('autosaveTime'),
    declaration: document.getElementById('declaration'),
    submitBtn: document.querySelector('.submit-btn'),
    appRef: document.getElementById('appRef')
  };

  const stepLabels = [
    'Personal Information',
    'Passport Details',
    'Contact Information',
    'Visa Details',
    'Review & Submit'
  ];

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    populateCountryDropdowns();
    bindEvents();
    loadSavedData();
    updateProgress();
    populateReview();
    
    // Auto-save every 30 seconds
    setInterval(autoSave, 30000);
    
    // Show saved draft if exists
    if (formData.lastSaved) {
      showAutosave('Draft loaded from ' + formatTime(formData.lastSaved));
    }
  });

  function populateCountryDropdowns() {
    const selects = document.querySelectorAll('#cob, #passportCountry');
    selects.forEach(select => {
      countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
      });
    });
  }

  function bindEvents() {
    // Visa card selection
    document.querySelectorAll('.visa-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.visa-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.querySelector('.visa-details').hidden = false;
        formData.visaType = card.dataset.visa;
        saveToStorage();
      });
    });

    // Input change events
    document.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('change', () => {
        formData[input.id] = input.value;
        if (input.type === 'checkbox') {
          formData[input.id] = input.checked;
        }
        saveToStorage();
        populateReview();
      });
      
      input.addEventListener('input', () => {
        formData[input.id] = input.value;
      });
    });

    // Declaration checkbox
    if (els.declaration) {
      els.declaration.addEventListener('change', () => {
        if (els.submitBtn) {
          els.submitBtn.disabled = !els.declaration.checked;
        }
      });
    }

    // File upload
    const fileInput = document.getElementById('passportUpload');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          showAutosave(`Passport file: ${file.name}`);
        }
      });
    }
  }

  function loadSavedData() {
    Object.entries(formData).forEach(([key, value]) => {
      const input = document.getElementById(key);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = value;
        } else {
          input.value = value;
        }
      }
    });
    
    // Restore visa type selection
    if (formData.visaType) {
      const card = document.querySelector(`[data-visa="${formData.visaType}"]`);
      if (card) {
        card.classList.add('selected');
        document.querySelector('.visa-details').hidden = false;
      }
    }
    
    // Update submit button state
    if (els.declaration && els.submitBtn) {
      els.submitBtn.disabled = !els.declaration.checked;
    }
  }

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem('visaApplication');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  function saveToStorage() {
    try {
      formData.lastSaved = new Date().toISOString();
      localStorage.setItem('visaApplication', JSON.stringify(formData));
    } catch (e) {
      console.error('Failed to save:', e);
    }
  }

  function autoSave() {
    saveToStorage();
    showAutosave('Auto-saved');
  }

  function showAutosave(message) {
    if (!els.autosave) return;
    els.autosave.querySelector('.autosave-text').textContent = message;
    els.autosaveTime.textContent = formatTime(new Date());
    els.autosave.classList.add('visible');
    
    setTimeout(() => {
      els.autosave.classList.remove('visible');
    }, 3000);
  }

  function formatTime(date) {
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Navigation functions (exposed globally for onclick)
  window.nextStep = function() {
    if (currentStep < totalSteps) {
      if (!validateStep(currentStep)) {
        showError('Please fill in all required fields');
        return;
      }
      currentStep++;
      showStep(currentStep);
      updateProgress();
    }
  };

  window.prevStep = function() {
    if (currentStep > 1) {
      currentStep--;
      showStep(currentStep);
      updateProgress();
    }
  };

  window.goToStep = function(step) {
    currentStep = step;
    showStep(step);
    updateProgress();
  };

  window.saveDraft = function() {
    saveToStorage();
    showAutosave('Draft saved');
    
    // Visual feedback
    const btn = document.querySelector('button[onclick="saveDraft()"]');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = '✓ Saved';
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    }
  };

  window.submitApplication = function() {
    if (!validateStep(5)) {
      return;
    }
    
    // Generate application reference
    const ref = 'VEVO-' + new Date().getFullYear() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (els.appRef) {
      els.appRef.textContent = ref;
    }
    
    // Save final submission
    formData.applicationRef = ref;
    formData.submittedAt = new Date().toISOString();
    formData.status = 'Submitted';
    localStorage.setItem('visaApplication_' + ref, JSON.stringify(formData));
    
    // Clear draft
    localStorage.removeItem('visaApplication');
    
    // Show success
    showStep('success');
    document.querySelector('.progress-container').style.display = 'none';
    document.querySelector('.step-indicator').style.display = 'none';
  };

  function showStep(step) {
    document.querySelectorAll('.step-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    
    if (step === 'success') {
      document.querySelector('[data-step="success"]').classList.add('active');
    } else {
      const panel = document.querySelector(`[data-step="${step}"]`);
      if (panel) {
        panel.classList.add('active');
      }
    }
    
    // Update step indicators
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
      dot.classList.remove('active', 'completed');
      if (index + 1 < step) {
        dot.classList.add('completed');
      } else if (index + 1 === step) {
        dot.classList.add('active');
      }
    });
    
    document.querySelectorAll('.step-line').forEach((line, index) => {
      line.classList.remove('completed');
      if (index + 1 < step) {
        line.classList.add('completed');
      }
    });
  }

  function updateProgress() {
    if (els.progressBar) {
      els.progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
    }
    if (els.stepLabel) {
      els.stepLabel.textContent = stepLabels[currentStep - 1] || '';
    }
    if (els.currentStep) {
      els.currentStep.textContent = currentStep;
    }
  }

  function validateStep(step) {
    const panel = document.querySelector(`[data-step="${step}"]`);
    if (!panel) return true;
    
    const required = panel.querySelectorAll('[required]');
    let valid = true;
    
    required.forEach(input => {
      if (!input.value || (input.type === 'checkbox' && !input.checked)) {
        input.style.borderColor = '#e74c3c';
        valid = false;
        
        // Remove error styling on input
        input.addEventListener('input', function removeError() {
          input.style.borderColor = '';
          input.removeEventListener('input', removeError);
        }, { once: true });
      }
    });
    
    return valid;
  }

  function showError(message) {
    // Create or update error message
    let errorEl = document.getElementById('step-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'step-error';
      errorEl.style.cssText = 'background: #fee; color: #c33; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 14px;';
      const activePanel = document.querySelector('.step-panel.active');
      if (activePanel) {
        activePanel.querySelector('.step-card').insertBefore(errorEl, activePanel.querySelector('.step-actions'));
      }
    }
    errorEl.textContent = message;
    
    setTimeout(() => {
      if (errorEl.parentNode) {
        errorEl.parentNode.removeChild(errorEl);
      }
    }, 5000);
  }

  function populateReview() {
    // Personal
    const personal = document.getElementById('reviewPersonal');
    if (personal) {
      personal.innerHTML = `
        <div class="review-item"><div class="review-label">Given Names</div><div class="review-value">${formData.givenName || '-'}</div></div>
        <div class="review-item"><div class="review-label">Family Name</div><div class="review-value">${formData.familyName || '-'}</div></div>
        <div class="review-item"><div class="review-label">Date of Birth</div><div class="review-value">${formData.dob || '-'}</div></div>
        <div class="review-item"><div class="review-label">Country of Birth</div><div class="review-value">${formData.cob || '-'}</div></div>
      `;
    }
    
    // Passport
    const passport = document.getElementById('reviewPassport');
    if (passport) {
      passport.innerHTML = `
        <div class="review-item"><div class="review-label">Passport Number</div><div class="review-value">${formData.passportNumber || '-'}</div></div>
        <div class="review-item"><div class="review-label">Country</div><div class="review-value">${formData.passportCountry || '-'}</div></div>
        <div class="review-item"><div class="review-label">Date of Issue</div><div class="review-value">${formData.passportIssue || '-'}</div></div>
        <div class="review-item"><div class="review-label">Date of Expiry</div><div class="review-value">${formData.passportExpiry || '-'}</div></div>
      `;
    }
    
    // Contact
    const contact = document.getElementById('reviewContact');
    if (contact) {
      contact.innerHTML = `
        <div class="review-item"><div class="review-label">Email</div><div class="review-value">${formData.email || '-'}</div></div>
        <div class="review-item full-width"><div class="review-label">Phone</div><div class="review-value">${(formData.phoneCountry || '') + ' ' + (formData.phone || '')}</div></div>
        <div class="review-item full-width"><div class="review-label">Address</div><div class="review-value">${formData.address || '-'}</div></div>
      `;
    }
    
    // Visa
    const visa = document.getElementById('reviewVisa');
    if (visa) {
      const visaNames = {
        visitor: 'Visitor Visa',
        student: 'Student Visa',
        work: 'Work Visa',
        family: 'Family Visa'
      };
      visa.innerHTML = `
        <div class="review-item"><div class="review-label">Visa Type</div><div class="review-value">${visaNames[formData.visaType] || '-'}</div></div>
        <div class="review-item"><div class="review-label">Subclass</div><div class="review-value">${formData.visaSubclass || '-'}</div></div>
        <div class="review-item"><div class="review-label">TRN</div><div class="review-value">${formData.trn || '-'}</div></div>
      `;
    }
  }
})();