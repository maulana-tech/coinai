// Daily statement as a PDF attachment, in coinAI's own visual language: cream paper, serif
// headings, mono uppercase labels, hairline rules, brand green — no icons, emoji or gradients.
// Uses the 14 standard PDF fonts (no font files to ship), which only cover Latin text, so
// Chinese reports skip the attachment and rely on the HTML email.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { MarketSnapshot } from '../../shared/market.js'
import { explorerTx, type UserState } from './chain.js'
import type { Target } from './guard.js'
import { EMAIL_LABELS, money } from './email.js'
import type { Locale, RunResult } from './swarm.js'

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const COL = {
  paper: hex('#f7f3ea'),
  ink: hex('#193d2d'),
  primary: hex('#1c4934'),
  muted: hex('#5f6f63'),
  line: hex('#d9d0bb'),
  soft: hex('#efe8d8'),
  gold: hex('#b8893a'),
  up: hex('#2f7a4f'),
  down: hex('#b3412f'),
  white: rgb(1, 1, 1),
}
const W = 595.28 // A4
const H = 841.89
const M = 48
const CONTENT = W - 2 * M

// Characters LLMs like that the WinAnsi-encoded standard fonts can't draw.
const REPLACE: Record<string, string> = { '‑': '-', '‐': '-', '−': '-', '≈': '~', '→': '->', '←': '<-', ' ': ' ', ' ': ' ', ' ': ' ' }

