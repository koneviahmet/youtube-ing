<script setup lang="ts">
import { shuffle } from '@/lib/vocabGames/shuffle'
import type { VocabCard } from '@/lib/vocabGames/types'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ words: VocabCard[] }>()

type Pt = { x: number; y: number }
type Dir = { dx: number; dy: number }

type FoodItem = {
  /** Sol üst hücre (yatay blok) */
  x: number
  y: number
  /** Kaç sütun kaplıyor (>=1) */
  span: number
  vocabId: string
  text: string
}

/**
 * Sabit kare hücre kenarı (CSS piksel). Sütun/satır sayısı konteyner boyutundan
 * `floor(boyut / CELL_PX)` ile hesaplanır; ızgara ortalanır, tuval alanı ekranı doldurmaya devam eder.
 */
const CELL_PX = 28

const gridCols = ref(20)
const gridRows = ref(16)
/** İlk `resizeCanvas` öncesi boyut değişimi sayılmasın (gereksiz restart önlenir) */
let lastGridKey = ''

/** Daha yavaş tur (ms) */
const TICK_MS = 280
/** Ekranda en fazla kaç farklı kelime / seçenek */
const MAX_EN_FOOD = 6
const STRIKES_MAX = 3
/** Üst bantta kelime/yem çıkmasın (HUD + güvenli boşluk) */
const HUD_RESERVED_ROWS = 3
/** Yeni EN/TR turunda yem yenilenmez (ms); görünüm soluktan opaklığa geçer */
const FOOD_ARM_MS = 2000

/**
 * Görsel segment: `min(cw,ch) * ölçek` (dikdörtgen hücrede ortalanır).
 * Ölçek > 1 komşu “karelerin” üst üste binmesini sağlar (daha akıcı zincir).
 */
const SNAKE_BODY_VISUAL_SCALE = 0.92
const SNAKE_HEAD_VISUAL_SCALE = 1.02

/** Yanlış / çarpma: kırmızı süresi + yeşile dönüş (ms) */
const HURT_RED_MS = 420
const HURT_FADE_MS = 720

/** Bu Chebyshev mesafede (torus) kelime balonu gösterilir */
const FOOD_BUBBLE_MAX_CELLS = 4
const BUBBLE_FONT = '600 13px system-ui, -apple-system, sans-serif'
const BUBBLE_MAX_LINES = 4
/** Türkçe turunda baş üstü düşünce balonu (İngilizce kelime) */
const HEAD_THOUGHT_FONT = '600 14px system-ui, -apple-system, sans-serif'
const HEAD_THOUGHT_MAX_LINES = 3
/** Tam görünür kalma (ms), sonra animasyonlu solukla kaybolma */
const HEAD_THOUGHT_VISIBLE_MS = 3200
const HEAD_THOUGHT_FADE_MS = 1000

const HIGH_SCORE_LS_KEY = 'youtube-ing-vocab-snake-high-score'
/** Doğru Türkçe anlam (tur tamamlama) başına puan */
const POINTS_PER_CORRECT_PAIR = 10
const CELEBRATION_MS = 4200

function loadHighScore(): number {
  try {
    const v = localStorage.getItem(HIGH_SCORE_LS_KEY)
    if (v == null) return 0
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function saveHighScore(n: number) {
  try {
    localStorage.setItem(HIGH_SCORE_LS_KEY, String(Math.floor(n)))
  } catch {
    /* ignore */
  }
}

/**
 * Hücreler sabit `CELL_PX` kare; oyun ızgarası `cols*CELL_PX` × `rows*CELL_PX` ile tuval içinde ortalanır.
 */
function gridMetrics(canvasW: number, canvasH: number) {
  const cols = gridCols.value
  const rows = gridRows.value
  const gw = cols * CELL_PX
  const gh = rows * CELL_PX
  const ox = (canvasW - gw) / 2
  const oy = (canvasH - gh) / 2
  return { cw: CELL_PX, ch: CELL_PX, ox, oy, gw, gh }
}

function fillRoundedCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  const rr = typeof ctx.roundRect === 'function'
  if (rr) {
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
  } else {
    ctx.rect(x, y, w, h)
    ctx.fill()
  }
}

/** Torus üzerinde Chebyshev (kral hareketi) mesafe */
function torusChebyshevDist(ax: number, ay: number, bx: number, by: number): number {
  const C = gridCols.value
  const R = gridRows.value
  const dx = Math.min(Math.abs(ax - bx), C - Math.abs(ax - bx))
  const dy = Math.min(Math.abs(ay - by), R - Math.abs(ay - by))
  return Math.max(dx, dy)
}

function minDistHeadToFood(head: Pt, f: FoodItem): number {
  let m = Infinity
  for (const c of foodCells(f)) {
    m = Math.min(m, torusChebyshevDist(head.x, head.y, c.x, c.y))
  }
  return m
}

function wrapBubbleLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  const pushCur = () => {
    if (cur) {
      lines.push(cur)
      cur = ''
    }
  }
  for (const word of words) {
    if (lines.length >= maxLines) break
    const test = cur ? `${cur} ${word}` : word
    if (ctx.measureText(test).width <= maxW) {
      cur = test
    } else {
      pushCur()
      if (lines.length >= maxLines) break
      if (ctx.measureText(word).width <= maxW) {
        cur = word
      } else {
        let chunk = ''
        for (const ch of word) {
          const t = chunk + ch
          if (ctx.measureText(t).width <= maxW) chunk = t
          else {
            if (chunk) {
              lines.push(chunk)
              chunk = ch
              if (lines.length >= maxLines) break
            } else chunk = ch
          }
        }
        cur = chunk
      }
    }
  }
  pushCur()
  return lines.length ? lines : [text.slice(0, 24)]
}

