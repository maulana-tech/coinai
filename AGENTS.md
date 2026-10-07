# AGENTS.md

coinAI — AI-agent-managed auto-savings on every payment, on BNB Smart Chain testnet (Indonesia Web3 Hackathon 2026, AI Agents track). Two independent workspaces: `evm/` (Foundry/Solidity) and `web/` (React 19 + Vite + TS + wagmi/ethers). `docs/ai-agents.md` describes the agent team; `deployments.json` + `web/src/lib/config.ts` are the source of truth for deployed addresses.

## Commands

- `evm/`: `forge build`, `forge test`. forge-std is a git submodule — run `git submodule update --init` after clone or builds fail.
- `web/`: `npm install`, `npm run dev`, `npm run lint` (oxlint), `npm run build` (runs `tsc -b` typecheck then `vite build`). No web test suite.
- Landing (`web/src/pages/landing.tsx`) is a film-led editorial page: looping videos + posters live in `web/public/landing/` (generated with Higgsfield, ping-pong looped with ffmpeg). Copy is i18n'd under `lp.*`.
- READMEs cite `/Users/em/.foundry/bin/forge` (a dead Mac path) — use `~/.foundry/bin/forge` (forge is not on PATH here).
- Deploys (BSC Testnet, chain 97): `forge script script/DeployAll.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY` — deploys MockUSDT, 3 SimpleVaults, CoinAI in one go (foundry.toml aliases `bsc_testnet` to `$BSC_TESTNET_RPC_URL`). `script/DeployRouter.s.sol` adds the tBNB DepositRouter next to an existing deployment (env `COINAI`, `TOKEN`, `TREASURY`); `script/DeployV2.s.sol` deployed v2; `script/DeployBadges.s.sol` the soulbound badges (env `COINAI`, `MINTER`). Verify with `forge verify-contract <addr> src/X.sol:X --chain 97 --verifier sourcify`. forge lives at `~/.foundry/bin/forge` (not on PATH).
- Git workflow: `push.sh` (bash, needs Git Bash) commits one file per commit with conventional-commit types inferred from filename; history matches. Don't batch commits.

## Gotchas

