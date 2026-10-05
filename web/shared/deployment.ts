// Live coinAI deployment on BNB Smart Chain Testnet (chain 97) — mirrors /deployments.json.
// Env vars override these; set VITE_COINAI_ADDRESS="" explicitly for the in-memory mock.
export const DEPLOYMENT = {
  chainId: 97,
  deployBlock: 133234240,
  coinai: '0xdA174816F66E30eBB3a002bcf5a71AD00037eBD9',
  token: '0x49eD8CC30FC55Ed36e976285d98eF00F213C31E2',
  // tBNB → tUSDT on-ramp priced by Chainlink BNB/USD (evm/src/DepositRouter.sol)
  depositRouter: '0x2e72901f3350b7f3f5E4E35918a6e4b4dC5bf104',
} as const