function fillSpeechBubble(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  bw: number,
  bh: number,
  tipX: number,
  tipY: number,
) {
  const r = 11
  const bm = left + bw / 2
  const bb = top + bh
  const notch = 11

  ctx.beginPath()
  ctx.moveTo(left + r, top)
  ctx.lineTo(left + bw - r, top)
  ctx.arcTo(left + bw, top, left + bw, top + r, r)
  ctx.lineTo(left + bw, bb - r)
  ctx.arcTo(left + bw, bb, left + bw - r, bb, r)
  ctx.lineTo(bm + notch, bb)
  ctx.lineTo(tipX, tipY)
  ctx.lineTo(bm - notch, bb)
  ctx.lineTo(left + r, bb)
  ctx.arcTo(left, bb, left, bb - r, r)
  ctx.lineTo(left, top + r)
  ctx.arcTo(left, top, left + r, top, r)
  ctx.closePath()
  ctx.fillStyle = 'rgba(30, 41, 59, 0.94)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.lineWidth = 1.25
  ctx.stroke()
}

function drawFoodSpeechBubble(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  food: FoodItem,
  cw: number,
  ch: number,
  ox: number,
  oy: number,
  opacity: number,
) {
  ctx.save()
  ctx.globalAlpha = opacity
  const span = Math.min(Math.max(1, food.span), gridCols.value - food.x)
  const fcX = ox + (food.x + span / 2) * cw
  const fcY = oy + (food.y + 0.5) * ch
  const cellMin = Math.min(cw, ch)
  const foodR = cellMin * 0.38

  ctx.font = BUBBLE_FONT
  const padX = 14
  const padY = 10
  const lineGap = 16
  const maxBubbleW = Math.min(280, canvasW - 16)

  const lines = wrapBubbleLines(ctx, food.text, maxBubbleW - padX * 2, BUBBLE_MAX_LINES)
  let maxLineW = 40
  for (const ln of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(ln).width)
  }
  const bubbleW = Math.min(maxBubbleW, maxLineW + padX * 2)
  const bubbleH = padY * 2 + lines.length * lineGap

  const gap = cellMin * 0.42 + 8
  let bx = fcX - bubbleW / 2
  let by = fcY - gap - bubbleH

  const hudBottom = oy + HUD_RESERVED_ROWS * ch + 6
  if (by < hudBottom) {
    by = fcY + gap + ch * 0.35
  }
  if (by + bubbleH > canvasH - 8) {
    by = canvasH - bubbleH - 8
  }
  bx = Math.max(6, Math.min(bx, canvasW - bubbleW - 6))

  const bubbleBottom = by + bubbleH
  /** Ok ucu yılanı takip etmez; ilgili kelimenin (yem) üzerine işaret eder */
  const tipX = fcX
  let tipY = fcY
  if (bubbleBottom <= fcY - foodR * 0.2) {
    tipY = fcY - foodR * 0.85
  } else if (by >= fcY + foodR * 0.2) {
    tipY = fcY + foodR * 0.85
  } else {
    tipY = fcY
  }

  fillSpeechBubble(ctx, bx, by, bubbleW, bubbleH, tipX, tipY)

  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let ly = by + padY
  for (const ln of lines) {
    ctx.fillText(ln, bx + padX, ly)
    ly += lineGap
  }
  ctx.restore()
}

