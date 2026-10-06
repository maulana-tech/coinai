// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/MockUSDT.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    MockUSDT usdt;
    address operator = address(0x0BE7);
    address hermes = address(0x4E12);
    address hirer = address(0x41E);

    function setUp() public {
        vm.warp(1_700_000_000);
        usdt = new MockUSDT();
        registry = new AgentRegistry(address(usdt));
        vm.startPrank(hirer);
        usdt.faucet();
        usdt.approve(address(registry), type(uint256).max);
        vm.stopPrank();
    }

    function _listHermes(uint128 fee) internal returns (uint256) {
        vm.prank(operator);
        return registry.list(hermes, 4, fee, "Hermes", "Keeps your group dues paid");
    }

    function test_hirePaysTheOperatorAndStacksPeriods() public {
        uint256 id = _listHermes(2e6);
        vm.prank(hirer);
        uint64 until = registry.hire(id, 1);
        assertEq(until, block.timestamp + 30 days);
        assertEq(usdt.balanceOf(operator), 2e6);
        vm.prank(hirer);
        until = registry.hire(id, 2); // extends the running rental
        assertEq(until, block.timestamp + 90 days);
        assertEq(usdt.balanceOf(operator), 6e6);
        assertEq(registry.listing(id).hires, 2);
    }

    function test_freeListingsAndLimits() public {
        uint256 id = _listHermes(0);
        vm.prank(hirer);
        registry.hire(id, 12);
        vm.prank(hirer);
        vm.expectRevert(AgentRegistry.InvalidPeriods.selector);
        registry.hire(id, 13);
        vm.prank(hirer);
        vm.expectRevert(AgentRegistry.Unauthorized.selector);
        registry.update(id, 0, false, "");
        vm.prank(operator);
        registry.update(id, 1e6, false, "paused");
        vm.prank(hirer);
        vm.expectRevert(AgentRegistry.Inactive.selector);
        registry.hire(id, 1);
        vm.expectRevert(AgentRegistry.InvalidListing.selector);
        registry.list(hermes, 8, 0, "bad skills", "");
    }
}
