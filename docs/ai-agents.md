# AI agents

coinAI's agent team manages a user's savings **inside limits the user signs on-chain**. The LLMs decide; the smart contract decides what is allowed.

## The team

| Role | Kind | Job | Can it move funds? |
|---|---|---|---|
| **Market Analyst** | LLM | Reads BNB, BTC, ETH and CAKE (spot price from **Chainlink feeds on BNB Smart Chain**, 30-day trend and volatility from Binance daily candles) and calls the regime: `risk_on`, `neutral` or `risk_off`. Cached 30 min and shared by all users | No — read-only |
| **Savings Strategist** | LLM | Proposes a new savings split from payment frequency, size, days since last payment, spendable buffer, the user's goal and the team's recent runs, with a confidence | No — proposes only |
| **Investment Strategist** | LLM | Splits idle savings across Conservative / Balanced / Growth, starting from a reference mix (saved pool or investor profile) and tilting at most 15 points per vault, mostly with the market regime, with a confidence. Every payment gets invested the same way (automatic DCA) | No — proposes only |
| **Confidence gate + Guardrails** (`decision.ts`, `guard.ts`) | Code | Skips proposals under 50% confidence (or without one); bounds the mix around the reference; then rejects anything outside the user's policy, over the idle savings still uncommitted in this run, locked, or without a reason | No |
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

## How a decision is made and explained

`web/api/_lib/decision.ts` is the deterministic half of every investment decision:

1. **Reference mix.** The active saved pool's vault mix, or, without one, the investor profile: conservative 70/25/5, moderate 25/50/25, aggressive 10/40/50 (Conservative/Balanced/Growth), with the horizon moving 10 points between Growth and Conservative (short → safer, long → more growth).
2. **Tilt bound.** The strategist may move each vault at most `MAX_TILT` = 15 points from the reference (measured on the share of the invested amount). Anything further is pulled back in code (`fitAllocation`), keeping the invested percentage; the run records `clamped`.
3. **Confidence gate.** Both strategists return `confidence` 0..1. Under `MIN_CONFIDENCE` = 0.5, or missing, the proposal is **skipped** (logged with what it would have done), never executed. Fails closed like the Risk Officer.
4. **Memory.** The last 5 agent runs (`runs:<address>`) are summarized for both strategists and the Risk Officer: regime, split change, invested mix, what executed and what was rejected or skipped. They must not reverse a recent move without new data, and the Risk Officer vetoes one that does.

Each run stores the result as `RunResult.decision` (reference, final mix, invested share, clamp, confidences, split from → to, previous run). The app shows it as **"Why the agents chose this mix"** on AI Portfolio and the Investment Strategist page: per vault the current position, the reference, the tilt and the final weight, the buffer, the savings split with its confidence, the rule and the previous run. Tests: `node --experimental-strip-types --test api/_lib/decision.test.ts`.

## Agent team vs a fixed rule

`web/scripts/evaluate-agents.ts` replays the last 365 days (`--days N`) of Binance daily closes for BNB, BTC and ETH and compares the agent team with a fixed rule (20% of every payment into Balanced) for three seeded income patterns: a monthly salary, freelance (≈4 jobs a month with a 15-day dry spell) and a daily gig. Each spends 26 tUSDT a day; a "short day" is a day the spendable balance can't cover that.

The agent side (`web/api/_lib/evaluation.ts`) is the strategists' prompt rules as code, so the replay is free and repeatable:

