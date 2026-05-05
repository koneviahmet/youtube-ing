import type { Component } from 'vue'
import GameAnagram from '@/components/vocab-games/games/GameAnagram.vue'
import GameComboChain from '@/components/vocab-games/games/GameComboChain.vue'
import GameCloze from '@/components/vocab-games/games/GameCloze.vue'
import GameFirstLetter from '@/components/vocab-games/games/GameFirstLetter.vue'
import GameFlashcards from '@/components/vocab-games/games/GameFlashcards.vue'
import GameHangman from '@/components/vocab-games/games/GameHangman.vue'
import GameMatch from '@/components/vocab-games/games/GameMatch.vue'
import GameMemory from '@/components/vocab-games/games/GameMemory.vue'
import GameMultipleChoice from '@/components/vocab-games/games/GameMultipleChoice.vue'
import GameOddOneOut from '@/components/vocab-games/games/GameOddOneOut.vue'
import GameRevealHint from '@/components/vocab-games/games/GameRevealHint.vue'
import GameSnake from '@/components/vocab-games/games/GameSnake.vue'
import GameSpeedChoice from '@/components/vocab-games/games/GameSpeedChoice.vue'
import GameTrueFalse from '@/components/vocab-games/games/GameTrueFalse.vue'
import GameTyping from '@/components/vocab-games/games/GameTyping.vue'
import GameWordSearch from '@/components/vocab-games/games/GameWordSearch.vue'
import type { VocabGameId } from '@/lib/vocabGames/types'

export interface VocabGameEntry {
  id: VocabGameId
  title: string
  description: string
  component: Component
}

export const VOCAB_GAMES: readonly VocabGameEntry[] = [
  {
    id: 'flashcards',
    title: 'Kartlar',
    description: 'Kelime ↔ anlam çevirisi; tıklayıp çevir.',
    component: GameFlashcards,
  },
  {
    id: 'multiple-choice',
    title: 'Çoktan seçmeli',
    description: 'Anlamı gör, doğru İngilizce kelimeyi seç.',
    component: GameMultipleChoice,
  },
  {
    id: 'typing',
    title: 'Yazarak',
    description: 'Türkçe anlamı görünce İngilizce kelimeyi yaz.',
    component: GameTyping,
  },
  {
    id: 'match',
    title: 'Eşleştir',
    description: 'Kelimeye tıkla, sonra doğru anlamına tıkla.',
    component: GameMatch,
  },
  {
    id: 'memory',
    title: 'Hafıza',
    description: 'Kartları çevir; kelime ile anlamı eşleştir.',
    component: GameMemory,
  },
  {
    id: 'snake',
    title: 'Yılan',
    description: 'Önce İngilizce kelimeyi yiyin, sonra doğru Türkçesini bulun.',
    component: GameSnake,
  },
  {
    id: 'hangman',
    title: 'Kelimeyi tamamla',
    description: 'Türkçe anlamı okuyup harflerle İngilizce kelimeyi tamamlayın.',
    component: GameHangman,
  },
  {
    id: 'anagram',
    title: 'Anagram',
    description: 'Karışık harfleri doğru sıraya diz.',
    component: GameAnagram,
  },
  {
    id: 'word-search',
    title: 'Kelime avı',
    description: 'Izgarada gizlenen kelimeleri bul.',
    component: GameWordSearch,
  },
  {
    id: 'cloze',
    title: 'Boşluk doldur',
    description: 'Cümledeki boşluğu doğru kelimeyle tamamla.',
    component: GameCloze,
  },
  {
    id: 'true-false',
    title: 'Doğru / Yanlış',
    description: 'Kelime ve anlam eşleşmesi doğru mu?',
    component: GameTrueFalse,
  },
  {
    id: 'speed-choice',
    title: 'Hızlı seçim',
    description: 'Süre dolmadan doğru İngilizce kelimeyi seç.',
    component: GameSpeedChoice,
  },
  {
    id: 'reveal-hint',
    title: 'İpucu ile',
    description: 'Harf harf aç; kelimeyi tahmin et.',
    component: GameRevealHint,
  },
  {
    id: 'first-letter',
    title: 'İlk harf',
    description: 'İlk harf(ipucu) verilir; kelimeyi tamamla.',
    component: GameFirstLetter,
  },
  {
    id: 'odd-one-out',
    title: 'Hangisi değil?',
    description: 'Verilen anlama uymayan İngilizce kelimeyi seç.',
    component: GameOddOneOut,
  },
  {
    id: 'combo-chain',
    title: 'Combo zinciri',
    description: 'Art arda doğru cevaplarla seri oluştur.',
    component: GameComboChain,
  },
] as const

export function getGameEntry(id: VocabGameId): VocabGameEntry | undefined {
  return VOCAB_GAMES.find((g) => g.id === id)
}
