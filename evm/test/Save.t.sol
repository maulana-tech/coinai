// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/Save.sol";
import "../src/MockUSDT.sol";
import "../src/SimpleVault.sol";

contract CoinAITest is Test {
    CoinAI coinai;
    MockUSDT usdt;
    SimpleVault[3] vaults;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address agent = address(0xA6E7);

    function setUp() public {
        usdt = new MockUSDT();
        vaults[0] = new SimpleVault(address(usdt), "Conservative", "cv", 300, 1);
        vaults[1] = new SimpleVault(address(usdt), "Balanced", "bv", 600, 2);
        vaults[2] = new SimpleVault(address(usdt), "Growth", "gv", 1200, 3);
        coinai = new CoinAI(address(usdt), [address(vaults[0]), address(vaults[1]), address(vaults[2])]);

        vm.startPrank(alice);
        usdt.faucet();
        usdt.approve(address(coinai), type(uint256).max);
        vm.stopPrank();
    }

    function _pay(uint256 amount) internal {
        vm.prank(alice);
        coinai.pay(alice, bob, amount);
    }

    function _delegate(uint16 minBps, uint16 maxBps) internal {
        vm.prank(bob);
        coinai.setAgent(agent, minBps, maxBps, uint64(block.timestamp + 30 days));
    }

    // ─── Core ────────────────────────────────────────────────────────────────

    function test_pay_splitsDefault20Percent() public {
        _pay(1000);
        CoinAI.Account memory acc = coinai.accountOf(bob);
        assertEq(acc.spend, 800);
        assertEq(acc.shares, 200);
        assertEq(usdt.balanceOf(address(coinai)), 1000);
        (uint128 total, uint64 count, uint64 last) = coinai.statsOf(bob);
        assertEq(total, 1000);
        assertEq(count, 1);
        assertEq(last, block.timestamp);
    }

    function test_withdrawSpend() public {
        _pay(1000);
        vm.prank(bob);
        assertEq(coinai.withdrawSpend(bob, 500), 500);
        assertEq(usdt.balanceOf(bob), 500);
    }

    function test_lockBlocksSavingsWithdrawal() public {
        _pay(1000);
        uint64 until = uint64(block.timestamp + 1 days);
        vm.startPrank(bob);
        coinai.setLock(bob, until);
        vm.expectRevert(CoinAI.LockActive.selector);
        coinai.withdrawSavings(bob, 100);
        vm.warp(until);
        assertEq(coinai.withdrawSavings(bob, 100), 100);
        vm.stopPrank();
    }

    function test_setYieldTarget_revertsWithSavings() public {
        _pay(1000);
        vm.prank(bob);
        vm.expectRevert(CoinAI.SavingsNotZero.selector);
        coinai.setYieldTarget(bob, CoinAI.YieldTarget.Growth);
    }

    function test_investSavings_mintsVaultSharesToUser() public {
        _pay(1000);
        vm.prank(bob);
        coinai.investSavings(200, CoinAI.YieldTarget.Growth);
        assertEq(vaults[2].balanceOf(bob), 200);
        assertEq(coinai.accountOf(bob).shares, 0);
    }

    function test_faucetCooldown() public {
        vm.prank(alice);
        vm.expectRevert();
        usdt.faucet();
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        usdt.faucet();
        assertEq(usdt.balanceOf(alice), 2 * usdt.FAUCET_AMOUNT());
    }

    // ─── Agent guardrails ────────────────────────────────────────────────────

    function test_agentSetSplit_withinBounds() public {
        _delegate(1000, 4000);
        vm.prank(agent);
        coinai.agentSetSplit(bob, 3500, "steady income, raise savings");
        assertEq(coinai.accountOf(bob).splitBps, 3500);
    }

    function test_agentSetSplit_outOfBoundsReverts() public {
        _delegate(1000, 4000);
        vm.startPrank(agent);
        vm.expectRevert(CoinAI.SplitOutOfRange.selector);
        coinai.agentSetSplit(bob, 5000, "");
        vm.expectRevert(CoinAI.SplitOutOfRange.selector);
        coinai.agentSetSplit(bob, 500, "");
        vm.stopPrank();
    }

    function test_agentInvest_sharesGoToUserNotAgent() public {
        _pay(1000);
        _delegate(0, 10_000);
        vm.prank(agent);
        coinai.agentInvest(bob, 200, CoinAI.YieldTarget.Conservative, "low risk profile");
        assertEq(vaults[0].balanceOf(bob), 200);
        assertEq(vaults[0].balanceOf(agent), 0);
        assertEq(usdt.balanceOf(agent), 0);
    }

    function test_agentInvest_respectsLock() public {
        _pay(1000);
        _delegate(0, 10_000);
        vm.prank(bob);
        coinai.setLock(bob, uint64(block.timestamp + 1 days));
        vm.prank(agent);
        vm.expectRevert(CoinAI.LockActive.selector);
        coinai.agentInvest(bob, 200, CoinAI.YieldTarget.Growth, "");
    }

    function test_nonAgentRejected() public {
        _delegate(0, 10_000);
        vm.prank(alice);
        vm.expectRevert(CoinAI.NotAgent.selector);
        coinai.agentSetSplit(bob, 3000, "");
    }

    function test_agentRejectedAfterExpiry() public {
        _delegate(0, 10_000);
        vm.warp(block.timestamp + 30 days);
        vm.prank(agent);
        vm.expectRevert(CoinAI.NotAgent.selector);
        coinai.agentSetSplit(bob, 3000, "");
    }

    function test_agentRejectedAfterRevoke() public {
        _delegate(0, 10_000);
        vm.prank(bob);
        coinai.revokeAgent();
        vm.prank(agent);
        vm.expectRevert(CoinAI.NotAgent.selector);
        coinai.agentSetSplit(bob, 3000, "");
    }

    function test_setAgent_invalidPolicyReverts() public {
        vm.startPrank(bob);
        vm.expectRevert(CoinAI.InvalidPolicy.selector);
        coinai.setAgent(agent, 5000, 1000, uint64(block.timestamp + 1 days));
        vm.expectRevert(CoinAI.InvalidPolicy.selector);
        coinai.setAgent(agent, 0, 10_001, uint64(block.timestamp + 1 days));
        vm.expectRevert(CoinAI.InvalidPolicy.selector);
        coinai.setAgent(agent, 0, 1000, uint64(block.timestamp));
        vm.expectRevert(CoinAI.InvalidAddress.selector);
        coinai.setAgent(bob, 0, 1000, uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }
}
