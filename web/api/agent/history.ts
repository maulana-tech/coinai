import { bearer, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { isRunning, type RunResult } from '../_lib/swarm.js'

// GET with Authorization: Bearer <token> → { runs: RunResult[] (newest first), running }
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const [runs, running] = await Promise.all([kv.list<RunResult>(`runs:${user}`, 20), isRunning(user)])
  return json({ runs, running })
}
