# Smart Contracts

Solidity contracts for coinAI, deployed on Flare Coston2.

## Contracts

| Contract | Description |
|---|---|
| `Save.sol` | Core savings contract — payment splitting, yield targets, withdrawals |
| `VaultAdapter.sol` | Deposits FXRP into ERC-4626 vaults |
| `SparkDexAdapter.sol` | Swaps FXRP via SparkDEX V3 |
| `FxrpVault.sol` | Custom ERC-4626 vault for FXRP |
| `ISparkDexRouter.sol` | SparkDEX V3 router interface |

## Build & Test

```bash
git submodule update --init  # forge-std
~/.foundry/bin/forge build
~/.foundry/bin/forge test
```

## Deploy

See [docs/deployment.md](../docs/deployment.md) for deploy scripts and addresses.

## Gotchas

- FXRP has **6 decimals** on Coston2 (not 18)
- `forge-std` is a git submodule — run `git submodule update --init` after clone
- Use `~/.foundry/bin/forge` (not bare `forge` — the npm `forge` package is ForgeCode, not Foundry)
