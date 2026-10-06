// Link previews for shared groups: /g/:id is rewritten here (vercel.json), so WhatsApp, X, Telegram and
// Facebook see the group's title, a one-line summary from the chain and the kind's art. People are sent on
// to /groups/:id straight away. The title is user-written, so everything is HTML-escaped.

import { Contract, formatUnits } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { chainProvider } from './chain.js'

const KINDS = ['patungan', 'iuran', 'donasi'] as const
type Kind = (typeof KINDS)[number]
const IMAGE: Record<Kind, string> = { patungan: '/landing/agents.jpg', iuran: '/landing/save.jpg', donasi: '/landing/hero.jpg' }
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

const usdt = (x: bigint) => `${Number(formatUnits(x, 6)).toLocaleString('id-ID', { maximumFractionDigits: 2 })} tUSDT`
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })

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
  const target = `/groups/${id}`
  const title = f ? `${f.title} · coinAI` : 'coinAI · Dana grup'
  const description = f ? ogDescription(f) : 'Patungan, iuran, dan donasi bareng di coinAI. Setiap setoran tercatat on-chain.'
  const image = `${origin}${IMAGE[f?.kind ?? 'patungan']}`
  const url = `${origin}/g/${id}`
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
<meta property="og:url" content="${e(url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(title)}" />
<meta name="twitter:description" content="${e(description)}" />
<meta name="twitter:image" content="${e(image)}" />
<link rel="canonical" href="${e(url)}" />
<meta http-equiv="refresh" content="0;url=${e(target)}" />
</head>
<body>
<script>location.replace(${JSON.stringify(target)})</script>
<a href="${e(target)}">${e(f?.title ?? 'coinAI')}</a>
</body>
</html>`
}
