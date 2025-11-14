# 📸 Pexels API Kurulum Rehberi

## 🎯 Pexels API Nedir?

Pexels, milyonlarca ücretsiz stok fotoğraf ve video sunan bir platformdur. API'si ile otomatik olarak script'inize uygun videolar indirebilirsiniz.

## 🔑 API Key Nasıl Alınır?

### Adım 1: Pexels Hesabı Oluşturun
1. [https://www.pexels.com](https://www.pexels.com) adresine gidin
2. Sağ üstten **Join** veya **Sign Up** butonuna tıklayın
3. Email ve şifre ile kayıt olun (veya Google hesabı ile giriş yapın)

### Adım 2: API Key'inizi Alın
1. [https://www.pexels.com/api/](https://www.pexels.com/api/) adresine gidin
2. **Get Started** butonuna tıklayın
3. Açılan sayfada **Your API Key** bölümünü bulun
4. API key'inizi kopyalayın (örnek: `563492ad6f917000010000018c12a1b2e9f74f3d9b0c5c0b5c5c5c5c`)

### Adım 3: .env Dosyasına Ekleyin
1. Proje klasöründeki `.env` dosyasını açın
2. `PEXELS_API_KEY` satırını bulun
3. `your_pexels_api_key_here` yerine kopyaladığınız API key'i yapıştırın

```bash
# Örnek:
PEXELS_API_KEY=563492ad6f917000010000018c12a1b2e9f74f3d9b0c5c0b5c5c5c5c
```

4. Dosyayı kaydedin

### Adım 4: Serveri Yeniden Başlatın
```bash
npm run dev
```

## 📝 Kullanım

### Video Oluşturma Wizard'ında:

1. **🎬 YENİ VIDEO OLUŞTUR** butonuna tıklayın
2. **Step 1-3**: Script, Audio, Subtitle oluşturun
3. **Step 4**: **📸 Pexels'den Oluştur** seçeneğini seçin
4. **Devam Et** butonuna tıklayın
5. **Step 5**: Video otomatik olarak Pexels'den indirilip oluşturulacak!

### 🎬 Nasıl Çalışır?

1. **Keyword Extraction**: Script'ten otomatik olarak anahtar kelimeler çıkarılır
2. **Video Search**: Her subtitle için Pexels'de ilgili kelimeler aranır
3. **Auto Download**: Dikey (9:16) videolar otomatik indirilir
4. **Smart Composition**: Videolar audio uzunluğuna göre kesilip birleştirilir
5. **Subtitle Overlay**: Türkçe altyazılar eklenir
6. **Final Render**: YouTube Shorts formatında (1080x1920) video oluşturulur

## ⚠️ Önemli Notlar

### Kullanım Limitleri
- **Ücretsiz API**: Ayda 20,000 istek (günlük ~660 istek)
- Her video oluşturma için birden fazla istek yapılır
- Yaklaşık **100-200 video/ay** üretebilirsiniz

### Video Kalitesi
- **Dikey videolar** tercih edilir (portrait orientation)
- **HD kalite** otomatik seçilir
- **1080x1920** formatına otomatik kırpılır

### Fallback Sistemi
Eğer Pexels'den video bulunamazsa:
1. Önce local `assets/` klasöründeki videolar kullanılır
2. Sonra siyah placeholder video oluşturulur

## 🔧 Sorun Giderme

### "PEXELS_API_KEY not configured" Hatası
- `.env` dosyasında API key'in doğru eklendiğinden emin olun
- Serveri yeniden başlatın: `npm run dev`

### "No videos found for keyword" Uyarısı
- Script'te daha genel kelimeler kullanın (İngilizce kelimeler daha iyi sonuç verir)
- Fallback sistemi devreye girecek ve local videolar kullanılacak

### Video İndirme Yavaş
- İnternet bağlantınızı kontrol edin
- İlk seferde videolar indirilir, sonra cache'den kullanılır
- İndirilen videolar `pipeline/raw_videos/` klasöründe saklanır

## 📦 İndirilen Videolar

İndirilen videolar şu klasörde saklanır:
```
pipeline/raw_videos/
├── science.mp4
├── technology.mp4
├── space.mp4
└── ...
```

Aynı keyword için tekrar video oluşturulduğunda, mevcut video kullanılır (tekrar indirilmez).

## 🎨 Özellikler

✅ Otomatik keyword extraction
✅ Akıllı video arama
✅ Dikey video (9:16) filtresi
✅ HD kalite seçimi
✅ Otomatik indirme ve cache
✅ Türkçe altyazı desteği
✅ Smooth geçişler
✅ Fallback sistemi

## 🆚 Mod Karşılaştırması

| Özellik | Manuel Yükle | Otomatik Oluştur | Pexels API |
|---------|--------------|------------------|------------|
| Video kaynağı | Kullanıcı | Local assets | Pexels API |
| Hazırlık | Video bulma gerekli | Assets klasörüne ekleme | Otomatik |
| Çeşitlilik | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Hız | En hızlı | Hızlı | Yavaş (ilk seferde) |
| İnternet | Gerekli değil | Gerekli değil | Gerekli |
| Maliyet | Ücretsiz | Ücretsiz | Ücretsiz (limitli) |

## 📚 Kaynaklar

- [Pexels API Docs](https://www.pexels.com/api/documentation/)
- [Pexels Terms of Service](https://www.pexels.com/terms-of-service/)
- [Pexels License](https://www.pexels.com/license/) - Videolar ticari kullanıma açık!

---

**💡 İpucu**: İlk birkaç videoyu Pexels ile oluşturup, beğendiğiniz videoları `assets/` klasörüne ekleyebilirsiniz. Böylece "Otomatik Oluştur" moduyla daha hızlı video üretebilirsiniz!