/** Türkçe tur: yediği İngilizce kelime — düşünce balonu (yılan kafasının üstünde) */
function drawSnakeHeadThoughtBubble(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  head: Pt,
  word: string,
  cw: number,
  ch: number,
  ox: number,
  oy: number,
  cellMin: number,
  opacity: number,
) {
  ctx.save()
  ctx.globalAlpha = opacity
  const side = cellMin * SNAKE_HEAD_VISUAL_SCALE
  const px = ox + head.x * cw
  const py = oy + head.y * ch
  const sx = px + (cw - side) / 2
  const sy = py + (ch - side) / 2
  const headCx = sx + side / 2
  const headTopY = sy

  ctx.font = HEAD_THOUGHT_FONT
  const padX = 12
  const padY = 9
  const lineGap = 17
  const maxBubbleW = Math.min(280, canvasW - 16)
  const lines = wrapBubbleLines(ctx, word, maxBubbleW - padX * 2, HEAD_THOUGHT_MAX_LINES)
  let maxLineW = 28
  for (const ln of lines) {
    maxLineW = Math.max(maxLineW, ctx.measureText(ln).width)
  }
  const bubbleW = Math.min(maxBubbleW, maxLineW + padX * 2)
  const bubbleH = padY * 2 + lines.length * lineGap

  const r3 = Math.max(3, cellMin * 0.11)
  const r2 = Math.max(4, cellMin * 0.16)
  const r1 = Math.max(5, cellMin * 0.22)
  const chainBelow = r3 * 2 + r2 * 2 + r1 * 2 + 10

  const hudBottom = oy + HUD_RESERVED_ROWS * ch + 6
  let bx = headCx - bubbleW / 2
  let by = headTopY - chainBelow - bubbleH - 6

  if (by < hudBottom) {
    by = hudBottom
  }
  if (by + bubbleH + chainBelow > canvasH - 10) {
    by = Math.max(hudBottom, canvasH - 10 - bubbleH - chainBelow)
  }
  bx = Math.max(8, Math.min(bx, canvasW - bubbleW - 8))

  const bubbleBottom = by + bubbleH
  const br = 12
  const mx = bx + bubbleW / 2

  ctx.beginPath()
  const rr = typeof ctx.roundRect === 'function'
  if (rr) {
    ctx.roundRect(bx, by, bubbleW, bubbleH, br)
  } else {
    ctx.rect(bx, by, bubbleW, bubbleH)
  }
  ctx.fillStyle = 'rgba(30, 41, 59, 0.94)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.lineWidth = 1.25
  ctx.stroke()

  const lastCy = headTopY - r1 - 4
  const y1 = bubbleBottom + r3 + 3
  const y2 = bubbleBottom + (lastCy - bubbleBottom) * 0.55
  const x2 = mx + (headCx - mx) * 0.28

  const drawPuff = (cx: number, cy: number, r: number) => {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(30, 41, 59, 0.94)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
    ctx.lineWidth = 1.25
    ctx.stroke()
  }

  drawPuff(mx, y1, r3)
  drawPuff(x2, y2, r2)
  drawPuff(headCx, lastCy, r1)

  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let ly = by + padY
  for (const ln of lines) {
    ctx.fillText(ln, bx + padX, ly)
    ly += lineGap
  }
  ctx.restore()
}

const wrapRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const snake = ref<Pt[]>([])
const dir = ref<Dir>({ dx: 1, dy: 0 })
const pendingDir = ref<Dir | null>(null)

const phase = ref<'english' | 'turkish'>('english')
const activeCard = ref<VocabCard | null>(null)
const foods = ref<FoodItem[]>([])
/** Tur yemleri yerleştiğinde performance.now; 0 iken bekleme yok */
const foodsRoundSpawnAt = ref(0)
/** Türkçe turda düşünce balonunun gösterilmeye başladığı an (performance.now) */
const headThoughtShownAt = ref(0)

const strikes = ref(0)
const gameOver = ref(false)
/** performance.now() tabanlı kırmızı flash başlangıcı; 0 = yok */
const lastHurtAt = ref(0)

const score = ref(0)
const highScore = ref(0)
/** Oyun başında kayıtlı rekor (bu oturumda bunu ilk kez geçince kutlama) */
const recordAtSessionStart = ref(0)
const hasBrokenSessionRecord = ref(false)
const showRecordCelebration = ref(false)

let celebrationTimer: ReturnType<typeof setTimeout> | null = null

function triggerRecordCelebration() {
  showRecordCelebration.value = true
  if (celebrationTimer) clearTimeout(celebrationTimer)
  celebrationTimer = window.setTimeout(() => {
    showRecordCelebration.value = false
    celebrationTimer = null
  }, CELEBRATION_MS)
}

function clearCelebrationTimer() {
  if (celebrationTimer) {
    clearTimeout(celebrationTimer)
    celebrationTimer = null
  }
  showRecordCelebration.value = false
}

function confettiStyle(n: number): Record<string, string> {
  const left = `${((n * 73) % 100) + (n % 7) * 0.3}%`
  const delay = `${((n * 17) % 25) * 0.018}s`
  const duration = `${2.2 + (n % 11) * 0.22}s`
  const hue = (n * 47 + n * n) % 360
  return {
    left,
    top: '-12px',
    animationDelay: delay,
    animationDuration: duration,
    backgroundColor: `hsl(${hue} 82% 58%)`,
  }
}

let tickId: ReturnType<typeof setInterval> | null = null
let ro: ResizeObserver | null = null
let hurtAnimId: number | null = null
let foodArmRafId: number | null = null
let thoughtFadeRafId: number | null = null

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

