import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_SECONDS || '30', 10) * 1000;

// Keep-Alive / Anti-Sleep Configuration
// Render free tier 15 dakikada uykuya geçer. Varsayılan olarak 10 dakikada bir (600,000 ms)
// kendi public URL'ine HTTP GET /ping atarak Render'ın servisi kapatmasını önler.
const KEEP_ALIVE_INTERVAL_MS = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES || '10', 10) * 60 * 1000;
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || null;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store with JSON persistence fallback
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Known historic baseline
const HISTORIC_BASELINE = [
  { id: 'stealth/space-bunny-alpha', name: 'Space Bunny Alpha', firstSeen: '2026-09-23T00:00:00Z', interval: '7 gün', note: '1M Context, Free Preview (Bitiş: 5 Ekim 2026)' },
  { id: 'stealth/union-alpha', name: 'Union Alpha (Pareto)', firstSeen: '2026-09-16T00:00:00Z', interval: '27 gün', note: '262K Context, Unbiased.AI' },
  { id: 'stealth/ox-alpha', name: 'Ox Alpha (GLM-5.3-Flash)', firstSeen: '2026-08-20T00:00:00Z', interval: '114 gün', note: '1M Context Reasoning, Zhipu AI' },
  { id: 'stealth/owl-alpha', name: 'Owl Alpha (LongCat-2.0)', firstSeen: '2026-04-28T00:00:00Z', interval: '48 gün', note: '1M Context 1.6T MoE, Meituan' },
  { id: 'stealth/hunter-alpha', name: 'Hunter Alpha (MiMo-V2-Pro)', firstSeen: '2026-03-11T00:00:00Z', interval: '33 gün', note: 'Xiaomi AI Division' },
  { id: 'stealth/healer-alpha', name: 'Healer Alpha (MiMo-V2-Omni)', firstSeen: '2026-03-11T00:00:00Z', interval: 'Aynı Gün', note: 'Xiaomi AI Division' },
  { id: 'stealth/pony-alpha', name: 'Pony Alpha (GLM-5)', firstSeen: '2026-02-06T00:00:00Z', interval: '191 gün', note: 'Zhipu AI' },
  { id: 'stealth/horizon-alpha', name: 'Horizon Alpha / Beta', firstSeen: '2025-07-30T00:00:00Z', interval: '29 gün', note: 'GPT-5 Early Checkpoint' },
  { id: 'stealth/cypher-alpha', name: 'Cypher Alpha', firstSeen: '2025-07-01T00:00:00Z', interval: '82 gün', note: 'Anonymous Benchmark Build' },
  { id: 'stealth/optimus-alpha', name: 'Optimus Alpha', firstSeen: '2025-04-10T00:00:00Z', interval: '7 gün', note: 'GPT-4.1 Variant' },
  { id: 'stealth/quasar-alpha', name: 'Quasar Alpha', firstSeen: '2025-04-03T00:00:00Z', interval: 'Başlangıç', note: 'GPT-4.1 Early Build' }
];

let state = {
  lastCheckedAt: null,
  totalModelsTracked: 0,
  activeStealthModels: [],
  knownStealthIds: new Set(),
  alerts: [],
  keepAlive: {
    selfUrl: SELF_URL,
    lastPingAt: null,
    pingCount: 0,
    status: 'ACTIVE'
  },
  stats: {
    checkCount: 0,
    lastLatencyMs: 0,
    apiStatus: 'INITIALIZING',
    lastError: null
  }
};

// Load history
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const saved = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      saved.forEach(item => state.knownStealthIds.add(item.id));
      return saved;
    }
  } catch (err) {
    console.error('History yüklenirken hata:', err.message);
  }
  HISTORIC_BASELINE.forEach(item => state.knownStealthIds.add(item.id));
  saveHistory(HISTORIC_BASELINE);
  return [...HISTORIC_BASELINE];
}

let historyRecords = loadHistory();

function saveHistory(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('History kaydedilirken hata:', err.message);
  }
}

// Check if a model is stealth
function isStealthModel(model) {
  const id = (model.id || '').toLowerCase();
  const name = (model.name || '').toLowerCase();
  const desc = (model.description || '').toLowerCase();

  if (id.startsWith('stealth/') || id.includes('/stealth') || id.includes(':stealth')) {
    return true;
  }
  if (name.includes('stealth') || desc.includes('stealth model')) {
    return true;
  }
  if (model.provider && typeof model.provider === 'string' && model.provider.toLowerCase() === 'stealth') {
    return true;
  }
  return false;
}

// Send webhook notification
async function triggerNotifications(newModel) {
  const msg = `🚨 [OpenRouter Stealth Radar] YENİ STEALTH MODEL TESPİT EDİLDİ!\n\nModel ID: ${newModel.id}\nİsim: ${newModel.name || 'Bilinmiyor'}\nBağlam: ${newModel.context_length ? newModel.context_length.toLocaleString() + ' tokens' : 'N/A'}\nFiyat: Prompt $${newModel.pricing?.prompt || 0} / Completion $${newModel.pricing?.completion || 0}\nZaman: ${new Date().toISOString()}`;

  if (DISCORD_WEBHOOK_URL) {
    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: msg,
          embeds: [{
            title: `🕵️ Yeni Stealth Model: ${newModel.name || newModel.id}`,
            color: 0xff0055,
            fields: [
              { name: 'Model ID', value: `\`${newModel.id}\``, inline: true },
              { name: 'Context Length', value: `${newModel.context_length || 'N/A'}`, inline: true },
              { name: 'Pricing', value: `$${newModel.pricing?.prompt || 0} / $${newModel.pricing?.completion || 0}`, inline: true },
              { name: 'Detected At', value: new Date().toLocaleTimeString('tr-TR'), inline: true }
            ]
          }]
        })
      });
    } catch (err) {
      console.error('Discord bildirim hatası:', err.message);
    }
  }

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: msg
        })
      });
    } catch (err) {
      console.error('Telegram bildirim hatası:', err.message);
    }
  }
}

