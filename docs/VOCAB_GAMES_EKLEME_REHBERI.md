# Kelime oyunu ekleme rehberi (10 yeni oyun)

Bu dosya, projeye **10 yeni kelime etkinliği** eklerken izlenecek adımları, her oyun için **detaylı uygulama promptunu** ve iş bittiğinde işaretleme için **master kontrol promptunu** içerir.

---

## Mevcut mimari (özet)

| Dosya / konum | Görev |
|-----------------|--------|
| `src/lib/vocabGames/types.ts` | `VocabGameId` birlik tipine yeni `id` ekle |
| `src/lib/vocabGames/registry.ts` | `VOCAB_GAMES` dizisine `{ id, title, description, component }` ekle |
| `src/components/vocab-games/games/Game*.vue` | Oyun bileşeni (`props: { words: VocabCard[] }`, gerekirse `emit('batchComplete')`) |
| `src/components/vocab-games/VocabGamesModal.vue` | Yılan dışındaki oyunlarda `useWordBatches` zaten 10’luk turları geçirir; **yılan hariç** tüm yeni oyunlar aynı `words` prop’unu kullanır |
| `src/lib/vocabGames/pool.ts` | Genelde değişmez; kelimeler `VocabCard` (`word`, `meaning_tr`, `example?`) |

**Yılan (`snake`) dışındaki oyunlar** için: tur bitiminde `emit('batchComplete')` veya eşdeğer akış, 10’luk partiye geçişi sağlar (mevcut oyunlara bak).

---

## Tek oyun ekleme — adım adım

1. **`types.ts`**: `VocabGameId` tipine yeni literal ekle (ör. `'hangman'`).
2. **Bileşen**: `src/components/vocab-games/games/GameMyGame.vue` oluştur; `VocabCard[]` ile çalış; en az 2 kelime gerekiyorsa guard ekle.
3. **`registry.ts`**: Oyunu `VOCAB_GAMES` listesine ekle; `getGameEntry` otomatik bulur.
4. **Build**: `npm run build` ile `vue-tsc` + Vite hatasız geçsin.
5. **Manuel test**: Kelime oyunları sekmesinden aç, modalda tur, `batchComplete` (varsa) ve yılan dışı batch davranışını doğrula.

---

## Master kontrol listesi (kopyala — AI’ya / kendine verilecek prompt)

Aşağıdaki bloğu bir sohbetin başına veya görev tanımına yapıştır. **Her oyun bittiğinde** ilgili satırdaki `[ ]` ifadesini `[x]` yap.

```text
Görev: youtube-ing projesine VOCAB_GAMES_EKLEME_REHBERI.md dosyasındaki 10 yeni kelime oyununu sırayla ekle.
Kurallar: Sadece gerekli dosyalara dokun; mevcut oyunları kırma; yılan hariç oyunlarda 10’luk batch + batchComplete sözleşmesine uy.
Her oyun tamamlandığında aşağıdaki satırda [ ] → [x] işaretle ve kısaca ne yaptığını özetle.

Tamamlanma kontrolü:
- [ ] Oyun 1 — Adam asmaca (Hangman)
- [ ] Oyun 2 — Anagram (harf karıştırma)
- [ ] Oyun 3 — Mini kelime avı (Word search ızgarası)
- [ ] Oyun 4 — Boşluk doldurma (Cloze, altyazı/örnek cümle)
- [ ] Oyun 5 — Doğru / Yanlış (anlam eşleşmesi)
- [ ] Oyun 6 — Hızlı seçim (süre sınırlı çoktan seçmeli)
- [ ] Oyun 7 — Kademeli ipucu (harf harf açılır)
- [ ] Oyun 8 — İlk harf(ipucu ile yazma)
- [ ] Oyun 9 — Hangisi değil? (odd one out)
- [ ] Oyun 10 — Combo zinciri (üst üste doğru, bozulabilir seri)
```

---

# Oyun 1 — Adam asmaca (Hangman)

