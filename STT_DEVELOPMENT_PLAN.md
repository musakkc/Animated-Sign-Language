# PROJE ADI: Animated-Sign-Language STT Module (Gerçek Zamanlı Alt Yazı Sistemi)

## 1. ROL VE VİZYON TANIMI
Sen, düşük gecikmeli (low-latency) ses işleme ve yapay zeka entegrasyonu konularında uzmanlaşmış, kıdemli bir yazılım mimarı ve makine öğrenmesi mühendisisin. Bu projenin amacı, **Animated-Sign-Language** projesi için konuşulanları anlık olarak algılayan, Google Sesli Yazma performansına yakın, yüksek doğruluklu bir Türkçe STT (Speech-to-Text) modülü geliştirmektir.

## 2. TEKNİK YIĞIN (TECHNICAL STACK)
* **Dil:** Python 3.10+
* **Ana STT Motoru:** `faster-whisper` (CTranslate2 backend)
* **Model:** `large-v3-turbo` veya `distil-large-v3` (Hız/Doğruluk dengesi için).
* **VAD (Voice Activity Detection):** `silero-vad` (Sessizlik ve konuşma ayrımı için).
* **Ses Girişi:** `pyaudio` veya `sounddevice`.
* **İşlem Birimi:** CUDA (NVIDIA GPU) öncelikli, yoksa CPU (int8 quantization).
* **Eşzamanlılık:** `asyncio` ve `threading` (Producer-Consumer mimarisi).

## 3. GELİŞTİRME FAZLARI VE DETAYLI ADIMLAR

### FAZ 1: STT Motorunun Kurulumu ve Model Optimizasyonu
* `faster-whisper` kütüphanesini kullanarak model yükleme mekanizmasını kur.
* **Quantization:** Bellek ve hız optimizasyonu için `compute_type="int8_float16"` (GPU) veya `compute_type="int8"` (CPU) kullan.
* **Dil Zorlaması:** Modelin dili algılamak için zaman kaybetmesini engellemek adına `language="tr"` parametresini sabitle.
* **Initial Prompt:** Cümle yapısını ve noktalama işaretlerini iyileştirmek için `"Merhaba, bu bir Türkçe konuşmadır, noktalama işaretlerine dikkat ederek yaz."` gibi bir başlangıç promptu ekle.

### FAZ 2: Gerçek Zamanlı Akış (Streaming) ve VAD Entegrasyonu
* **Mikrofon Dinleyici:** Sesi 16kHz mono formatında sürekli dinleyen bir `stream` oluştur.
* **Silero VAD:** Gelen ses paketlerini sürekli analiz et. Sadece konuşma başladığında buffer'a veri yaz, sessizlik olduğunda (örn: 500ms+ sessizlik) buffer'ı modele gönder.
* **Chunking:** Sesi 500ms - 1000ms'lik küçük parçalar (chunks) halinde işle.

### FAZ 3: "Interim vs Final" (Ara Sonuç vs Kesin Sonuç) Mimarisi
* **Interim (Tahmini) Çıktı:** Kullanıcı konuşurken, henüz cümle bitmeden modelin yaptığı ilk tahminleri ekrana bas (Düşük `beam_size` ile hızlı sonuç).
* **Final (Kesin) Çıktı:** VAD sessizlik algıladığında, o ana kadar biriken tüm buffer'ı daha yüksek doğrulukla (`beam_size=5`) tekrar işle ve ekrandaki metni güncelle.
* **Text Merging:** Önceki cümlelerin yeni gelenlerle çakışmaması için metin birleştirme algoritması geliştir.

### FAZ 4: Performans ve Gecikme Optimizasyonu
* **Gecikme Hedefi:** Konuşma ile metnin ekrana düşmesi arasındaki farkı <1.5 saniye seviyesine indir.
* **Beam Search:** Hız için `beam_size=1` (Greedy search) ile denemeler yap, doğruluğa göre optimize et.
* **VRAM Yönetimi:** Modelin belleği şişirmemesi için periyodik temizlik veya singleton model yapısı kullan.

## 4. KODLAMA STANDARTLARI VE TALİMATLAR
* **Modülerlik:** Ses yakalama, VAD ve STT işlemleri ayrı sınıflarda (`class`) tanımlanmalıdır.
* **Logging:** Her işlem adımında (VAD başlattı, model transkript etti, süre X ms) detaylı log üret.
* **Type Hinting:** Tüm Python fonksiyonlarında tip belirtimlerini kullan.
* **Hata Yönetimi:** Mikrofon erişim hataları, CUDA out-of-memory durumları ve kütüphane çakışmaları için `try-except` bloklarını kapsamlı tut.

## 5. KRİTİK NOTLAR (Yapay Zeka İçin)
1.  **Türkçe Karakterler:** Çıktıların UTF-8 formatında ve Türkçe karakterleri (ş, ğ, ü, ı, ö, ç) doğru desteklediğinden emin ol.
2.  **Bağlam (Context):** Animated-Sign-Language projesi için bu metinlerin bir animasyon motoruna (Unity/Unreal/Web) besleneceğini unutma, bu yüzden metinlerin temiz ve anlaşılır olması şarttır.
3.  **Hız:** Gereksiz her türlü döngüden kaçın, `numpy` kullanarak ses verisini vektörel işle.

---
**BU PLANA SADIK KAL VE HER ADIMDA EN İYİ PRACTİCE'LERİ UYGULA.**
