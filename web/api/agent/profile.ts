import { bearer, body, json } from '../_lib/http.js'
import { cleanGoals, getGoals, setGoals } from '../_lib/rewards.js'
import { cleanProfile, getProfile, setProfile, type Profile } from '../_lib/swarm.js'

// GET → { profile, goals }
export async function GET(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  const [profile, goals] = await Promise.all([getProfile(user), getGoals(user)])
  return json({ profile, goals })
}

// POST { risk, horizon, goal } → { profile }
// POST ?goals { goals } → { goals } (savings pockets, C1; one function to stay under the Hobby 12-function limit)
export async function POST(req: Request) {
  const user = bearer(req)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if (new URL(req.url).searchParams.has('goals')) {
    try {
      const goals = cleanGoals((await body<{ goals: unknown }>(req)).goals, Math.floor(Date.now() / 1000))
      await setGoals(user, goals)
      return json({ goals })
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }
  }
  const profile = cleanProfile(await body<Profile>(req))
  await setProfile(user, profile)
  return json({ profile })
}
