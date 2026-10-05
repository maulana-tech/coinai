# AI agents

coinAI's agent team manages a user's savings **inside limits the user signs on-chain**. The LLMs decide; the smart contract decides what is allowed.

## The team

| Role | Kind | Job | Can it move funds? |
|---|---|---|---|
| **Market Analyst** | LLM | Reads BNB, BTC, ETH and CAKE (spot price from **Chainlink feeds on BNB Smart Chain**, 30-day trend and volatility from Binance daily candles) and calls the regime: `risk_on`, `neutral` or `risk_off`. Cached 30 min and shared by all users | No — read-only |
| **Savings Strategist** | LLM | Proposes a new savings split from payment frequency, size, days since last payment, spendable buffer and the user's goal | No — proposes only |
| **Investment Strategist** | LLM | Splits idle savings across Conservative / Balanced / Growth, starting from the investor profile (risk, horizon, goal) and tilting with the market regime. Every payment gets invested the same way (automatic DCA) | No — proposes only |
| **Guardrails** (`guard.ts`) | Code | Rejects anything outside the user's policy, over the idle savings still uncommitted in this run, locked, or without a reason | No |
| **Risk Officer** | LLM | Reviews each surviving proposal against data, profile and market; can **veto, never modify**. Missing/invalid review = rejected | No |
| **Executor** | Code | Sends approved proposals from the agent wallet: `agentSetSplit`, then one `agentInvest` per vault | Only into the user's own vault positions |
| **Reporter** | LLM | Writes the update in the user's language: what came in, the market read, what each agent did and why, reminders | No |
| **Chat Advisor** | LLM + tools | Answers questions (`get_state`, `get_market`, `get_recent_runs`); for any change it calls `run_agent_team(instruction)` instead of acting itself | No |

```
Chainlink (BSC) + Binance ─ Market Analyst ─┐
readUserState + profile ─┬─ Savings Strategist ──────┐
                         └─ Investment Strategist ───┴─→ guard.ts ─→ Risk Officer ─→ executor ─→ Reporter
```

The orchestrator (`web/api/_lib/swarm.ts`) is plain TypeScript, so the sequence is fixed and every step is recorded (`steps[]` with `analyzed / proposed / skipped / rejected / approved / executed / failed`).

Each role has its own page in the app at `/app/agent/<role>` (`market`, `savings`, `investment`, `guardrails`, `risk`, `executor`, `reporter`) showing what it reads, its limits, a role-specific panel (live market board, investor profile + latest allocation, on-chain limits, approvals vs vetoes, transactions, latest report) and its recent decisions.

## Pool simulator and Portfolio Reviewer (`/app/market`)

