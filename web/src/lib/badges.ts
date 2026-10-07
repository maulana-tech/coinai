import { Contract, Interface, type ContractRunner } from 'ethers'
import { DEPLOYMENT } from '../../shared/deployment.js'
import { sendTx, simulate } from '@/lib/coinai.evm'
import { CONTRACT_ID, readProvider } from '@/lib/config'
import { getEthersSigner } from '@/lib/ethers-wagmi'
import type { MessageKey } from '@/lib/i18n'

// Soulbound saving badges (evm/src/CoinAIBadges.sol). The first three the user claims themself once CoinAI v2's
// state proves them; the last three the agent wallet awards from the daily cron (api/_lib/rewards.ts).
const ABI = [
  'function badgesOf(address user) view returns (uint64[6])',
  'function eligible(address user,uint8 badge) view returns (bool)',
  'function claim(uint8 badge)',
  'error AlreadyEarned()',
  'error NotEligible()',
  'error UnknownBadge()',
]
const iface = new Interface(ABI)
export const BADGES_ADDRESS: string = CONTRACT_ID === '' ? '' : DEPLOYMENT.v2.badges

export type BadgeId = 0 | 1 | 2 | 3 | 4 | 5
export const BADGES: { id: BadgeId; key: string; claimable: boolean; title: MessageKey; how: MessageKey }[] = [
  { id: 0, key: 'first', claimable: true, title: 'badge.firstTitle', how: 'badge.firstHow' },
  { id: 1, key: 'ten', claimable: true, title: 'badge.tenTitle', how: 'badge.tenHow' },
  { id: 2, key: 'saved', claimable: true, title: 'badge.savedTitle', how: 'badge.savedHow' },
  { id: 3, key: 'streak', claimable: false, title: 'badge.streakTitle', how: 'badge.streakHow' },
  { id: 4, key: 'goal', claimable: false, title: 'badge.goalTitle', how: 'badge.goalHow' },
  { id: 5, key: 'agent', claimable: false, title: 'badge.agentTitle', how: 'badge.agentHow' },
]

export type BadgeState = { earnedAt: number[]; eligible: boolean[] } // per badge id; earnedAt 0 = not yet

// mock mode: nothing on-chain, the first badge is claimable so the flow can be tried
const mockEarned = [0, 0, 0, 0, 0, 0]

export async function getBadges(user: string): Promise<BadgeState> {
  if (!BADGES_ADDRESS) return { earnedAt: [...mockEarned], eligible: [true, false, false, false, false, false] }
  const c = new Contract(BADGES_ADDRESS, ABI, readProvider)
  const [earned, ...eligible] = await Promise.all([
    c.badgesOf(user) as Promise<bigint[]>,
    ...[0, 1, 2].map((id) => c.eligible(user, id) as Promise<boolean>),
  ])
  return { earnedAt: (earned as bigint[]).map(Number), eligible: [...(eligible as boolean[]), false, false, false] }
}

export async function claimBadge(id: BadgeId): Promise<{ hash: string }> {
  if (!BADGES_ADDRESS) {
    mockEarned[id] = Math.floor(Date.now() / 1000)
    return { hash: '' }
  }
  const c = new Contract(BADGES_ADDRESS, ABI, (await getEthersSigner()) as ContractRunner)
  await simulate(c.claim.staticCall(id), iface)
  const hash = await sendTx(c.claim(id, { gasLimit: 200_000 }), iface)
  return { hash }
}
