// Status Check Page JavaScript
(() => {
  'use strict';

  // DOM Elements
  const els = {
    form: document.getElementById('check-form'),
    reference: document.getElementById('reference'),
    statusResult: document.getElementById('status-result'),
    emptyState: document.getElementById('empty-state'),
    notFound: document.getElementById('not-found'),
    badge: document.getElementById('statusBadge'),
    refDisplay: document.getElementById('refDisplay'),
    submittedDate: document.getElementById('submittedDate'),
    lastUpdated: document.getElementById('lastUpdated'),
    timelineTrack: document.getElementById('timelineTrack'),
    visaType: document.getElementById('visaType'),
    processingTime: document.getElementById('processingTime'),
    applicantName: document.getElementById('applicantName'),
    statusMessage: document.getElementById('statusMessage'),
    updatesList: document.getElementById('updatesList'),
    lastChecked: document.getElementById('lastChecked'),
    refreshBtn: document.getElementById('refreshBtn'),
    liveIndicator: document.getElementById('liveIndicator')
  };

  let currentRef = null;
  let autoRefreshInterval = null;

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    // Check for ref in URL
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      els.reference.value = ref;
      checkStatus(ref);
    }

    // Form submission
    els.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const ref = els.reference.value.trim();
      if (ref) {
        checkStatus(ref);
        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('ref', ref);
        window.history.pushState({}, '', url);
      }
    });

    // Refresh button
    els.refreshBtn?.addEventListener('click', () => {
      if (currentRef) {
        refreshStatus();
      }
    });
  });

  async function checkStatus(ref) {
    currentRef = ref;
    
    // Show loading state
    els.form?.querySelector('button').classList.add('loading');
    
    try {
      // Try to get from local storage first (submitted applications)
      const stored = localStorage.getItem('visaApplication_' + ref);
      
      if (stored) {
        const data = JSON.parse(stored);
        displayStatus(ref, data);
        startAutoRefresh(ref);
      } else {
        // Check if it's a mock/demo reference
        if (ref.toUpperCase().startsWith('VEVO-')) {
          // Generate mock data for demo
          const mockData = generateMockData(ref);
          displayStatus(ref, mockData);
        } else {
          showNotFound();
        }
      }
    } catch (error) {
      console.error('Error checking status:', error);
      showNotFound();
    } finally {
      els.form?.querySelector('button').classList.remove('loading');
    }
  }

  function displayStatus(ref, data) {
    // Hide empty state and not found
    els.emptyState.hidden = true;
    els.notFound.hidden = true;
    els.statusResult.hidden = false;
    els.liveIndicator.hidden = false;

    // Set status badge
    const status = data.status || 'Submitted';
    els.badge.className = 'status-badge ' + getStatusClass(status);
    els.badge.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">${status}</span>
    `;

    // Set metadata
    els.refDisplay.textContent = ref.toUpperCase();
    els.submittedDate.textContent = formatDate(data.submittedAt || new Date());
    els.lastUpdated.textContent = formatDateTime(data.lastSaved || new Date());

    // Set detail cards
    els.visaType.textContent = getVisaTypeName(data.visaType) || 'Visitor (600)';
    els.applicantName.textContent = data.givenName + ' ' + data.familyName || '-';
    
    // Calculate processing time
    const submitted = new Date(data.submittedAt || Date.now());
    const days = Math.floor((Date.now() - submitted) / (1000 * 60 * 60 * 24));
    els.processingTime.textContent = days === 0 ? 'Less than 1 day' : `${days} day${days > 1 ? 's' : ''}`;

    // Generate timeline
    renderTimeline(status);

    // Generate updates
    renderUpdates(data, status);

    // Update status message
    updateStatusMessage(status);

    // Update last checked
    updateLastChecked();
  }

  function renderTimeline(currentStatus) {
    const steps = [
      { id: 'submitted', label: 'Submitted', icon: '📝' },
      { id: 'received', label: 'Received', icon: '📥' },
      { id: 'assessment', label: 'Assessment', icon: '🔍' },
      { id: 'decision', label: 'Decision', icon: '✓' }
    ];

    const statusOrder = ['Submitted', 'Received', 'In progress', 'Approved', 'Rejected'];
    const currentIndex = statusOrder.indexOf(currentStatus);

    els.timelineTrack.innerHTML = steps.map((step, index) => {
      let state = '';
      if (index < currentIndex) {
        state = 'completed';
      } else if (index === currentIndex || (currentStatus === 'In progress' && index === 2)) {
        state = 'active';
      }
      
      return `
        <div class="timeline-step ${state}">
          <div class="timeline-icon">${state === 'completed' ? '✓' : step.icon}</div>
          <span class="timeline-label">${step.label}</span>
        </div>
      `;
    }).join('');
  }

  function renderUpdates(data, status) {
    const updates = [];
    
    // Add submission update
    updates.push({
      date: data.submittedAt || new Date(),
      title: 'Application Submitted',
      desc: 'Your visa application has been successfully submitted and is now being processed.'
    });

    // Add status updates based on current status
    if (status === 'In progress' || status === 'Approved' || status === 'Rejected') {
      const progressDate = new Date(data.submittedAt || Date.now());
      progressDate.setDate(progressDate.getDate() + 2);
      
      updates.push({
        date: progressDate.toISOString(),
        title: 'Under Assessment',
        desc: 'Your application is currently being reviewed by a case officer.'
      });
    }

    if (status === 'Approved') {
      const decisionDate = new Date(data.submittedAt || Date.now());
      decisionDate.setDate(decisionDate.getDate() + 5);
      
      updates.push({
        date: decisionDate.toISOString(),
        title: 'Visa Granted',
        desc: 'Congratulations! Your visa application has been approved. Please review your visa conditions.'
      });
    }

    if (status === 'Rejected') {
      const decisionDate = new Date(data.submittedAt || Date.now());
      decisionDate.setDate(decisionDate.getDate() + 5);
      
      updates.push({
        date: decisionDate.toISOString(),
        title: 'Application Finalised',
        desc: 'Your visa application has been assessed. Please check your email for the decision.'
      });
    }

    // Sort by date descending
    updates.reverse();

    els.updatesList.innerHTML = updates.map(update => {
      const date = new Date(update.date);
      return `
        <div class="update-item">
          <div class="update-date">
            <span class="day">${date.getDate()}</span>
            <span class="month">${date.toLocaleString('en-US', { month: 'short' })}</span>
          </div>
          <div class="update-content">
            <div class="update-title">${update.title}</div>
            <p class="update-desc">${update.desc}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateStatusMessage(status) {
    const messages = {
      'Submitted': 'Your application has been submitted and is awaiting initial processing.',
      'Received': 'We have received your application and assigned a case officer.',
      'In progress': 'Your application is currently under assessment. This may take several weeks.',
      'Approved': 'Your visa has been granted! Please check the VEVO Result page for detailed information.',
      'Rejected': 'Your application has been finalised. Please refer to your email for further details.'
    };

    const html = messages[status] || messages['Submitted'];
    
    if (status === 'Approved') {
      els.statusMessage.innerHTML = `
        <p>${html}</p>
        <button class="primary" onclick="location.href='vevo-result.html?ref=${currentRef}'" style="margin-top: 16px;">
          View VEVO Result
        </button>
      `;
    } else {
      els.statusMessage.innerHTML = `<p>${html}</p>`;
    }
  }

  function refreshStatus() {
    if (!currentRef) return;
    
    els.refreshBtn.classList.add('spinning');
    
    // Simulate network delay
    setTimeout(() => {
      checkStatus(currentRef);
      els.refreshBtn.classList.remove('spinning');
      
      // Visual feedback
      const originalText = els.lastChecked.textContent;
      els.lastChecked.innerHTML = '<span style="color: var(--accent);">Updated!</span>';
      setTimeout(() => {
        updateLastChecked();
      }, 2000);
    }, 800);
  }

  function startAutoRefresh(ref) {
    // Clear existing interval
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
    
    // Auto refresh every 30 seconds
    autoRefreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    }, 30000);
  }

  function updateLastChecked() {
    els.lastChecked.innerHTML = `Just now`;
  }

  function showNotFound() {
    els.emptyState.hidden = true;
    els.statusResult.hidden = true;
    els.notFound.hidden = false;
    els.liveIndicator.hidden = true;
  }

  function generateMockData(ref) {
    // Generate consistent mock data based on ref
    const hash = ref.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const statuses = ['Submitted', 'Received', 'In progress', 'Approved', 'Rejected'];
    const status = statuses[hash % statuses.length];
    
    const submitted = new Date();
    submitted.setDate(submitted.getDate() - (hash % 14));
    
    return {
      givenName: 'John',
      familyName: 'Smith',
      visaType: hash % 2 === 0 ? 'visitor' : 'student',
      status: status,
      submittedAt: submitted.toISOString(),
      lastSaved: new Date().toISOString()
    };
  }

  function getStatusClass(status) {
    const map = {
      'Submitted': 'submitted',
      'Received': 'submitted',
      'In progress': 'in-progress',
      'Approved': 'approved',
      'Rejected': 'rejected'
    };
    return map[status] || 'submitted';
  }

  function getVisaTypeName(type) {
    const map = {
      'visitor': 'Visitor (Subclass 600)',
      'student': 'Student (Subclass 500)',
      'work': 'Work (Subclass 482)',
      'family': 'Partner (Subclass 820)'
    };
    return map[type] || type;
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
  });
})();