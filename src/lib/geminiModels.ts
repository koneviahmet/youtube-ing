/** Önerilen Gemini model kimlikleri (Google AI Studio / generativelanguage API) */
export const DEFAULT_GEMINI_MODEL_ID = 'gemini-2.5-flash' as const
export const AUTO_GEMINI_MODEL_ID = 'auto' as const

export const GEMINI_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: AUTO_GEMINI_MODEL_ID, label: 'Otomatik (önerilen)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash 001' },
  { id: 'gemini-2.0-flash-lite-001', label: 'Gemini 2.0 Flash-Lite 001' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview (Nano Banana)' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
]

export function geminiModelLabel(id: string): string {
  return GEMINI_MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id
}
