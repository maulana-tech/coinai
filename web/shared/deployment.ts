// Live coinAI deployment on BNB Smart Chain Testnet (chain 97) — mirrors /deployments.json.
// Env vars override these; set VITE_COINAI_ADDRESS="" explicitly for the in-memory mock.
export const DEPLOYMENT = {
  chainId: 97,
  deployBlock: 133234240,
  coinai: '0xdA174816F66E30eBB3a002bcf5a71AD00037eBD9',
  token: '0x49eD8CC30FC55Ed36e976285d98eF00F213C31E2',
  // tBNB → tUSDT on-ramp priced by Chainlink BNB/USD (evm/src/DepositRouter.sol)
  depositRouter: '0x2e72901f3350b7f3f5E4E35918a6e4b4dC5bf104',
  // coinAI v2 (evm/script/DeployV2.s.sol), live from block 135234110; the app still runs on v1 until it migrates
  v2: {
    deployBlock: 135234110,
    coinai: '0x2Cf391a4074927a6D3b5B81af3D3D993D00DF515',
    basketVault: '0x53bc4990EF969F60Cf39650212019a89742052ed', // AI Smart Money: tUSDT, BNB, BTC, ETH, CAKE
    groupFunds: '0x1129b2C358360C1eaC3C379Cf05f87028A5855d1', // Patungan, Iuran, Donasi
    agentRegistry: '0xD063CeD905bD9034778e86e9d98716b79B85405E', // hireable agent skills
  },
} as const
