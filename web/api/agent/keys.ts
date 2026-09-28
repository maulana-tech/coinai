import { bearer, body, json } from '../_lib/http.js'
import { addKey, listKeys, removeKey, verifyKey } from '../_lib/keys.js'

// GET → { keys: [{ id, tail, addedAt }] }   (never the key itself)
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json({ keys: await listKeys(user) })
}

// POST { key } → { keys }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const key = String((await body<{ key: string }>(req)).key ?? '').trim()
  if (!/^sk-or-[\w-]{20,200}$/.test(key)) return json({ error: 'invalid_key' }, 400)
  if (!(await verifyKey(key))) return json({ error: 'key_rejected' }, 400)
  try {
    return json({ keys: await addKey(user, key) })
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
}

// DELETE { id } → { keys }
export async function DELETE(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const id = String((await body<{ id: string }>(req)).id ?? '')
  return json({ keys: await removeKey(user, id) })
}
