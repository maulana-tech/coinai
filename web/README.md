# web

The coinAI app (`src/`, React SPA) and its AI agent backend (`api/`, Vercel Functions), deployed together to Vercel.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · wagmi + ethers v6 · shadcn-style UI · motion · Vercel Functions · OpenRouter · Upstash Redis · nodemailer (Gmail SMTP)

## Commands

```bash
npm install
npm run dev        # SPA only (http://localhost:5173)
npx vercel dev     # SPA + /api
npm run build      # tsc -b (src + api) then vite build
npm run lint       # oxlint
node --test api/_lib/guard.test.ts
```

## Environment

Copy `.env.example` to `.env`. It has two blocks:

- `VITE_*` — public, shipped to the browser: `VITE_COINAI_ADDRESS` (empty = mock mode), `VITE_TOKEN_ADDRESS`, `VITE_AGENT_ADDRESS`, `VITE_DEPLOY_BLOCK`, `VITE_RPC_URL`, `VITE_EXPLORER_URL`.
- Server-only (never prefix with `VITE_`): agent wallet key, OpenRouter, Upstash, session/cron secrets, Telegram, Gmail, `APP_URL`.

Full table: [../docs/deployment.md](../docs/deployment.md).

## Map

| Path | Purpose |
|---|---|
| `src/pages/landing.tsx` | Landing page; films + posters in `public/landing/` |
| `src/pages/agent.tsx` | AI agent page |
| `src/lib/config.ts` | Chain + addresses |
| `src/lib/coinai.ts` → `coinai.evm.ts` / `coinai.mock.ts` | Contract service (real or mock) |
| `src/lib/token.ts` | tUSDT helpers + faucet |
| `src/lib/yield.ts` | Vault data read from chain |
| `src/lib/activity.ts` | Event history (incl. agent decisions) |
| `src/lib/agent-api.ts` | Client for `/api/*` (wallet-signed login) |
| `src/lib/i18n.tsx` | en / id / zh |
| `api/_lib/swarm.ts` | Agent team orchestration |
| `api/_lib/guard.ts` | Deterministic guardrails |
| `api/cron/daily.ts` | Daily report + reminders |

Agent design: [../docs/ai-agents.md](../docs/ai-agents.md).