- **Token decimals**: tUSDT (`evm/src/MockUSDT.sol`) is **6 decimals**, matching `TOKEN_DECIMALS = 6` in `web/src/lib/token.ts` (used by `format.ts`, `yield.ts`, faucet, and `formatMoney`). Keep them in sync.
- **The app and agents run on CoinAI v2** (`evm/src/CoinAIV2.sol`, `DEPLOYMENT.v2` in `web/shared/deployment.ts`). v1 (`Save.sol`, top-level `DEPLOYMENT.coinai`) is read only: `web/src/lib/legacy.ts` + `LegacyBanner` let users withdraw what is left there, and activity reads both. v2 has no per-account yield target: savings are `idle` plus `positions` held inside the contract.
- **Position mapping** is duplicated: CoinAIV2 targets (0 Conservative, 1 Balanced, 2 Growth, 3 Basket) = `POSITIONS` in `web/src/lib/types.ts` and `web/api/_lib/guard.ts`. Changing order breaks both.
- **Agent guardrails** (`CoinAIV2.sol`): users `setAgent(agent, skills, minBps, maxBps, payBudget, expiry)` per agent (up to 8). Skills: SPLIT → `agentSetSplit`; INVEST → `agentInvest` / `agentRebalance` (only between the user's own positions); PAY → `agentContribute` (GroupFunds the user joined, from spendable, within `payBudget` per 30 days). Investing is allowed while locked; withdrawing positions isn't. `api/_lib/guard.ts` mirrors all of this — change both together. Never add an agent path that transfers to a non-user address. Design: `docs/ai-agents.md`.
- **Contract errors**: custom Solidity `error`s are mapped to `Error(Contract, #N)` strings via `ERROR_CODES` in `coinai.evm.ts` and localized in `web/src/lib/errors.ts` + `i18n.tsx`. Adding a contract error requires updating all three.
- **Consumer features** (`api/_lib/rewards.ts`, page `/app/rewards`): goals are KV pockets that each hold a share of the one on-chain savings balance (saved via `POST /api/agent/profile?goals`); weekly streaks are stepped by the cron for every wallet in the KV sets `users` + `savers`; badges live in `evm/src/CoinAIBadges.sol` (ids 0–2 claimable by the user, 3–5 awarded by the agent wallet); referral points are credited in `/api/agent/autopilot` nudge from the on-chain payment, read via `GET /api/agent/autopilot?user=`; public pools via `GET /api/pools?public`.
- **Telegram** (`api/telegram.ts` webhook): commands /portfolio /agent /groups /goals /badges /points /pools /use /deposit /market /run /report; their texts and the push notifications (referral points, awarded badge, goal reached, organizer income, Plutus weights) live in `api/_lib/bot.ts` (en/id/zh, tested in `bot.test.ts`). After adding a command, update the menu in `web/scripts/setup-telegram.sh` and rerun it.
- **Daily duties** (`api/_lib/duties.ts`, called from `api/cron/daily.ts`): Plutus sets the basket weights (`BasketVault.setSmartWeights`, the agent wallet is the curator) from the market regime; Hermes pays dues only while hired in `AgentRegistry`; Poseidon adds group reminders to the Telegram report.
- **Mock mode is opt-in**: `VITE_MOCK=1` switches `coinai.ts` to an in-memory mock (`coinai.mock.ts`) — handy for UI work without a chain. Every other `VITE_*` value that is unset or empty (as `vercel env pull` writes them) falls back to the live v2 deployment in `web/shared/deployment.ts`, so the app never quietly shows fake data.
- Chain is hardwired to BSC Testnet (chain 97). Read paths use a plain `JsonRpcProvider` (never pops a wallet dialog); write paths use the wagmi signer, which switches/adds chain 97 via `getEthersSigner()`.
- `web/` package manager is **npm** (README + Vercel). `pnpm-lock.yaml`/`pnpm-workspace.yaml` are stale placeholders (`allowBuilds` contains literal "set this to true or false" text) — ignore them.
- Dev-only: Vite proxies `/faucet` to a Blend faucet lambda (no CORS); `web/vercel.json` rewrites everything to `index.html` for the SPA in production.

## Agent backend (`web/api/`, Vercel Functions)

- Multi-agent flow in `api/_lib/swarm.ts`: Market Analyst (Chainlink on BSC + Binance, `shared/market.ts`) → Savings + Investment strategists (parallel, use the investor profile) → `guard.ts` (deterministic, mirrors contract rules) → Risk Officer (veto only, fails closed) → executor (agent wallet) → Reporter. Orchestration is code, not an LLM supervisor.
- LLM = OpenRouter via plain `fetch` (`llm.ts`), model per role via `OPENROUTER_MODEL[_ROLE]`. Storage = Upstash Redis REST (`kv.ts`). Notifications: Telegram bot webhook (`api/telegram.ts`) + Gmail SMTP (`nodemailer`). Daily cron `api/cron/daily.ts` (Vercel Hobby = 1x/day).
- Auth: wallet `personal_sign` of `loginMessage()` → `/api/auth` → HMAC bearer token (`http.ts`). All server env vars are listed in `web/.env.example` (no `VITE_` prefix = never shipped to the client).
- Imports inside `api/` use `.js` extensions (nodenext). `api/` is typechecked by `tsconfig.api.json` as part of `npm run build`. Guard and decision tests: `node --test api/_lib/guard.test.ts api/_lib/decision.test.ts` (Node < 22.18 needs `--experimental-strip-types`); all backend tests (incl. `duties.test.ts`, which imports `.js` paths): `npx tsx --test api/_lib/*.test.ts`. Evaluation: `npx tsx --test api/_lib/evaluation.test.ts`; `npx tsx scripts/evaluate-agents.ts` regenerates `src/lib/evaluation-results.ts` (never edit it by hand).
- `vercel dev` (not `npm run dev`) is needed to serve `/api` locally.
- Shared group links `/g/:id` (vercel.json → `api/invoices.ts?og=`) serve a preview page (`_lib/og.ts`) whose `og:image` is `/g/:id/image.png` (`?ogimg=`): the group's live card drawn with satori + `@resvg/resvg-js` (`_lib/og-image.ts`, fonts fetched from Google Fonts). Keep it under ~300 KB (art only on the right half) or WhatsApp drops the preview.
- Vercel Hobby allows **max 12 serverless functions** (one per file in `api/` outside `_lib/`; all 12 used since `api/invoices.ts`). Add routes to an existing file (method or query flag) rather than a new file.

## Web conventions

- UI text is i18n'd via `web/src/lib/i18n.tsx` with 3 locales (en, id, zh); new user-facing strings must be added to all three blocks. Revert strings are mapped to `Error(Contract, #N)` before display.
- Routes: `/` landing, `/pay/:address` payment link, `/app/*` dashboard app shell (see `src/App.tsx`). Components under `src/components/ui/` are shadcn-style; `@/` aliases `src/`.
- Addresses come from `VITE_*` env (`src/lib/config.ts`), defaulting to `DEPLOYMENT.v2`. Vault addresses are read from `CoinAI.vaultOf()`.
