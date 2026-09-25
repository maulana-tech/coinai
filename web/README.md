# Frontend

React + Vite + TypeScript + Tailwind CSS v4 frontend for coinAI.

## Stack

- **React 19** with TypeScript
- **Vite** for build & dev
- **Tailwind CSS v4** for styling
- **ethers.js v6** for contract interactions
- **wagmi** for wallet connection
- **shadcn-style** UI components

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server (http://localhost:5173)
npm run build     # Type-check + production build
npm run lint      # Run oxlint
```

## Environment

```env
VITE_CHAIN_MODE=evm
VITE_COINAI_ADDRESS=0x588DeC15D915659E8BF36c01e662479916301d3A
VITE_FLARE_RPC_URL=https://coston2-api.flare.network/ext/C/rpc
```

Set `VITE_COINAI_ADDRESS=""` for mock mode (no wallet needed).

## Key Files

| File | Purpose |
|---|---|
| `lib/config.ts` | Contract addresses, RPC URLs |
| `lib/coinai.evm.ts` | EVM contract interactions |
| `lib/coinai.mock.ts` | In-memory mock |
| `lib/fxrp.ts` | FXRP token utilities |
| `lib/app-state.tsx` | Global state provider |
| `lib/yield.ts` | Yield calculations |
| `lib/errors.ts` | Error code mapping |
| `lib/i18n.tsx` | Translations (EN, ID, ZH) |

## Gotchas

- FXRP has **6 decimals** (not 18)
- All write calls include explicit `gasLimit` to prevent silent reverts on Coston2
- `vercel.json` handles SPA routing — excludes static assets from rewrite
- Console logging is enabled in deposit flow for debugging
