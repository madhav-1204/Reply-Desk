// Reply Desk - Frontend Application Logic

(function () {
  'use strict';

  // State
  const state = {
    currentView: 'reply',
    starRating: null,
    detectedSentiment: null,
    overrideSentiment: 'auto',
    length: 'short',
    tone: 'friendly',
    isGenerating: false,
    historyItems: [],
    profile: null,
    samples: []
  };

  // DOM Elements
  const elements = {
    // Nav
    navReply: document.getElementById('nav-reply'),
    navHistory: document.getElementById('nav-history'),
    navProfile: document.getElementById('nav-profile'),
    historyCount: document.getElementById('history-count'),
    views: {
      reply: document.getElementById('view-reply'),
      history: document.getElementById('view-history'),
      profile: document.getElementById('view-profile')
    },

    // Status & Banner
    statusDot: document.getElementById('status-dot'),
    statusModel: document.getElementById('status-model'),
    statusText: document.getElementById('status-text'),
    ollamaAlert: document.getElementById('ollama-alert'),
    ollamaAlertMsg: document.getElementById('ollama-alert-msg'),

    // Reply View Inputs
    sampleSelect: document.getElementById('sample-select'),
    starButtons: document.querySelectorAll('.star-btn'),
    starClearBtn: document.getElementById('star-clear-btn'),
    reviewInput: document.getElementById('review-input'),
    sentimentDot: document.getElementById('sentiment-dot'),
    sentimentName: document.getElementById('sentiment-name'),
    sentimentOverrideSelect: document.getElementById('sentiment-override-select'),
    lengthControl: document.getElementById('length-control'),
    toneControl: document.getElementById('tone-control'),
    btnGenerate: document.getElementById('btn-generate'),
    btnClear: document.getElementById('btn-clear'),

    // Reply View Outputs
    replyOutput: document.getElementById('reply-output'),
    btnRegenerate: document.getElementById('btn-regenerate'),
    btnCopy: document.getElementById('btn-copy'),
    copyText: document.getElementById('copy-text'),
    generatingOverlay: document.getElementById('generating-overlay'),
    replyStats: document.getElementById('reply-stats'),

    // History View
    historySearch: document.getElementById('history-search'),
    historyList: document.getElementById('history-list'),
    historyEmpty: document.getElementById('history-empty'),

    // Profile View
    profileForm: document.getElementById('profile-form'),
    profBizName: document.getElementById('prof-biz-name'),
    profBizType: document.getElementById('prof-biz-type'),
    profOwnerName: document.getElementById('prof-owner-name'),
    profSignoff: document.getElementById('prof-signoff'),
    profToneNotes: document.getElementById('prof-tone-notes'),
    profNeverSay: document.getElementById('prof-never-say'),
    profileSaveStatus: document.getElementById('profile-save-status')
  };

  // -------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------
  async function init() {
    setupNavigation();
    setupStarRating();
    setupControls();
    setupActions();
    setupProfileForm();
    setupHistory();

    await checkStatus();
    await loadProfile();
    await loadSamples();
    await refreshHistory();

    // Check status periodically every 15 seconds
    setInterval(checkStatus, 15000);
  }

  // -------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------
  function setupNavigation() {
    const navItems = [elements.navReply, elements.navHistory, elements.navProfile];

    navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        switchView(view);
      });
    });
  }

  function switchView(viewName) {
    state.currentView = viewName;

    // Update active nav button
    [elements.navReply, elements.navHistory, elements.navProfile].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update active panel
    Object.entries(elements.views).forEach(([name, panel]) => {
      panel.classList.toggle('active', name === viewName);
    });

    if (viewName === 'history') {
      refreshHistory();
    } else if (viewName === 'profile') {
      loadProfile();
    }
  }

  // -------------------------------------------------------------
  // Health & Status
  // -------------------------------------------------------------
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (res.ok && data.status === 'ok') {
        elements.statusDot.className = 'status-dot online';
        elements.statusModel.textContent = data.model || 'gemma3:1b';
        elements.statusText.textContent = 'Running offline';
        elements.ollamaAlert.style.display = 'none';
        elements.btnGenerate.disabled = false;
      } else {
        showOfflineAlert(data.error || 'Could not reach Ollama. Start it with: ollama serve');
      }
    } catch (err) {
      showOfflineAlert('Could not reach Ollama. Start it with: ollama serve');
    }
  }

  function showOfflineAlert(msg) {
    elements.statusDot.className = 'status-dot offline';
    elements.statusText.textContent = 'Offline';
    elements.ollamaAlertMsg.textContent = msg;
    elements.ollamaAlert.style.display = 'flex';
  }

  // -------------------------------------------------------------
  // Star Rating
  // -------------------------------------------------------------
  function setupStarRating() {
    elements.starButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const star = parseInt(btn.dataset.star, 10);
        setStarRating(star);
        detectSentimentDebounced();
      });
    });

    elements.starClearBtn.addEventListener('click', () => {
      setStarRating(null);
      detectSentimentDebounced();
    });
  }

  function setStarRating(rating) {
    state.starRating = rating;

    elements.starButtons.forEach(btn => {
      const starVal = parseInt(btn.dataset.star, 10);
      btn.classList.toggle('active', rating !== null && starVal <= rating);
    });

    elements.starClearBtn.style.display = rating !== null ? 'inline-block' : 'none';
  }

  // -------------------------------------------------------------
  // Sentiment Detection & Override
  // -------------------------------------------------------------
  let sentimentTimer = null;
  function detectSentimentDebounced() {
    clearTimeout(sentimentTimer);
    sentimentTimer = setTimeout(runSentimentDetection, 400);
  }

  async function runSentimentDetection() {
    const text = elements.reviewInput.value.trim();

    if (!text) {
      state.detectedSentiment = null;
      updateSentimentDisplay();
      return;
    }

    try {
      const res = await fetch('/api/sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText: text,
          starRating: state.starRating
        })
      });

      if (res.ok) {
        const data = await res.json();
        state.detectedSentiment = data.sentiment;
        updateSentimentDisplay();

        // If negative sentiment detected and tone hasn't been manually locked, suggest apologetic tone
        if (getEffectiveSentiment() === 'negative' && state.tone === 'friendly') {
          setTone('apologetic');
        }
      }
    } catch (err) {
      console.warn('Sentiment detection failed:', err);
    }
  }

  function getEffectiveSentiment() {
    if (state.overrideSentiment && state.overrideSentiment !== 'auto') {
      return state.overrideSentiment;
    }
    return state.detectedSentiment || 'neutral';
  }

  function updateSentimentDisplay() {
    const effective = getEffectiveSentiment();
    const hasInput = elements.reviewInput.value.trim().length > 0;

    if (!hasInput && !state.detectedSentiment) {
      elements.sentimentDot.className = 'sentiment-dot dot-neutral';
      elements.sentimentName.textContent = 'None';
      return;
    }

    elements.sentimentDot.className = `sentiment-dot dot-${effective}`;
    elements.sentimentName.textContent = effective.charAt(0).toUpperCase() + effective.slice(1);
  }

  // -------------------------------------------------------------
  // Controls (Length, Tone, Sentiment Override)
  // -------------------------------------------------------------
  function setupControls() {
    // Review text input listener
    elements.reviewInput.addEventListener('input', () => {
      detectSentimentDebounced();
    });

    // Sentiment override select
    elements.sentimentOverrideSelect.addEventListener('change', (e) => {
      state.overrideSentiment = e.target.value;
      updateSentimentDisplay();
      if (getEffectiveSentiment() === 'negative') {
        setTone('apologetic');
      }
    });

    // Length segmented control
    elements.lengthControl.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        elements.lengthControl.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.length = btn.dataset.value;
      });
    });

    // Tone segmented control
    elements.toneControl.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTone(btn.dataset.value);
      });
    });

    // Sample reviews selector
    elements.sampleSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      if (!selectedId) return;

      const sample = state.samples.find(s => s.id === selectedId);
      if (sample) {
        elements.reviewInput.value = sample.text;
        setStarRating(sample.stars);
        state.detectedSentiment = sample.sentiment;
        elements.sentimentOverrideSelect.value = 'auto';
        state.overrideSentiment = 'auto';
        updateSentimentDisplay();

        if (sample.sentiment === 'negative') {
          setTone('apologetic');
        } else if (sample.sentiment === 'positive') {
          setTone('friendly');
        } else {
          setTone('professional');
        }
      }
    });
  }

  function setTone(toneValue) {
    state.tone = toneValue;
    elements.toneControl.querySelectorAll('.segment-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.value === toneValue);
    });
  }

  // -------------------------------------------------------------
  // Reply Actions (Generate, Regenerate, Copy, Clear)
  // -------------------------------------------------------------
  function setupActions() {
    elements.btnGenerate.addEventListener('click', () => generateReply());
    elements.btnRegenerate.addEventListener('click', () => generateReply());

    elements.btnClear.addEventListener('click', () => {
      elements.reviewInput.value = '';
      elements.sampleSelect.value = '';
      setStarRating(null);
      state.detectedSentiment = null;
      updateSentimentDisplay();
      elements.replyOutput.value = '';
      elements.replyStats.textContent = '';
      elements.btnRegenerate.disabled = true;
      elements.btnCopy.disabled = true;
    });

    elements.btnCopy.addEventListener('click', async () => {
      const text = elements.replyOutput.value;
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        elements.copyText.textContent = 'Copied';
        setTimeout(() => {
          elements.copyText.textContent = 'Copy';
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        elements.replyOutput.select();
        document.execCommand('copy');
        elements.copyText.textContent = 'Copied';
        setTimeout(() => {
          elements.copyText.textContent = 'Copy';
        }, 2000);
      }
    });

    // Live stats on reply editing
    elements.replyOutput.addEventListener('input', updateReplyStats);
  }

  function updateReplyStats() {
    const text = elements.replyOutput.value.trim();
    if (!text) {
      elements.replyStats.textContent = '';
      return;
    }
    const words = text.split(/\s+/).filter(Boolean).length;
    elements.replyStats.textContent = `${words} words`;
  }

  // -------------------------------------------------------------
  // Reply Generation (SSE Streaming)
  // -------------------------------------------------------------
  async function generateReply() {
    const text = elements.reviewInput.value.trim();
    if (!text) {
      elements.reviewInput.focus();
      return;
    }

    if (state.isGenerating) return;
    setGeneratingState(true);

    elements.replyOutput.value = '';
    elements.replyStats.textContent = '';

    const payload = {
      reviewText: text,
      starRating: state.starRating,
      sentiment: getEffectiveSentiment(),
      tone: state.tone,
      length: state.length,
      stream: true
    };

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Generation failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.chunk) {
                elements.replyOutput.value += data.chunk;
                elements.replyOutput.scrollTop = elements.replyOutput.scrollHeight;
              }
              if (data.done) {
                elements.replyOutput.value = data.fullReply;
                updateReplyStats();
                await refreshHistory();
              }
            } catch (e) {
              // Ignore non-json lines
            }
          } else if (line.startsWith('event: error')) {
            throw new Error('Generation error occurred.');
          }
        }
      }
    } catch (err) {
      console.error('Generation error:', err);
      elements.replyOutput.value = `Error: ${err.message || 'Could not generate reply.'}\n\nMake sure Ollama is running: ollama serve`;
    } finally {
      setGeneratingState(false);
      updateReplyStats();
      elements.btnRegenerate.disabled = false;
      elements.btnCopy.disabled = !elements.replyOutput.value.trim();
    }
  }

  function setGeneratingState(isGenerating) {
    state.isGenerating = isGenerating;
    elements.btnGenerate.disabled = isGenerating;
    elements.generatingOverlay.style.display = isGenerating ? 'flex' : 'none';
  }

  // -------------------------------------------------------------
  // Samples Loading
  // -------------------------------------------------------------
  async function loadSamples() {
    try {
      const res = await fetch('/api/samples');
      if (res.ok) {
        state.samples = await res.json();
        elements.sampleSelect.innerHTML = '<option value="">Load a sample review...</option>';
        state.samples.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.stars ? s.stars + '★ ' : ''}${s.businessName} (${s.sentiment})`;
          elements.sampleSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not load sample reviews:', err);
    }
  }

  // -------------------------------------------------------------
  // Business Profile Form
  // -------------------------------------------------------------
  function setupProfileForm() {
    elements.profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const profileData = {
        businessName: elements.profBizName.value,
        businessType: elements.profBizType.value,
        ownerName: elements.profOwnerName.value,
        preferredSignoff: elements.profSignoff.value,
        toneNotes: elements.profToneNotes.value,
        neverSay: elements.profNeverSay.value
      };

      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileData)
        });

        if (res.ok) {
          state.profile = await res.json();
          elements.profileSaveStatus.textContent = 'Profile saved';
          setTimeout(() => {
            elements.profileSaveStatus.textContent = '';
          }, 2500);
        }
      } catch (err) {
        console.error('Failed to save profile:', err);
        elements.profileSaveStatus.textContent = 'Failed to save';
      }
    });
  }

  async function loadProfile() {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const profile = await res.json();
        state.profile = profile;

        elements.profBizName.value = profile.businessName || '';
        elements.profBizType.value = profile.businessType || '';
        elements.profOwnerName.value = profile.ownerName || '';
        elements.profSignoff.value = profile.preferredSignoff || '';
        elements.profToneNotes.value = profile.toneNotes || '';
        elements.profNeverSay.value = profile.neverSay || '';
      }
    } catch (err) {
      console.warn('Could not load profile:', err);
    }
  }

  // -------------------------------------------------------------
  // History View & Management
  // -------------------------------------------------------------
  function setupHistory() {
    let searchTimer = null;
    elements.historySearch.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        refreshHistory(e.target.value.trim());
      }, 300);
    });
  }

  async function refreshHistory(search = '') {
    try {
      const url = search ? `/api/history?q=${encodeURIComponent(search)}` : '/api/history';
      const res = await fetch(url);
      if (res.ok) {
        state.historyItems = await res.json();
        renderHistoryList(state.historyItems);
        elements.historyCount.textContent = state.historyItems.length;
      }
    } catch (err) {
      console.warn('Could not refresh history:', err);
    }
  }

  function renderHistoryList(items) {
    elements.historyList.innerHTML = '';

    if (!items || items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No past reviews recorded yet.';
      elements.historyList.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const stars = item.starRating ? '★'.repeat(item.starRating) : '';
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';

      const sentimentLabel = (item.sentiment || 'neutral').charAt(0).toUpperCase() + (item.sentiment || 'neutral').slice(1);

      card.innerHTML = `
        <div class="history-card-header">
          <div class="history-meta-left">
            <span class="sentiment-indicator">
              <span class="sentiment-dot dot-${item.sentiment || 'neutral'}"></span>
              <span>${sentimentLabel}</span>
            </span>
            ${stars ? `<span class="history-stars">${stars}</span>` : ''}
            <span>Tone: ${item.tone || 'Friendly'}</span>
          </div>
          <span class="history-date">${dateStr}</span>
        </div>
        <div class="history-card-body">
          <div class="history-section">
            <div class="history-section-title">Review</div>
            <div class="history-text">${escapeHtml(item.reviewText)}</div>
          </div>
          <div class="history-section">
            <div class="history-section-title">Reply</div>
            <div class="history-text">${escapeHtml(item.replyText)}</div>
          </div>
        </div>
        <div class="history-card-actions">
          <button type="button" class="btn btn-secondary btn-sm action-copy">Copy reply</button>
          <button type="button" class="btn btn-secondary btn-sm action-load">Load into editor</button>
          <button type="button" class="btn btn-secondary btn-sm action-delete">Delete</button>
        </div>
      `;

      // Copy action
      const copyBtn = card.querySelector('.action-copy');
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(item.replyText);
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy reply'; }, 1800);
      });

      // Load into editor action
      card.querySelector('.action-load').addEventListener('click', () => {
        elements.reviewInput.value = item.reviewText;
        setStarRating(item.starRating);
        state.detectedSentiment = item.sentiment;
        elements.sentimentOverrideSelect.value = 'auto';
        updateSentimentDisplay();
        setTone(item.tone || 'friendly');
        elements.replyOutput.value = item.replyText;
        updateReplyStats();
        elements.btnRegenerate.disabled = false;
        elements.btnCopy.disabled = false;
        switchView('reply');
      });

      // Delete action
      card.querySelector('.action-delete').addEventListener('click', async () => {
        try {
          const res = await fetch(`/api/history/${item.id}`, { method: 'DELETE' });
          if (res.ok) {
            refreshHistory(elements.historySearch.value.trim());
          }
        } catch (err) {
          console.error('Failed to delete history item:', err);
        }
      });

      elements.historyList.appendChild(card);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run on page load
  document.addEventListener('DOMContentLoaded', init);
})();
