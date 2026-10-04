# 🕵️ OpenRouter Stealth Radar

OpenRouter'a sessizce eklenen, henüz ana arayüzde (UI) duyurulmamış gizli (**stealth / alpha**) yapay zeka modellerini doğrudan API seviyesinde saniyeler içinde yakalayan ultra-minimal ve canlı radar.

---

## ⚡ Özellikler

- **Ultra Hızlı API Taraması:** 30 saniyede bir `https://openrouter.ai/api/v1/models` endpoint'ini doğrudan sorgular. Model arayüze çıkmadan 2–6 saat önce tespit eder.
- **Canlı Alarm & Ses:** Yeni bir `stealth/*` modeli düştüğü anda tarayıcıda görsel alarm yanıp söner ve sesli uyarı (`Web Audio API`) çalar.
- **Render Anti-Sleep (Uyumama Garantisi):** Render ücretsiz planında servisler 15 dakika trafik almazsa uykuya geçer. Bu proje, Render'ın atadığı `RENDER_EXTERNAL_URL` adresine **her 10 dakikada bir otomatik HTTP GET /ping** atarak sitenin 7/24 uyanık kalmasını sağlar.
- **Sıfır Şişkinlik:** Saf HTML/CSS/JS (Vanilla) ve hafif Node.js Express altyapısı.
- **İsteğe Bağlı Bildirim:** Discord veya Telegram Webhook desteği.

---

## 🚀 Render'a 2 Dakikada Deploy Etme

### 1. GitHub'a Gönderin
Kendi terminalinizde bu proje klasöründeyken:
```bash
git init
git add .
git commit -m "feat: initial openrouter stealth radar"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADINIZ/openrouter-stealth-tracker.git
git push -u origin main
```

### 2. Render.com Üzerinde Kurulum
1. [dashboard.render.com](https://dashboard.render.com/) adresine gidin.
2. **New +** butonuna basıp **Web Service** seçin.
3. GitHub reponuzu bağlayın.
4. Ayarlar:
   - **Name:** `openrouter-stealth-radar`
   - **Language / Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
5. **Create Web Service** butonuna tıklayın!

> 💡 **Not:** Render servisinizi başlattığında otomatik olarak `RENDER_EXTERNAL_URL` çevre değişkenini tanımlar. Sunucu da bu URL'i algılayıp kendi kendine her 10 dakikada bir ping atarak uykuyu önler!

---

## ⚙️ Çevre Değişkenleri (İsteğe Bağlı)

İsterseniz Render panelindeki **Environment Variables** bölümüne şunları ekleyebilirsiniz:

| Değişken | Varsayılan | Açıklama |
| :--- | :--- | :--- |
| `POLL_INTERVAL_SECONDS` | `30` | API tarama sıklığı (saniye) |
| `KEEP_ALIVE_INTERVAL_MINUTES` | `10` | Kendi kendini pingleyip uyanık tutma sıklığı (dakika) |
| `DISCORD_WEBHOOK_URL` | *Yok* | Yeni model gelince Discord kanalına anında mesaj atar |
| `TELEGRAM_BOT_TOKEN` | *Yok* | Telegram bot tokeni |
| `TELEGRAM_CHAT_ID` | *Yok* | Telegram kanal/kullanıcı ID'si |

---

## 💻 Yerel Çalıştırma (Localhost)

```bash
cd openrouter-stealth-tracker
npm install
npm start
```
Tarayıcınızda: `http://localhost:3000`