/** 0 = yeşil, 1 = tam kırmızı (tut + geçiş) */
function hurtBlend(now: number): number {
  const t0 = lastHurtAt.value
  if (!t0) return 0
  const dt = now - t0
  if (dt < HURT_RED_MS) return 1
  if (dt < HURT_RED_MS + HURT_FADE_MS) {
    return 1 - easeOutCubic((dt - HURT_RED_MS) / HURT_FADE_MS)
  }
  return 0
}

function rgbMix(g: [number, number, number], r: [number, number, number], t: number) {
  return `rgb(${Math.round(g[0] + (r[0] - g[0]) * t)},${Math.round(g[1] + (r[1] - g[1]) * t)},${Math.round(g[2] + (r[2] - g[2]) * t)})`
}

function triggerHurtFlash() {
  lastHurtAt.value = performance.now()
  if (hurtAnimId != null) cancelAnimationFrame(hurtAnimId)
  const frame = () => {
    draw()
    const now = performance.now()
    if (lastHurtAt.value && now - lastHurtAt.value < HURT_RED_MS + HURT_FADE_MS + 24) {
      hurtAnimId = requestAnimationFrame(frame)
    } else {
      hurtAnimId = null
      lastHurtAt.value = 0
      requestAnimationFrame(draw)
    }
  }
  hurtAnimId = requestAnimationFrame(frame)
}

function stopHurtAnim() {
  if (hurtAnimId != null) {
    cancelAnimationFrame(hurtAnimId)
    hurtAnimId = null
  }
  lastHurtAt.value = 0
}

const needsMoreWords = computed(() => props.words.length < 2)

/** Oyun bitti ekranı: bu turda oyun başındaki rekoru geçildi mi */
const brokeRecordThisGame = computed(
  () => gameOver.value && score.value > recordAtSessionStart.value,
)

function foodArmProgress(now: number): number {
  const t0 = foodsRoundSpawnAt.value
  if (t0 <= 0) return 1
  return Math.min(1, Math.max(0, (now - t0) / FOOD_ARM_MS))
}

function stopFoodArmFadeAnim() {
  if (foodArmRafId != null) {
    cancelAnimationFrame(foodArmRafId)
    foodArmRafId = null
  }
}

function runFoodArmFadeAnim() {
  stopFoodArmFadeAnim()
  const t0 = foodsRoundSpawnAt.value
  if (t0 <= 0) return
  const frame = () => {
    draw()
    if (performance.now() - t0 < FOOD_ARM_MS) {
      foodArmRafId = requestAnimationFrame(frame)
    } else {
      foodArmRafId = null
      requestAnimationFrame(draw)
    }
  }
  foodArmRafId = requestAnimationFrame(frame)
}

/** Türkçe tur düşünce balonu: tam süre sonra smoothstep ile soluklar */
function headThoughtOpacity(now: number): number {
  const t0 = headThoughtShownAt.value
  if (t0 <= 0) return 0
  const elapsed = now - t0
  if (elapsed <= HEAD_THOUGHT_VISIBLE_MS) return 1
  if (elapsed >= HEAD_THOUGHT_VISIBLE_MS + HEAD_THOUGHT_FADE_MS) return 0
  const u = (elapsed - HEAD_THOUGHT_VISIBLE_MS) / HEAD_THOUGHT_FADE_MS
  const s = u * u * (3 - 2 * u)
  return 1 - s
}

function stopThoughtFadeAnim() {
  if (thoughtFadeRafId != null) {
    cancelAnimationFrame(thoughtFadeRafId)
    thoughtFadeRafId = null
  }
}

function runThoughtFadeAnim() {
  stopThoughtFadeAnim()
  const t0 = headThoughtShownAt.value
  if (t0 <= 0) return
  const end = t0 + HEAD_THOUGHT_VISIBLE_MS + HEAD_THOUGHT_FADE_MS
  const frame = () => {
    draw()
    if (performance.now() < end) {
      thoughtFadeRafId = requestAnimationFrame(frame)
    } else {
      thoughtFadeRafId = null
      requestAnimationFrame(draw)
    }
  }
  thoughtFadeRafId = requestAnimationFrame(frame)
}

function foodCells(f: FoodItem): Pt[] {
  const n = Math.min(Math.max(1, f.span), gridCols.value - f.x)
  const out: Pt[] = []
  for (let i = 0; i < n; i++) out.push({ x: f.x + i, y: f.y })
  return out
}

function buildTakenSet(exclude: Pt[]): Set<string> {
  const taken = new Set<string>()
  for (const p of snake.value) taken.add(`${p.x},${p.y}`)
  for (const p of exclude) taken.add(`${p.x},${p.y}`)
  for (const f of foods.value) {
    for (const c of foodCells(f)) taken.add(`${c.x},${c.y}`)
  }
  return taken
}

