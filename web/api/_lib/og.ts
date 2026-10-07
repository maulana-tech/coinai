// Link previews for shared groups: /g/:id is rewritten here (vercel.json), so WhatsApp, X, Telegram and
// Facebook see the group's title, a one-line summary from the chain and the kind's art. People are sent on
// to /groups/:id straight away. The title is user-written, so everything is HTML-escaped.

import { Contract, formatUnits } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { chainProvider } from './chain.js'

const KINDS = ['patungan', 'iuran', 'donasi'] as const
type Kind = (typeof KINDS)[number]
export const IMAGE: Record<Kind, string> = { patungan: '/landing/agents.jpg', iuran: '/landing/save.jpg', donasi: '/landing/hero.jpg' }
const ABI = [
  'function fund(uint256 id) view returns ((address organizer,address beneficiary,uint8 kind,bool cancelled,uint64 start,uint64 deadline,uint64 period,uint128 target,uint128 dues,uint128 raised,uint128 withdrawn,uint32 contributors,uint32 members,string title))',
]

export type OgFund = {
  kind: Kind
  title: string
  cancelled: boolean
  deadline: number
  period: number
  target: bigint
  dues: bigint
  raised: bigint
  contributors: number
  members: number
}

export async function readOgFund(id: number): Promise<OgFund> {
  const address = process.env.GROUP_FUNDS_ADDRESS || DEPLOYMENT.v2.groupFunds
  const f = await new Contract(address, ABI, chainProvider()).fund(id)
  return {
    kind: KINDS[Number(f.kind)] ?? 'donasi',
    title: String(f.title),
    cancelled: Boolean(f.cancelled),
    deadline: Number(f.deadline),
    period: Number(f.period),
    target: BigInt(f.target),
    dues: BigInt(f.dues),
    raised: BigInt(f.raised),
    contributors: Number(f.contributors),
    members: Number(f.members),
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const usdt = (x: bigint) => `${Number(formatUnits(x, 6)).toLocaleString('id-ID', { maximumFractionDigits: 2 })} tUSDT`
export const day = (unix: number) => new Date(unix * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })

/** One line for the preview, in Indonesian (the app's main audience). */
export function ogDescription(f: OgFund): string {
  if (f.cancelled) return 'Grup ini sudah dibatalkan oleh organizer.'
  if (f.kind === 'patungan')
    return `Patungan · ${usdt(f.raised)} dari ${usdt(f.target)} terkumpul · ${f.contributors} penyumbang · tenggat ${day(f.deadline)}. Semua atau tidak sama sekali: dana kembali kalau target tidak tercapai.`
  if (f.kind === 'iuran')
    return `Iuran ${usdt(f.dues)} tiap ${Math.round(f.period / 86_400)} hari · ${f.members} anggota · ${usdt(f.raised)} terkumpul. Semua orang bisa melihat siapa yang sudah lunas.`
  return `Donasi · ${usdt(f.raised)}${f.target > 0n ? ` dari ${usdt(f.target)}` : ''} terkumpul · ${f.contributors} penyumbang. Setiap pencairan bermemo dan tercatat on-chain.`
}

/** The page link-preview bots read; browsers go on to the app's group page. */
export function ogPage(f: OgFund | null, id: number, origin: string): string {
  return previewPage({
    title: f ? `${f.title} · coinAI` : 'coinAI · Dana grup',
    description: f ? ogDescription(f) : 'Patungan, iuran, dan donasi bareng di coinAI. Setiap setoran tercatat on-chain.',
    // the card drawn from the chain (og-image.ts); the query changes with the numbers so chat apps refetch it
    image: f ? `${origin}/g/${id}/image.png?v=${f.raised}-${f.contributors}-${f.members}-${Number(f.cancelled)}` : `${origin}${IMAGE.patungan}`,
    card: !!f,
    url: `${origin}/g/${id}`,
    target: `/groups/${id}`,
  })
}

export type OgGoal = { name: string; target: number; deadline: number; saved: number }
const tusdt = (x: number) => `${x.toLocaleString('id-ID', { maximumFractionDigits: 2 })} tUSDT`

export function ogGoalDescription(g: OgGoal, now = Date.now() / 1000): string {
  const pct = Math.min(100, Math.floor((g.saved / g.target) * 100))
  const left = g.deadline ? Math.ceil((g.deadline - now) / 86_400) : null
  const when = left === null ? '' : left > 0 ? ` · ${left} hari lagi` : ' · lewat tenggat'
  return `Menabung untuk ${g.name}: ${tusdt(g.saved)} dari ${tusdt(g.target)} (${pct}%)${when}. Setiap pembayaran lewat coinAI otomatis menyisihkan sebagian ke tabungan ini.`
}

/** A shared savings goal: the preview shows its live progress, and people land on the owner's payment link. */
export function ogGoalPage(g: OgGoal | null, user: string, id: string, origin: string): string {
  const path = `/goal/${user}/${encodeURIComponent(id)}`
  return previewPage({
    title: g ? `${g.name} · coinAI` : 'coinAI · Target tabungan',
    description: g ? ogGoalDescription(g) : 'Tabungan otomatis dari setiap pembayaran, dikelola tim agen AI di BNB Chain.',
    image: g ? `${origin}${path}/image.png?v=${Math.round(g.saved * 100)}-${g.target}` : `${origin}/landing/save.jpg`,
    card: !!g,
    url: `${origin}${path}`,
    target: `/pay/${user}`,
  })
}

function previewPage(p: { title: string; description: string; image: string; card: boolean; url: string; target: string }): string {
  const { title, description, image, url, target } = p
  const e = escapeHtml
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${e(title)}</title>
<meta name="description" content="${e(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="coinAI" />
<meta property="og:title" content="${e(title)}" />
<meta property="og:description" content="${e(description)}" />
<meta property="og:image" content="${e(image)}" />
${p.card ? '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n' : ''}<meta property="og:url" content="${e(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(title)}" />
<meta name="twitter:description" content="${e(description)}" />
<meta name="twitter:image" content="${e(image)}" />
<link rel="canonical" href="${e(url)}" />
<meta http-equiv="refresh" content="0;url=${e(target)}" />
</head>
<body>
<script>location.replace(${JSON.stringify(target)})</script>
<a href="${e(target)}">${e(title)}</a>
</body>
</html>`
}
