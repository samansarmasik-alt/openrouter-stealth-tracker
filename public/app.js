let lastKnownModelIds = new Set();
let isFirstLoad = true;

// Gentle, soft non-intrusive notification chime (520Hz soft warm tone)
function playGentleChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, audioCtx.currentTime + 0.12); // E5

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

// Relative time formatting
function formatRelativeTime(isoString) {
  if (!isoString) return '--';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 5) return 'Az önce';
  if (diffSec < 60) return `${diffSec}s önce`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}d önce`;
  return new Date(isoString).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// Fetch and render data
async function updateRadar() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Top status pill
    const statusLabel = document.getElementById('status-label');
    const statusDot = document.querySelector('.status-dot');
    const latencyLabel = document.getElementById('latency-label');

    if (data.stats.apiStatus === 'ONLINE') {
      statusLabel.textContent = 'API Bağlı';
      statusDot.className = 'status-dot online';
      latencyLabel.textContent = `${data.stats.lastLatencyMs}ms`;
    } else {
      statusLabel.textContent = 'API Bağlantı Hatası';
      statusDot.className = 'status-dot error';
      latencyLabel.textContent = '--';
    }

    // Top Metrics
    document.getElementById('active-count').textContent = data.activeStealthModels.length;
    document.getElementById('active-badge').textContent = `${data.activeStealthModels.length} model aktif`;
    document.getElementById('total-count').textContent = (data.totalModelsTracked || 0).toLocaleString();
    document.getElementById('last-checked').textContent = formatRelativeTime(data.lastCheckedAt);
    document.getElementById('sync-subtext').textContent = `${data.stats.checkCount} tarama tamamlandı`;

    // Alert detection
    const currentIds = new Set(data.activeStealthModels.map(m => m.id));
    if (!isFirstLoad) {
      for (const id of currentIds) {
        if (!lastKnownModelIds.has(id)) {
          playGentleChime();
          const target = data.activeStealthModels.find(m => m.id === id);
          renderAlertBanner(id, target);
        }
      }
    }
    lastKnownModelIds = currentIds;
    isFirstLoad = false;

    // Check server alerts
    if (data.alerts && data.alerts.length > 0) {
      const latest = data.alerts[0];
      renderAlertBanner(latest.id, latest);
    }

    // Render active models
    renderActiveCards(data.activeStealthModels);

    // Render history table
    renderHistoryTable(data.history);

    // Render telemetry logs
    renderTelemetryLog(data.alerts);

  } catch (err) {
    console.error('Veri güncelleme hatası:', err.message);
    const statusLabel = document.getElementById('status-label');
    const statusDot = document.querySelector('.status-dot');
    if (statusLabel) statusLabel.textContent = 'Bağlantı Hatası';
    if (statusDot) statusDot.className = 'status-dot error';
  }
}

function renderAlertBanner(id, model) {
  const alertBox = document.getElementById('new-model-alert');
  const alertContent = document.getElementById('alert-content');
  alertBox.classList.remove('hidden');

  alertContent.innerHTML = `
    <strong>Yeni Pre-Release Model Tespit Edildi:</strong> <code>${id}</code>
    — Bağlam: ${(model?.context_length || model?.context || 0).toLocaleString()} token,
    Fiyat: $${model?.pricing?.prompt || 0}/1M prompt.
  `;
}

function renderActiveCards(models) {
  const container = document.getElementById('active-list');
  if (!models || models.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Şu anda OpenRouter API rotasında aktif bir pre-release model bulunmamaktadır.
        Arka plan taraması devam ediyor.
      </div>
    `;
    return;
  }

  container.innerHTML = models.map(m => `
    <article class="model-entry">
      <div class="model-entry-header">
        <div>
          <div class="model-entry-title">${m.name}</div>
          <div class="model-entry-id"><code>${m.id}</code></div>
        </div>
        <span class="chip-status">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: currentColor;"></span>
          Canlı Test Rotası
        </span>
      </div>

      <div class="model-specs-grid">
        <div class="spec-col">
          <span class="spec-key">Bağlam Penceresi</span>
          <span class="spec-val">${(m.context_length || 0).toLocaleString()} tokens</span>
        </div>
        <div class="spec-col">
          <span class="spec-key">Prompt Fiyatı</span>
          <span class="spec-val">$${m.pricing?.prompt || 0} / 1M</span>
        </div>
        <div class="spec-col">
          <span class="spec-key">Completion Fiyatı</span>
          <span class="spec-val">$${m.pricing?.completion || 0} / 1M</span>
        </div>
        <div class="spec-col">
          <span class="spec-key">Önizleme Durumu</span>
          <span class="spec-val" style="color: #10b981;">${m.pricing?.prompt === 0 ? 'Ücretsiz Kotada' : 'Ücretli Erişim'}</span>
        </div>
      </div>
    </article>
  `).join('');
}

function renderHistoryTable(history) {
  const tbody = document.getElementById('history-body');
  if (!history || history.length === 0) return;

  tbody.innerHTML = history.map(item => `
    <tr>
      <td>
        <strong>${item.name || item.id}</strong><br>
        <code>${item.id}</code>
      </td>
      <td>${item.firstSeen ? new Date(item.firstSeen).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}</td>
      <td class="td-interval">${item.interval || '--'}</td>
      <td>${item.note?.split(',')[1] || item.note?.split('(')[1]?.replace(')', '') || 'Doğrulanmış Model'}</td>
      <td>${item.note || '--'}</td>
    </tr>
  `).join('');
}

function renderTelemetryLog(alerts) {
  const container = document.getElementById('events-log');
  if (!alerts || alerts.length === 0) {
    container.innerHTML = `
      <div class="telemetry-row muted">
        API eşitleme döngüsü aktif. Son 466 model katalog karşılaştırmasında anomali tespit edilmedi.
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="telemetry-row alert">
      [${new Date(a.detectedAt).toLocaleTimeString('tr-TR')}] TESPİT EDİLDİ: ${a.id} (${(a.context || 0).toLocaleString()} token bağlamı)
    </div>
  `).join('');
}

async function triggerManualScan() {
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Eşitleniyor...';

  try {
    await fetch('/api/check', { method: 'POST' });
    await updateRadar();
  } catch (err) {
    console.error('Manuel tarama hatası:', err);
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Yenile';
  }
}

// Global click to enable web audio context
document.addEventListener('click', () => {
  // Unlocks browser audio policy
}, { once: true });

// Initial load + interval
updateRadar();
setInterval(updateRadar, 8000);
