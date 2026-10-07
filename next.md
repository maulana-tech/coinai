# Next

What is still missing, in order of priority. The full plan and what is done live in [`docs/roadmap.md`](docs/roadmap.md).

State today (`feat/coinai-v2`): the app and the agents run on CoinAI v2: positions + AI Smart Money basket (own weights or Plutus's), moves between positions, migration banner for v1 funds, pay many, groups paid from the coinAI balance, per-skill agent permissions with Greek names, Hermes hire, a tBNB DepositRouter for v2, and the backend acting on v2 (Athena rebalance, Plutus weights, Hermes dues, Poseidon reminders). The consumer apps are in: savings goals as pockets with a share card (C1), soulbound badges + weekly streaks (C2, `CoinAIBadges`), the community pool leaderboard with copy (C3) and referral points through payment links (C4). The A3 evaluation includes Athena's rebalance, a Plutus-vs-static basket replay and the live-model spot check. The landing has a Groups chapter fed by the live GroupFunds contract, and mock mode is opt-in only (`VITE_MOCK=1`).

## 1. Vercel (needs the account owner: the Vercel CLI isn't set up here)

- Env: `VITE_COINAI_ADDRESS` / `COINAI_ADDRESS` must point at v2 (`0x2Cf3…F515`) or be removed so the default applies; `VITE_DEPLOY_BLOCK` stays at v1's block so old history shows; `VITE_AGENT_ADDRESS` = the agent wallet. Optional: `BADGES_ADDRESS` (defaults to `DEPLOYMENT.v2.badges`).
- Then check on the deploy: invoices and Telegram receipts end to end, group link previews at `/g/:id` (OG tags), the cron's new duties (Plutus weights, Hermes dues, streaks + awarded badges), referral points after a first payment through a link.
- A3 live-model spot check is done locally (claude-haiku-4.5: split direction 9/10, mix 0 points off). Set `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` on Vercel for the live agents.
- Set `OPENROUTER_MODEL_RISK` and record a backup demo video.

## 2. Open product points

- Landing council: Zeus stays as the orchestrator, and the woman with the dove stays part of the scene (no 13th agent) unless decided otherwise.
- Goals are pockets over the one on-chain savings balance (shares of it). A per-goal vault and lock would need a v3 contract.
- The basket replay shows Plutus losing less than static weights over the last year but with a slightly deeper worst dip (31 weight changes): consider changing weights only after a regime holds for a few days.

## 3. Housekeeping

- Lint: six warnings remain, mostly `only-export-components` in `components/ui/`.
- The main chunk is still 659 KB (219 KB gzip), mostly wagmi + ethers; split them out if it matters.
