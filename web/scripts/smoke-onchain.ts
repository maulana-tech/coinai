// End-to-end smoke test of coinAI v2 on BSC Testnet with real transactions. Run from web/:
//   npx tsx scripts/smoke-onchain.ts            (reads DEPLOYER_PRIVATE_KEY + BSC_TESTNET_RPC_URL from ../evm/.env)
//   npx tsx scripts/smoke-onchain.ts --no-groups   skip creating the three demo groups
// The deployer wallet plays a user through every app flow, using the app's own ABIs (read from src/lib/*.ts), and
// checks the chain after each step. The agent wallet's calls are simulated with eth_call from its address on the
// live state (no key needed), using the backend's own calldata (api/_lib/chain.ts agentTx) and ABIs.

import { readFileSync, existsSync } from 'node:fs'
import { Contract, Interface, JsonRpcProvider, MaxUint256, Wallet, formatUnits, parseEther, type InterfaceAbi } from 'ethers'
import { DEPLOYMENT } from '../shared/deployment.ts'
import { agentTx } from '../api/_lib/chain.ts'
import { BASKET_ABI as BACKEND_BASKET_ABI } from '../api/_lib/duties.ts'
import { BADGES_ABI as BACKEND_BADGES_ABI } from '../api/_lib/rewards.ts'
import { smartWeights } from '../api/_lib/decision.ts'

for (const f of ['../evm/.env', '.env']) if (existsSync(f)) process.loadEnvFile(f)
const key = process.env.DEPLOYER_PRIVATE_KEY
if (!key) throw new Error('DEPLOYER_PRIVATE_KEY missing (evm/.env)')
const provider = new JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL || 'https://bsc-testnet-dataseed.bnbchain.org')
const me = new Wallet(key, provider)
const ME = me.address
const AGENT = DEPLOYMENT.v2.agent
const withGroups = !process.argv.includes('--no-groups')
// coinAI v2's backend reads COINAI_ADDRESS from env; point it at v2 for agentTx
process.env.COINAI_ADDRESS = DEPLOYMENT.v2.coinai

/** The ABI array `name` as written in a frontend file (only string entries), so the test uses the app's exact ABI. */
function appAbi(file: string, name: string): InterfaceAbi {
  const src = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), 'utf8')
  const start = src.indexOf(`const ${name} = [`)
  if (start < 0) throw new Error(`${name} not found in ${file}`)
  const body = src.slice(start, src.indexOf('\n]', start))
  return [...body.matchAll(/^\s*'([^']+)',?/gm)].map((m) => m[1])
}

const TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]
const token = new Contract(DEPLOYMENT.token, TOKEN_ABI, me)
const coinai = new Contract(DEPLOYMENT.v2.coinai, appAbi('coinai.evm.ts', 'COINAI_ABI'), me)
const basket = new Contract(DEPLOYMENT.v2.basketVault, appAbi('basket.ts', 'BASKET_ABI'), me)
const badges = new Contract(DEPLOYMENT.v2.badges, appAbi('badges.ts', 'ABI'), me)
const registry = new Contract(DEPLOYMENT.v2.agentRegistry, appAbi('registry.ts', 'REGISTRY_ABI'), me)
const groups = new Contract(DEPLOYMENT.v2.groupFunds, appAbi('groups.ts', 'ABI'), me)
const router = new Contract(DEPLOYMENT.v2.depositRouter, appAbi('deposit.ts', 'ROUTER_ABI'), me)

const U = (x: number) => BigInt(Math.round(x * 1e6)) // tUSDT, 6 decimals
const fmt = (x: bigint) => formatUnits(x, 6)
const results: { step: string; ok: boolean; note: string }[] = []

async function step(name: string, fn: () => Promise<string | void>) {
  process.stdout.write(`• ${name} … `)
  try {
    const note = (await fn()) ?? ''
    results.push({ step: name, ok: true, note })
    console.log(`ok ${note}`)
  } catch (e) {
    const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message
    results.push({ step: name, ok: false, note: msg.slice(0, 160) })
    console.log(`FAILED ${msg.slice(0, 160)}`)
  }
}

