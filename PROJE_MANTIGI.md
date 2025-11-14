# 🎬 Shorts Auto - Proje Çalışma Mantığı

## 📋 Genel Bakış

Bu proje, YouTube Shorts videolarını otomatik olarak üreten bir pipeline sistemidir. Baştan sona tüm süreci otomatikleştirir: topic seçiminden YouTube'a yüklemeye kadar.

---

## 🔄 Pipeline Adımları (Sıralı İşlem)

### 1️⃣ **Topic Generator** (`src/topic-generator.js`)
**Ne yapar?**
- Belirli bir kategori ve sayıda video konusu (topic) oluşturur
- Bu konuları `queue.json` dosyasına ekler
- Her topic'in durumu: `"queued"` (sırada)

**Örnek:**
```bash
node src/topic-generator.js --count=5 --category="islam-tarihi"
```
→ `queue.json` dosyasına 5 yeni topic eklenir

---

### 2️⃣ **Script Generator** (`src/script-generator.js`)
**Ne yapar?**
- `queue.json`'daki `"queued"` durumundaki topic'leri okur
- Her topic için OpenAI'a gidip **Türkçe YouTube Shorts scripti** oluşturur
- Script'i `pipeline/scripts/{id}.json` dosyasına kaydeder
- Queue'daki topic'in durumunu `"scripted"` yapar

**Oluşturulan Script Yapısı:**
```json
{
  "id": "topic-123",
  "script": "Giriş cümlesi... 3 hızlı gerçek... CTA",
  "bullets": ["Giriş", "Gerçek 1", "Gerçek 2", "Gerçek 3", "CTA"],
  "recommendedVoiceSpeed": "fast"
}
```

---

### 3️⃣ **TTS Generator** (`src/tts-generator.js`)
**Ne yapar?**
- `pipeline/scripts/` klasöründeki script'leri okur
- Her script için OpenAI TTS API'sini kullanarak **ses dosyası** oluşturur
- Ses dosyasını `pipeline/audio/{id}.mp3` olarak kaydeder
- Script dosyasına `audioPath` ekler ve durumu `"voiced"` yapar

