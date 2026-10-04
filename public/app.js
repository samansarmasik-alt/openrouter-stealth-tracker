let lastKnownModelIds = new Set();
let isFirstLoad = true;

// Synthesize an alert chime using Web Audio API
function playAlertBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.15); // E6

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.log('Audio notification blocked or unsupported:', e);
  }
}

// Format relative time in Turkish
function formatTimeAgo(isoString) {
  if (!isoString) return '--';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 5) return 'Az önce';
  if (diffSec < 60) return `${diffSec} sn önce`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  return new Date(isoString).toLocaleTimeString('tr-TR');
}

// Fetch and render data
async function updateRadar() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('API Hatası');
    const data = await res.json();

    // API Status badge
    const badge = document.getElementById('api-status');
    if (data.stats.apiStatus === 'ONLINE') {
      badge.textContent = 'ONLINE (RADAR AKTİF)';
      badge.className = 'badge online';
    } else {
      badge.textContent = `HATA (${data.stats.lastError || 'Bilinmiyor'})`;
      badge.className = 'badge error';
    }

    // Metrics
    document.getElementById('active-count').textContent = data.activeStealthModels.length;
    document.getElementById('active-badge').textContent = `${data.activeStealthModels.length} Model`;
    document.getElementById('total-count').textContent = data.totalModelsTracked;
    document.getElementById('last-checked').textContent = formatTimeAgo(data.lastCheckedAt);
    document.getElementById('latency-text').textContent = `${data.stats.lastLatencyMs} ms gecikme (${data.stats.checkCount} tarama)`;

    // Check for NEW model alerts
    const currentIds = new Set(data.activeStealthModels.map(m => m.id));
    if (!isFirstLoad) {
      for (const id of currentIds) {
        if (!lastKnownModelIds.has(id)) {
          // Brand new model detected!
          playAlertBeep();
          showAlertBanner(id, data.activeStealthModels.find(m => m.id === id));
        }
      }
    }
    lastKnownModelIds = currentIds;
    isFirstLoad = false;

    // Check recent alerts from server
    if (data.alerts && data.alerts.length > 0) {
      const latest = data.alerts[0];
      showAlertBanner(latest.id, latest);
    }

    // Render active models
    renderActiveModels(data.activeStealthModels);

    // Render history
    renderHistory(data.history);

    // Render logs
    renderLogs(data.alerts);

  } catch (err) {
    console.error('Radar güncelleme hatası:', err);
    document.getElementById('api-status').textContent = 'BAĞLANTI KESİLDİ';
    document.getElementById('api-status').className = 'badge error';
  }
}

function showAlertBanner(id, model) {
  const alertBox = document.getElementById('new-model-alert');
  const alertContent = document.getElementById('alert-content');
  alertBox.classList.remove('hidden');

  alertContent.innerHTML = `
    <strong>Model ID:</strong> <code>${id}</code><br>
    <strong>İsim:</strong> ${model?.name || id}<br>
    <strong>Bağlam:</strong> ${model?.context_length ? model.context_length.toLocaleString() + ' tokens' : 'N/A'}<br>
    <strong>Fiyat:</strong> Prompt: $${model?.pricing?.prompt || 0} / Comp: $${model?.pricing?.completion || 0}
  `;
}

function renderActiveModels(models) {
  const container = document.getElementById('active-list');
  if (!models || models.length === 0) {
    container.innerHTML = '<div class="log-entry empty">Şu anda OpenRouter API üzerinde yayında aktif bir stealth model bulunamadı (Taramalar devam ediyor).</div>';
    return;
  }

  container.innerHTML = models.map(m => `
    <div class="model-card">
      <div class="model-title-row">
        <span class="model-id">${m.name} (<code>${m.id}</code>)</span>
        <span class="model-tag">CANLI TEST</span>
      </div>
      <div class="model-meta">
        <span class="meta-item">Bağlam: <strong>${(m.context_length || 0).toLocaleString()} token</strong></span>
        <span class="meta-item">Giriş Fiyatı: <strong>$${m.pricing?.prompt || 0} / 1M</strong></span>
        <span class="meta-item">Çıkış Fiyatı: <strong>$${m.pricing?.completion || 0} / 1M</strong></span>
        <span class="meta-item">Mod: <strong>${m.pricing?.prompt === 0 ? 'ÜCRETSİZ ÖNİZLEME' : 'ÜCRETLİ'}</strong></span>
      </div>
    </div>
  `).join('');
}

function renderHistory(history) {
  const tbody = document.getElementById('history-body');
  if (!history || history.length === 0) return;

  tbody.innerHTML = history.map(item => `
    <tr>
      <td><strong>${item.name || item.id}</strong><br><small style="color:#666">${item.id}</small></td>
      <td>${item.firstSeen ? new Date(item.firstSeen).toLocaleDateString('tr-TR') : '--'}</td>
      <td>${item.interval || '--'}</td>
      <td>${item.note || 'Stealth test sürümü'}</td>
    </tr>
  `).join('');
}

function renderLogs(alerts) {
  const container = document.getElementById('events-log');
  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<div class="log-entry empty">Henüz oturum içinde yeni model tetiklenmedi. 30 saniyede bir taranıyor.</div>';
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="log-entry alert">
      [${new Date(a.detectedAt).toLocaleTimeString('tr-TR')}] YENİ MODEL: ${a.id} (${(a.context || 0).toLocaleString()} tokens)
    </div>
  `).join('');
}

async function triggerManualScan() {
  const btn = document.getElementById('btn-scan');
  btn.disabled = true;
  btn.textContent = 'TARANIYOR...';

  try {
    const res = await fetch('/api/check', { method: 'POST' });
    const result = await res.json();
    await updateRadar();
  } catch (err) {
    alert('Manuel tarama hatası: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ŞİMDİ TARA';
  }
}

// Request notification permission if user clicks anywhere
document.addEventListener('click', () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, { once: true });

// Initial load + interval polling
updateRadar();
setInterval(updateRadar, 10000); // UI updates every 10 seconds