function sanitize(font: PDFFont, text: string): string {
  let out = ''
  for (const ch of text.replace(/[‑‐−≈→←   ]/g, (c) => REPLACE[c])) {
    try {
      font.encodeText(ch)
      out += ch
    } catch {
      /* drop characters the font can't encode */
    }
  }
  return out
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n').map((p) => sanitize(font, p))) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

export async function renderReportPdf(opts: {
  run: RunResult
  state: UserState
  market: MarketSnapshot | null
  locale: Locale
}): Promise<Uint8Array | null> {
  const { run, state, market, locale } = opts
  if (locale === 'zh') return null
  const t = EMAIL_LABELS[locale]
  const doc = await PDFDocument.create()
  doc.setTitle(`coinAI — ${t.kicker}`)
  doc.setAuthor('coinAI')
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const mono = await doc.embedFont(StandardFonts.Courier)
  const date = new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'long' }).format(new Date(run.at))

  const pages: PDFPage[] = []
  let page!: PDFPage
  let y = 0
  const newPage = () => {
    page = doc.addPage([W, H])
    pages.push(page)
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: COL.paper })
    y = H - M
  }
  const ensure = (h: number) => {
    if (y - h < M + 40) newPage()
  }
  const text = (s: string, x: number, yy: number, font: PDFFont, size: number, color = COL.ink) =>
    page.drawText(sanitize(font, s), { x, y: yy, font, size, color })
  const rule = (yy: number, color = COL.line) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.5, color })
  const labelAt = (s: string, x: number, yy: number) => text(s.toUpperCase().split('').join(' '), x, yy, mono, 6.5, COL.muted)
  const section = (title: string) => {
    ensure(40)
    y -= 18
    labelAt(title, M, y)
    y -= 10
  }
  const paragraph = (s: string, font: PDFFont, size: number, color = COL.ink, x = M, width = CONTENT, lead = 1.45) => {
    for (const line of wrap(font, s, size, width)) {
      ensure(size * lead)
      y -= size * lead
      text(line, x, y, font, size, color)
    }
  }

  newPage()

  // Header
  text('coinAI', M, y - 26, serif, 30, COL.primary)
  const kicker = `${t.kicker} / ${date}`.toUpperCase()
  text(kicker, W - M - mono.widthOfTextAtSize(sanitize(mono, kicker), 7.5), y - 14, mono, 7.5, COL.muted)
  text('BNB SMART CHAIN TESTNET', W - M - mono.widthOfTextAtSize('BNB SMART CHAIN TESTNET', 7.5), y - 26, mono, 7.5, COL.muted)
  y -= 40
  rule(y, COL.primary)

  // Lead sentence
  y -= 8
  paragraph(run.report.split('\n').find((l) => l.trim()) ?? '', serif, 15, COL.ink, M, CONTENT, 1.3)

  // Summary boxes
  const invested = state.vaults.reduce((s, v) => s + v.userPosition, 0n)
  const total = state.spend + state.savings + invested
  section(t.summary)
  const boxes: [string, bigint][] = [
    [t.total, total],
    [t.spendable, state.spend],
    [t.idle, state.savings],
    [t.invested, invested],
  ]
  const gap = 8
  const bw = (CONTENT - gap * 3) / 4
  ensure(52)
  boxes.forEach(([name, value], i) => {
    const x = M + i * (bw + gap)
    page.drawRectangle({ x, y: y - 44, width: bw, height: 44, borderColor: COL.line, borderWidth: 0.5, color: i === 0 ? COL.soft : COL.paper })
    text(name.toUpperCase(), x + 10, y - 16, mono, 6.5, COL.muted)
    text(money(value, locale), x + 10, y - 33, bold, 12, COL.ink)
  })
  y -= 58
  text(`${state.splitBps / 100}%`, M, y, bold, 9)
  text(t.split, M + bold.widthOfTextAtSize(`${state.splitBps / 100}% `, 9), y, sans, 9, COL.muted)

  // Vaults
  section(t.holdings)
  const held = state.vaults.filter((v) => v.userPosition > 0n)
  if (!held.length) paragraph(t.notInvested, sans, 9.5, COL.muted)
  for (const v of held) {
    ensure(20)
    rule(y)
    y -= 13
    text(t.vault[v.target as Target], M, y, sans, 10)
    text(`${t.apy} ${(v.apyBps / 100).toFixed(0)}%`, M + 150, y, mono, 8, COL.muted)
    const amount = money(v.userPosition, locale)
    text(amount, W - M - bold.widthOfTextAtSize(amount, 10), y, bold, 10)
    y -= 7
  }
  if (held.length) rule(y)

  // Market
  section(t.market)
  if (run.market) {
    const badge = t.regime[run.market.regime].toUpperCase()
    const bwid = mono.widthOfTextAtSize(badge, 7) + 14
    const badgeColor = run.market.regime === 'risk_on' ? COL.up : run.market.regime === 'risk_off' ? COL.down : COL.gold
    ensure(20)
    page.drawRectangle({ x: M, y: y - 13, width: bwid, height: 13, color: badgeColor })
    text(badge, M + 7, y - 9.5, mono, 7, COL.white)
    y -= 16
    paragraph(run.market.summary, sans, 9.5)
  }
  if (market) {
    y -= 6
    for (const c of market.coins) {
      ensure(18)
      rule(y)
      y -= 12
      text(c.symbol, M, y, bold, 9)
      const price = `$${c.price.toLocaleString('en-US')}`
      text(price, M + 170 - sans.widthOfTextAtSize(price, 9), y, sans, 9)
      const d1 = `${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(2)}%  24h`
      const d7 = `${c.change7d >= 0 ? '+' : ''}${c.change7d.toFixed(2)}%  7d`
      text(d1, M + 300 - sans.widthOfTextAtSize(d1, 9), y, sans, 9, c.change24h >= 0 ? COL.up : COL.down)
      text(d7, W - M - sans.widthOfTextAtSize(d7, 9), y, sans, 9, c.change7d >= 0 ? COL.up : COL.down)
      y -= 6
    }
    rule(y)
    y -= 4
    paragraph(t.marketSource, sans, 7.5, COL.muted)
  }

  // Agent actions
  section(t.actions)
  if (!run.executed.length) paragraph(t.noActions, sans, 9.5, COL.muted)
  for (const e of run.executed) {
    const reason = wrap(sans, e.reason, 9, CONTENT - 14)
    const h = 32 + reason.length * 11.5
    ensure(h + 6)
    page.drawRectangle({ x: M, y: y - h, width: CONTENT, height: h, color: COL.soft })
    page.drawRectangle({ x: M, y: y - h, width: 2, height: h, color: COL.primary })
    text(e.kind === 'set_split' ? t.splitAction : t.investAction, M + 12, y - 14, bold, 9.5)
    reason.forEach((line, i) => text(line, M + 12, y - 27 - i * 12, sans, 9, COL.muted))
    text(explorerTx(e.txHash), M + 12, y - h + 8, mono, 6.5, COL.primary)
    y -= h + 6
  }

  // Reporter's note
  section(t.note)
  paragraph(run.report, sans, 9.5, COL.ink, M, CONTENT, 1.35)

  // Reminders
  if (run.reminders.length) {
    section(t.reminders)
    for (const r of run.reminders) {
      const lines = wrap(sans, r, 9, CONTENT - 12)
      ensure(lines.length * 13 + 6)
      page.drawRectangle({ x: M, y: y - lines.length * 13 - 2, width: 2, height: lines.length * 13 + 2, color: COL.gold })
      lines.forEach((line, i) => text(line, M + 10, y - 11 - i * 13, sans, 9))
      y -= lines.length * 13 + 8
    }
  }

  // Footer on every page
  const who = `${state.user.slice(0, 6)}...${state.user.slice(-4)}`
  pages.forEach((p, i) => {
    page = p
    rule(M + 24)
    const footer = wrap(sans, t.footer, 7, CONTENT - 60)
    footer.forEach((line, j) => text(line, M, M + 12 - j * 9, sans, 7, COL.muted))
    const num = `${who}   ${i + 1}/${pages.length}`
    text(num, W - M - mono.widthOfTextAtSize(num, 7), M + 12, mono, 7, COL.muted)
  })

  return doc.save()
}
