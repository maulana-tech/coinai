import { bearer, body, json } from './_lib/http.js'
import { deletePool, loadPools, savePool, setActivePool } from './_lib/pools.js'

// Saved pools (Market page). All calls need Authorization: Bearer <token>.
// GET → { pools, activeId }
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json(await loadPools(user))
}

// POST { id?, name, weights } → create or update → { pools, activeId }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
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
