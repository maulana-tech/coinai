# Deployment

coinAI runs on **BNB Smart Chain Testnet** (chain ID 97). A deploy has three parts:

1. **Smart contracts** (`evm/`): tUSDT, 3 yield vaults, and CoinAI
2. **Web and agent backend** (`web/`): the Vite SPA plus Vercel Functions in `web/api/`
3. **External services**: OpenRouter, Upstash Redis, Telegram bot, and Gmail

> **Status:** contracts are live on BSC Testnet (block 133234240, addresses in [`deployments.json`](../deployments.json)). The app defaults to them via `web/shared/deployment.ts`; env vars override.

---

## Network

| Parameter | Value |
|---|---|
| Chain | BNB Smart Chain Testnet |
| Chain ID | 97 |
| RPC | `https://bsc-testnet-rpc.publicnode.com` (supports `eth_getLogs` up to 50k blocks, CORS). The official `data-seed-prebsc-*` RPCs reject `eth_getLogs`, so the app doesn't use them for reads |
| Explorer | `https://testnet.bscscan.com` |
| Faucet (tBNB) | `https://faucet.zalalena.com/bsc` — address + captcha, no mainnet balance or account (used by the app). Alternatives: [QuickNode](https://faucet.quicknode.com/binance-smart-chain/bnb-testnet) (no balance, every 12h), [Bitbond](https://tokentool.bitbond.com/faucet/bsc-testnet) (wallet + profile), or the [official faucet](https://www.bnbchain.org/en/testnet-faucet) (needs 0.002 BNB on mainnet) |
| Native token | tBNB (18 decimals) |
| App token | tUSDT (`MockUSDT`, **6 decimals**, `faucet()` gives 1,000 per day) |

## Wallets

Prepare **two separate wallets**:

| Wallet | Used for | Needs |
|---|---|---|
| **Deployer** | Deploying contracts (one time) | ±0.05 tBNB |
| **Agent** | Sending `agentSetSplit` / `agentInvest` transactions from the backend | tBNB for gas only, never holds user funds |

Users authorize the **agent wallet's address** through `setAgent(...)` in the app. The agent can only change the split within the user's bounds and move savings into the 3 vaults. The vault shares always go to the user.

---

## 1. Smart contracts

### Prerequisites

```bash
cd evm
# forge-std (this repo isn't git, so no submodule)
~/.foundry/bin/forge install foundry-rs/forge-std --no-git   # skip if lib/forge-std already has files
cp .env.example .env    # fill in DEPLOYER_PRIVATE_KEY
~/.foundry/bin/forge test   # must be green before deploying
```

`evm/.env`:
```env
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
DEPLOYER_PRIVATE_KEY=0x...
```

### Deploy (one command, 5 contracts)

```bash
cd evm
source .env
~/.foundry/bin/forge script script/DeployAll.s.sol \
  --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

The output prints the addresses:
```
MockUSDT:           0x...
Vault Conservative: 0x...   (APY 3%,  low risk)
Vault Balanced:     0x...   (APY 6%,  medium risk)
Vault Growth:       0x...   (APY 12%, high risk)
CoinAI:             0x...
```

> The vault APYs are **display metadata** only (testnet has no real yield). On mainnet these vaults are replaced by real protocols (Venus, Lista, PancakeSwap).

### Verify on BscScan (optional, good for judges)

```bash
~/.foundry/bin/forge verify-contract <COINAI_ADDRESS> src/Save.sol:CoinAI \
  --chain 97 --etherscan-api-key <BSCSCAN_KEY> \
  --constructor-args $(cast abi-encode "constructor(address,address[3])" <USDT> "[<V1>,<V2>,<V3>]")
```

### After deploying

Write the addresses into `deployments.json` (the source of truth), then fill in the env vars in section 3.

---

## 2. External services

### OpenRouter (LLM)
1. Create a key at https://openrouter.ai/keys and top up credit.
2. Pick a model that **supports tool calling** (needed for Chat Advisor) and put its slug in `OPENROUTER_MODEL`.
3. Optional: use a different model per role, e.g. a cheaper model for the reporter:
   `OPENROUTER_MODEL_STRATEGIST`, `OPENROUTER_MODEL_RISK`, `OPENROUTER_MODEL_REPORTER`, `OPENROUTER_MODEL_CHAT`.

### Upstash Redis (storage for subscriptions, run history, rate limits)
- In the Vercel dashboard → project → **Storage / Marketplace → Upstash for Redis** → connect to the project. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are filled in automatically.
- Or create a database at upstash.com and fill in `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

### Telegram bot
1. Chat with **@BotFather** → `/newbot` → save the **token** and **username** (without `@`).
2. Generate a webhook secret: `openssl rand -hex 32`.
3. **After the web is deployed** (section 4), register the webhook and the command menu:
   ```bash
   cd web
   APP_URL=https://<your-app>.vercel.app ./scripts/setup-telegram.sh   # reads the token/secret from web/.env
   ```
   The script sets the webhook (`/api/telegram`, with the secret), the `/market /run /report /reset /stop /help` menu and the bot description, then prints `getWebhookInfo`.
4. Users link their wallet from the app (AI Agent → Daily report & reminders → Connect Telegram). After that they can chat with coinAI in Telegram exactly like on the website.

### Gmail (daily email reports)
1. The Google account must have **2-Step Verification** turned on.
2. Google Account → Security → **App passwords** → create one for "coinAI".
3. Fill in `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (16 characters, no spaces).

> Gmail limits sending to ±500 emails per day. That's plenty for the demo.

---

## 3. Environment variables (`web/`)

Everything is set in **Vercel → Project → Settings → Environment Variables**. For local development, copy `web/.env.example` to `web/.env`.

### Frontend (`VITE_*`, shipped to the browser)

```env
VITE_COINAI_ADDRESS=0x...          # CoinAI on BSC Testnet (empty = in-memory mock mode)
VITE_TOKEN_ADDRESS=0x...           # MockUSDT (tUSDT)
VITE_AGENT_ADDRESS=0x...           # public address of the agent wallet (AGENT_PRIVATE_KEY)
VITE_DEPLOY_BLOCK=12345678         # CoinAI deploy block; activity history is read from here
```

Vault addresses are read from `CoinAI.vaultOf()`, so they aren't configured.

> Never put secrets in a `VITE_*` variable. Everything with that prefix is readable in the browser.

### Agent backend (server-side only)

| Variable | Contents |
|---|---|
| `COINAI_ADDRESS` | CoinAI address (falls back to `VITE_COINAI_ADDRESS`) |
| `BSC_RPC_URL` | Defaults to `https://bsc-testnet-rpc.publicnode.com` |
| `AGENT_PRIVATE_KEY` | **Agent** wallet private key (not the deployer) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | See section 2 |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Set automatically by Upstash |
| `SESSION_SECRET` | `openssl rand -base64 32`. Signs login tokens |
| `CRON_SECRET` | `openssl rand -base64 32`. Vercel sends it automatically to the cron |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET` | See section 2 |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | See section 2 |
| `APP_URL` | Public URL, e.g. `https://coinai.vercel.app` (used for links in reports) |

---

## 4. Deploy the web + backend to Vercel

Project settings:

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework | Vite |
| Build Command | `npm run build` (typechecks `src/` and `api/`, then `vite build`) |
| Output Directory | `dist` |

`web/vercel.json` already sets up:
- `api/**/*.ts` as Vercel Functions (`maxDuration: 300s` (free LLMs can need retries; Hobby with Fluid compute allows up to 300s))
- a **daily cron** at `0 1 * * *` UTC (**08:00 WIB**) → `/api/cron/daily`
- SPA rewrites for every path except `/api/*`

> On the Vercel **Hobby** plan, crons can run at most once a day. That's enough for the daily report. During the demo, use the "Run agent now" button (`POST /api/agent/run`).

After the deploy succeeds:
1. Register the Telegram webhook (section 2).
2. Top up the agent wallet with tBNB.

### Local development

```bash
cd web
npm install
npx vercel dev      # serves the SPA + /api (npm run dev only serves the SPA)
node --test api/_lib/guard.test.ts   # guardrail test
```

---

## 5. Smoke test after deploying

```bash
APP=https://<your-app>.vercel.app

# Cron endpoint rejects requests without the secret (should return 403)
curl -i $APP/api/cron/daily

# Trigger the cron manually (should return JSON { users, results })
curl -H "Authorization: Bearer $CRON_SECRET" $APP/api/cron/daily
```

End-to-end flow in the app:
1. Connect wallet → Faucet: claim tBNB (link) and mint tUSDT.
2. Pay yourself or another account through the payment link.
3. Agent page → enable the agent (split range + duration) → **Run agent now**.
4. Check the decision log: every action has a reason and a BscScan link (`AgentAction` event).
5. Notifications → connect Telegram (press **Start** in the bot) and/or Gmail → in Telegram, ask "how are my savings?", then try `/market` and `/report`.

## API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth` | wallet signature | `{address, issuedAt, signature}` → `{token}` |
| POST | `/api/agent/run` | Bearer | Run the agent team now (1×/minute) |
| POST | `/api/agent/chat` | Bearer | Chat Advisor (30 messages / 10 minutes) |
| GET | `/api/agent/history` | Bearer | The last 20 runs |
| GET/POST/DELETE | `/api/subscribe` | Bearer | Manage Telegram / Gmail notifications |
| POST | `/api/telegram` | webhook secret | Telegram bot: chat + `/market /run /report /reset /stop` |
| GET | `/api/market` | — | Market snapshot (Chainlink + Binance) + Market Analyst read |
| GET/POST | `/api/agent/profile` | Bearer | Investor profile |
| GET | `/api/cron/daily` | `CRON_SECRET` | Daily report + reminders |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `missing env X` | Env var not set in Vercel. Redeploy after adding it |
| Agent `failed` / `NotAgent` | User hasn't run `setAgent`, it expired, or `AGENT_PRIVATE_KEY` doesn't match the authorized address |
| `insufficient funds` in the executor | Agent wallet is out of tBNB |
| `openrouter 4xx` | Wrong key, credit ran out, or the model slug doesn't exist |
| Chat never calls a tool | The chosen model doesn't support tool calling. Switch `OPENROUTER_MODEL_CHAT` |
| Telegram silent | Webhook not registered, or `TELEGRAM_WEBHOOK_SECRET` differs from the `secret_token` |
| Gmail `Invalid login` | Use an App Password, not the normal password. 2FA must be on |
