import { bearer, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import type { RunResult } from '../_lib/swarm.js'

// GET with Authorization: Bearer <token> → { runs: RunResult[] } (newest first)
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json({ runs: await kv.list<RunResult>(`runs:${user}`, 20) })
}