- **Split:** hold with fewer than 2 payments; save less (−10) on a thin buffer, a gap over 1.5× the person's usual rhythm, next to nothing left over from earlier payments (spendable minus the spendable part of an average payment < 10% of a payment), or a left-over that keeps shrinking run over run and is under a quarter of a payment; save more (+10) on steady income with a healthy buffer and a quarter of a payment left over that isn't shrinking. Bounded by the signed range (10–40% here).
- **Mix:** the profile's reference mix (moderate: 25/50/25), tilted by a rule-based regime read (BNB + BTC 30-day trend and volatility: risk_on +10 Growth / −10 Conservative, risk_off +15 Conservative / −15 Growth) and bounded by `fitAllocation`, the same code a live run uses.
- **Vault models:** `testnet` (the deployed vaults' fixed APY) and `market` (roadmap F6 preview: Balanced half-tracks BTC, Growth half-tracks BNB + ETH).

The replay found two flaws, fixed in both the rules and the Savings Strategist prompt: a "long gap" measured in absolute days (it lowered every monthly salary), and raising the split without checking whether anything was left over (43 short days for the salary pattern). Because "shrinking" needs the previous run's spendable balance, runs now record it (`RunResult.decision.spendable`) and the memory passes it to the strategists.

The **live-model spot check** then calls the real Savings and Investment Strategists (same prompts, a `describe()`-shaped view of the replay's state) at evenly spaced payments and records how often the split direction matches the rules, how far the invested mix is from the rules' mix, and how many proposals the confidence gate skipped. It needs `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (env or `web/.env`); `--no-llm` skips it, `--points N` sets the sample size.

Output: `web/src/lib/evaluation-results.ts`, shown as **"Agent team vs a fixed rule"** on AI Portfolio, plus a Markdown table on stdout for the README. Tests: `npx tsx --test api/_lib/evaluation.test.ts`.

## Pool simulator and Portfolio Reviewer (`/app/market`)

The user builds a hypothetical pool (e.g. 70% BNB, 20% BTC, 10% USDT) from crypto (BNB, BTC, ETH, CAKE, SOL, XRP, DOGE, LINK, AVAX), **tokenized US stocks and ETFs** (27 stocks such as Apple, Microsoft, NVIDIA, Tesla, plus SPY, QQQ and SMH: Binance's 24/7 `…BUSDT` tokens that track the share price; listings under ~2 months old and leveraged ETFs are left out), tokenized gold (PAXG) and stablecoin; list in `web/shared/pool.ts`. The browser backtests it on 90 days of Binance daily closes (daily rebalance: return, annualized volatility, worst drawdown) and shows an 80% range for 3/6/12 months from volatility alone (zero drift, not a forecast). `POST /api/pools?review` recomputes the stats server-side and asks the **Portfolio Reviewer** (LLM, `risk` model) to judge the pool against the investor profile and the Market Analyst's read: `fits` / `too_risky` / `too_cautious`, a short summary and a suggested mix the user can apply. Nothing is bought; investing in coin pools is a roadmap item (a crypto vault needs a CoinAI v2 deployment). Coin icons: Cryptofonts/cryptoicons (GPL-3.0, `web/public/coins/`); stock logos built from Simple Icons (CC0, `web/public/stocks/`).

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

**When the models fail.** Every failed LLM step records a `code` (`llmFailure` in `llm.ts`): `bad_key` (401), `no_credit` (402/403), `rate_limited` (429), `timeout`, `bad_output` (no readable JSON after the corrective retry) or `unavailable`. The app shows the cause in plain words on the step and, when it kept the run from doing anything, a banner that nothing changed and the savings are untouched (also as the toast on AI Portfolio). If the Reporter is down too, the report starts with a code-written line saying the same, so Telegram and email don't just list reminders. The server logs a warning at startup when the Risk Officer resolves to the strategists' model: set `OPENROUTER_MODEL_RISK` to a different, stable model so the review is independent. Tests: `npx tsx --test api/_lib/llm.test.ts`.

## When the team runs

| Trigger | Endpoint | Executes txs? |
|---|---|---|
| "Run agent now" in `/app/agent` | `POST /api/agent/run` (1×/min per user) | Yes |
| Chat: "I want to save more for December" | `POST /api/agent/chat` → `run_agent_team` | Yes |
| Daily cron, 08:00 WIB | `GET /api/cron/daily` | Yes, then sends the report |
| Telegram chat: any message | `POST /api/telegram` → same Chat Advisor as the web | Only via `run_agent_team` |
| Telegram `/run` | `POST /api/telegram` (1×/min) | Yes |
| Telegram `/report` | `POST /api/telegram` | No (report only) |

Payments also trigger **autopilot** (`POST /api/agent/autopilot`, `action: "nudge"`), including deposits from the user's own wallet (tUSDT, or tBNB through the DepositRouter).

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
- **Agent runs**: `runSwarm` sets `running:<address>` (5 min TTL) for the duration of a run; `GET /api/agent/run` returns it, and the Agent page shows "still running" and polls until the result appears. The last 20 runs stay in `runs:<address>`.
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
| `web/api/_lib/decision.ts` (+ `.test.ts`) | Reference mix, tilt bound, confidence gate |
| `web/src/components/decision-card.tsx` | "Why the agents chose this mix" table |
| `web/api/_lib/evaluation.ts` (+ `.test.ts`), `web/scripts/evaluate-agents.ts` | Agent vs fixed-rule replay and live-model spot check |
| `web/src/components/evaluation-card.tsx`, `web/src/lib/evaluation-results.ts` | Evaluation panel and its generated data |
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
