import { getAddress } from 'ethers'
import { readUserState } from '../_lib/chain.js'
import { policyActive } from '../_lib/guard.js'
import { body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'

// POST { user } → { autopilot } — enrolls a wallet in the daily run. No signature needed:
// it only enrolls wallets that really authorized our agent on-chain.
export async function POST(req: Request) {
  const { user: raw } = await body<{ user: string }>(req)
  let user: string
  try {
    user = getAddress(String(raw))
  } catch {
    return json({ error: 'invalid_address' }, 400)
  }
  const active = policyActive(await readUserState(user))
  if (active) await kv.sadd('users', user)
  return json({ autopilot: active })
}