## Özet
Oyuncu Türkçe anlamı görür; İngilizce kelimeyi harf harf tahmin eder. Yanlış tahmin sayısı sınırı (ör. 6–8) aşılırsa tur kaybedilir; doğru bilinince kelime tamamlanır ve sıradaki kelimeye / batchComplete’e geç.

## Aşamalar
1. `VocabGameId` + `GameHangman.vue`: kelimeyi `_ _ _` olarak göster; kullanılan harfleri devre dışı buton veya klavye.
2. Kazanınca `batchComplete` mantığı: tek kelimelik tur döngüsünde son kelimeden sonra emit (diğer oyunlarla aynı desen).
3. Registry kaydı; kısa Türkçe `title` / `description`.

## Detaylı uygulama promptu (kopyala-yapıştır)

```text
youtube-ing projesinde "Adam asmaca" kelime oyununu ekle.

Teknik:
- src/lib/vocabGames/types.ts içinde VocabGameId'ye 'hangman' ekle.
- src/components/vocab-games/games/GameHangman.vue oluştur: props words: VocabCard[].
- Her turda havuzdan rastgele veya sırayla bir kelime seç; meaning_tr üstte sabit kalsın.
- İngilizce kelimeyi büyük/küçük harf duyarsız karşılaştır; sadece harf girişi kabul et.
- Yanlış tahmin sayacı (ör. 6); asıl basit “adam” çizimi veya kalan hak sayısı metni yeterli.
- Kelime bitince bir sonraki kelimeye geç; words listesi bittiğinde veya sen mevcut batch bitti saydığında emit('batchComplete') — projedeki GameTyping / GameFlashcards ile tutarlı olsun.
- src/lib/vocabGames/registry.ts'e ekle: title "Adam asmaca", kısa açıklama Türkçe.
- npm run build hatasız olsun.
```

---

# Oyun 2 — Anagram (harf karıştırma)

## Özet
İngilizce kelimenin harfleri karışık gösterilir; oyuncu doğru sırayı tıklayarak veya sürükleyerek (MVP: tıklama ile sıraya ekle) kelimeyi oluşturur. Doğrulayınca sonraki kelime / batch.

## Aşamalar
1. Kelimeyi shuffle et; aynı harften birden fazla varsa ayırt et (index ile benzersiz tile).
2. “Sıfırla” ile karıştırılmış harfleri yenile (opsiyonel).
3. Doğru eşleşmede `batchComplete` stratejisi diğer oyunlarla uyumlu.

## Detaylı uygulama promptu

```text
"Anagram" kelime oyununu ekle (id: 'anagram').

- GameAnagram.vue: words: VocabCard[]; her turda bir kelimenin harflerini karıştırıp buton grid olarak göster; tıklanan sıra üstte oluşan kelimeyi güretir; kontrol düğmesi veya otomatik doğrulama.
- Türkçe anlamı (meaning_tr) görünür kalsın.
- Kelime uzunluğu 1 veya boş kelime edge case: güvenli mesaj.
- Tur/batch tamamlanınca emit('batchComplete').
- registry + types güncelle; build geçsin.
```

---

# Oyun 3 — Mini kelime avı (Word search)

## Özet
Küçük bir harf ızgarasında (ör. 8×8) seçili kelime havuzundan 3–5 kelime gizlenir; oyuncu sürükleyerek veya hücre hücre seçerek (MVP: satır/sütun/diagonal basit kural) kelimeyi işaretler. Bulunan kelime listeden düşer.

## Aşamalar
1. Izgara üretimi: kelimeleri yerleştir, kalan hücrelere rastgele harf.
2. Seçim mantığı: çizgi üzerindeki hücrelerin birleşimi hedef kelimeyle eşleşiyor mu kontrol et.
3. Tüm kelimeler bulununca `batchComplete`.

## Detaylı uygulama promptu

