# Development

## Prerequisites

- Node.js 20+ (24 recommended; the guard test runs `.ts` natively)
- [Foundry](https://book.getfoundry.sh/getting-started/installation) — use `~/.foundry/bin/forge` (the npm `forge` package is unrelated)
- An EVM wallet (MetaMask, Rabby, …) for the real-chain flow
- Optional: `npx vercel` to run the agent backend locally

## Quick start

```bash
git clone https://github.com/maulana-tech/coinai.git
cd coinai
git submodule update --init          # forge-std

# contracts
cd evm && ~/.foundry/bin/forge test  # 15 tests

# frontend in mock mode (no wallet, no contract)
cd ../web && npm install && npm run dev   # http://localhost:5173
```

Mock mode is on only with `VITE_MOCK=1`: `lib/coinai.mock.ts` keeps accounts in memory and vault, basket and badge data is static. Without it the app reads the live v2 deployment, even when `VITE_*` values are empty.

## Full local stack (anvil)

Run the real contracts on a local chain that pretends to be BSC Testnet (chain id 97):

```bash
# 1. chain
anvil --chain-id 97 --port 8547

# 2. contracts (anvil's first default key)
cd evm
~/.foundry/bin/forge script script/DeployAll.s.sol --rpc-url http://127.0.0.1:8547 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 3. app, pointed at anvil (addresses from the deploy output)
cd ../web
VITE_RPC_URL=http://127.0.0.1:8547 VITE_COINAI_ADDRESS=0x… VITE_TOKEN_ADDRESS=0x… \
VITE_DEPLOY_BLOCK=0 VITE_AGENT_ADDRESS=0x… npm run dev
```

Add the anvil network (RPC `http://127.0.0.1:8547`, chain id 97) to your wallet and import an anvil account to click through. Delete `evm/broadcast/DeployAll.s.sol/97/` afterwards so local runs aren't mistaken for real deploys.

## Agent backend locally

`/api/*` only exists under Vercel's runtime, so use:

```bash
cd web
cp .env.example .env    # fill the server-side block (OpenRouter, agent key, Upstash, secrets)
npx vercel dev          # SPA + /api on one port
```

Without OpenRouter/Upstash keys the Agent page still renders; runs and chat return an error toast.

## Commands

| Command | What |
|---|---|
| `cd evm && ~/.foundry/bin/forge test` | Contract tests (split, lock, vault routing, agent guardrails) |
| `cd web && npm run build` | Typecheck `src/` + `api/` (`tsc -b`) and build |
| `cd web && npm run lint` | oxlint |
| `cd web && node --test api/_lib/guard.test.ts` | Guardrail unit tests |
| `cd web && node --test api/_lib/decision.test.ts` | Reference mix, tilt bound, confidence gate |
| `cd web && npx tsx --test api/_lib/evaluation.test.ts` | Replay engine: regime rule, split rule, mix rule |
| `cd web && npx tsx --test api/_lib/llm.test.ts` | LLM failure classification |
| `cd web && npx tsx scripts/evaluate-agents.ts` | Agent vs fixed rule over real prices (+ live-model spot check with an OpenRouter key; `--no-llm` to skip) |
| `./push.sh "message"` | Commit one file per commit and push |

## Gotchas

- **Token decimals** — tUSDT is 6 decimals (`TOKEN_DECIMALS` in `web/src/lib/token.ts`, `MockUSDT.sol`). Keep them in sync.
- **Vault order** — `YieldTarget` in `Save.sol` (Conservative=0, Balanced=1, Growth=2) must match `YIELD_TARGETS` in `web/src/lib/types.ts` and `TARGETS` in `web/api/_lib/guard.ts`.
- **Contract errors** — adding a Solidity `error` means updating `ERROR_CODES` in `lib/coinai.evm.ts`, `lib/errors.ts`, and `lib/i18n.tsx` (en, id, zh).
- **i18n** — every user-facing string goes into all three locale blocks in `lib/i18n.tsx`. Landing copy lives under `lp.*`.
- **Chain** — write paths call `getEthersSigner()`, which asks the wallet to switch to (or add) chain 97 first.
- **Activity history** — public BSC RPCs cap `eth_getLogs`, so `lib/activity.ts` reads newest-first in 5,000-block chunks, at most 10 chunks, starting from `VITE_DEPLOY_BLOCK`. Older history needs an indexer.
- **`api/` imports** use `.js` extensions (NodeNext); the guard test imports `./guard.ts` directly and runs under Node's type stripping.
- **Vercel Hobby** — cron runs at most once a day; use "Run agent now" in demos.
- **HMR** — editing `lib/app-state.tsx` during `vite dev` can blank the page ("useAppState must be used within AppStateProvider"); reload.

## Manual test flow

1. Connect a wallet on BSC Testnet → `/app/faucet`: get tBNB (link) and mint tUSDT.
2. From another wallet, pay your link (`/app/link` → `/pay/:address`).
3. Dashboard shows the split; `/app/yield` shows idle savings and the three vaults.
4. Move some savings into a vault; confirm shares in your wallet / BscScan.
5. `/app/agent`: enable the agent (split range + duration) → **Run agent now**.
6. Check the steps, the report, and the decision log (reason + BscScan link).
7. Connect Telegram and/or email → send `/report` to the bot.
