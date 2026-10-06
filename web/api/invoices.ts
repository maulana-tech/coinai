import { bearer, body, json } from './_lib/http.js'
import { cancelInvoice, createInvoice, getInvoice, idrPerUsd, listInvoices, settleInvoice } from './_lib/invoices.js'
import { ogPage, readOgFund } from './_lib/og.js'
import { notifyPayment } from './_lib/receipts.js'

// Invoices (roadmap F3). The 12th and last function the Hobby plan allows: keep new routes as actions here.
// GET ?id=<id> → { invoice, idrPerUsd } (public: the pay page)
// GET with Authorization: Bearer <token> → { invoices } (the merchant's last 50)
// GET ?og=<groupId> → the link-preview page for a shared group (vercel.json rewrites /g/:id here)
export async function GET(req: Request) {
  const url = new URL(req.url)
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
