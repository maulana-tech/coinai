// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/BasketVault.sol";
import "../src/CoinAIV2.sol";
import "../src/GroupFunds.sol";
import "../src/MockUSDT.sol";
import "../script/DeployV2.s.sol";

/// v2 against the live BSC Testnet state: real Chainlink feeds, the deployed tUSDT and yield vaults.
/// forge test --match-contract Fork --fork-url https://bsc-testnet-dataseed.bnbchain.org
contract CoinAIV2ForkTest is Test, DeployV2 {
    BasketVault basket;
    GroupFunds funds;
    CoinAIV2 coinai;
    address agent = makeAddr("agent");
    address saver = makeAddr("saver");
    address payer = makeAddr("payer");

    function _deploy() internal {
        (string[] memory symbols, address[] memory feeds, uint16[] memory caps, uint16[] memory weights) = basketConfig();
        basket = new BasketVault(TUSDT, agent, symbols, feeds, caps, weights);
        funds = new GroupFunds(TUSDT);
        coinai = new CoinAIV2(TUSDT, [VAULT_CONSERVATIVE, VAULT_BALANCED, VAULT_GROWTH], address(basket), address(funds));
        basket.initCoinAI(address(coinai));
    }

    function _pricesAreLiveAndFresh() internal view {
        (uint256[] memory p, bool[] memory fresh) = basket.prices();
        for (uint256 i = 1; i < p.length; ++i) {
            assertTrue(fresh[i]);
            assertGt(p[i], 0);
            console.log(i, p[i] / 1e18);
        }
    }

    function _payAndDelegate() internal {
        vm.startPrank(payer);
        MockUSDT(TUSDT).faucet();
        MockUSDT(TUSDT).approve(address(coinai), type(uint256).max);
        coinai.pay(payer, saver, 1_000e6);
        vm.stopPrank();
        vm.prank(saver);
        coinai.setAgent(agent, 7, 1_000, 4_000, 50e6, uint64(block.timestamp + 30 days));
    }

    function _agentRuns() internal {
        uint16[] memory riskOff = new uint16[](5);
        (riskOff[0], riskOff[1], riskOff[2], riskOff[3], riskOff[4]) = (8_000, 500, 1_000, 500, 0);
        vm.startPrank(agent);
        coinai.agentInvest(saver, 100e6, 3, "fork: AI basket");
        coinai.agentInvest(saver, 50e6, 1, "fork: balanced vault");
        basket.setSmartWeights(riskOff, "fork: risk_off");
        coinai.agentRebalance(saver, 3, 0, 30e6, "fork: de-risk");
        vm.stopPrank();
    }

    function _duesByPayAgent() internal {
        vm.prank(payer);
        uint256 kas = funds.create(GroupFunds.Kind.Iuran, payer, "Kas fork", 0, 0, 10e6, 30 days);
        vm.prank(saver);
        funds.join(kas);
        vm.prank(agent);
        coinai.agentContribute(saver, kas, 10e6, "fork: dues");
        (uint256 paid, uint256 owed) = funds.duesOf(kas, saver);
        assertEq(paid, owed);
    }

    function test_fork_fullFlowOnRealFeedsAndVaults() public {
        if (block.chainid != 97) return; // only meaningful on a BSC Testnet fork
        _deploy();
        _pricesAreLiveAndFresh();
        _payAndDelegate();
        _agentRuns();
        _duesByPayAgent();

        CoinAIV2.AccountView memory a = coinai.accountOf(saver);
        assertApproxEqAbs(a.positions[3], 70e6, 10);
        assertApproxEqAbs(a.positions[0], 30e6, 2);
        assertApproxEqAbs(a.positions[1], 50e6, 2);
        assertEq(a.spend, 790e6);
        assertEq(MockUSDT(TUSDT).balanceOf(agent), 0);

        vm.prank(saver);
        assertApproxEqAbs(coinai.withdrawPosition(saver, 1, type(uint256).max), 50e6, 2);
    }
}