const send = async (p: Promise<{ wait: () => Promise<unknown>; hash: string }>) => {
  const tx = await p
  await tx.wait()
  return tx.hash
}
function expect(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`)
}
const account = async () => {
  const a = await coinai.accountOf(ME)
  return { split: Number(a.splitBps), spend: BigInt(a.spend), idle: BigInt(a.idle), pos: (a.positions as bigint[]).map(BigInt) }
}
async function approve(spender: string, amount: bigint) {
  if ((await token.allowance(ME, spender)) < amount) await send(token.approve(spender, MaxUint256))
}

console.log(`coinAI v2 smoke test · user ${ME} · agent ${AGENT}\n`)
console.log(`tBNB ${formatUnits(await provider.getBalance(ME))} · tUSDT ${fmt(await token.balanceOf(ME))}\n`)

// ─── User flows (real transactions) ─────────────────────────────────────────

await step('setSplit 50%', async () => {
  await send(coinai.setSplit(ME, 5000))
  expect((await account()).split === 5000, 'split is 5000')
})

await step('pay 20 tUSDT to myself (deposit)', async () => {
  const before = await account()
  await approve(DEPLOYMENT.v2.coinai, U(20))
  const hash = await send(coinai.pay(ME, ME, U(20)))
  const after = await account()
  expect(after.spend - before.spend === U(10) && after.idle - before.idle === U(10), 'split 10 spend / 10 idle')
  return hash
})

await step('investSavings 3 → Conservative vault', async () => {
  const before = await account()
  await send(coinai.investSavings(U(3), 0))
  const after = await account()
  expect(after.idle === before.idle - U(3) && after.pos[0] >= before.pos[0] + U(3) - 1n, 'idle → conservative')
  return `conservative ${fmt(after.pos[0])}`
})

await step('investSavings 3 → AI Smart Money basket', async () => {
  const before = await account()
  await send(coinai.investSavings(U(3), 3, { gasLimit: 700_000 }))
  const after = await account()
  expect(after.pos[3] > before.pos[3], 'basket grew')
  return `basket ${fmt(after.pos[3])}`
})

await step('rebalance Conservative → Balanced (all)', async () => {
  await send(coinai.rebalance(0, 1, MaxUint256, { gasLimit: 500_000 }))
  const a = await account()
  expect(a.pos[0] === 0n && a.pos[1] > 0n, 'moved')
  return `balanced ${fmt(a.pos[1])}`
})

await step('withdrawPosition Balanced (all) to wallet', async () => {
  const wallet = await token.balanceOf(ME)
  await send(coinai.withdrawPosition(ME, 1, MaxUint256, { gasLimit: 300_000 }))
  expect((await account()).pos[1] === 0n && (await token.balanceOf(ME)) > wallet, 'position out to wallet')
})

await step('withdrawSavings 1 (idle, 1:1)', async () => {
  const before = await account()
  await send(coinai.withdrawSavings(ME, U(1)))
  expect((await account()).idle === before.idle - U(1), 'idle -1')
})

await step('withdrawSpend 1', async () => {
  const before = await account()
  await send(coinai.withdrawSpend(ME, U(1)))
  expect((await account()).spend === before.spend - U(1), 'spend -1')
})

await step('payMany 1 + 1 tUSDT (agent wallet + basket curator)', async () => {
  const to = [AGENT, '0x000000000000000000000000000000000000dEaD']
  const stats = await coinai.statsOf(AGENT)
  await approve(DEPLOYMENT.v2.coinai, U(2))
  await send(coinai.payMany(to, [U(1), U(1)], { gasLimit: 300_000 }))
  expect(Number((await coinai.statsOf(AGENT)).paymentCount) === Number(stats.paymentCount) + 1, 'recipient credited')
})

await step('setAgent: split + invest + pay, 10–40%, 5 tUSDT/30d, 14 days', async () => {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 14 * 86400)
  await send(coinai.setAgent(AGENT, 7, 1000, 4000, U(5), expiry, { gasLimit: 250_000 }))
  const p = await coinai.policyOf(ME, AGENT)
  const [agents] = await coinai.agentsOf(ME)
  expect(Number(p.skills) === 7 && (agents as string[]).some((a) => a.toLowerCase() === AGENT.toLowerCase()), 'policy set')
})

await step('BasketVault.setWeights own 30/20/20/15/15, then follow Plutus again', async () => {
  await send(basket.setWeights([3000, 2000, 2000, 1500, 1500], { gasLimit: 600_000 }))
  const [w, custom] = await basket.weightsOf(ME)
  expect(custom && Number(w[0]) === 3000, 'custom weights')
  await send(basket.setWeights([], { gasLimit: 600_000 }))
  expect(!(await basket.weightsOf(ME))[1], 'back to Plutus')
})

await step('claim badge "First payment"', async () => {
  const before = (await badges.badgesOf(ME))[0]
  if (before !== 0n) return 'already earned'
  await send(badges.claim(0))
  expect((await badges.badgesOf(ME))[0] > 0n, 'badge minted')
})

let hermesId = -1
await step('hire Hermes in AgentRegistry (1 period)', async () => {
  const count = Number(await registry.listingCount())
  for (let i = 0; i < count; i++) if ((await registry.listing(i)).name === 'Hermes') hermesId = i
  expect(hermesId >= 0, 'Hermes listed')
  const fee = BigInt((await registry.listing(hermesId)).feePer30Days)
  await approve(DEPLOYMENT.v2.agentRegistry, fee)
  await send(registry.hire(hermesId, 1))
  return `rented until ${new Date(Number(await registry.rentedUntil(ME, hermesId)) * 1000).toISOString().slice(0, 10)}`
})

await step('depositBNB 0.002 tBNB through the v2 router', async () => {
  const before = await account()
  const wei = parseEther('0.002')
  const [quoted] = await router.quoteBNB(wei)
  await send(router.depositBNB((BigInt(quoted) * 99n) / 100n, { value: wei, gasLimit: 300_000 }))
  const after = await account()
  expect(after.spend + after.idle > before.spend + before.idle, 'credited to coinAI v2')
  return `≈ ${fmt(BigInt(quoted))} tUSDT`
})

await step('legacy v1: withdraw what is left (spend, idle savings, v1 vault shares)', async () => {
  const v1 = new Contract(DEPLOYMENT.coinai, appAbi('legacy.ts', 'V1_ABI'), me)
  const acc = await v1.accountOf(ME)
  const spend = BigInt(acc.spend)
  const savings = BigInt(acc.shares)
  const locked = Number(acc.lockUntil) * 1000 > Date.now()
  if (spend > 0n) await send(v1.withdrawSpend(ME, spend, { gasLimit: 200_000 }))
  if (savings > 0n && !locked) await send(v1.withdrawSavings(ME, savings, { gasLimit: 300_000 }))
  let redeemed = 0n
  for (let i = 0; i < 3; i++) {
    const vault = new Contract(await v1.vaultOf(i), appAbi('legacy.ts', 'VAULT_ABI'), me)
    const shares = BigInt(await vault.balanceOf(ME))
    if (shares > 0n) {
      await send(vault.redeem(shares, ME, ME, { gasLimit: 200_000 }))
      redeemed += shares
    }
  }
  const after = await v1.accountOf(ME)
  expect(BigInt(after.spend) === 0n && (locked || BigInt(after.shares) === 0n), 'v1 emptied')
  return `spend ${fmt(spend)} · savings ${fmt(savings)}${locked ? ' (locked, kept)' : ''} · vault shares ${fmt(redeemed)}`
})

// ─── Groups (real ones, so the landing and the groups pages show live data) ─

let iuranId = -1
if (withGroups) {
  const now = Math.floor(Date.now() / 1000)
  const create = async (kind: number, title: string, target: bigint, deadline: number, dues: bigint, period: number) => {
    const tx = await groups.create(kind, ME, title, target, deadline, dues, period, { gasLimit: 400_000 })
    const receipt = await tx.wait()
    const ev = receipt.logs.map((l: { topics: string[]; data: string }) => groups.interface.parseLog(l)).find((x: { name: string } | null) => x?.name === 'FundCreated')
    return Number(ev.args.id)
  }
  await step('GroupFunds: Iuran "Kas RT 05" (2 tUSDT / 30 days), join, pay dues from coinAI spendable', async () => {
    iuranId = await create(1, 'Kas RT 05', 0n, 0, U(2), 30 * 86400)
    await send(groups.join(iuranId))
    await send(coinai.contributeFromSpend(iuranId, U(2), 'Iuran Oktober', { gasLimit: 300_000 }))
    const [paid, owed] = await groups.duesOf(iuranId, ME)
    expect(Number(paid) === 1 && Number(owed) === 1, 'dues paid up')
    return `group #${iuranId}`
  })
  await step('GroupFunds: Patungan "Trip ke Bali" (target 50, 30 days), chip in 5 from wallet', async () => {
    const id = await create(0, 'Trip ke Bali', U(50), now + 30 * 86400, 0n, 0)
    await approve(DEPLOYMENT.v2.groupFunds, U(5))
    await send(groups.contribute(id, U(5), 'Aku ikut!'))
    expect(BigInt((await groups.fund(id)).raised) === U(5), 'raised 5')
    return `group #${id}`
  })
  await step('GroupFunds: Donasi "Bantu banjir Bekasi", give 3 from coinAI spendable', async () => {
    const id = await create(2, 'Bantu banjir Bekasi', U(100), now + 21 * 86400, 0n, 0)
    await send(coinai.contributeFromSpend(id, U(3), 'Semoga cepat pulih', { gasLimit: 300_000 }))
    expect(BigInt((await groups.fund(id)).raised) === U(3), 'raised 3')
    return `group #${id}`
  })
}

