# evm

Solidity contracts for coinAI on BNB Smart Chain Testnet (chain 97). Foundry, Solidity 0.8.28.

## Contracts

| File | Contract | Purpose |
|---|---|---|
| `src/Save.sol` | `CoinAI` | Payment split, spend/savings balances, time-lock, vault routing, AI agent delegation (`setAgent`, `agentSetSplit`, `agentInvest`), `AgentAction` audit events |
| `src/SimpleVault.sol` | `SimpleVault` | Minimal ERC-4626 vault with APY/risk metadata; deployed 3× (Conservative, Balanced, Growth) |
| `src/MockUSDT.sol` | `MockUSDT` | 6-decimal test stablecoin with a 24h-rate-limited `faucet()` |

## Build & test

```bash
git submodule update --init   # forge-std
~/.foundry/bin/forge build
~/.foundry/bin/forge test     # 15 tests incl. agent guardrails
```

## Deploy

```bash
cp .env.example .env          # BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY
source .env
~/.foundry/bin/forge script script/DeployAll.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

Deploys MockUSDT, the three vaults and CoinAI in one go and prints the addresses. Put them in `../deployments.json`, then see [../docs/deployment.md](../docs/deployment.md).

## Notes

- Use `~/.foundry/bin/forge`; the npm `forge` package is a different tool.
- `YieldTarget` order (Conservative=0, Balanced=1, Growth=2) is mirrored in `web/src/lib/types.ts` and `web/api/_lib/guard.ts`.
- Vault addresses are immutable constructor args and CoinAI has no owner.
