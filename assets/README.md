# 📦 Assets Folder - Stock Video Deposu

Bu klasör, video oluşturma sırasında kullanılan stok video kliplerini içerir.

## 🎬 Video Nasıl Eklenir?

### Seçenek 1: Manuel İndirme (Önerilen - İlk Kullanım)
1. **Pexels** veya **Pixabay** gibi sitelere git:
   - https://www.pexels.com/videos/
   - https://pixabay.com/videos/

2. **Dikey videolar** ara (9:16 veya portrait):
   - Arama terimleri: "technology vertical", "nature portrait", "city vertical"
   - Filtreleme: Orientation → Portrait

3. **İndir** ve bu klasöre kopyala:
   ```bash
   mv ~/Downloads/*.mp4 ~/Projects/Neim/shorts-auto/assets/
   ```

### Seçenek 2: Pexels API (Otomatik)
API key ekleyerek otomatik video indirme:
1. https://www.pexels.com/api/ adresine git
2. Ücretsiz kayıt ol, API key al
3. `.env` dosyasına ekle: `PEXELS_API_KEY=your_key`
4. Artık "📸 Pexels'den Oluştur" modu kullanılabilir!

## 📝 Format Gereksinimleri

- **Format**: MP4, MOV, WebM
- **Oryantasyon**: Dikey (9:16) - YouTube Shorts için
- **Çözünürlük**: Minimum 1080x1920 (önerilen)
- **Süre**: En az 5-10 saniye

## 🎯 Kullanım

Video renderer, bu klasördeki kliplerden rastgele seçim yapar ve subtitle uzunluğuna göre kesitler alır.

**⚠️ Şu an bu klasörde video yok!** 
→ "✨ Otomatik Oluştur" modu çalışması için en az 1 video ekleyin.

## 💡 İpuçları

- En az **5-10 video** ekleyin (çeşitlilik için)
- **Farklı konularda** videolar ekleyin (doğa, teknoloji, soyut, vb.)
- **Telif hakkı**: Pexels/Pixabay videoları ticari kullanıma açıktır ✅

## 🔗 Faydalı Linkler

- [Pexels Videos](https://www.pexels.com/videos/)
- [Pixabay Videos](https://pixabay.com/videos/)
- [Pexels API Documentation](https://www.pexels.com/api/documentation/)

## 🚀 Hızlı Test

Test için örnek video indirin:
```bash
cd ~/Projects/Neim/shorts-auto/assets
curl -L "https://videos.pexels.com/video-files/3840858/3840858-sd_360_640_30fps.mp4" -o sample_video.mp4
```

Artık "✨ Otomatik Oluştur" modu çalışacak!
