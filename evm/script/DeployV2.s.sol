// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/BasketVault.sol";
import "../src/CoinAIV2.sol";
import "../src/GroupFunds.sol";

interface ITestUSDT {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// Deploys coinAI v2 next to the live tUSDT and yield vaults (deployments.json): GroupFunds, the AI Smart Money
/// basket, CoinAI v2, the AgentRegistry with the coinAI team's hireable skills, and a starting basket reserve.
/// AGENT=<agent wallet> forge script script/DeployV2.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployV2 is Script {
    address constant TUSDT = 0x49eD8CC30FC55Ed36e976285d98eF00F213C31E2;
    address constant VAULT_CONSERVATIVE = 0x1b013Af5755CB96d9314A5074391931EBCd40ACa;
    address constant VAULT_BALANCED = 0x4071DdCe831E484640e864a8627cc3ece308e895;
    address constant VAULT_GROWTH = 0xf9B035426d2A16EF00F0547dc0F4Ed9226D2671d;
    uint256 constant BASKET_RESERVE = 300e6; // pays basket gains above deposits on testnet

    function basketConfig()
        public
        pure
        returns (string[] memory symbols, address[] memory feeds, uint16[] memory caps, uint16[] memory weights)
    {
        // Chainlink proxies on BSC Testnet (8 decimals), as in web/shared/market.ts. CAKE is capped harder: it's the
        // most volatile and the least liquid of the four.
        symbols = new string[](5);
        feeds = new address[](5);
        caps = new uint16[](5);
        weights = new uint16[](5);
        (symbols[0], feeds[0], caps[0], weights[0]) = ("tUSDT", address(0), 10_000, 4_000);
        (symbols[1], feeds[1], caps[1], weights[1]) = ("BNB", 0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526, 5_000, 2_000);
        (symbols[2], feeds[2], caps[2], weights[2]) = ("BTC", 0x5741306c21795FdCBb9b265Ea0255F499DFe515C, 5_000, 2_000);
        (symbols[3], feeds[3], caps[3], weights[3]) = ("ETH", 0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7, 5_000, 1_500);
        (symbols[4], feeds[4], caps[4], weights[4]) = ("CAKE", 0x81faeDDfeBc2F8Ac524327d70Cf913001732224C, 2_000, 500);
    }

    function run() external {
        address agent = vm.envAddress("AGENT");
        (string[] memory symbols, address[] memory feeds, uint16[] memory caps, uint16[] memory weights) = basketConfig();
        vm.startBroadcast();
        GroupFunds funds = new GroupFunds(TUSDT);
        BasketVault basket = new BasketVault(TUSDT, agent, symbols, feeds, caps, weights);
        CoinAIV2 coinai = new CoinAIV2(TUSDT, [VAULT_CONSERVATIVE, VAULT_BALANCED, VAULT_GROWTH], address(basket), address(funds));
        basket.initCoinAI(address(coinai));
        AgentRegistry registry = new AgentRegistry(TUSDT);
        // The coinAI team's hireable skills, all served by the one agent wallet; fees go to the deployer (treasury).
        registry.list(agent, 2, 0, "Athena", "Invests idle savings across the vaults and the AI Smart Money basket, and rebalances on the market read.");
        registry.list(agent, 1, 0, "Demeter", "Tunes how much of every payment you save, inside the range you set.");
        registry.list(agent, 4, 1e6, "Hermes", "Keeps your group dues paid from your spendable balance: only funds you joined, only up to your budget.");
        if (ITestUSDT(TUSDT).balanceOf(msg.sender) >= BASKET_RESERVE) ITestUSDT(TUSDT).transfer(address(basket), BASKET_RESERVE);
        vm.stopBroadcast();

        console.log("GroupFunds:   ", address(funds));
        console.log("BasketVault:  ", address(basket));
        console.log("CoinAIV2:     ", address(coinai));
        console.log("AgentRegistry:", address(registry));
    }
}