```text
"Kelime avı" oyununu ekle (id: 'word-search').

- GameWordSearch.vue: words'dan en fazla 5 kelimeyi (İngilizce, A-Z) ızgaraya yerleştir; placement basit (yatay/dikey yeterli MVP).
- Oyuncu hücre seçerek kelimeyi işaretler; doğru ise vurgula ve listeden çıkar.
- Kelime çok uzunsa grid boyutunu artır veya kelimeyi atlama — makul sınır koy.
- Tüm kelimeler bulunduğunda emit('batchComplete').
- types + registry; build.
```

---

# Oyun 4 — Boşluk doldurma (Cloze)

## Özet
`example` alanı varsa onu kullan; yoksa `word` ile basit bir şablon cümle üret (ör. "The ____ is here."). Boşluğu doğru İngilizce kelime ile doldur; çoktan seçmeli veya yazılı olabilir.

## Aşamalar
1. `VocabCard` içinden `example`’da hedef kelimeyi `____` ile maskele (regex dikkat).
2. Example yoksa: `"______ "` + kısa Türkçe ipucu veya sadece TR anlam.
3. Doğru cevap sonrası sonraki soru / batch.

## Detaylı uygulama promptu

```text
"Cloze / boşluk doldurma" oyunu ekle (id: 'cloze').

- GameCloze.vue: her tur bir kelime; mümkünse key_vocab.example içindeki İngilizce cümlede hedef kelimeyi boşlukla maskele; yoksa minimal şablon kullan.
- Cevap: yazılı input veya 4 seçenek (havuzdan yanlış üret).
- Doğru → sonraki; tur sonu emit('batchComplete').
- registry, types, build.
```

---

# Oyun 5 — Doğru / Yanlış (anlam eşleşmesi)

## Özet
Ekranda İngilizce kelime + Türkçe anlam gösterilir; bazen kasıtlı yanlış eşleştirme (başka kelimenin anlamı). Oyuncu Doğru / Yanlış seçer.

## Aşamalar
1. %50 doğru çift (kelime + kendi meaning_tr), %50 yanlış (meaning başka karttan).
2. Skor sayacı opsiyonel.
3. N soru sonra veya kelime listesi bitince `batchComplete`.

## Detaylı uygulama promptu

```text
"Doğru / Yanlış" oyunu ekle (id: 'true-false').

- GameTrueFalse.vue: her tur word + meaning_tr çifti göster; bazen meaning_tr başka bir VocabCard'dan gelsin (yanlış eşleşme).
- İki büyük buton: Doğru / Yanlış; cevabı kontrol et.
- Örn. 10 soru veya words uzunluğu kadar tur sonra emit('batchComplete').
- types, registry, build.
```

---

# Oyun 6 — Hızlı seçim (süre sınırlı MC)

## Özet
Mevcut çoktan seçmeliye benzer; fakat her soru için 8–15 sn geri sayım; süre biterse yanlış sayılır veya pas geçilir.

## Aşamalar
1. `setInterval` / `requestAnimationFrame` ile kalan süre çubuğu.
2. Süre dolunca otomatik sonraki soru.
3. Soru seti bitince `batchComplete`.

## Detaylı uygulama promptu

```text
"Hızlı seçim" oyunu ekle (id: 'speed-choice').

- GameSpeedChoice.vue: GameMultipleChoice'a benzer ama her soruda görünür geri sayım (ör. 12 sn); süre bitince bir sonraki soruya geç.
- Model: meaning_tr soru, 4 İngilizce seçenek havuzdan.
- Tüm sorular bitince emit('batchComplete').
- types, registry, build.
```

---

# Oyun 7 — Kademeli ipucu (harf harf açılır)

## Özet
Kelime başta tamamen gizli veya sadece uzunluk; her “İpucu” tıklanında bir harf açılır; erken tahmin bonusu (opsiyonel sayaç).

## Aşamalar
1. State: açık harf indeksleri veya maskeli string.
2. Tahmin input veya harf harf seçim.
3. Doğru kelime bilinince sonraki kelime / batch.

