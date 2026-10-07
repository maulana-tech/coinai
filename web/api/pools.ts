import { bearer, body, json } from './_lib/http.js'
import { reviewPool } from './_lib/pool-review.js'
import { deletePool, loadPools, publicPools, savePool, setActivePool } from './_lib/pools.js'

// Saved pools (Market page). All calls need Authorization: Bearer <token>.
// GET → { pools, activeId }
// GET ?public → { pools: PublicPool[] } (the community leaderboard, C3; no sign-in needed)
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has('public')) return json({ pools: await publicPools() })
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json(await loadPools(user))
}

// POST { id?, name, weights, public? } → create or update (public shares it on the leaderboard) → { pools, activeId }
// POST ?review { weights, locale } → { review } (AI review of an unsaved pool; one function to stay
// under the Hobby plan's 12-function limit)
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if (new URL(req.url).searchParams.has('review')) return reviewPool(req, user)
  try {
    return json(await savePool(user, await body(req)))
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
}

// PUT { activeId: string | null } → choose the strategy the agents follow
export async function PUT(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { activeId } = await body<{ activeId: string | null }>(req)
  return json(await setActivePool(user, activeId ?? null))
}

// DELETE { id }
export async function DELETE(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const { id } = await body<{ id: string }>(req)
  return json(await deletePool(user, String(id ?? '')))
}
