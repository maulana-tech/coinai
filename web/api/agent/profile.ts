import { bearer, body, json } from '../_lib/http.js'
import { cleanProfile, getProfile, setProfile, type Profile } from '../_lib/swarm.js'

// GET → { profile }
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  return json({ profile: await getProfile(user) })
}

// POST { risk, horizon, goal } → { profile }
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const profile = cleanProfile(await body<Profile>(req))
  await setProfile(user, profile)
  return json({ profile })
}
