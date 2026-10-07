# coinAI demo

Everything below was recorded on the live app, [coinai-gamma.vercel.app](https://coinai-gamma.vercel.app), on BNB Smart Chain Testnet. The wallet signs real transactions, and every balance, group, badge and BscScan page comes from the chain. None of it is mock data.

Press play on any video to watch it; each table says what happens when, so you can skip to the part you need.

- [Landing page](#landing-page) · 0:46
- [1. Get test funds, deposit, get paid](#1-get-test-funds-deposit-get-paid) · 1:59
- [2. Give the AI agents permission](#2-give-the-ai-agents-permission) · 1:13
- [3. Market, your own pool, and the agents' work on-chain](#3-market-your-own-pool-and-the-agents-work-on-chain) · 1:40
- [4. Savings goals](#4-savings-goals) · 0:38
- [5. Badges, invoices and paying someone](#5-badges-invoices-and-paying-someone) · 0:52
- [6. Start a group fund](#6-start-a-group-fund) · 1:35

## Landing page

https://github.com/user-attachments/assets/0fc24242-bafc-41af-b3cd-8930abfe07ad

*0:46 · [download MP4](assets/demo-landing.mp4)*. A scroll through the landing page, ending in the app.

| Time | What you see |
|---|---|
| 0:00 | **Hero.** "coinAI makes money grow": each payment splits itself into a spendable part and a savings part, and an AI team puts the savings to work inside limits you sign. |
| 0:03 | **We save it / they grow it.** The auto-split happens the moment a payment lands, then the agents invest idle savings into vaults. |
| 0:06 | **The council.** "Twelve at the table, one job: your money." A looping film of the twelve agents, each with a Greek name. |
| 0:09 | **Zeus → Apollo → Demeter.** You scroll through the agents one at a time. Each card says what the agent does, what it runs on (an LLM or plain code), when it runs, and the contract call it may make. |
| 0:15 | **Perseus (risk check) and Heracles (executor).** Every proposal is checked against your on-chain limits before gas is spent, and only approved moves are sent from the agent wallet. |
| 0:27 | **Plutus and Poseidon.** Plutus curates the AI Smart Money basket (tUSDT, BNB, BTC, ETH, CAKE) with Chainlink prices and caps enforced by the contract. Poseidon keeps the group-fund rules. |
| 0:33 | **We save together.** Group funds: patungan (all or nothing), iuran (fixed dues per period) and donasi (open fundraiser), each rule enforced by `GroupFunds`. |
| 0:36 | **Live on chain.** The group cards ("Bantu banjir Bekasi", "Trip ke Bali", "Kas RT 05") are read live from the `GroupFunds` contract. |
| 0:39 | **No custody, only guardrails.** The agent can change your split and move savings between your own positions. It has no function that sends funds anywhere else, and every decision is on the record. |
| 0:44 | **Open the app.** The dashboard shell: Money, Invest, AI team, Together, More. Connect a wallet to start. |

## 1. Get test funds, deposit, get paid

https://github.com/user-attachments/assets/1ea24e8c-1347-4f4b-ba51-d9bba8620ec9

*1:59 · [download MP4](assets/steps/1-setup.mp4)*

| Time | What happens |
|---|---|
| 0:00 | Connect a wallet. The app switches it to BNB Smart Chain Testnet, and **Get test funds** shows the wallet's tBNB (gas) and tUSDT. |
| 0:09 | Mint 1,000 tUSDT from the faucet (one transaction). |
| 0:18 | **Deposit into coinAI** from the wallet: the deposit is split on arrival like any payment. |
| 0:27 | The **Dashboard**: the "Get set up in three steps" checklist, total balance, spendable vs savings. |
| 0:36 | After depositing 100 tUSDT: **80 tUSDT spendable, 20 tUSDT saved** (the 20% split), plus the three savings vaults (3%, 6%, 12% APY). **Activity** lists the faucet claim and the deposit. |
| 0:44 | **Payment link**: a QR code and a `/pay/<address>` link anyone can pay through. Every payment that comes in is split the same way. |
| 0:53 | A first look at **Goals & rewards** (savings goals, badges, invite friends). |
| 1:02 | Open the group **Kas RT 05** (iuran: 2 tUSDT every 30 days) and join it. |
| 1:20 | **Pay dues from the coinAI spendable balance** (no wallet transfer needed), with a message. The wallet confirms, the group goes from 2 to 4 tUSDT, and the payment appears in the group's activity and members list. |
| 1:50 | The group's share card. |

## 2. Give the AI agents permission

https://github.com/user-attachments/assets/0019b2f5-65e7-41c1-8abb-f7326a89fd3b

*1:13 · [download MP4](assets/steps/2-agent.mp4)*

| Time | What happens |
|---|---|
| 0:00 | **AI Portfolio**: total savings, what is invested, the AI Smart Money basket (tUSDT, BNB, BTC, ETH, CAKE) and why the agents chose this mix. |
| 0:05 | **AI Agent → Agent permission**: the agent is off until you sign limits. Choose what it may do: **Demeter** (tune my split), **Athena** (invest & rebalance), **Hermes** (pay my dues). |
| 0:15 | **Hire Hermes** for 30 days (1 tUSDT, paid on-chain through `AgentRegistry`). The wallet confirms. |
| 0:29 | Set the limits: savings split **10%–40%**, a dues budget of 10 tUSDT per 30 days, and how long the permission lasts (30 days). Then **Enable agent**: one transaction to `CoinAIV2.setAgent`. |
| 0:49 | Sign in to the agent backend with a signed message (no gas). |
| 0:54 | "Hermes hired" with a link to the transaction. Below: the agent team (Apollo, Demeter, Athena, Perseus, Hades, Heracles, Nyx), **Run the team**, the AI projection (what your savings could be in 3, 6 and 12 months) and the daily report on Telegram. |

## 3. Market, your own pool, and the agents' work on-chain

https://github.com/user-attachments/assets/8ebf2ee8-b4c3-4e06-b992-4f52021809b7

*1:40 · [download MP4](assets/steps/3-market.mp4)*

| Time | What happens |
|---|---|
| 0:00 | **Market**: live BNB, BTC, ETH and CAKE prices from Chainlink on BNB Chain, with 24h/7d changes and volatility. |
| 0:08 | **Build a pool**: presets (70 BNB · 20 BTC · 10 USDT, Balanced mix, Stocks + crypto, Cautious) or your own weights per asset. The simulation shows the return, volatility and worst drop over the last 365 days, and a range for 3, 6 and 12 months. Weights must add up to 100%. |
| 0:30 | **AI review**: the Portfolio Reviewer checks the pool against your investor profile and today's market. **Save** it and **Use it**: the Investment Strategist now follows this pool. |
| 0:38 | **Community pools**: pools other people shared this week. |
| 0:53 | **AI Portfolio → AI Smart Money basket**: Plutus's current weights with the reason, or **Set my own weights**. |
| 1:01 | **Does the agent team help?**: the replay of the agents against a fixed rule over a year of real prices, and Plutus vs static basket weights. |
| 1:16 | **BscScan**: the basket contract's transactions (`Set Weights` calls from the agent wallet), so every move can be checked on-chain. |
| 1:31 | **Investor profile** (risk appetite, horizon, goal) and **Athena**'s page: what she reads, her limits, why she chose this mix. |

## 4. Savings goals

https://github.com/user-attachments/assets/286e10a8-a982-4c23-b051-db35467cc534

*0:38 · [download MP4](assets/steps/4-goals.mp4)*

| Time | What happens |
|---|---|
| 0:00 | **Goals & rewards → Savings goals**: create "Buy Macbook" with a 1,000 tUSDT target, a deadline (31 Dec 2026) and the share of savings it holds (100%). |
| 0:22 | The goal shows its progress, the days left and how much it holds. Goals are pockets over your one on-chain savings balance. |
| 0:30 | **Share** the goal card through the system share menu. |

## 5. Badges, invoices and paying someone

https://github.com/user-attachments/assets/c8e0d8d4-be05-4dc4-8d14-f8029ba0a11d

*0:52 · [download MP4](assets/steps/5-badges-paylink.mp4)*

| Time | What happens |
|---|---|
| 0:00 | **Badges**: claim **First payment**, a soulbound token from `CoinAIBadges`. The contract checks you earned it, and the wallet confirms. |
| 0:21 | "Badge minted to your wallet" with a link to the transaction. The badge now shows as earned. |
| 0:28 | Back on the **Dashboard** (80 spendable, 20 saved) and the activity feed, including the agent's daily report. |
| 0:31 | **Payment link** with an **invoice**: a fixed amount in IDR or tUSDT, a memo and a reference. It shows as paid only once the payment is confirmed on-chain. |
| 0:42 | The payer's view (`/pay/<address>`): enter an amount (quick amounts 25, 50, 100). The page tells the payer that 20% of the payment goes straight to the receiver's savings. |

## 6. Start a group fund

https://github.com/user-attachments/assets/b5c64e2e-5ce2-459c-8b19-094dabd9b6d3

*1:35 · [download MP4](assets/steps/6-groups.mp4)*

| Time | What happens |
|---|---|
| 0:00 | **Groups**: every group on the `GroupFunds` contract (Bantu banjir Bekasi, Trip ke Bali, Kas RT 05), filterable by kind. |
| 0:06 | **New group**, step 1: choose the kind. **Chip-in** (all or nothing), **Dues** (a fixed amount each period) or **Fundraiser** (open to anyone). Each kind's rules are enforced by the contract. |
| 0:19 | Step 2: name it ("Study group"), dues per member (1 tUSDT), how often (every month) and where payouts go. A live preview of the card updates as you type. |
| 0:38 | Step 3: review. The rules cannot change once the group is created. **Create**: one transaction from your wallet. |
| 0:57 | "Your group is live": the share card, its link and QR. The organizer's panel shows what is available to pay out. Members join and pay themselves, and everyone can see who has paid. |
| 1:23 | **Settings**: language (English, Indonesian, Chinese), display currency, theme, your own OpenRouter keys for the AI, and the network/contract details. |

> The share card in steps 1 and 6 was recorded before the **Link** tab was added. Sharing a group now sends its link, which chat apps unfold into the group's live card.

[← Back to the README](../README.md)
