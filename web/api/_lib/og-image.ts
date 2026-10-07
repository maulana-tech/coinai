// The image a shared group link unfolds into (1200×630, og:image of /g/:id): the same card style as the in-app
// share card (share-card.ts), drawn on the server from the chain so WhatsApp, Telegram, X and Facebook show the
// live numbers without anyone downloading anything.

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { day, IMAGE, usdt, type OgFund } from './og.js'

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null | false)[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null && c !== false) },
})

const W = 1200
const H = 630
const ART = 440 // width of the kind's art on the right
const GOLD = '#d5aa61'
const GREEN = '#8fc9a3'
const LABEL = { patungan: 'PATUNGAN', iuran: 'IURAN', donasi: 'DONASI' } as const
const CTA = { patungan: 'Ikut patungan di coinAI', iuran: 'Bayar iuran di coinAI', donasi: 'Menyumbang di coinAI' } as const

/** Indonesian status, same rules as fundStatus() in the app. */
export function ogStatus(f: OgFund, now = Date.now() / 1000): string {
  if (f.cancelled) return 'Dibatalkan'
  if (f.kind === 'patungan') return f.raised >= f.target ? 'Tercapai' : now > f.deadline ? 'Gagal' : 'Terbuka'
  return f.deadline !== 0 && now > f.deadline ? 'Selesai' : 'Terbuka'
}

/** The lines the card shows, kept apart from the drawing so they can be tested. */
export function ogCard(f: OgFund) {
  const progress = f.target > 0n ? Math.min(1, Number((f.raised * 1000n) / f.target) / 1000) : null
  const meta =
    f.kind === 'iuran'
      ? `${usdt(f.dues)} tiap ${Math.round(f.period / 86_400)} hari · ${f.members} anggota`
      : [`${f.contributors} penyumbang`, f.deadline ? `tenggat ${day(f.deadline)}` : ''].filter(Boolean).join(' · ')
  return {
    label: LABEL[f.kind],
    status: ogStatus(f),
    title: f.title,
    amount: usdt(f.raised),
    amountOf: f.target > 0n ? `dari ${usdt(f.target)}` : 'terkumpul',
    progress,
    done: progress !== null && progress >= 1,
    meta,
    cta: CTA[f.kind],
  }
}

// Google Fonts serves TrueType to a client that sends no browser user agent; `text=` keeps each file tiny.
async function font(family: string, weight: number, text: string): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`)).text()
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
  if (!src) throw new Error(`font ${family}`)
  return (await fetch(src)).arrayBuffer()
}

export async function ogImage(f: OgFund, origin: string): Promise<Response> {
  const c = ogCard(f)
  const host = origin.replace(/^https?:\/\//, '')
  const sans = `coinAI${c.status}${c.amount}${c.amountOf}${c.meta}${c.cta}${host}/g/0123456789`
  const [serif, sansMid, sansBold, mono] = await Promise.all([
    font('Cormorant Garamond', 600, c.title + '…'),
    font('DM Sans', 500, sans),
    font('DM Sans', 700, sans),
    font('Space Mono', 700, c.label + c.status.toUpperCase()),
  ])

  const tree = h(
    'div',
    { width: W, height: H, position: 'relative', color: '#fff', fontFamily: 'DM Sans', backgroundColor: '#0b0b0b' },
    // the art only on the right: a photo behind the text would double the PNG (chat apps skip large previews)
    { type: 'img', props: { src: `${origin}${IMAGE[f.kind]}`, width: ART, height: H, style: { position: 'absolute', top: 0, right: 0, width: ART, height: H, objectFit: 'cover' } } },
    h('div', { position: 'absolute', top: 0, right: ART - 160, width: 160, height: H, backgroundImage: 'linear-gradient(90deg, #0b0b0b 0%, rgba(11,11,11,0.6) 50%, rgba(11,11,11,0) 100%)' }),
    h(
      'div',
      { position: 'absolute', top: 0, left: 0, width: W - ART + 40, height: H, padding: 56, flexDirection: 'column' },
      // brand + status
      h(
        'div',
        { alignItems: 'center', justifyContent: 'space-between' },
        h(
          'div',
          { alignItems: 'center' },
          { type: 'img', props: { src: `${origin}/logo-dark.png`, width: 48, height: 48, style: { width: 48, height: 48 } } },
          h('div', { marginLeft: 14, fontSize: 34, fontWeight: 500 }, 'coinAI'),
        ),
        h('div', { padding: '8px 20px', borderRadius: 999, backgroundColor: 'rgba(244,237,224,0.92)', color: '#0b0b0b', fontFamily: 'Space Mono', fontSize: 18, letterSpacing: 3 }, c.status.toUpperCase()),
      ),
      // label + title
      h('div', { marginTop: 44, fontFamily: 'Space Mono', fontSize: 20, letterSpacing: 5, color: 'rgba(255,255,255,0.72)' }, c.label),
      h('div', { marginTop: 10, fontFamily: 'Cormorant Garamond', fontSize: 70, lineHeight: 1.02, maxHeight: 150, overflow: 'hidden' }, c.title),
      // amount, bar, meta
      h(
        'div',
        { marginTop: 'auto', flexDirection: 'column' },
        h('div', { alignItems: 'baseline' }, h('div', { fontSize: 54, fontWeight: 700 }, c.amount), h('div', { marginLeft: 16, fontSize: 26, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }, c.amountOf)),
        c.progress !== null &&
          h(
            'div',
            { marginTop: 16, width: W - ART + 40 - 112, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
            h('div', { width: Math.max(12, Math.round((W - ART + 40 - 112) * c.progress)), height: 12, borderRadius: 6, backgroundColor: c.done ? GREEN : GOLD }),
          ),
        h('div', { marginTop: 16, fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }, c.meta),
        h(
          'div',
          { marginTop: 22, paddingTop: 18, borderTop: '2px solid rgba(255,255,255,0.15)', justifyContent: 'space-between', fontSize: 22 },
          h('div', { fontWeight: 700 }, c.cta),
          h('div', { fontWeight: 500, color: 'rgba(255,255,255,0.6)' }, host),
        ),
      ),
    ),
  )

  const svg = await satori(tree as never, {
    width: W,
    height: H,
    fonts: [
      { name: 'Cormorant Garamond', data: serif, weight: 600, style: 'normal' },
      { name: 'DM Sans', data: sansMid, weight: 500, style: 'normal' },
      { name: 'DM Sans', data: sansBold, weight: 700, style: 'normal' },
      { name: 'Space Mono', data: mono, weight: 700, style: 'normal' },
    ],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 800 } }).render().asPng()
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } })
}