// Core scan function
async function scanOpenRouter() {
  const startTime = Date.now();
  state.stats.checkCount++;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'User-Agent': 'OpenRouter-Stealth-Radar/1.0 (+https://github.com/openrouter-stealth-tracker)'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API hata kodu: ${res.status}`);
    }

    const json = await res.json();
    const models = Array.isArray(json?.data) ? json.data : [];
    const latency = Date.now() - startTime;

    state.stats.lastLatencyMs = latency;
    state.stats.apiStatus = 'ONLINE';
    state.stats.lastError = null;
    state.totalModelsTracked = models.length;
    state.lastCheckedAt = new Date().toISOString();

    const currentlyActive = [];

    for (const m of models) {
      if (isStealthModel(m)) {
        currentlyActive.push({
          id: m.id,
          name: m.name || m.id,
          context_length: m.context_length || 0,
          pricing: m.pricing || {},
          description: m.description || '',
          architecture: m.architecture || {},
          top_provider: m.top_provider || null
        });

        // Brand new stealth model detected
        if (!state.knownStealthIds.has(m.id)) {
          state.knownStealthIds.add(m.id);
          const newAlert = {
            id: m.id,
            name: m.name || m.id,
            detectedAt: new Date().toISOString(),
            context: m.context_length,
            pricing: m.pricing
          };

          state.alerts.unshift(newAlert);
          if (state.alerts.length > 50) state.alerts.pop();

          historyRecords.unshift({
            id: m.id,
            name: m.name || m.id,
            firstSeen: new Date().toISOString(),
            interval: 'YENİ TESPİT',
            note: 'Otomatik radar tarafından yakalandı.'
          });
          saveHistory(historyRecords);

          console.log(`[ALERT] YENİ STEALTH MODEL BULUNDU: ${m.id}`);
          triggerNotifications(m);
        }
      }
    }

    state.activeStealthModels = currentlyActive;
    return { success: true, count: currentlyActive.length, total: models.length, latency };
  } catch (err) {
    state.stats.lastLatencyMs = Date.now() - startTime;
    state.stats.apiStatus = 'ERROR';
    state.stats.lastError = err.message;
    console.error(`[SCAN ERROR] ${err.message}`);
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------------
// SELF-PING / KEEP-ALIVE MECHANISM (Render Uyku Önleyici)
// -------------------------------------------------------------
async function pingSelf() {
  const targetUrl = state.keepAlive.selfUrl || `http://localhost:${PORT}`;
  try {
    const pingEndpoint = `${targetUrl.replace(/\/$/, '')}/ping`;
    const res = await fetch(pingEndpoint, { signal: AbortSignal.timeout(5000) });
    state.keepAlive.lastPingAt = new Date().toISOString();
    state.keepAlive.pingCount++;
    state.keepAlive.status = res.ok ? 'HEALTHY' : 'WARN';
    console.log(`[KEEP-ALIVE] Ping başarılı: ${pingEndpoint} (Toplam: ${state.keepAlive.pingCount})`);
  } catch (err) {
    console.log(`[KEEP-ALIVE] Ping uyarısı: ${err.message}`);
    state.keepAlive.status = 'PING_FAILED';
  }
}

// Ping and Health Routes
app.get('/ping', (req, res) => {
  res.json({
    status: 'pong',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'openrouter-stealth-radar'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    lastCheckedAt: state.lastCheckedAt,
    totalModelsTracked: state.totalModelsTracked,
    activeStealthModels: state.activeStealthModels,
    alerts: state.alerts,
    history: historyRecords,
    stats: state.stats,
    keepAlive: state.keepAlive,
    pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
    serverTime: new Date().toISOString()
  });
});

app.post('/api/check', async (req, res) => {
  const result = await scanOpenRouter();
  res.json(result);
});

// Periodic Workers
setInterval(scanOpenRouter, POLL_INTERVAL_MS);
setInterval(pingSelf, KEEP_ALIVE_INTERVAL_MS);

// Initial actions
scanOpenRouter().then(() => {
  console.log(`[INIT] İlk tarama tamamlandı. Taranan toplam model: ${state.totalModelsTracked}`);
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` OpenRouter Stealth Radar Başlatıldı!`);
  console.log(` Port: ${PORT}`);
  console.log(` Model Tarama Aralığı: ${POLL_INTERVAL_MS / 1000} saniye`);
  console.log(` Keep-Alive Self-Ping: ${KEEP_ALIVE_INTERVAL_MS / 60000} dakika`);
  if (SELF_URL) {
    console.log(` Self URL Algılandı: ${SELF_URL}`);
  } else {
    console.log(` Not: Render üzerinde otomatik SELF_URL (RENDER_EXTERNAL_URL) devreye girecektir.`);
  }
  console.log(`=========================================`);

  // İlk self-ping
  setTimeout(pingSelf, 5000);
});
