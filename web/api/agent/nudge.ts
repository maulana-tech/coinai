import { getAddress } from 'ethers'
import { explorerTx, readUserState } from '../_lib/chain.js'
import { policyActive } from '../_lib/guard.js'
import { body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { getSub, sendTelegram } from '../_lib/notify.js'
import { runSwarm } from '../_lib/swarm.js'

const MIN_IDLE = 1_000_000n // 1 tUSDT
const FRESH_PAYMENT = 600 // seconds

// POST { user } — autopilot: the payment page calls this after a successful payment so the
// recipient's agent team invests the new savings right away. No auth needed: it only ever acts
// within the recipient's own on-chain permission, and cheap chain checks gate every LLM call.
export async function POST(req: Request) {
  const { user: raw } = await body<{ user: string }>(req)
  let user: string
  try {
    user = getAddress(String(raw))
  } catch {
    return json({ error: 'invalid_address' }, 400)
  }

  const s = await readUserState(user)
  if (!policyActive(s)) return json({ ran: false, reason: 'agent_not_enabled' })
  if (s.savings < MIN_IDLE) return json({ ran: false, reason: 'no_idle_savings' })
  if (!s.lastPaymentAt || s.now - s.lastPaymentAt > FRESH_PAYMENT) return json({ ran: false, reason: 'no_recent_payment' })
  if ((await kv.hit(`rl:nudge:${user}`, 600)) > 1) return json({ ran: false, reason: 'rate_limited' })

  await kv.sadd('users', user)
  const sub = await getSub(user).catch(() => null)
  const run = await runSwarm(user, { locale: sub?.locale })
  if (sub?.telegramChatId && run.executed.length) {
    const lines = run.executed.map((e) => `• ${e.reason}\n  ${explorerTx(e.txHash)}`).join('\n')
    await sendTelegram(sub.telegramChatId, `Payment received — your agents put the new savings to work:\n${lines}`).catch(() => {})
  }
  return json({ ran: true, executed: run.executed.length })
}