The user builds a hypothetical pool (e.g. 70% BNB, 20% BTC, 10% USDT) from crypto (BNB, BTC, ETH, CAKE, SOL, XRP, DOGE, LINK, AVAX), **tokenized US stocks and ETFs** (27 stocks such as Apple, Microsoft, NVIDIA, Tesla, plus SPY, QQQ and SMH: Binance's 24/7 `…BUSDT` tokens that track the share price; listings under ~2 months old and leveraged ETFs are left out), tokenized gold (PAXG) and stablecoin; list in `web/shared/pool.ts`. The browser backtests it on 90 days of Binance daily closes (daily rebalance: return, annualized volatility, worst drawdown) and shows an 80% range for 3/6/12 months from volatility alone (zero drift, not a forecast). `POST /api/pool` recomputes the stats server-side and asks the **Portfolio Reviewer** (LLM, `risk` model) to judge the pool against the investor profile and the Market Analyst's read: `fits` / `too_risky` / `too_cautious`, a short summary and a suggested mix the user can apply. Nothing is bought; investing in coin pools is a roadmap item (a crypto vault needs a CoinAI v2 deployment). Coin icons: Cryptofonts/cryptoicons (GPL-3.0, `web/public/coins/`); stock logos built from Simple Icons (CC0, `web/public/stocks/`).

## Saved pools as the AI's strategy

On the Market page the user can save pools by name (up to 10, `POST/PUT/DELETE /api/pools`, KV `pools:<wallet>`) and make one the **AI benchmark**. Because the contract only invests into the three vaults, the pool steers the Investment Strategist through its risk mix (`vaultMix` in `web/shared/pool.ts`):

| Pool assets | Vault |
|---|---|
| Stablecoin, gold (PAXG) | Conservative |
| BTC, ETH, BNB, index ETFs (SPY, QQQ) | Balanced |
| Other coins, single stocks, sector ETFs | Growth |

The strategist aims for that mix and may deviate by at most 15 points per vault (risk-off market or a clear profile mismatch), citing the strategy by name; the Risk Officer treats a strategy-consistent allocation as the user's explicit choice. Each run records the strategy it used (`RunResult.strategy`), shown on AI Portfolio. Verified on testnet: "Pool 1 Agresif" (10/40/50) → allocation 15/45/40 for a moderate profile, 3 vault deposits executed.

## Market data

| Data | Source | Where |
|---|---|---|
| Spot price | Chainlink price feed proxies on BSC Testnet — BNB `0x2514…7526`, BTC `0x5741…515C`, ETH `0x143d…8BA7`, CAKE `0x81fa…224C` (8 decimals) | `web/shared/market.ts` |
| 24h / 7d / 30d change, 30-day annualized volatility | Binance daily candles via `data-api.binance.vision` (public market-data mirror, not geo-blocked for US-hosted functions) | same |

The same module powers the market board in the browser (works without the backend) and the Market Analyst on the server. `GET /api/market` returns the snapshot plus the analyst's cached read. If the oracle read fails, the latest Binance close is used and labelled as such.

## Investor profile

Stored per user in Redis (`profile:<address>`), edited on `/app/agent/investment`, served by `GET/POST /api/agent/profile`:

| Field | Values |
|---|---|
| `risk` | `conservative` · `moderate` (default) · `aggressive` |
| `horizon` | `short` (< 6 months) · `medium` (6–24 months, default) · `long` (2+ years) |
| `goal` | free text, ≤ 140 chars (e.g. "trip to Bali in December") |

## Three layers of safety

1. **Contract** (`evm/src/Save.sol`) — `agentSetSplit` requires `minSplitBps ≤ bps ≤ maxSplitBps` and `now < expiry`; `agentInvest` can only deposit the user's idle savings into one of three immutable vaults with `receiver = user`. There is no function that transfers to the agent or anyone else. `revokeAgent()` cuts access in one tx.
2. **Guardrails** (`web/api/_lib/guard.ts`) — the same rules in code, so bad proposals never cost gas. Multiple investments in one run are checked against the savings still uncommitted, and an allocation over 100% is scaled down before it reaches the guard. Covered by `node --test api/_lib/guard.test.ts`.
3. **Risk Officer** — an independent LLM review that fails closed.

Worst case with a jailbroken or confused model: the split moves within the user's range, or idle savings move into the user's own vault position. Both are visible and reversible by the user.

## LLMs (OpenRouter)

`web/api/_lib/llm.ts` calls OpenRouter's OpenAI-compatible endpoint with plain `fetch`.

| Env | Used by |
|---|---|
| `OPENROUTER_MODEL` | default for every role |
| `OPENROUTER_MODEL_STRATEGIST` | market analyst + both strategists |
| `OPENROUTER_MODEL_RISK` | risk officer |
| `OPENROUTER_MODEL_REPORTER` | reporter (a cheaper model is fine) |
| `OPENROUTER_MODEL_CHAT` | chat advisor — **must support tool calling** |

Structured roles ask for `response_format: json_object` and the parser tolerates JSON wrapped in prose or code fences.

## When the team runs

| Trigger | Endpoint | Executes txs? |
|---|---|---|
| "Run agent now" in `/app/agent` | `POST /api/agent/run` (1×/min per user) | Yes |
| Chat: "I want to save more for December" | `POST /api/agent/chat` → `run_agent_team` | Yes |
| Daily cron, 08:00 WIB | `GET /api/cron/daily` | Yes, then sends the report |
| Telegram chat: any message | `POST /api/telegram` → same Chat Advisor as the web | Only via `run_agent_team` |
| Telegram `/run` | `POST /api/telegram` (1×/min) | Yes |
| Telegram `/report` | `POST /api/telegram` | No (report only) |

Payments also trigger **autopilot** (`POST /api/agent/nudge`), including deposits from the user's own wallet (tUSDT, or tBNB through the DepositRouter).

If the user hasn't enabled the agent (or it expired), the run is **report-only**: no proposals, just the report and reminders.

On testnet every run (and the daily cron) first calls the **yield simulator**, so vault positions grow with their APY (sped up 30×) and the agents' allocation shows real earnings. See `docs/architecture.md`.

## Reports and reminders

Reminders are computed in code (not by the LLM) and passed to the Reporter:
- agent permission expires within 3 days / agent not enabled
- savings lock ends within 3 days
- no payment received for 7+ days
- idle savings ≥ 10 tUSDT not earning yield

The daily cron compares against yesterday's snapshot (`snap:<user>` in Redis) to report new payments and amounts received.

### Delivery channels

| Channel | How | Setup |
|---|---|---|
| **Telegram** | Bot API `sendMessage`. User links via a one-time deep link `t.me/<bot>?start=<code>` (1h TTL) generated after wallet login | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, then `web/scripts/setup-telegram.sh` |
| **Email** | **Gmail SMTP via `nodemailer`** (App Password, sent from `GMAIL_USER`). A statement-style HTML email (`api/_lib/email.ts`: summary, vault holdings, market read with Chainlink prices, agent actions with BscScan links, reporter's note, reminders) plus a one-page **PDF statement** attachment (`api/_lib/report-pdf.ts`, `pdf-lib`, en/id — the standard PDF fonts can't draw Chinese, so `zh` gets the HTML only). All LLM text is HTML-escaped | `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google account needs 2-Step Verification) |

Gmail's personal sending limit (~500/day) is plenty for the demo. For production volume, swap `sendEmail()` in `web/api/_lib/notify.ts` for a transactional provider (Resend, Postmark, SES) — it's one function.

## Persistence

- **Chat**: one conversation per wallet in Redis (`chat:<address>`, last 40 turns, 7 days), shared by the web chat (`/app/chat`) and Telegram. The user's message is stored before the model answers and a `chat:pending:<address>` flag is set, so closing the page mid-answer loses nothing: on return the page shows "thinking" and polls until the reply lands.
- **Agent runs**: `runSwarm` sets `running:<address>` (5 min TTL) for the duration of a run; `/api/agent/history` returns it, and the Agent page shows "still running" and polls until the result appears. The last 20 runs stay in `runs:<address>`.
- **Decisions**: `AgentAction` events on-chain, read by the decision log.

## Chat on Telegram

Once a chat is linked to a wallet, the bot is a full second front end for the same advisor (`web/api/_lib/advisor.ts`, shared with `/api/agent/chat`):

| Message | What happens |
|---|---|
| any text | Chat Advisor with tools (`get_state` incl. saved pools and the active strategy, `get_market`, `get_assets` for 90-day stats of any pool asset incl. tokenized stocks and gold, `get_recent_runs`, `set_strategy`, `run_agent_team`); same conversation as the web chat |
| `/portfolio` | Total savings, idle/spendable, position per vault, active strategy and its vault mix |
| `/pools` | Saved pools with their vault mix; ✓ marks the AI benchmark |
| `/use <name>` / `/use off` | Make a saved pool the AI benchmark (partial names match) or clear it |
| `/deposit` | How to deposit tUSDT or tBNB, with a link to the app (the bot can't sign transactions) |
| `/market` | Live Chainlink prices + Market Analyst read (works before linking) |
| `/run` | Runs the agent team now and replies with the report + BscScan links |
| `/report` | Report only, no transactions |
| `/reset` | Clears the conversation (web + Telegram) |
| `/stop` | Unlinks the chat and stops daily reports |

Linking is one wallet ↔ one chat: re-linking a wallet from another chat unlinks (and notifies) the old chat, and a chat that switches wallets stops receiving the old wallet's reports. Command replies and `/help` are in Indonesian for wallets set to Indonesian. Replies are plain text (markdown the model adds is stripped). Re-run `scripts/setup-telegram.sh` once to register the new commands in Telegram's menu.

The bot shows "typing…" while the agents work, ignores Telegram's retries of the same `update_id`, shares the 30 messages / 10 min limit with the web chat, and always answers 200 so updates don't pile up.

## Auth

Chat, run and subscribe calls need a session: the app asks the wallet to `personal_sign` a login message, `POST /api/auth` verifies it and returns a 7-day HMAC token (`SESSION_SECRET`). Opening the Agent page never pops a signature by itself; it's only requested when the user runs, chats, or manages notifications.

## Files

| File | Purpose |
|---|---|
| `web/shared/market.ts` (+ `.test.ts`) | Chainlink + Binance market snapshot, shared by app and backend |
| `web/api/_lib/swarm.ts` | Team roles, prompts, profile, market analysis, orchestration, reminders, reporter |
| `web/api/market.ts`, `web/api/agent/profile.ts` | Public market endpoint; investor profile |
| `web/api/_lib/guard.ts` (+ `.test.ts`) | Deterministic proposal checks |
| `web/api/_lib/chain.ts` | Read user state, execute from the agent wallet |
| `web/api/_lib/llm.ts` | OpenRouter client |
| `web/api/_lib/kv.ts` | Upstash Redis REST client |
| `web/api/_lib/advisor.ts` | Chat Advisor shared by the web chat and Telegram |
| `web/api/telegram.ts`, `web/scripts/setup-telegram.sh` | Telegram bot webhook; one-time webhook + command menu setup |
| `web/api/_lib/notify.ts` | Telegram + Gmail delivery |
| `web/api/_lib/http.ts` | JSON helpers, wallet login, session tokens |
| `web/src/pages/agent.tsx` | Agent page: permission, team, run, chat, notifications, decision log |
| `web/src/pages/agent-role.tsx`, `web/src/lib/agent-roles.ts` | One page per agent role |
| `web/src/components/market-board.tsx`, `web/src/lib/use-market.ts` | Market board + analyst card |
| `web/src/lib/agent-api.ts` | Frontend client for the endpoints above |
