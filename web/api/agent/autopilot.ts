import { getAddress } from 'ethers'
import { explorerTx, paymentCountOf, paymentFromTx, readUserState } from '../_lib/chain.js'
import { policyActive } from '../_lib/guard.js'
import { body, json } from '../_lib/http.js'
import { kv } from '../_lib/kv.js'
import { referralText } from '../_lib/bot.js'
import { getSub, notifyUser, sendTelegram } from '../_lib/notify.js'
import { notifyPayment } from '../_lib/receipts.js'
import { creditReferral, rewardsOf } from '../_lib/rewards.js'
import { runSwarm } from '../_lib/swarm.js'

const MIN_IDLE = 1_000_000n // 1 tUSDT
const FRESH_PAYMENT = 600 // seconds

// Autopilot, public (no signature): both actions only ever act within the wallet's own on-chain
// agent permission, and cheap chain checks gate every LLM call.
// POST { user, action: 'register' } → { autopilot }: enroll a wallet that authorized our agent in the daily run.
// POST { user, action: 'nudge', txHash? } → { ran }: after a payment, let the recipient's agents invest the new savings now.
// With txHash, the recipient also gets a Telegram receipt (once per tx; the tx is read from the chain, not trusted),
// and a newcomer's first payment through the link earns both sides referral points (C4).
// GET ?user=0x… → { points, referrals, referredBy, streakWeeks, bestStreak } (public; also enrolls the wallet in the
// daily streak tracking, which needs no agent permission).
export async function POST(req: Request) {
  const { user: raw, action, txHash } = await body<{ user: string; action: 'nudge' | 'register'; txHash: string }>(req)
  let user: string
  try {
    user = getAddress(String(raw))
  } catch {
    return json({ error: 'invalid_address' }, 400)
  }

  const s = await readUserState(user)
  if (action === 'register') {
    if (policyActive(s)) await kv.sadd('users', user)
    return json({ autopilot: policyActive(s) })
  }
  if (action === 'nudge' && txHash) {
    const payment = await paymentFromTx(String(txHash)).catch(() => null)
    if (payment?.to === user) {
      await notifyPayment(payment).catch((e) => console.error('receipt', e))
      // statsOf counts payments received, so paying doesn't change the payer's count: 0 means they're new to coinAI
      const count = await paymentCountOf(payment.from).catch(() => 1)
      const credited = await creditReferral(payment.from, user, count).catch((e) => console.error('referral', e))
      if (credited)
        await Promise.all([
          notifyUser(user, (l) => referralText('referrer', payment.from, l)),
          notifyUser(payment.from, (l) => referralText('newcomer', user, l)),
        ])
    }
  }
  if (!policyActive(s)) return json({ ran: false, reason: 'agent_not_enabled' })
  if (s.savings < MIN_IDLE) return json({ ran: false, reason: 'no_idle_savings' })
  if (!s.lastPaymentAt || s.now - s.lastPaymentAt > FRESH_PAYMENT) return json({ ran: false, reason: 'no_recent_payment' })
  if ((await kv.hit(`rl:nudge:${user}`, 600)) > 1) return json({ ran: false, reason: 'rate_limited' })

  await kv.sadd('users', user)
  const sub = await getSub(user).catch(() => null)
  const run = await runSwarm(user, { locale: sub?.locale })
  if (sub?.telegramChatId && run.executed.length) {
    const lines = run.executed.map((e) => `• ${e.reason}\n  ${explorerTx(e.txHash)}`).join('\n')
    await sendTelegram(sub.telegramChatId, `Your agents put the new savings to work:\n${lines}`).catch(() => {})
  }
  return json({ ran: true, executed: run.executed.length })
}

export async function GET(req: Request) {
  let user: string
  try {
    user = getAddress(String(new URL(req.url).searchParams.get('user')))
  } catch {
    return json({ error: 'invalid_address' }, 400)
  }
  await kv.sadd('savers', user)
  return json(await rewardsOf(user))
}
