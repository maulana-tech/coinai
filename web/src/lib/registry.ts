import { Contract, Interface, type ContractRunner } from 'ethers'
import { AGENT_REGISTRY_ADDRESS, readProvider } from '@/lib/config'
import { sendTx, simulate } from '@/lib/coinai.evm'
import { getEthersSigner } from '@/lib/ethers-wagmi'
import { ensureTokenAllowance } from '@/lib/token'

// AgentRegistry (evm/src/AgentRegistry.sol): hireable agent skills, paid per 30 days in tUSDT to the operator.
// Hiring buys time on the listing; the skills themselves are still granted with CoinAI.setAgent.
const REGISTRY_ABI = [
  'function listingCount() view returns (uint256)',
  'function listing(uint256 id) view returns ((address operator,address agent,uint8 skills,bool active,uint64 hires,uint128 feePer30Days,string name,string description))',
  'function rentedUntil(address hirer,uint256 id) view returns (uint64)',
  'function hire(uint256 id,uint8 periods) returns (uint64)',
  'error Unauthorized()',
  'error InvalidListing()',
  'error Inactive()',
  'error InvalidPeriods()',
  'error TransferFailed()',
]
const iface = new Interface(REGISTRY_ABI)

export type Listing = {
  id: number
  agent: string
  skills: number
  active: boolean
  feePer30Days: bigint
  name: string
  description: string
  rentedUntil: bigint // for the user; 0 if never hired
}

const registry = (runner: ContractRunner = readProvider) => new Contract(AGENT_REGISTRY_ADDRESS, REGISTRY_ABI, runner)

/** Every listing, with how long `user` has it hired. Empty in mock mode. */
export async function getListings(user: string | null): Promise<Listing[]> {
  if (!AGENT_REGISTRY_ADDRESS) return []
  const r = registry()
  const count = Number(await r.listingCount())
  return Promise.all(
    Array.from({ length: count }, async (_, id) => {
      const [l, until] = await Promise.all([r.listing(id), user ? r.rentedUntil(user, id) : 0n])
      return {
        id,
        agent: l.agent as string,
        skills: Number(l.skills),
        active: l.active as boolean,
        feePer30Days: BigInt(l.feePer30Days),
        name: l.name as string,
        description: l.description as string,
        rentedUntil: BigInt(until),
      }
    }),
  )
}

export async function hire(user: string, listing: Listing, periods: number): Promise<{ hash: string }> {
  const c = registry(await getEthersSigner())
  const cost = listing.feePer30Days * BigInt(periods)
  if (cost > 0n) await ensureTokenAllowance(user, cost, c.runner!, AGENT_REGISTRY_ADDRESS)
  await simulate(c.hire.staticCall(listing.id, periods), iface)
  const hash = await sendTx(c.hire(listing.id, periods, { gasLimit: 200_000 }), iface)
  return { hash }
}
