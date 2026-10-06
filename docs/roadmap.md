# Roadmap

Plan to strengthen coinAI across the three hackathon tracks, in order: **AI Agents → Finance & Commerce → Consumer Apps**.

| Track | Brief | What coinAI has today |
|---|---|---|
| AI Agents | autonomous agents & AI x DeFi onchain | 7-role team + chat advisor, three safety layers, autopilot on payment, saved pools as strategy |
| Finance & Commerce | DeFi, payments and RWA for Indonesia | auto-split payments, payment links + QR, IDR display, tBNB on-ramp, 3 vaults with simulated yield |
| Consumer Apps | social, gaming and loyalty with seamless UX | Telegram bot, email + PDF statements, 3 locales; no social, gaming or loyalty yet |

## Progress

What's left, in order: [`next.md`](../next.md).

| Item | Status |
|---|---|
| A1 agent memory, A2 confidence gate (+ "Why the agents chose this mix", part of A5) | done |
| F1 withdraw from vaults, F2 consistent facts | done |
| A3 agent vs fixed rule (replay + panel + README) | done; live-model spot check waits for an OpenRouter key |
| A4 demo reliability: failure codes, clear messages, independent-risk-model warning | done; set `OPENROUTER_MODEL_RISK` on Vercel and record a backup demo |
| A5 explainability | done with the decision card (reference, tilt, confidence, previous run) |
| F3 invoices (rupiah/tUSDT, memo, reference, on-chain verified status) | done; test the full flow on a deploy (local env has no KV credentials) |
| F4 Telegram receipt for every payment | done; same |
| F5 rebalance, F6 AI Smart Money basket, F7 `payMany` (CoinAIV2 + BasketVault) | contracts deployed and verified; backend + app next |
| Group funds (Patungan / Iuran / Donasi) | contracts deployed and verified; standalone pages done (`/groups`, `/groups/new`, `/groups/:id`, shareable `/g/:id` with link preview), share images for posts and stories, UX checked with screenshots on a local fork |
| Hireable agent skills (AgentRegistry, scoped multi-agent permissions), Greek agent names | contracts deployed and verified; Agents page + v2 migration (v1 banner) + backend next |
| Landing "council" section: the team as Greek gods at one table, scroll-driven, one card per agent with its contracts and transactions | done |

## Gaps found (as of `bb107ad`)

1. **Vault positions can't be withdrawn in the app.** Neither `Save.sol` nor the UI has a redeem path, while the docs promise "withdraw anytime from vaults" and "reversible by the user".
2. **Agents can only add to vaults, never move between them.** A `risk_off` read only steers new money; what already sits in Growth stays there.
3. **No agent memory.** `runs:<user>` is stored but never fed to the strategists, so decisions can flip-flop; `confidence` is requested and then ignored.
4. **The market read has no consequence.** Simulated APY is fixed (3/6/12%), so "risk_off → conservative" doesn't change outcomes.
5. **No social, gaming or loyalty layer.**
6. **Vercel Hobby limit:** 11 of 12 functions were used (12 of 12 since F3 added `api/invoices.ts`). New server features must ride on existing endpoints (`?action=` pattern, like `api/agent/autopilot.ts`).
7. **Inconsistent facts:** deploy block (`133234240` vs `133234241`) and agent address (`0x03c8…f6C6` vs `0x7209…dd0B`) differ between `deployments.json` and `docs/hackathon-project-detail.md`.

All contract changes are batched into a single **CoinAI v2** deploy so users migrate once.

## Phase 1 — AI Agents (no contract change)