// ─── Agent wallet (eth_call from its address on the live state) ─────────────

const simulate = (tx: { to: string; data: string }) => provider.call({ ...tx, from: AGENT })

await step('agent: agentSetSplit 30% (Demeter)', async () => {
  await simulate(agentTx(ME, { kind: 'set_split', bps: 3000, reason: 'smoke test' }))
})
await step('agent: agentInvest 1 → Growth (Athena)', async () => {
  await simulate(agentTx(ME, { kind: 'invest', amount: U(1), target: 'growth', reason: 'smoke test' }))
})
await step('agent: agentRebalance basket → Conservative (Athena, risk-off)', async () => {
  const a = await account()
  expect(a.pos[3] > 0n, 'basket position to move')
  await simulate(agentTx(ME, { kind: 'rebalance', from: 'basket', to: 'conservative', amount: a.pos[3] / 2n, reason: 'smoke test' }))
})
if (iuranId >= 0)
  await step('agent: agentContribute 2 into Kas RT 05 (Hermes, within budget)', async () => {
    await simulate(agentTx(ME, { kind: 'contribute', fundId: iuranId, amount: U(2), member: true, reason: 'smoke test' }))
  })
await step('agent: agentContribute over the 5 tUSDT budget is refused', async () => {
  if (iuranId < 0) return 'skipped (no group)'
  try {
    await simulate(agentTx(ME, { kind: 'contribute', fundId: iuranId, amount: U(6), member: true, reason: 'smoke test' }))
  } catch {
    return 'reverted as expected'
  }
  throw new Error('over-budget contribution was accepted')
})
await step('agent: BasketVault.setSmartWeights for risk_off (Plutus, curator)', async () => {
  const b = new Contract(DEPLOYMENT.v2.basketVault, BACKEND_BASKET_ABI, provider)
  const assets = (await b.assets()) as { symbol: string; maxBps: bigint }[]
  const w = smartWeights('risk_off', assets.map((a) => ({ symbol: a.symbol, maxBps: Number(a.maxBps) })))
  expect(w !== null, 'weights fit the caps')
  await simulate({ to: DEPLOYMENT.v2.basketVault, data: new Interface(BACKEND_BASKET_ABI).encodeFunctionData('setSmartWeights', [w, 'smoke test']) })
})
await step('agent: CoinAIBadges.award streak badge (minter)', async () => {
  await simulate({ to: DEPLOYMENT.v2.badges, data: new Interface(BACKEND_BADGES_ABI).encodeFunctionData('award', [ME, 3]) })
})
await step('non-agent wallet is refused agentInvest', async () => {
  try {
    await provider.call({ ...agentTx(ME, { kind: 'invest', amount: U(1), target: 'growth', reason: 'x' }), from: '0x000000000000000000000000000000000000dEaD' })
  } catch {
    return 'reverted as expected'
  }
  throw new Error('a stranger could call agentInvest')
})

// ─── Summary ─────────────────────────────────────────────────────────────────

const a = await account()
console.log(`\nAccount now: spend ${fmt(a.spend)} · idle ${fmt(a.idle)} · positions ${a.pos.map(fmt).join(' / ')}`)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
for (const f of failed) console.log(`  ✗ ${f.step}: ${f.note}`)
process.exit(failed.length ? 1 : 0)
