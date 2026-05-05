# AI-Powered English Learning from YouTube — Proje Planı

**Rol:** Kıdemli Full-Stack Yazılım Mimarı ve Dil Edinimi odaklı uygulama  
**Teknoloji:** Vue 3 (Vite), Composition API, Pinia, Tailwind CSS  
**Çıktı:** Tüm ilerleme bu dosyada işlenir; tamamlanan görevler `[x]`, bekleyenler `[ ]`.

---

## Süreç kuralı (onay)

Her faz tamamlandıktan sonra **bir sonraki faza geçmeden önce** paydaş onayı beklenir. Bu dosya her onaylı adımda güncellenir.

---

## Teknik özet

| Alan | Seçim |
|------|--------|
| Framework | Vue 3 (Composition API), Vite |
| State | Pinia (tek JSON kaynağı + video/işlem durumu) |
| Styling | Tailwind CSS — modern, sade, **karanlık mod odaklı** |
| Video | YouTube IFrame Player API |
| AI | **Google Gemini API** (`generativelanguage.googleapis.com`), model seçimi uygulama içi (Pinia `geminiModelId` + `.env` API anahtarı; geliştirmede Vite proxy) |
| Veri | Tek JSON objesi; import/export + LocalStorage |

---

## Arayüz prensipleri (özet)

- **Split-screen:** Dikey ikiye bölünmüş layout; **sürüklenebilir resizer** ile panel oranları ayarlanabilir.
- **Sol panel (medya):** Üstte YouTube oynatıcı; altta video ile senkron, tıklanabilir saniye göstergeli **akıllı altyazı akışı**.
- **Sağ panel (etkileşim):** Sekmeler — **Öğrenme Kartları** | **Pratik/Sohbet** | **Sınav**; deyim ve kelimeler kart tabanlı.
- **Sticky controls:** Video kontrolleri ve **JSON dışa aktar** her zaman erişilebilir.

---

## AI veri yapısı ve prompt stratejisi

SRT metni Gemini’ye parçalar halinde gönderilir. Her parça için hedef çıktı:

- Orijinal metin  
- Türkçe çeviri  
- `key_vocab` (önemli kelimeler)  
- Gramer notu  

Video sonu için: **10 adet** `multiple_choice` sorusu.

**Model seçimi:** Kullanıcı arayüzünde (`RightPanel`) listeden `geminiModelId` seçilir; seçim tek JSON ile dışa aktarılır ve LocalStorage’a yazılır. Önerilen model listesi `src/lib/geminiModels.ts` içinde genişletilebilir.

İlgili modül: **Prompt Engineer** — SRT chunk’lama + şema doğruluğu + hata/tekrar politikası.

---

# Fazlar ve görevler

## Faz A — Setup

- [x] Vite ile Vue 3 proje iskeleti oluşturma  
- [x] Composition API yapısı ve klasör düzeni (`components`, `stores`, `composables`, `lib`)  
- [x] Pinia kurulumu ve boş “app state” store (tek JSON kök yapısı için tipler)  
- [x] Tailwind CSS kurulumu — karanlık tema varsayılanı, baz tipografi ölçeği  
- [x] Çevresel değişken şablonu (`.env.example`) — **Gemini / `GEMINI_API_KEY`** proxy için  
- [x] ESLint / Prettier (projede kullanılacaksa) ile tutarlı format  

## Faz B — Core Logic (Video, SRT, senkron)

- [x] YouTube IFrame Player API bileşeni + güvenli origin / API yükleme  
- [x] Oynatıcıdan saniye zamanı (current time) reactive akışı  
- [x] Yerel SRT seçimi/yükleme ve parse ( zaman kodları → metin blokları )  
- [x] SRT bloklarının veri modeline bağlanması (Pinia ile tek JSON’a uyumlu)  
- [x] **Sync logic:** Mevcut video saniyesine göre altyazı vurgusu ve ilgili kart/bölüm kaydırması (Intersection Observer veya manuel senkron)  
- [x] Altyazı satırına tıklayınca ilgili saniyeye seek  

## Faz C — AI Integration

- [x] **Gemini** çağrı katmanı (`generateContent`; serverless veya minimal backend proxy — CORS/key gizleme)  
- [x] **Prompt Engineer** modülü: SRT chunk’lama + istenen JSON şeması için sistem/kullanıcı prompt’ları  
- [x] Yanıt ayrıştırma/doğrulama ve kısmi hata durumunda yeniden deneme veya kullanıcıya bildirim  
- [x] Üretilen içeriğin (kelime kartları, gramer notları, quiz) Pinia tek JSON’a yazılması  

## Faz D — UI / UX

- [x] Split layout + draggable resizer (performanslı, mobilde degrade edecek breakpoint stratejisi)  
- [x] Sol panel: oynatıcı + akıllı altyazı listesi  
- [x] Sağ panel: Tab [Öğrenme Kartları] | [Pratik/Sohbet] | [Sınav]; kart bileşenleri  
- [x] **Gemini model seçimi** (sağ panel üstü)  
- [x] Sticky bar: playback kontrolleri + **JSON Dışa Aktar** (ve gerekiyorsa içe aktar girişi)  
- [x] Geçişler ve mikro-etkileşimler (Vue `<Transition>` / CSS; istenirse hafif motion kütüphanesi)  
- [x] Erişilebilirlik: odak halkaları, klavye ile sekmeler, kontrast  

## Faz E — Export / Import & Persistence

- [x] Tüm uygulama durumunu tek JSON şemasında dışa aktarma  
- [x] JSON dosyası içe aktarma + şema doğrulama  
- [x] LocalStorage ile otomatik kayıt/yükleme ve sürüm alanı (`schemaVersion`)  
- [x] “Sıfırla” / yedekten geri yükleme UX’i  

## Faz F — UI refinement (cilalama)

- [x] Tipografi ve spacing tutarlılığı (Tailwind tema)  
- [x] Liste/kart yükleme ve boş durum (empty states)  
- [x] Loading ve hata göstergeleri (video, AI, dosya okuma)  
- [ ] Son performans gözden geçirmesi (büyük SRT ve uzun liste senaryoları)  

---

## Uygulama adımları (Faz 1–6 — yukarıdaki fazlarla eşleşme)

Bu alt başlıklar sprint/PR dilimleri için kullanılabilir.

### Faz 1: Setup

- [x] Proje iskeleti, Tailwind, Pinia (Faz A ile aynı kapsam)

### Faz 2: Video & SRT

- [x] YouTube Player API + SRT parse ve store bağlama (Faz B’nin ilgili maddeleri)

### Faz 3: AI Bridge

- [x] **Gemini** entegrasyonu + Prompt Engineer + **uygulama içi model seçimi** (Faz C/D)

### Faz 4: Sync Logic

- [x] Video saniyesi ↔ altyazı/kart senkronu ve tıklanınca seek (Faz B/D kesişimi)

### Faz 5: JSON Persistence

- [x] Export/import + LocalStorage (Faz E)

### Faz 6: UI Refinement

- [ ] Animasyonlar, tipografi, cilalama (Faz F)

---

## Günlük / onay kaydı

| Tarih | Faz | Not |
|-------|-----|-----|
| _—_ | — | İlk plan oluşturuldu |
| 2026-05-04 | AI | Claude → **Gemini**; `geminiModelId` ile arayüzden model seçimi |
| 2026-05-04 | Persistence | Sıfırlama öncesi otomatik yedek + local yedekten geri yükleme eklendi |

---

_Onay bekleniyor: **Faz F son maddesi (performans gözden geçirmesi)** ile devam etmek uygun mudur?_
