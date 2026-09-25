# Development

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for smart contracts)
- EVM wallet (MetaMask, Rabby, etc.)

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/0x1e30c3/save-main.git
cd save-main
git submodule update --init  # forge-std
```

### 2. Smart Contracts

```bash
cd evm
cp .env.example .env
# Edit .env: set FLARE_RPC_URL and DEPLOYER_PRIVATE_KEY

# Build
~/.foundry/bin/forge build

# Test
~/.foundry/bin/forge test
```

### 3. Frontend

```bash
cd web
cp .env.example .env
# VITE_COINAI_ADDRESS is pre-filled with deployed contract

npm install
npm run dev
```

Opens at [http://localhost:5173/](http://localhost:5173/).

### 4. Mock Mode

Set `VITE_COINAI_ADDRESS=""` in `web/.env` to use in-memory mock. This lets you develop the UI without a wallet or deployed contract.

## Project Structure

```
your-save/
├── evm/                    # Smart contracts
│   ├── src/
│   │   ├── Save.sol        # Core coinAI contract
│   │   ├── VaultAdapter.sol    # ERC-4626 vault adapter
│   │   ├── SparkDexAdapter.sol # SparkDEX swap adapter
│   │   ├── FxrpVault.sol       # Custom ERC-4626 vault
│   │   └── ISparkDexRouter.sol # SparkDEX interface
│   ├── script/             # Deployment scripts
│   ├── test/               # Contract tests
│   ├── lib/forge-std/      # Foundry standard library
│   ├── foundry.toml        # Foundry config
│   └── .env                # Deployer keys
├── web/                    # Frontend
│   ├── src/
│   │   ├── lib/            # Core logic, hooks, services
│   │   ├── components/     # React components
│   │   ├── pages/          # Route pages
│   │   └── App.tsx         # Router
│   ├── public/             # Static assets
│   ├── vercel.json         # Vercel SPA routing
│   └── package.json
├── docs/                   # Documentation
├── deployments.json        # Deployed addresses
├── AGENTS.md               # AI agent instructions
├── CONTEXT.md              # Hackathon context
└── push.sh                 # Git push helper
```

## Key Commands

| Command | Description |
|---|---|
| `cd evm && forge build` | Compile contracts |
| `cd evm && forge test` | Run contract tests |
| `cd web && npm run dev` | Start dev server |
| `cd web && npm run build` | Type-check + production build |
| `cd web && npm run lint` | Run linter |
| `./push.sh "message"` | Auto-commit & push (one commit per file) |

## Git Workflow

The project uses `push.sh` which commits one file per commit with conventional-commit types inferred from filename. Don't batch commits.

## Key Gotchas

### FXRP Decimals
FXRP has **6 decimals** on Coston2 (not 18). This is set in `web/src/lib/fxrp.ts` as `FXRP_DECIMALS = 6`. All formatting, parsing, and display uses this.

### Yield Target Mapping
The enum order in `Save.sol` (SparkDEX=0, Firelight=1, Upshift=2) must match `toYieldTarget/fromYieldTarget` in `coinai.evm.ts`. Changing either breaks the frontend.

### Contract Errors
Custom Solidity errors are mapped to `Error(Contract, #N)` strings via `ERROR_CODES` in `coinai.evm.ts`. Adding a contract error requires updating:
1. `Save.sol` — error declaration
2. `coinai.evm.ts` — ERROR_CODES mapping
3. `errors.ts` — error pattern matching
4. `i18n.tsx` — translations (EN, ID, ZH)

### Chain Enforcement
All write paths check `chainId === 114` before sending transactions. If the wallet is on a different chain, the user gets a "Wrong network" error.

### Vercel SPA Routing
`web/vercel.json` handles client-side route rewrites. The pattern excludes static assets (`/assets/`, `/logos/`, `/favicon.ico`) to avoid serving index.html for real files.

## Testing

### Contract Tests
```bash
cd evm && forge test
```

### Manual Testing Flow
1. Connect wallet on Coston2
2. Get FXRP from faucet (`/app/faucet`)
3. Create payment link (`/app/link`)
4. Pay to the link from another wallet
5. Check savings balance on dashboard
6. Deposit savings to yield (`/app/yield`)
7. Verify vault shares on explorer

## Debugging

The frontend has console logging in the deposit flow:
- `[depositYieldDirect] START` — input parameters
- `[depositYieldDirect] chainId` — network check
- `[depositYieldDirect] VAULT path` / `SPARKDEX path` — which adapter is used
- `[depositYieldDirect] staticCall OK/FAILED` — simulation result
- `[depositYieldDirect] TX success` — transaction hash
- `[runAction] ERROR` — full error object for debugging

Check browser DevTools (F12 → Console) to trace issues.
