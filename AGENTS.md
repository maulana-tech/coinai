# AGENTS.md

coinAI — auto-savings on every FXRP payment (Flare Summer Signal, Bounty 1). Two independent workspaces: `evm/` (Foundry/Solidity) and `web/` (React 19 + Vite + TS + wagmi/ethers). `CONTEXT.md` is the hackathon planning doc; `deployments.json` + `web/src/lib/config.ts` are the source of truth for deployed addresses.

## Commands

- `evm/`: `forge build`, `forge test`. forge-std is a git submodule — run `git submodule update --init` after clone or builds fail.
- `web/`: `npm install`, `npm run dev`, `npm run lint` (oxlint), `npm run build` (runs `tsc -b` typecheck then `vite build`). No web test suite.
- READMEs cite `/Users/em/.foundry/bin/forge` (a dead Mac path) — just use `forge` from PATH.
- Deploys (BSC Testnet, chain 97): `forge script script/DeployAll.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY` — deploys MockUSDT, 3 SimpleVaults, CoinAI in one go (foundry.toml aliases `bsc_testnet` to `$BSC_TESTNET_RPC_URL`). forge lives at `~/.foundry/bin/forge` (not on PATH).
- Git workflow: `push.sh` (bash, needs Git Bash) commits one file per commit with conventional-commit types inferred from filename; history matches. Don't batch commits.

## Gotchas

- **FXRP decimals**: the app treats FXRP as **6 decimals** (`FXRP_DECIMALS = 6` in `web/src/lib/fxrp.ts`, used by `format.ts`, `yield.ts`, faucet) even though README/comments claim 18. Contract math is decimal-agnostic, so web↔contract amounts are consistent only at 6. Don't "fix" to 18 without changing every lib layer.
- **Yield target mapping** is duplicated: enum order in `evm/src/Save.sol` (Conservative=0, Balanced=1, Growth=2; web still uses old Flare labels until the frontend migration) and `toYieldTarget/fromYieldTarget` in `web/src/lib/coinai.evm.ts`. Changing order breaks the frontend. `setYieldTarget` reverts with `SavingsNotZero()` if the account holds shares.
- **Agent guardrails** (`Save.sol`): users `setAgent(agent, minBps, maxBps, expiry)`; agent may only `agentSetSplit` (within bounds) and `agentInvest` (into the 3 immutable vaults, shares minted to the user). Never add an agent path that transfers to a non-user address. Plan: `docs/plan-bnb-ai-agent.md`.
- **Contract errors**: custom Solidity `error`s are mapped to `Error(Contract, #N)` strings via `ERROR_CODES` in `coinai.evm.ts` and localized in `web/src/lib/errors.ts` + `i18n.tsx`. Adding a contract error requires updating all three.
- **Mock mode**: setting `VITE_COINAI_ADDRESS=""` in `web/.env` switches `coinai.ts` to an in-memory mock (`coinai.mock.ts`) — handy for UI work without a wallet.
- Chain is hardwired to Flare Coston2 (chain 114). Read paths use a plain `JsonRpcProvider` (never pops a wallet dialog); write paths use the wagmi signer and enforce chain 114.
- `web/` package manager is **npm** (README + Vercel). `pnpm-lock.yaml`/`pnpm-workspace.yaml` are stale placeholders (`allowBuilds` contains literal "set this to true or false" text) — ignore them.
- `evm/README.md` shows an outdated coinAI address (`0x6d4d...`); current is `0x588D...` (see `deployments.json`).
- `check_tx.js` at root is a scratch debug script with hardcoded tx/addresses — not part of the app.
- Dev-only: Vite proxies `/faucet` to a Blend faucet lambda (no CORS); `web/vercel.json` rewrites everything to `index.html` for the SPA in production.

## Agent backend (`web/api/`, Vercel Functions)

- Multi-agent flow in `api/_lib/swarm.ts`: Savings + Yield strategists (parallel) → `guard.ts` (deterministic, mirrors contract rules) → Risk Officer (veto only, fails closed) → executor (agent wallet) → Reporter. Orchestration is code, not an LLM supervisor.
- LLM = OpenRouter via plain `fetch` (`llm.ts`), model per role via `OPENROUTER_MODEL[_ROLE]`. Storage = Upstash Redis REST (`kv.ts`). Notifications: Telegram bot webhook (`api/telegram.ts`) + Gmail SMTP (`nodemailer`). Daily cron `api/cron/daily.ts` (Vercel Hobby = 1x/day).
- Auth: wallet `personal_sign` of `loginMessage()` → `/api/auth` → HMAC bearer token (`http.ts`). All server env vars are listed in `web/.env.example` (no `VITE_` prefix = never shipped to the client).
- Imports inside `api/` use `.js` extensions (nodenext). `api/` is typechecked by `tsconfig.api.json` as part of `npm run build`. Guard test: `node --test api/_lib/guard.test.ts`.
- `vercel dev` (not `npm run dev`) is needed to serve `/api` locally.

## Web conventions

- UI text is i18n'd via `web/src/lib/i18n.tsx` with 3 locales (en, id, zh); new user-facing strings must be added to all three blocks. Revert strings are mapped to `Error(Contract, #N)` before display.
- Routes: `/` landing, `/pay/:address` payment link, `/app/*` dashboard app shell (see `src/App.tsx`). Components under `src/components/ui/` are shadcn-style; `@/` aliases `src/`.
- Deployed addresses are also hardcoded as defaults in `src/lib/config.ts` (e.g. VaultAdapter `0x3c13...`, `YIELD_TOKEN_OUT`). `depositYieldDirect` in `coinai.evm.ts` special-cases the VaultAdapter path vs the SparkDEX router path.