/** Yatay `span` uzunluğunda boş slot; yoksa null. */
function findHorizontalPlacement(
  span: number,
  exclude: Pt[],
  minRowY: number,
): Pt | null {
  const sp = Math.min(Math.max(1, span), gridCols.value)
  const taken = buildTakenSet(exclude)
  const candidates: Pt[] = []
  const C = gridCols.value
  const R = gridRows.value
  for (let y = minRowY; y < R; y++) {
    for (let x = 0; x <= C - sp; x++) {
      let ok = true
      for (let i = 0; i < sp; i++) {
        if (taken.has(`${x + i},${y}`)) {
          ok = false
          break
        }
      }
      if (ok) candidates.push({ x, y })
    }
  }
  if (!candidates.length) return null
  return candidates[Math.floor(Math.random() * candidates.length)]!
}

function placeFoodItem(
  text: string,
  vocabId: string,
  exclude: Pt[],
): boolean {
  const want = 1
  const pos = findHorizontalPlacement(want, exclude, HUD_RESERVED_ROWS)
  if (!pos) return false
  const cells = foodCells({
    x: pos.x,
    y: pos.y,
    span: want,
    vocabId,
    text,
  })
  exclude.push(...cells)
  foods.value.push({
    x: pos.x,
    y: pos.y,
    span: want,
    vocabId,
    text,
  })
  return true
}

function dedupeWordsById(words: readonly VocabCard[]): VocabCard[] {
  const map = new Map<string, VocabCard>()
  for (const w of words) {
    if (!map.has(w.id)) map.set(w.id, w)
  }
  return [...map.values()]
}

function initSnake() {
  const cx = Math.floor(gridCols.value / 2)
  const cy = Math.floor(gridRows.value / 2)
  snake.value = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ]
  dir.value = { dx: 1, dy: 0 }
  pendingDir.value = null
}

function spawnEnglishRound() {
  stopThoughtFadeAnim()
  headThoughtShownAt.value = 0
  phase.value = 'english'
  activeCard.value = null
  foods.value = []
  const pool = shuffle(dedupeWordsById(props.words))
  const n = Math.min(MAX_EN_FOOD, Math.max(1, pool.length))
  const chosen = pool.slice(0, n)
  const exclude: Pt[] = []
  const placedIds = new Set<string>()
  for (const w of chosen) {
    if (placedIds.has(w.id)) continue
    placedIds.add(w.id)
    if (!placeFoodItem(w.word, w.id, exclude)) break
  }
  foodsRoundSpawnAt.value = performance.now()
  runFoodArmFadeAnim()
}

function spawnTurkishRound(card: VocabCard) {
  phase.value = 'turkish'
  foods.value = []
  const others = dedupeWordsById(props.words).filter((w) => w.id !== card.id)
  const norm = (s: string) => s.trim().toLowerCase()
  const seenMeanings = new Set<string>()
  seenMeanings.add(norm(card.meaning_tr))

  const wrongPick: { vocabId: string; text: string }[] = []
  const shuffled = shuffle([...others])
  for (const w of shuffled) {
    if (wrongPick.length >= 3) break
    const key = norm(w.meaning_tr)
    if (seenMeanings.has(key)) continue
    seenMeanings.add(key)
    wrongPick.push({ vocabId: w.id, text: w.meaning_tr })
  }

  const items: { vocabId: string; text: string }[] = [
    { vocabId: card.id, text: card.meaning_tr },
    ...wrongPick,
  ]
  const placed = shuffle(items)
  const exclude: Pt[] = []
  const placedIds = new Set<string>()
  for (const it of placed) {
    if (placedIds.has(it.vocabId)) continue
    placedIds.add(it.vocabId)
    if (!placeFoodItem(it.text, it.vocabId, exclude)) break
  }
  foodsRoundSpawnAt.value = performance.now()
  runFoodArmFadeAnim()
  headThoughtShownAt.value = performance.now()
  runThoughtFadeAnim()
}

function opposite(a: Dir, b: Dir): boolean {
  return a.dx === -b.dx && a.dy === -b.dy
}

function sameDir(a: Dir, b: Dir): boolean {
  return a.dx === b.dx && a.dy === b.dy
}

function queueDirection(next: Dir) {
  if (gameOver.value || needsMoreWords.value) return
  const cur = dir.value
  if (opposite(next, cur)) return
  /** Zaten bu yönde gidiyorsa kuyruğa yazma (dokunma “ileri” istemiyor) */
  if (sameDir(next, cur)) return
  pendingDir.value = next
}

/** Baştan dokunuşa birim vektör → 4 yön (ekran y aşağı pozitif). */
function dirFromVector(vx: number, vy: number): Dir {
  const a = Math.atan2(vy, vx)
  if (a >= -Math.PI / 4 && a < Math.PI / 4) return { dx: 1, dy: 0 }
  if (a >= Math.PI / 4 && a < (3 * Math.PI) / 4) return { dx: 0, dy: 1 }
  if (a >= (3 * Math.PI) / 4 || a < (-3 * Math.PI) / 4) return { dx: -1, dy: 0 }
  return { dx: 0, dy: -1 }
}