**Çıktı:**
- `pipeline/audio/topic-123.mp3` (ses dosyası)
- `pipeline/audio/topic-123.json` (ses metadata'sı)

---

### 4️⃣ **Video Renderer** (`pipeline/video_renderer.py`)
**Ne yapar?**
- Ses dosyası ve script'i alır
- `assets/stocks/` klasöründen uygun bir **stock video** seçer
- Stock videoyu 1080x1920 (9:16) formata getirir
- Script'teki metinleri **animasyonlu yazılar** olarak videoya ekler
- Arka plan müziği ekler (varsa)
- Final videoyu `pipeline/videos/{id}.mp4` olarak kaydeder

**Gereksinimler:**
- `assets/stocks/` klasöründe en az 1 video dosyası olmalı
- Python MoviePy kütüphanesi gerekli

**Çıktı:**
- `pipeline/videos/topic-123.mp4` (final video)

---

### 5️⃣ **Subtitle Sync** (`src/subtitle-sync.js`)
**Ne yapar?**
- Oluşturulan video için **altyazı** oluşturur
- Whisper API veya CLI ile ses dosyasını transkribe eder
- Altyazıları `.srt` formatında kaydeder
- İsteğe bağlı: Altyazıları videoya yakar (burn) veya ayrı dosya olarak tutar
- Video metadata'sını günceller, durumu `"rendered"` yapar

**Çıktı:**
- `pipeline/videos/topic-123.srt` (altyazı dosyası)
- `pipeline/videos/topic-123.captions.json` (JSON formatında altyazılar)

---

### 6️⃣ **Meta Generator** (`src/meta-generator.js`)
**Ne yapar?**
- Render edilmiş videolar için **YouTube metadata** oluşturur
- OpenAI ile başlık, açıklama, etiketler, hashtag'ler ve thumbnail metni üretir
- Metadata'yı `pipeline/meta/{id}.json` dosyasına kaydeder
- Video durumunu `"ready-for-upload"` yapar

**Oluşturulan Metadata:**
```json
{
  "title": "Çekici başlık (≤70 karakter)",
  "description": "Açıklama (150-300 karakter)",
  "tags": ["etiket1", "etiket2", ...],
  "hashtags": ["#shorts", "#..."],
  "thumbnailText": "Thumbnail metni"
}
```

---

### 7️⃣ **YouTube Uploader** (`src/youtube-uploader.js`)
**Ne yapar?**
- `"ready-for-upload"` durumundaki videoları bulur
- Google OAuth ile YouTube API'ye bağlanır
- Video'yu, metadata'yı ve altyazıları YouTube'a yükler
- Yüklenen video ID'sini kaydeder
- Durumu `"uploaded"` yapar

**Gereksinimler:**
- Google OAuth credentials (`credentials.json`)
- YouTube API token (ilk çalıştırmada `--auth` ile oluşturulur)

---

## 🚀 Full Pipeline Çalıştırma

### Tek Komutla Tüm Süreç:
```bash
npm run generate -- --count=5 --category="islam-tarihi" --privacy=unlisted
```

**Bu komut şunları yapar:**
1. 5 topic oluşturur
2. Her topic için script yazar
3. Her script için ses oluşturur
4. Her ses için video render eder
5. Her video için altyazı ekler
6. Her video için metadata oluşturur
7. (Opsiyonel) YouTube'a yükler

---

## 📁 Dosya Yapısı ve Video Konumu

### Video Dosyaları Nerede?
**Tam yol:** `pipeline/videos/{topic-id}.mp4`

**Örnek:**
```
shorts-auto/
  └── pipeline/
      └── videos/
          ├── topic-1763120547536-0.mp4  ← BURADA!
          ├── topic-1763120547536-0.json  (metadata)
          ├── topic-1763120547536-0.srt   (altyazı)
          └── topic-1763120547536-0.captions.json
```

### Video'yu Nasıl Bulurum?

**1. Terminal'den:**
```bash
cd /Users/neimramazanoglu/Desktop/otomasyon/shorts-auto
ls -lh pipeline/videos/*.mp4
```

**2. Finder'dan:**
- `shorts-auto` klasörünü aç
- `pipeline` → `videos` klasörüne git
- `.mp4` dosyaları burada

**3. Dashboard'dan:**
- `http://localhost:3000` adresine git
- "Recent Queue Items" bölümünde video ID'lerini gör
- Dosya sisteminde `pipeline/videos/{id}.mp4` yolunu kullan

---

## 🎯 Durum Akışı

Her topic şu durumlardan geçer:

```
queued → scripted → voiced → rendered → ready-for-upload → uploaded
```

**Durum Kontrolü:**
- `queue.json` dosyasında her topic'in `status` alanına bak
- Veya dashboard'da (`http://localhost:3000`) istatistikleri gör

---

## ⚙️ Önemli Notlar

### Video Render İçin Gereksinimler:
1. **Stock Video Gerekli:** `assets/stocks/` klasöründe en az 1 video dosyası olmalı
2. **FFmpeg Kurulu:** Video render için FFmpeg gerekli (zaten kurulu ✅)
3. **Python Dependencies:** MoviePy ve ffmpeg-python kurulu olmalı (zaten kurulu ✅)

### YouTube Upload İçin:
- İlk çalıştırmada OAuth token oluşturulmalı:
  ```bash
  node src/youtube-uploader.js --auth
  ```
- `credentials.json` dosyası gerekli (Google Cloud Console'dan indirilmeli)

---

## 🔍 Sorun Giderme

### Video Render Edilmedi?
- `assets/stocks/` klasöründe video var mı kontrol et
- Python virtual environment aktif mi? (`source .venv/bin/activate`)
- FFmpeg çalışıyor mu? (`ffmpeg -version`)

### Script Türkçe Değil?
- `.env` dosyasında `OPENAI_API_KEY` doğru mu?
- Script generator'ı tekrar çalıştır: `node src/script-generator.js`

### Pipeline Yarıda Kaldı?
- Her adımı manuel çalıştırabilirsin:
  ```bash
  node src/script-generator.js
  node src/tts-generator.js
  python pipeline/video_renderer.py --audio ... --script ...
  node src/subtitle-sync.js
  node src/meta-generator.js
  ```

---

## 📊 Özet

**Full pipeline çalıştığında:**
1. ✅ Topic'ler oluşturulur
2. ✅ Script'ler yazılır (Türkçe)
3. ✅ Ses dosyaları oluşturulur
4. ✅ Video'lar render edilir → **`pipeline/videos/{id}.mp4`**
5. ✅ Altyazılar eklenir
6. ✅ Metadata oluşturulur
7. ✅ (Opsiyonel) YouTube'a yüklenir

**Final video dosyası:** `pipeline/videos/{topic-id}.mp4`

Bu dosyayı doğrudan YouTube'a yükleyebilir veya manuel olarak kullanabilirsin!

