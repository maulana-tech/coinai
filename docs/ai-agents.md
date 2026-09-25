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

If the user hasn't enabled the agent (or it expired), the run is **report-only**: no proposals, just the report and reminders.

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
| **Email** | **Gmail SMTP via `nodemailer`**, authenticated with a Gmail App Password; sent from `GMAIL_USER` | `GMAIL_USER`, `GMAIL_APP_PASSWORD` (Google account needs 2-Step Verification) |

Gmail's personal sending limit (~500/day) is plenty for the demo. For production volume, swap `sendEmail()` in `web/api/_lib/notify.ts` for a transactional provider (Resend, Postmark, SES) — it's one function.

## Chat on Telegram

Once a chat is linked to a wallet, the bot is a full second front end for the same advisor (`web/api/_lib/advisor.ts`, shared with `/api/agent/chat`):

| Message | What happens |
|---|---|
| any text | Chat Advisor with tools (`get_state`, `get_market`, `get_recent_runs`, `run_agent_team`); last 12 turns kept per chat for 7 days |
| `/market` | Live Chainlink prices + Market Analyst read (works before linking) |
| `/run` | Runs the agent team now and replies with the report + BscScan links |
| `/report` | Report only, no transactions |
| `/reset` | Clears the chat memory |
| `/stop` | Unlinks the chat and stops daily reports |

The bot shows "typing…" while the agents work, ignores Telegram's retries of the same `update_id`, shares the 30 messages / 10 min limit with the web chat, and always answers 200 so updates don't pile up.

## Auth

Chat, run and subscribe calls need a session: the app asks the wallet to `personal_sign` a login message, `POST /api/auth` verifies it and returns a 24h HMAC token (`SESSION_SECRET`). Opening the Agent page never pops a signature by itself; it's only requested when the user runs, chats, or manages notifications.

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
