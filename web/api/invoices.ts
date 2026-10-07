import { bearer, body, json } from './_lib/http.js'
import { cancelInvoice, createInvoice, getInvoice, idrPerUsd, listInvoices, settleInvoice } from './_lib/invoices.js'
import { isAddress, getAddress } from 'ethers'
import { POSITIONS } from './_lib/guard.js'
import { readUserState } from './_lib/chain.js'
import { ogGoalPage, ogPage, readOgFund, type OgGoal } from './_lib/og.js'
import { goalProgress, publicGoal } from './_lib/rewards.js'
import { notifyPayment } from './_lib/receipts.js'

// Invoices (roadmap F3). The 12th and last function the Hobby plan allows: keep new routes as actions here.
// GET ?id=<id> → { invoice, idrPerUsd } (public: the pay page)
// GET with Authorization: Bearer <token> → { invoices } (the merchant's last 50)
// GET ?og=<groupId> → the link-preview page for a shared group (vercel.json rewrites /g/:id here)
// GET ?ogimg=<groupId> → that page's preview image, the group's card as a PNG (/g/:id/image.png)
// GET ?goal=<id>&user=<address> → the link-preview page for a shared savings goal (/goal/:user/:id); ?goalimg its card
export async function GET(req: Request) {
  const url = new URL(req.url)
  const goalId = url.searchParams.get('goal') ?? url.searchParams.get('goalimg')
  if (goalId !== null) {
    const owner = url.searchParams.get('user') ?? ''
    if (!isAddress(owner) || !/^[a-z0-9-]{1,40}$/.test(goalId)) return Response.redirect(new URL('/', url.origin), 302)
    const user = getAddress(owner)
    const goal = await readOgGoal(user, goalId).catch(() => null)
    if (url.searchParams.has('goalimg')) return drawn((m) => goal && m.goalImage(goal, url.origin), url.origin, '/landing/save.jpg')
    return new Response(ogGoalPage(goal, user, goalId, url.origin), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    })
  }
  const ogimg = url.searchParams.get('ogimg')
  if (ogimg !== null) {
    const groupId = Number.parseInt(ogimg, 10)
    const fund = Number.isSafeInteger(groupId) && groupId >= 0 ? await readOgFund(groupId).catch(() => null) : null
    return drawn((m) => fund && m.ogImage(fund, url.origin), url.origin, '/landing/agents.jpg')
  }
  const og = url.searchParams.get('og')
  if (og !== null) {
    const groupId = Number.parseInt(og, 10)
    if (!Number.isSafeInteger(groupId) || groupId < 0) return Response.redirect(new URL('/groups', url.origin), 302)
    const fund = await readOgFund(groupId).catch(() => null)
    return new Response(ogPage(fund, groupId, url.origin), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    })
  }
  const id = url.searchParams.get('id')
  if (id) {
    const invoice = await getInvoice(id)
    if (!invoice) return json({ error: 'not_found' }, 404)
    return json({ invoice, idrPerUsd: invoice.currency === 'IDR' ? await idrPerUsd().catch(() => null) : null })
  }
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json({ invoices: await listInvoices(user) })
}

// POST { name?, memo, reference?, currency: 'IDR' | 'USDT', amount } with a bearer token → { invoice }
// POST ?paid { id, txHash } (public; verified on-chain) → { invoice }
// POST ?cancel { id } with a bearer token → { invoice }
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams
  if (q.has('paid')) {
    const { id, txHash } = await body<{ id: string; txHash: string }>(req)
    try {
      const { invoice, payment } = await settleInvoice(String(id ?? ''), String(txHash ?? ''))
      await notifyPayment(payment, invoice).catch((e) => console.error('receipt', e))
      return json({ invoice })
    } catch (e) {
      const code = (e as Error).message
      return json({ error: code }, code === 'not_found' ? 404 : 400)
    }
  }

  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  try {
    if (q.has('cancel')) {
      const { id } = await body<{ id: string }>(req)
      return json({ invoice: await cancelInvoice(user, String(id ?? '')) })
    }
    return json({ invoice: await createInvoice(user, await body(req)) })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
}

/** A goal its owner shared, with what it holds now: its share of the user's savings on-chain (idle + positions). */
async function readOgGoal(user: string, id: string): Promise<OgGoal | null> {
  const goal = await publicGoal(user, id)
  if (!goal) return null
  const s = await readUserState(user)
  const savings = Number(POSITIONS.reduce((sum, p) => sum + s.positions[p], s.savings)) / 1e6
  return { name: goal.name, target: goal.target, deadline: goal.deadline, saved: goalProgress(goal, savings, s.now).saved }
}

/**
 * A preview card, or the plain art when there is nothing to draw or drawing fails. The renderer (satori + resvg
 * wasm) is loaded only here, so a problem with it can never take down invoices or the preview pages.
 */
async function drawn(draw: (m: typeof import('./_lib/og-image.js')) => Promise<Response> | null, origin: string, fallback: string) {
  try {
    const res = await draw(await import('./_lib/og-image.js'))
    if (res) return res
  } catch (e) {
    console.error('og image', e)
  }
  return Response.redirect(new URL(fallback, origin), 302)
}
