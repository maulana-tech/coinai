# Flare Integration

## How coinAI Uses Flare

coinAI is built on Flare Coston2 testnet and leverages several Flare-native features:

### FAssets / FXRP

**FXRP** is the primary asset. It's a wrapped representation of XRP on Flare, backed 1:1 by locked XRP + agent collateral.

- **Contract:** `0x0b6A3645c240605887a5532109323A3E12273dc7`
- **Decimals:** 6 (not 18 — this is specific to the Coston2 testnet deployment)
- **Standard:** ERC-20 with FAssets backing

coinAI holds FXRP from payments and routes it to yield protocols. Users can:
1. Receive FXRP payments (auto-split into spend + savings)
2. Withdraw spendable FXRP to wallet
3. Deposit savings into yield vaults
4. Direct-deposit FXRP from wallet to vaults

### Flare Coston2 Testnet

| Property | Value |
|---|---|
| Chain ID | 114 |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` |
| Explorer | `https://coston2-explorer.flare.network` |
| Faucet | `https://faucet.flare.network/coston2` |
| Native Token | C2FLR (18 decimals) |

### SparkDEX (Uniswap V3 Fork)

SparkDEX is a DEX on Flare, forked from Uniswap V3. coinAI uses it for swapping FXRP into other tokens via the `SparkDexAdapter`.

- **Router:** `0x4a1E5A90e9943467FAd1acea1E7F0e5e88472a1e`
- **Fee tier:** 3000 (0.3%)
- **Status on testnet:** Router is deployed but no valid FXRP pools exist yet

### Firelight (ERC-4626 Vaults)

Firelight provides ERC-4626 compliant yield vaults for FXRP. coinAI uses the `VaultAdapter` to deposit FXRP into these vaults.

- **Original vault:** `0xC90D6847747b85d1fa2E07859869fb9fB72c0361` (broken on testnet)
- **Custom FxrpVault:** `0x780780D122f075ada1Fa86A18dE2e0763B2526Ec` (deployed by us)

The custom `FxrpVault` is a minimal ERC-4626 vault that:
- Accepts FXRP deposits
- Mints shares 1:1 with FXRP
- Returns `type(uint256).max` for `maxDeposit()`
- Implements full deposit/withdraw/redeem/mint

### Upshift (Auto-Compound Vaults)

Upshift provides strategy-driven yield vaults.

- **Vault:** `0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81`
- **Status:** Not accepting deposits on testnet (`maxDeposit` reverts)

## Yield Routing Architecture

```
User's Savings (in coinAI contract)
         │
         ▼
  withdrawSavingsToAdapter()
         │
    ┌────┴────┐
    │         │
    ▼         ▼
VaultAdapter  SparkDexAdapter
    │         │
    ▼         ▼
FxrpVault    SparkDEX Router
(ERC-4626)   (V3 swap)
    │         │
    ▼         ▼
Vault Shares  Output Token
```

### VaultAdapter Flow
1. coinAI transfers FXRP to VaultAdapter
2. VaultAdapter approves the vault to pull FXRP
3. VaultAdapter calls `vault.deposit(amount, user)`
4. Vault mints shares directly to the user

### SparkDexAdapter Flow
1. coinAI transfers FXRP to SparkDexAdapter
2. SparkDexAdapter approves the router to pull FXRP
3. SparkDexAdapter calls `router.exactInputSingle(params)`
4. Router swaps FXRP → tokenOut and sends to user

## Direct Deposit (Bypass coinAI)

Users can deposit FXRP directly from their wallet to the vault, without going through the coinAI contract:

1. User approves FXRP to the vault
2. User calls `vault.deposit(amount, user)`
3. Vault mints shares to the user

This is handled by `depositYieldDirect()` in the frontend. The dashboard's `BalanceHero` component reads the vault share balance and adds it to the total display.

## FTSO Price Feeds

Flare's FTSO (Flare Time Series Oracle) provides decentralized price feeds. coinAI uses mock rates for now, but could integrate FTSO for:
- Real-time FXRP/USD pricing
- Portfolio value calculation
- Yield APY display

## Flare Data Connector (FDC)

FDC enables cross-chain data verification. coinAI doesn't currently use FDC, but it could be extended to:
- Verify XRP payments on XRPL for onboarding
- Cross-chain payment verification
- Multi-chain savings aggregation

## Resources

- [Flare Developer Hub](https://dev.flare.network/)
- [FAssets Overview](https://dev.flare.network/fassets/overview)
- [FXRP Overview](https://dev.flare.network/fxrp/overview)
- [SparkDEX Docs](https://sparkdex.finance)
- [Firelight Docs](https://firelight.finance)
- [Flare Coston2 Faucet](https://faucet.flare.network/coston2)