## Detaylı uygulama promptu

```text
"Kademeli ipucu" oyunu ekle (id: 'reveal-hint').

- GameRevealHint.vue: İngilizce kelimeyi maskele; "Harfi aç" ile rastgele veya sırayla harf göster; meaning_tr sabit.
- "Tahmin et" input ile tam kelime; doğruysa next.
- Kelimeler bitince emit('batchComplete').
- types, registry, build.
```

---

# Oyun 8 — İlk harf (ipucu ile yazma)

## Özet
Türkçe anlam + İngilizce kelimenin ilk 1–2 harfi gösterilir; geri kalanını kullanıcı yazar.

## Aşamalar
1. `word.slice(0, k)` + alt çizgi.
2. Normalize karşılaştırma (mevcut GameTyping ile aynı kurallar).
3. Tur sonu `batchComplete`.

## Detaylı uygulama promptu

```text
"İlk harf" oyunu ekle (id: 'first-letter').

- GameFirstLetter.vue: meaning_tr + İngilizce kelimenin ilk harfi (veya ilk iki harf); kullanıcı kalanını yazar.
- Kontrol: trim, case insensitive.
- Liste bitince emit('batchComplete').
- types, registry, build.
```

---

# Oyun 9 — Hangisi değil? (Odd one out)

## Özet
Dört İngilizce seçenekten biri verilen Türkçe anlamla **eşleşmez** (diğer üçü havuzdan gelen “yanlış” kelimeler ama TR karşılıkları benzer rolde — MVP: bir doğru TR, üç kelimeden biri random unrelated EN).

## Aşamalar
1. Soru: “Hangisi bu anlama ait değil?” — gösterilen TR sabit; dört EN seçenekten biri doğru eşleşmiyor.
2. Doğru cevap: “alakasız” olan seçenek.
3. N tur sonra `batchComplete`.

## Detaylı uygulama promptu

```text
"Hangisi değil?" oyunu ekle (id: 'odd-one-out').

- GameOddOneOut.vue: Bir Türkçe anlam (hedef kelimenin meaning_tr) göster; dört İngilizce seçenekten tam olarak biri bu anlama uymaz (kelime havuzundan üret).
- Oyuncu uymayanı seçer.
- Tur seti bitince emit('batchComplete').
- Edge: kelime sayısı < 4 ise uyarı veya düşük seçenek sayısı.
- types, registry, build.
```

---

# Oyun 10 — Combo zinciri (seri doğru)

## Özet
Arka arkaya doğru cevap “combo” sayacını artırır; yanlışta sıfırlanır. Çoktan seçmeli veya yazma ile aynı mekanik + görsel combo göstergesi.

## Aşamalar
1. `ref combo`, yanlışta 0’a dön.
2. Örn. 5 doğru üst üste → bonus mesaj veya `batchComplete` tetikle (tasarım kararı dokümante et).
3. Minimum kelime sayısı kontrolü.

## Detaylı uygulama promptu

```text
"Combo zinciri" oyunu ekle (id: 'combo-chain').

- GameComboChain.vue: meaning → doğru İngilizce seç (MC veya typing); doğruysa combo++; yanlışsa combo=0.
- Ekranda combo göstergesi; örn. üst üste 8 doğru sonrası veya words listesi bitince emit('batchComplete') — davranışı projedeki diğer oyunlarla tutarlı seç.
- types, registry, build.
```

---

## Son notlar

- **Yılan (`snake`)** tam kelime listesi kullanır; bu 10 oyundan hiçbiri yılan mantığını değiştirmemeli.
- **Modal içi kelime paneli** kapalı varsayılan; oyunlar sadece `words` prop’una güvenir.
- İstersen her oyun için `example` veya `meaning_tr` eksik edge case’lerini rehbere ek not olarak işleyebilirsin.

**Dosya yolu:** `docs/VOCAB_GAMES_EKLEME_REHBERI.md`