/** Yılan başı hücre merkezi → dokunuş; sadece dönüş için yön kuyruğa girer. */
function onSteer(e: PointerEvent) {
  const wrap = wrapRef.value
  if (!wrap || gameOver.value || needsMoreWords.value) return
  const rect = wrap.getBoundingClientRect()
  const rw = rect.width
  const rh = rect.height
  if (rw < 8 || rh < 8) return
  const tapX = e.clientX - rect.left
  const tapY = e.clientY - rect.top
  const head = snake.value[0]
  if (!head) return
  const { cw, ch, ox, oy } = gridMetrics(rw, rh)
  const hx = ox + (head.x + 0.5) * cw
  const hy = oy + (head.y + 0.5) * ch
  const vx = tapX - hx
  const vy = tapY - hy
  const len = Math.hypot(vx, vy)
  if (len < 14) return
  queueDirection(dirFromVector(vx, vy))
}

function onKeyDown(e: KeyboardEvent) {
  const k = e.key
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) return
  e.preventDefault()
  if (k === 'ArrowUp') queueDirection({ dx: 0, dy: -1 })
  if (k === 'ArrowDown') queueDirection({ dx: 0, dy: 1 })
  if (k === 'ArrowLeft') queueDirection({ dx: -1, dy: 0 })
  if (k === 'ArrowRight') queueDirection({ dx: 1, dy: 0 })
}

function wrapCoord(x: number, y: number): Pt {
  const C = gridCols.value
  const R = gridRows.value
  return {
    x: ((x % C) + C) % C,
    y: ((y % R) + R) % R,
  }
}

function tick() {
  if (gameOver.value || needsMoreWords.value) return

  if (pendingDir.value) {
    dir.value = pendingDir.value
    pendingDir.value = null
  }

  const head = snake.value[0]!
  const d = dir.value
  let nx = head.x + d.dx
  let ny = head.y + d.dy
  ;({ x: nx, y: ny } = wrapCoord(nx, ny))

  const newHead: Pt = { x: nx, y: ny }

  const nowTick = performance.now()
  const foodIdx =
    foodArmProgress(nowTick) >= 1
      ? foods.value.findIndex((f) =>
          foodCells(f).some((c) => c.x === newHead.x && c.y === newHead.y),
        )
      : -1
  let grow = false

  if (foodIdx >= 0) {
    const eaten = foods.value[foodIdx]!
    if (phase.value === 'english') {
      const card = props.words.find((w) => w.id === eaten.vocabId)
      if (card) {
        activeCard.value = card
        spawnTurkishRound(card)
        grow = true
      }
    } else {
      const correctId = activeCard.value?.id
      if (correctId && eaten.vocabId === correctId) {
        grow = true
        score.value += POINTS_PER_CORRECT_PAIR
        if (score.value > highScore.value) {
          highScore.value = score.value
          saveHighScore(highScore.value)
        }
        if (!hasBrokenSessionRecord.value && score.value > recordAtSessionStart.value) {
          hasBrokenSessionRecord.value = true
          triggerRecordCelebration()
        }
        spawnEnglishRound()
      } else {
        strikes.value += 1
        foods.value.splice(foodIdx, 1)
        triggerHurtFlash()
        if (strikes.value >= STRIKES_MAX) {
          gameOver.value = true
          stopTick()
          requestAnimationFrame(draw)
          return
        }
      }
    }
  }

  /** Büyümüyorsa kuyruk bu tur kayar — kuyruğa basmak çarpışma sayılmaz */
  const bodyForCollision =
    snake.value.length <= 1 ? [] : grow ? snake.value : snake.value.slice(0, -1)

  if (bodyForCollision.some((s) => s.x === newHead.x && s.y === newHead.y)) {
    strikes.value += 1
    triggerHurtFlash()
    if (strikes.value >= STRIKES_MAX) {
      gameOver.value = true
      stopTick()
    }
    requestAnimationFrame(draw)
    return
  }

  snake.value.unshift(newHead)
  if (!grow) snake.value.pop()

  requestAnimationFrame(draw)
}

function stopTick() {
  if (tickId) {
    clearInterval(tickId)
    tickId = null
  }
}

function startTick() {
  stopTick()
  tickId = setInterval(tick, TICK_MS)
}

function restart() {
  stopHurtAnim()
  stopFoodArmFadeAnim()
  stopThoughtFadeAnim()
  clearCelebrationTimer()
  gameOver.value = false
  strikes.value = 0
  score.value = 0
  recordAtSessionStart.value = loadHighScore()
  highScore.value = loadHighScore()
  hasBrokenSessionRecord.value = false
  initSnake()
  spawnEnglishRound()
  startTick()
  requestAnimationFrame(draw)
}

/** Grid küçüldüğünde koordinatları sınırla (oyun bitmiş / kelime yokken yeniden boyut) */
function clampStateToNewGrid() {
  const c = gridCols.value
  const r = gridRows.value
  snake.value = snake.value.map((p) => ({
    x: ((p.x % c) + c) % c,
    y: ((p.y % r) + r) % r,
  }))
  foods.value = foods.value.filter((f) => {
    const span = Math.min(Math.max(1, f.span), c - f.x)
    return f.x >= 0 && f.y >= 0 && f.y < r && f.x + span <= c
  })
}

