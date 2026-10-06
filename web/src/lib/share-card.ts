// A ready-to-post image of a group (feed 4:5 or story 9:16), drawn on a canvas in the app's own style:
// the kind's landing art under a dark band, Space Mono label, Cormorant Garamond title, DM Sans figures,
// and a QR code to the group's link. Everything is same-origin, so the canvas exports cleanly.

import { renderSVG } from 'uqr'

export type ShareFormat = 'post' | 'story'
export const SHARE_SIZE: Record<ShareFormat, { w: number; h: number }> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
}

export type ShareCardInput = {
  image: string // background art, same origin
  label: string // mono, uppercase
  status: string
  title: string
  amount: string // "80 tUSDT"
  amountOf: string // "of 120 tUSDT", or ''
  progress: number | null // 0..1, null = no bar
  done: boolean // target reached / everyone paid up: the bar turns green
  meta: string
  cta: string // "Chip in on coinAI"
  link: string // the URL the QR opens
  scanHint: string
}

const GOLD = '#d5aa61'
const GREEN = '#8fc9a3'
const INK = '#0b0b0b'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image ${src}`))
    img.src = src
  })
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
}

export async function renderShareCard(input: ShareCardInput, format: ShareFormat): Promise<Blob> {
  const { w, h } = SHARE_SIZE[format]
  await Promise.all([
    document.fonts.load('600 96px "Cormorant Garamond"'),
    document.fonts.load('700 72px "DM Sans"'),
    document.fonts.load('500 32px "DM Sans"'),
    document.fonts.load('700 26px "Space Mono"'),
  ]).catch(() => {})
  const [art, logo, qr] = await Promise.all([
    loadImage(input.image),
    loadImage('/logo-dark.png'),
    loadImage(URL.createObjectURL(new Blob([renderSVG(input.link)], { type: 'image/svg+xml' }))),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const pad = 72

  // art + the dark band the text sits on
  cover(ctx, art, w, h)
  const shade = ctx.createLinearGradient(0, 0, 0, h)
  shade.addColorStop(0, 'rgba(11,11,11,0.35)')
  shade.addColorStop(format === 'story' ? 0.38 : 0.3, 'rgba(11,11,11,0.15)')
  shade.addColorStop(format === 'story' ? 0.6 : 0.52, 'rgba(11,11,11,0.78)')
  shade.addColorStop(1, 'rgba(11,11,11,0.94)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, w, h)

  // top: brand left, status right
  ctx.drawImage(logo, pad, pad, 64, 64)
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 44px "DM Sans"'
  ctx.textBaseline = 'middle'
  spaced(ctx, 0)
  ctx.fillText('coinAI', pad + 80, pad + 34)
  ctx.font = '700 24px "Space Mono"'
  spaced(ctx, 4)
  const status = input.status.toUpperCase()
  const sw = ctx.measureText(status).width + 48
  roundRect(ctx, w - pad - sw, pad + 8, sw, 52, 26)
  ctx.fillStyle = 'rgba(244,237,224,0.92)'
  ctx.fill()
  ctx.fillStyle = INK
  ctx.fillText(status, w - pad - sw + 24, pad + 35)

  // bottom block, laid out upwards from the footer
  const qrSize = 196
  const footerTop = h - pad - qrSize
  ctx.textBaseline = 'alphabetic'

  // footer: QR + call to action
  roundRect(ctx, pad, footerTop, qrSize, qrSize, 24)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.drawImage(qr, pad + 14, footerTop + 14, qrSize - 28, qrSize - 28)
  const textX = pad + qrSize + 40
  const textW = w - pad - textX
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 40px "DM Sans"'
  spaced(ctx, 0)
  wrap(ctx, input.cta, textW, 2).forEach((line, i) => ctx.fillText(line, textX, footerTop + 56 + i * 48))
  ctx.font = '400 26px "Space Mono"'
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(wrap(ctx, input.link.replace(/^https?:\/\//, ''), textW, 1)[0], textX, footerTop + 150)
  ctx.font = '500 26px "DM Sans"'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(input.scanHint, textX, footerTop + 188)

  // divider
  let y = footerTop - 48
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(pad, y, w - pad * 2, 2)

  // meta
  y -= 40
  ctx.font = '500 32px "DM Sans"'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(wrap(ctx, input.meta, w - pad * 2, 1)[0], pad, y)

  // progress
  if (input.progress !== null) {
    y -= 52
    roundRect(ctx, pad, y, w - pad * 2, 16, 8)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.fill()
    const fill = Math.max(0.02, Math.min(1, input.progress)) * (w - pad * 2)
    roundRect(ctx, pad, y, fill, 16, 8)
    ctx.fillStyle = input.done ? GREEN : GOLD
    ctx.fill()
    y -= 28
  } else y -= 20

  // amount
  ctx.font = '700 76px "DM Sans"'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(input.amount, pad, y)
  if (input.amountOf) {
    const aw = ctx.measureText(input.amount).width
    ctx.font = '400 36px "DM Sans"'
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(input.amountOf, pad + aw + 20, y)
  }

  // title (up to 3 lines on a post, 4 on a story), then the mono label above it
  ctx.font = '600 96px "Cormorant Garamond"'
  ctx.fillStyle = '#ffffff'
  const lines = wrap(ctx, input.title, w - pad * 2, format === 'story' ? 4 : 3)
  y -= 112
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y)
    y -= 98
  }
  ctx.font = '700 26px "Space Mono"'
  spaced(ctx, 6)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillText(wrap(ctx, input.label.toUpperCase(), w - pad * 2, 1)[0], pad, y + 8)

  URL.revokeObjectURL(qr.src)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas export failed'))), 'image/png'))
}
