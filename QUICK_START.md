# 🚀 Hızlı Başlangıç Rehberi

## 📸 Pexels API ile Video Oluşturma

### 1️⃣ API Key Alın (2 dakika)
```bash
1. https://www.pexels.com/api/ adresine gidin
2. "Get Started" → Kayıt olun (Email veya Google)
3. API key'inizi kopyalayın
```

### 2️⃣ .env Dosyasını Güncelleyin
```bash
# .env dosyasını açın ve PEXELS_API_KEY satırını güncelleyin:
PEXELS_API_KEY=buraya_kopyaladiginiz_key_yapistirin
```

### 3️⃣ Serveri Başlatın
```bash
npm run dev
```

### 4️⃣ Video Oluşturun! 🎬
```
1. http://localhost:3000
2. "🎬 YENİ VIDEO OLUŞTUR"
3. Bir konu yazın (örn: "Güneş sistemi hakkında")
4. "Script Oluştur" → "Audio Oluştur" → "Altyazı Oluştur"
5. Preview'ı izleyin
6. "📸 Pexels'den Oluştur" seçin
7. "Devam Et" → Video oluşsun! ✨
```

---

## 🎯 3 Farklı Mod

### 📤 Manuel Yükle
- Kendi videolarınızı yükleyin
- Birden fazla video seçebilirsiniz
- En hızlı render

### ✨ Otomatik Oluştur  
- Local `assets/` klasöründen rastgele
- İnternet gerekmez
- Hızlı video oluşturma

### 📸 Pexels'den Oluştur (YENİ!)
- Script'e göre otomatik video indirme
- Sınırsız çeşitlilik
- İlk seferde yavaş, sonra hızlı (cache)

---

## 📁 Klasör Yapısı

```
shorts-auto/
├── pipeline/
│   ├── raw_videos/      # Pexels'den indirilen videolar (cache)
│   ├── audio/           # Oluşturulan TTS dosyaları
│   ├── videos/          # Final render edilen videolar
│   └── temp/            # Geçici dosyalar
├── assets/              # Local stock videolar
└── .env                 # API keys (OPENAI_API_KEY, PEXELS_API_KEY)
```

---

## ⚡ Hızlı Komutlar

```bash
# Server başlat
npm run dev

# Python bağımlılıkları yükle
.venv/bin/pip install -r requirements.txt

# Test video oluştur (Pexels)
.venv/bin/python3 pipeline/pexels_video_fetcher.py "technology"
```

---

## 🔧 Sorun Giderme

### "PEXELS_API_KEY not configured"
→ `.env` dosyasını kontrol edin ve serveri yeniden başlatın

### "No videos found"
→ Pexels fallback → Local assets → Placeholder
→ Script'te İngilizce kelimeler daha iyi sonuç verir

### Video yavaş oluşuyor
→ İlk seferde videolar indirilir (cache'lenir)
→ Sonraki seferler çok daha hızlı!

---

## 📊 Ücretsiz Limitler

| Servis | Limit | Yeterli Mi? |
|--------|-------|-------------|
| Pexels API | 20,000 istek/ay | ✅ ~100-200 video |
| OpenAI TTS | Pay-as-you-go | ✅ ~1000 video/$1 |

---

## 🎉 İlk Videonuzu Oluşturun!

**Önerilen test konusu:**
```
"Yapay zeka nedir? Kısa bir açıklama"
```

Bu 20-30 saniyelik bir video oluşturacak ve Pexels'den "artificial intelligence", "technology", "ai" gibi kelimelerle videolar indirecek!

---

💡 **İpucu**: İlk videoyu Pexels ile oluşturun, beğendiğiniz videoları `pipeline/raw_videos/` klasöründen `assets/` klasörüne kopyalayın. Böylece "Otomatik Oluştur" moduyla da kullanabilirsiniz!

**Başarılar! 🚀**