function syncGridToViewport(w: number, h: number) {
  const cols = Math.max(1, Math.floor(w / CELL_PX))
  const rows = Math.max(1, Math.floor(h / CELL_PX))
  const key = `${cols}x${rows}`
  if (key === lastGridKey) return
  const previous = lastGridKey
  lastGridKey = key
  gridCols.value = cols
  gridRows.value = rows
  if (previous === '') return
  if (!needsMoreWords.value && !gameOver.value) {
    restart()
  } else {
    clampStateToNewGrid()
    requestAnimationFrame(draw)
  }
}

function resizeCanvas() {
  const wrap = wrapRef.value
  const canvas = canvasRef.value
  if (!wrap || !canvas) return
  const r = wrap.getBoundingClientRect()
  const w = Math.max(160, r.width)
  const h = Math.max(160, r.height || wrap.clientHeight || 320)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  syncGridToViewport(w, h)
  draw()
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.clientWidth || canvas.offsetWidth || 300
  const h = canvas.clientHeight || canvas.offsetHeight || 400
  const { cw, ch, ox, oy, gw, gh } = gridMetrics(w, h)
  const cellMin = Math.min(cw, ch)
  const now = performance.now()
  const armProg = foodArmProgress(now)
  /** Turun başında soluk (≈0.3), 2 sn içinde tam opaklığa */
  const foodFadeAlpha = 0.28 + 0.72 * armProg

  ctx.fillStyle = '#0f1419'
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  const gc = gridCols.value
  const gr = gridRows.value
  for (let x = 0; x <= gc; x++) {
    ctx.beginPath()
    ctx.moveTo(ox + x * cw, oy)
    ctx.lineTo(ox + x * cw, oy + gh)
    ctx.stroke()
  }
  for (let y = 0; y <= gr; y++) {
    ctx.beginPath()
    ctx.moveTo(ox, oy + y * ch)
    ctx.lineTo(ox + gw, oy + y * ch)
    ctx.stroke()
  }

  const foodR = cellMin * 0.38
  ctx.save()
  ctx.globalAlpha = foodFadeAlpha
  for (const f of foods.value) {
    /** Doğru şık tek renkle belli olmasın — metin yakında balonda */
    for (const c of foodCells(f)) {
      const cx = ox + (c.x + 0.5) * cw
      const cy = oy + (c.y + 0.5) * ch
      ctx.beginPath()
      ctx.arc(cx, cy, foodR, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(96, 165, 250, 0.34)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.restore()

  const hb = hurtBlend(now)
  const headG: [number, number, number] = [34, 197, 94]
  const headR: [number, number, number] = [248, 113, 113]
  const bodyG: [number, number, number] = [22, 163, 74]
  const bodyR: [number, number, number] = [220, 38, 38]

  for (let i = snake.value.length - 1; i >= 0; i--) {
    const seg = snake.value[i]!
    const isHead = i === 0
    const px = ox + seg.x * cw
    const py = oy + seg.y * ch
    const side =
      cellMin * (isHead ? SNAKE_HEAD_VISUAL_SCALE : SNAKE_BODY_VISUAL_SCALE)
    const sx = px + (cw - side) / 2
    const sy = py + (ch - side) / 2
    const rr = side * 0.42
    ctx.fillStyle = isHead ? rgbMix(headG, headR, hb) : rgbMix(bodyG, bodyR, hb)
    fillRoundedCell(ctx, sx, sy, side, side, rr)
  }

  const head = snake.value[0]
  if (head && foods.value.length) {
    for (const f of foods.value) {
      if (minDistHeadToFood(head, f) <= FOOD_BUBBLE_MAX_CELLS) {
        drawFoodSpeechBubble(ctx, w, h, f, cw, ch, ox, oy, foodFadeAlpha)
      }
    }
  }

  if (head && phase.value === 'turkish' && activeCard.value) {
    const thoughtAlpha = headThoughtOpacity(now)
    if (thoughtAlpha > 0.015) {
      drawSnakeHeadThoughtBubble(
        ctx,
        w,
        h,
        head,
        activeCard.value.word,
        cw,
        ch,
        ox,
        oy,
        cellMin,
        thoughtAlpha,
      )
    }
  }
}

watch(
  () => props.words,
  () => {
    if (!needsMoreWords.value) restart()
  },
  { deep: true },
)

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown)
  await nextTick()
  resizeCanvas()
  ro = new ResizeObserver(() => resizeCanvas())
  if (wrapRef.value) ro.observe(wrapRef.value)
  if (!needsMoreWords.value) restart()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  stopTick()
  stopHurtAnim()
  stopFoodArmFadeAnim()
  stopThoughtFadeAnim()
  clearCelebrationTimer()
  ro?.disconnect()
})
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    :class="needsMoreWords ? 'gap-3' : 'h-full min-h-[50dvh] md:min-h-0'"
  >
    <p
      v-if="needsMoreWords"
      class="shrink-0 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn"
    >
      Bu oyun için en az 2 kelime seçin.
    </p>

    <template v-else>
      <div
        ref="wrapRef"
        class="relative min-h-0 w-full flex-1 overflow-hidden rounded-none border-0 border-white/10 bg-[#0f1419] md:rounded-xl md:border"
        style="touch-action: none"
      >
        <canvas
          ref="canvasRef"
          class="pointer-events-none absolute inset-0 block h-full w-full"
        />

        <p
          v-if="phase === 'turkish' && activeCard"
          class="sr-only"
          aria-live="polite"
        >
          {{ activeCard.word }}
        </p>

        <!-- Görünmez tam yüzey: tıklanan nokta ile yılan başına göre yön -->
        <div
          class="absolute inset-0 z-[1]"
          aria-hidden="true"
          @pointerdown.prevent="onSteer"
        />

        <div
          class="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 px-2 py-1.5 md:px-3"
        >
          <div class="min-w-0 flex flex-col gap-0.5 text-[11px] leading-tight tabular-nums md:text-xs">
            <p
              class="text-fg-muted/90"
              aria-live="polite"
            >
              {{ strikes }}/{{ STRIKES_MAX }} · {{ phase === 'english' ? 'EN' : 'TR' }}
            </p>
            <p class="font-medium text-accent/95">
              Puan {{ score }}
              <span class="font-normal text-fg-muted">
                · Rekor {{ highScore }}
              </span>
            </p>
          </div>

          <button
            type="button"
            class="pointer-events-auto shrink-0 touch-manipulation rounded border border-white/15 bg-black/40 px-2 py-1 text-[11px] text-fg-muted hover:border-white/25 hover:text-fg md:text-xs"
            @click="restart"
          >
            Sıfırla
          </button>
        </div>

        <!-- Rekor kutlaması + konfeti -->
        <div
          v-if="showRecordCelebration"
          class="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-start overflow-hidden pt-[min(22%,8rem)]"
          aria-live="assertive"
          role="status"
        >
          <div
            class="animate-record-pop rounded-xl border border-accent/50 bg-gradient-to-b from-accent/25 to-surface/95 px-5 py-3 text-center shadow-xl backdrop-blur-sm"
          >
            <p class="text-lg font-bold text-accent md:text-xl">
              Yeni rekor!
            </p>
            <p class="mt-1 text-sm text-fg-muted">
              Harika gidiyorsun — {{ score }} puan
            </p>
          </div>
          <div class="pointer-events-none absolute inset-0 overflow-hidden">
            <span
              v-for="n in 72"
              :key="'cf-' + n"
              class="snake-confetti absolute h-2.5 w-2 rounded-[2px] shadow-sm"
              :style="confettiStyle(n)"
            />
          </div>
        </div>

        <div
          v-if="gameOver"
          class="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-black/75 p-4 text-center backdrop-blur-[2px]"
        >
          <p class="text-lg font-semibold text-fg">
            Oyun bitti
          </p>
          <p class="max-w-lg text-base text-fg-muted md:text-lg">
            3 yanlış seçim veya kendi kuyruğuna çarpma sınırına ulaşıldı.
          </p>
          <p
            v-if="brokeRecordThisGame"
            class="max-w-md rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-base font-semibold text-accent"
          >
            Tebrikler — bu oyunda rekoru geçtin ({{ score }} puan).
          </p>
          <p
            v-else
            class="max-w-md text-sm text-fg-muted"
          >
            Bu oyunda kayıtlı rekoru geçemedin (oyun başı rekoru {{ recordAtSessionStart }} puan). Bu tur:
            {{ score }} puan · güncel liste rekoru {{ highScore }} puan.
          </p>
          <button
            type="button"
            class="min-h-12 touch-manipulation rounded-xl border border-accent/50 bg-accent/20 px-8 py-3 text-lg font-semibold text-accent hover:bg-accent/30"
            @click="restart"
          >
            Tekrar oyna
          </button>
        </div>
      </div>

      <p class="sr-only">
        Yön için yüzeye dokunun: yılan başına göre dokunduğunuz yöne döner. Ok tuşları da çalışır. Önce İngilizce
        kelime, sonra doğru Türkçe anlam.
      </p>
    </template>
  </div>
</template>

<style scoped>
@keyframes snake-confetti-fall {
  0% {
    transform: translateY(0) translateX(0) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) translateX(18px) rotate(540deg);
    opacity: 0.92;
  }
}

.snake-confetti {
  animation-name: snake-confetti-fall;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes record-pop {
  0% {
    transform: scale(0.85);
    opacity: 0;
  }
  18% {
    transform: scale(1.04);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-record-pop {
  animation: record-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
</style>
