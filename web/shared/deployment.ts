// Live coinAI deployment on BNB Smart Chain Testnet (chain 97) — mirrors /deployments.json.
// Env vars override these when set to a non-empty value; VITE_MOCK=1 runs the app on the in-memory mock instead.
export const DEPLOYMENT = {
  chainId: 97,
  deployBlock: 133234240,
  coinai: '0xdA174816F66E30eBB3a002bcf5a71AD00037eBD9',
  token: '0x49eD8CC30FC55Ed36e976285d98eF00F213C31E2',
  // tBNB → tUSDT on-ramp priced by Chainlink BNB/USD (evm/src/DepositRouter.sol)
  depositRouter: '0x2e72901f3350b7f3f5E4E35918a6e4b4dC5bf104',
  // coinAI v2 (evm/script/DeployV2.s.sol), live from block 135234110: what the app and the agents run on.
  // The top-level coinai/deployBlock/depositRouter are v1, read only so users can move their funds out.
  v2: {
    deployBlock: 135234110,
    coinai: '0x2Cf391a4074927a6D3b5B81af3D3D993D00DF515',
    basketVault: '0x53bc4990EF969F60Cf39650212019a89742052ed', // AI Smart Money: tUSDT, BNB, BTC, ETH, CAKE
    groupFunds: '0x1129b2C358360C1eaC3C379Cf05f87028A5855d1', // Patungan, Iuran, Donasi
    agentRegistry: '0xD063CeD905bD9034778e86e9d98716b79B85405E', // hireable agent skills
    agent: '0x03c8faF61c40F35CCFFd8fDcCa7F037C2dB2f6C6', // the backend agent wallet (AGENT_PRIVATE_KEY): basket curator, badge minter
    // tBNB on-ramp for v2 (evm/script/DeployRouter.s.sol with COINAI = v2.coinai), live from block 135319692
    depositRouter: '0x6840F8f0651BD5e892c5284f63C642496fF429d7',
    // soulbound saving badges (evm/src/CoinAIBadges.sol), minter = the agent wallet, live from block 135320445
    badges: '0x89781499Dd2a0A80De2a5a3C527ed869F9d544C3',
  },
} as const
