import vue from '@vitejs/plugin-vue'
import type { IncomingMessage } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { fetchTranscript } from 'youtube-transcript'
import { defineConfig, loadEnv } from 'vite'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isGoogleBlockHtml(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes("<title>sorry...</title>") ||
    t.includes("we're sorry") ||
    t.includes('automated queries')
  )
}

/** Dev-only proxy: GEMINI_API_KEY tarayıcıya gitmez. Üretimde gerçek bir backend gerekir. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.GEMINI_API_KEY

  return {
    plugins: [
      vue(),
      {
        name: 'gemini-dev-proxy',
        configureServer(server) {
          server.middlewares.use('/api/youtube/captions/fallback', async (req, res, next) => {
            if (req.method !== 'GET') return next()
            try {
              const u = new URL(req.url ?? '', 'http://local')
              const videoId = (u.searchParams.get('videoId') ?? '').trim()
              const lang = (u.searchParams.get('lang') ?? '').trim()
              if (!videoId) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'videoId gerekli' }))
                return
              }
              const rows = await fetchTranscript(videoId, lang ? { lang } : undefined)
              const blocks = rows.map((r, i) => ({
                id: `ytlib-${i + 1}`,
                index: i,
                startSec: Number(r.offset ?? 0),
                endSec: Number((r.offset ?? 0) + (r.duration || 2)),
                text: String(r.text ?? '').replace(/\s+/g, ' ').trim(),
              }))
              const filtered = blocks.filter((b) => b.text)
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ blocks: filtered, lang: rows[0]?.lang ?? lang ?? '' }))
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              const msg = String(e)
              if (isGoogleBlockHtml(msg)) {
                res.end(
                  JSON.stringify({
                    error:
                      'Google otomatik sorguları geçici olarak engelledi. Bir süre sonra tekrar deneyin veya yerel .srt yükleyin.',
                    code: 'GOOGLE_BLOCKED',
                  }),
                )
                return
              }
              res.end(JSON.stringify({ error: msg }))
            }
          })

          server.middlewares.use('/api/youtube/captions/list', async (req, res, next) => {
            if (req.method !== 'GET') return next()
            try {
              const u = new URL(req.url ?? '', 'http://local')
              const videoId = (u.searchParams.get('videoId') ?? '').trim()
              if (!videoId) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'videoId gerekli' }))
                return
              }
              const upstream = await fetch(
                `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
              )
              const text = await upstream.text()
              if (isGoogleBlockHtml(text)) {
                res.statusCode = 429
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    error:
                      'Google otomatik sorguları geçici olarak engelledi. Bir süre sonra tekrar deneyin veya yerel .srt yükleyin.',
                    code: 'GOOGLE_BLOCKED',
                  }),
                )
                return
              }
              res.statusCode = upstream.status
              res.setHeader(
                'Content-Type',
                upstream.headers.get('content-type') ?? 'application/xml; charset=utf-8',
              )
              res.end(text)
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: String(e) }))
            }
          })

          server.middlewares.use('/api/youtube/captions/track', async (req, res, next) => {
            if (req.method !== 'GET') return next()
            try {
              const u = new URL(req.url ?? '', 'http://local')
              const videoId = (u.searchParams.get('videoId') ?? '').trim()
              const lang = (u.searchParams.get('lang') ?? '').trim()
              const name = (u.searchParams.get('name') ?? '').trim()
              const kind = (u.searchParams.get('kind') ?? '').trim()
              if (!videoId || !lang) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'videoId ve lang gerekli' }))
                return
              }
              const q = new URLSearchParams({
                v: videoId,
                lang,
                fmt: 'srv3',
              })
              if (name) q.set('name', name)
              if (kind) q.set('kind', kind)
              const upstream = await fetch(`https://video.google.com/timedtext?${q.toString()}`)
              const text = await upstream.text()
              if (isGoogleBlockHtml(text)) {
                res.statusCode = 429
                res.setHeader('Content-Type', 'application/json')
                res.end(
                  JSON.stringify({
                    error:
                      'Google otomatik sorguları geçici olarak engelledi. Bir süre sonra tekrar deneyin veya yerel .srt yükleyin.',
                    code: 'GOOGLE_BLOCKED',
                  }),
                )
                return
              }
              res.statusCode = upstream.status
              res.setHeader(
                'Content-Type',
                upstream.headers.get('content-type') ?? 'application/xml; charset=utf-8',
              )
              res.end(text)
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: String(e) }))
            }
          })

          server.middlewares.use('/api/gemini/generateContent', async (req, res, next) => {
            if (req.method !== 'POST') return next()
            if (!apiKey) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'GEMINI_API_KEY eksik (.env)' }))
              return
            }
            try {
              const raw = await readBody(req)
              const parsed = JSON.parse(raw) as { model?: string } & Record<string, unknown>
              const model =
                typeof parsed.model === 'string' && parsed.model.trim()
                  ? parsed.model.trim()
                  : 'gemini-2.0-flash'
              const geminiBody = { ...parsed }
              delete geminiBody.model
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
              const upstream = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': apiKey,
                },
                body: JSON.stringify(geminiBody),
              })
              const text = await upstream.text()
              res.statusCode = upstream.status
              res.setHeader(
                'Content-Type',
                upstream.headers.get('content-type') ?? 'application/json',
              )
              res.end(text)
            } catch (e) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: String(e) }))
            }
          })
        },
      },
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
