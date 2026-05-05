import type { SubtitleBlock } from '@/lib/schema'
import { dedupeSubtitleBlocks } from '@/lib/subtitleCleanup'

export interface CaptionTrack {
  langCode: string
  name: string
  kind: string
  isAsr: boolean
}

interface FallbackPayload {
  blocks: SubtitleBlock[]
  lang?: string
  error?: string
}

function summarizeErrorText(raw: string): string {
  const t = raw.trim()
  if (!t) return 'Bilinmeyen hata'
  try {
    const j = JSON.parse(t) as { error?: string }
    if (typeof j.error === 'string' && j.error) return j.error
  } catch {
    // ignore json parse
  }
  const lower = t.toLowerCase()
  if (
    lower.includes("<title>sorry...</title>") ||
    lower.includes("we're sorry") ||
    lower.includes('automated queries')
  ) {
    return 'Google otomatik sorguları geçici olarak engelledi. Bir süre sonra tekrar deneyin veya yerel .srt yükleyin.'
  }
  if (lower.startsWith('<!doctype html') || lower.startsWith('<html')) {
    return 'API JSON yerine HTML döndürdü. Geliştirme proxy endpointleri aktif olmayabilir.'
  }
  return t.length > 240 ? `${t.slice(0, 240)}...` : t
}

function parseTrackList(xml: string): CaptionTrack[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return Array.from(doc.querySelectorAll('track')).map((el) => ({
    langCode: el.getAttribute('lang_code') ?? '',
    name: el.getAttribute('name') ?? '',
    kind: el.getAttribute('kind') ?? '',
    isAsr: (el.getAttribute('kind') ?? '') === 'asr',
  }))
}

function pickTrack(tracks: CaptionTrack[], preferred: string[]): CaptionTrack | null {
  if (!tracks.length) return null
  for (const p of preferred) {
    const exact = tracks.find((t) => t.langCode.toLowerCase() === p.toLowerCase() && !t.isAsr)
    if (exact) return exact
  }
  for (const p of preferred) {
    const asr = tracks.find((t) => t.langCode.toLowerCase() === p.toLowerCase())
    if (asr) return asr
  }
  return tracks[0] ?? null
}

function parseCaptionXml(xml: string): SubtitleBlock[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const items = Array.from(doc.querySelectorAll('text'))
  const out: SubtitleBlock[] = []
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    const start = Number(el.getAttribute('start') ?? '0')
    const dur = Number(el.getAttribute('dur') ?? '0')
    const nextStart = Number(items[i + 1]?.getAttribute('start') ?? '0')
    const endSec = dur > 0 ? start + dur : nextStart > start ? nextStart : start + 2
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    out.push({
      id: `ytcap-${i + 1}`,
      index: out.length,
      startSec: start,
      endSec,
      text,
    })
  }
  return dedupeSubtitleBlocks(out)
}

export async function fetchAutoCaptionBlocks(
  videoId: string,
  preferredLangs = ['tr', 'en'],
): Promise<{ blocks: SubtitleBlock[]; track: CaptionTrack }> {
  const listRes = await fetch(`/api/youtube/captions/list?videoId=${encodeURIComponent(videoId)}`)
  const listXml = await listRes.text()
  if (!listRes.ok)
    throw new Error(
      summarizeErrorText(listXml) || `Altyazı listesi alınamadı (HTTP ${listRes.status})`,
    )
  const tracks = parseTrackList(listXml)
  const picked = pickTrack(tracks, preferredLangs)
  if (!picked) {
    return fetchFallbackCaptionBlocks(videoId, preferredLangs)
  }

  const q = new URLSearchParams({
    videoId,
    lang: picked.langCode,
    name: picked.name,
    kind: picked.kind,
  })
  const capRes = await fetch(`/api/youtube/captions/track?${q.toString()}`)
  const capXml = await capRes.text()
  if (!capRes.ok)
    throw new Error(
      summarizeErrorText(capXml) || `Altyazı metni alınamadı (HTTP ${capRes.status})`,
    )
  const blocks = parseCaptionXml(capXml)
  if (!blocks.length) {
    return fetchFallbackCaptionBlocks(videoId, [picked.langCode, ...preferredLangs])
  }
  return { blocks, track: picked }
}

async function fetchFallbackCaptionBlocks(
  videoId: string,
  preferredLangs: string[],
): Promise<{ blocks: SubtitleBlock[]; track: CaptionTrack }> {
  let lastErr = 'Bilinmeyen hata'
  for (const lang of preferredLangs) {
    const r = await fetch(
      `/api/youtube/captions/fallback?videoId=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(lang)}`,
    )
    const text = await r.text()
    if (!r.ok) {
      lastErr = summarizeErrorText(text) || `HTTP ${r.status}`
      continue
    }
    let json: FallbackPayload
    try {
      json = JSON.parse(text) as FallbackPayload
    } catch {
      lastErr = summarizeErrorText(text) || 'Geçersiz JSON yanıtı'
      continue
    }
    if (json.error) {
      lastErr = json.error
      continue
    }
    const blocks = dedupeSubtitleBlocks(Array.isArray(json.blocks) ? json.blocks : [])
    if (blocks.length) {
      return {
        blocks,
        track: {
          langCode: json.lang || lang,
          name: 'youtube-transcript fallback',
          kind: 'fallback',
          isAsr: false,
        },
      }
    }
  }
  throw new Error(`Bu video için erişilebilir altyazı bulunamadı (${lastErr})`)
}

