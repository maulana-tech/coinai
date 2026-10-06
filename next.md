# Next

What is still missing, in order of priority. The full plan and what is done live in [`docs/roadmap.md`](docs/roadmap.md).

State today: the CoinAI v2 contracts (`CoinAIV2`, `BasketVault`, `GroupFunds`, `AgentRegistry`) are deployed and verified on BSC Testnet (`deployments.json` → `bscTestnet.v2`). The group pages already run on `GroupFunds`; everything else in the app still runs on v1.

## 1. Move the app to CoinAI v2

- **Migration (option 1):** a banner for users who still have funds in v1: withdraw from v1, then use v2. Read both contracts until v1 is empty.
- `web/src/lib/coinai.evm.ts`, `web/src/lib/config.ts`: point at `DEPLOYMENT.v2.coinai` with the v2 ABI (positions per user: idle + vault shares + basket; `withdrawPosition`, `investSavings`, `rebalance`).
- **AI Portfolio:** show every position, including an AI Smart Money basket card (weights, price freshness, the reason given with the last `setSmartWeights`).
- **Payment link:** a "pay many" tab on top of `payMany` (up to 50 recipients, each recipient's split applied).
- **Groups:** pay from the coinAI spendable balance (`contributeFromSpend`) as well as from the wallet.
- **Activity:** read the v2 events (`PaymentRouted` with `yieldTarget = 255`, rebalance, basket, `agentContribute`).

## 2. Agents page v2

- Greek names everywhere in the app (agents page, decision card, activity), matching the landing.
- Per-skill permissions (`SKILL_SPLIT`, `SKILL_INVEST`, `SKILL_PAY`): `setAgent(agent, skills, minSplitBps, maxSplitBps, payBudget, expiry)`, list with `agentsOf`, `revokeAgent`.
- Split range: presets plus a custom slider in 5% steps, with a worked example ("of every Rp1.000.000 you save …").
- Hire Hermes from `AgentRegistry` (`hire(id, periods)`, 1 tUSDT per 30 days) and show `rentedUntil`.
- "Autopay with Hermes" on dues (iuran) group pages.

## 3. Backend: agents that act on v2

Vercel Hobby allows 12 functions and all 12 are used, so new server work goes in as `?action=` branches on existing endpoints.

- `web/api/_lib/chain.ts`: v2 reads and writes (`agentSetSplit`, `agentInvest`, `agentRebalance`, `agentContribute`).
- **Plutus:** daily `setSmartWeights(weights, reason)` from Apollo's market read, inside the vault's caps.
- **Athena:** `agentRebalance` when the regime changes (e.g. risk-off moves Growth → Conservative), with the same checks mirrored in `guard.ts` and tested.
- **Hermes:** pay dues in the daily cron (only funds the user joined, within `payBudget` per 30 days).
- **Poseidon:** Telegram reminders: dues due or late, chip-in deadline close, refunds open.
- Re-run the A3 evaluation on the v2 vaults and basket.
- When Plutus and Hermes really run: change their `status` from `'v2'` to `'live'` in `web/src/components/landing/council.tsx` (the landing says "Contract live · app soon" until then).

## 4. Check on a Vercel deploy (can't be done locally)

- Invoices and Telegram receipts end to end (the local env has no KV credentials).
- Group link previews at `/g/:id` (OG tags) in WhatsApp, X and Telegram.
- A3 live-model spot check: `OPENROUTER_API_KEY=… OPENROUTER_MODEL=… npx tsx scripts/evaluate-agents.ts`.
- Set `OPENROUTER_MODEL_RISK` on Vercel and record a backup demo video.

## 5. Consumer apps (roadmap phase 3, not started)

- C1 savings goals as pockets, with a shareable progress card.
- C2 streaks and soulbound badges.
- C3 public pools and copy strategy, with a weekly leaderboard by backtest.
- C4 referrals through payment links.

## 6. Landing "council" section: open points

- Zeus was added as the orchestrator; he wasn't in the first list of names. Keep or rename.
- The woman with the dove (far right of the painting) has no role, and the name Achilles is unused: a 13th agent, or leave her as part of the scene.
- `web/public/greek-god.jpeg` is 756 KB: ship a WebP/AVIF (~150 KB).

## 7. Housekeeping

- Lint: the pre-existing error in `web/api/telegram.ts` (`useText` is named like a React hook; rename it, e.g. `replyText`). Six warnings remain, mostly `only-export-components` in `components/ui/`.
- The app bundle is 1.4 MB (448 KB gzip): lazy-load the routes (landing, `/app/*`, `/groups*`).
