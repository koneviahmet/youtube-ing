/** Tek bir ezberlenebilir kelime kartı (AI key_vocab birleşimi) */
export interface VocabCard {
  id: string
  word: string
  meaning_tr: string
  example?: string
}

export type VocabGameId =
  | 'flashcards'
  | 'multiple-choice'
  | 'typing'
  | 'match'
  | 'memory'
  | 'snake'
  | 'hangman'
  | 'anagram'
  | 'word-search'
  | 'cloze'
  | 'true-false'
  | 'speed-choice'
  | 'reveal-hint'
  | 'first-letter'
  | 'odd-one-out'
  | 'combo-chain'