| # | Feature | Scope | Files |
|---|---|---|---|
| A1 | **Agent memory** | Feed the last 3–5 runs (decision, reason, outcome) to both strategists and the Risk Officer; rule: don't reverse a recent move without new data | `api/_lib/swarm.ts` |
| A2 | **Use confidence** | Skip proposals below a threshold (default 0.5), logged as `skipped: low confidence`; threshold configurable in the investor profile | `api/_lib/swarm.ts`, `api/_lib/guard.ts` (+ test) |
| A3 | **Agent vs fixed rule** | Replay 90 days of Binance closes (same data as `shared/pool.ts`) for three income patterns (monthly salary, freelancer, daily gig) and compare the agent team with a fixed 20% split into Balanced. Results table in README + panel on `/app/portfolio` | `web/scripts/`, `web/shared/` |
| A4 | **Demo reliability** | Pin a stable paid model for the Risk Officer, different from the strategists; clear UI message when every model fails; recorded backup demo | env, `api/_lib/llm.ts` |
| A5 | **Explainability** | "Why this move" on AI Portfolio: inputs used, change vs previous run, confidence | `src/pages/portfolio.tsx`, `src/pages/agent-role.tsx` |

## Phase 2 — Finance & Commerce

### 2a. Quick fixes (no contract change)

- **F1. Withdraw from vaults.** UI calls `vault.redeem(shares, user, user)` directly, closing gap 1.
- **F2. Consistent facts** across `deployments.json`, README and `docs/`.

### 2b. Payments for Indonesia (no contract change)

- **F3. Invoices.** IDR amount locked to the rate at payment time, memo/reference, *paid / unpaid* status read from `PaymentRouted` events. Extends the existing payment link.
- **F4. Payment received alerts on Telegram** for the recipient: receipt plus "X tUSDT saved automatically" (today Telegram only reports agent actions).

### 2c. CoinAI v2 — AI x DeFi (one redeploy)

- **F5. `agentRebalance(user, from, to, amount, reason)`.** Agents can move positions between vaults (e.g. on `risk_off`). Vault positions are held per user inside CoinAI, so withdrawals go through CoinAI; the invariant stays: funds only ever go to the user. Pattern: Mirai's `setStrategy` (redeem from the old vault, deposit into the new one in one call), but triggered by the agent team inside the user's limits.
- **F6. Market-linked vault.** A basket vault priced by Chainlink feeds on BSC (BNB, BTC, ETH, CAKE + stable), modelled on Mirai's `BasketVault`: per-saver units bought at the price on deposit, sold pro rata on withdrawal, value can fall. The difference from Mirai: the **agent team sets the weights** (from the market read and the user's saved pool) instead of a curator, within caps (min stable share, max per coin). The regime call then has real upside and downside, and A3 can be proven on-chain.
- **F7. `payMany`.** Payroll / gig payouts to many recipients in one call, each recipient's split applied.

**Open decision — real yield source.** Venus / Lista on testnet don't accept our `MockUSDT`:

- **(a)** keep the simulator and make it market-linked (F6) — realistic within hackathon time;
- **(b)** switch the asset to a token Venus supports on testnet — more "real", but faucet, DepositRouter and every flow change.

## Phase 3 — Consumer Apps

| # | Feature | Track angle | Builds on |
|---|---|---|---|
| C1 | **Savings goals as pockets** (amount, deadline, progress, own vault and lock per goal) with a shareable progress card; agents route each payment's savings across pockets | social | `goal` in the investor profile (free text today); pocket model from Mirai |
| C2 | **Streaks & soulbound badges** ("4 weeks saving", "goal reached", "first agent run"), minted from `statsOf` | loyalty, gaming | small standalone contract, independent of v2 |
| C3 | **Public pools & copy strategy** + weekly pool leaderboard by backtest | social, gaming | saved pools + backtest |
| C4 | **Referrals through payment links** (points for both sides) | loyalty | payment links |
| C5 | *(optional)* **Group savings goal / arisan** | social | needs a new contract; only if time allows |

## Out of scope

Not taken from Mirai: passkey accounts, automatic onboarding (gas + test funds), and single-transaction permit payments.

## Order of work

1. A1, A2, F1, F2 — quick, high impact
2. A3 — the strongest proof for judges
3. F3, F4
4. CoinAI v2 (F5, F6, F7) in one deploy, then re-run A3 on the new vaults
5. C1, C2, C3; then C4 if time allows

## Open questions

- Hackathon deadline — decides whether CoinAI v2 (2c) is in scope.
- Real yield source: (a) market-linked simulator or (b) Venus-supported asset.
