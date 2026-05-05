/** Accepts watch URL, youtu.be short link, or raw 11-char video id */
export function extractYoutubeVideoId(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  if (/^[\w-]{11}$/.test(t)) return t
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').slice(0, 11)
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v')
      if (v && /^[\w-]{11}$/.test(v)) return v
      const m = u.pathname.match(/\/embed\/([\w-]{11})/)
      if (m) return m[1]
      const m2 = u.pathname.match(/\/shorts\/([\w-]{11})/)
      if (m2) return m2[1]
    }
  } catch {
    return null
  }
  return null
}
