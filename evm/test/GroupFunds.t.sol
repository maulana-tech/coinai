// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/GroupFunds.sol";
import "../src/MockUSDT.sol";

contract GroupFundsTest is Test {
    GroupFunds funds;
    MockUSDT usdt;
    address org = address(0x0126);
    address venue = address(0x7E1E);
    address a = address(0xA);
    address b = address(0xB);

    function setUp() public {
        vm.warp(1_700_000_000);
        usdt = new MockUSDT();
        funds = new GroupFunds(address(usdt));
        for (uint256 i; i < 2; ++i) {
            address who = i == 0 ? a : b;
            vm.startPrank(who);
            usdt.faucet();
            usdt.approve(address(funds), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _patungan(uint128 target) internal returns (uint256) {
        vm.prank(org);
        return funds.create(GroupFunds.Kind.Patungan, venue, "Bukber angkatan", target, uint64(block.timestamp + 7 days), 0, 0);
    }

    function test_patungan_paysOutOnlyOnceTheTargetIsReached() public {
        uint256 id = _patungan(100e6);
        vm.prank(a);
        funds.contribute(id, 60e6, "Gas!");
        vm.prank(org);
        vm.expectRevert(GroupFunds.TargetNotReached.selector);
        funds.withdraw(id, 60e6, "DP restoran");
        vm.prank(b);
        funds.contribute(id, 40e6, "");
        vm.prank(org);
        funds.withdraw(id, 100e6, "DP restoran");
        assertEq(usdt.balanceOf(venue), 100e6);
        assertEq(funds.fund(id).contributors, 2);
    }

    function test_patungan_refundsWhenItFallsShort() public {
        uint256 id = _patungan(100e6);
        vm.prank(a);
        funds.contribute(id, 30e6, "");
        vm.prank(a);
        vm.expectRevert(GroupFunds.Closed.selector); // still running
        funds.refund(id);
        vm.warp(block.timestamp + 8 days);
        vm.prank(b);
        vm.expectRevert(GroupFunds.Closed.selector); // closed for new money
        funds.contribute(id, 1e6, "");
        uint256 before = usdt.balanceOf(a);
        vm.prank(a);
        assertEq(funds.refund(id), 30e6);
        assertEq(usdt.balanceOf(a), before + 30e6);
        vm.prank(a);
        vm.expectRevert(GroupFunds.NothingToRefund.selector);
        funds.refund(id);
    }

    function test_patungan_cancelOpensRefunds() public {
        uint256 id = _patungan(100e6);
        vm.prank(a);
        funds.contribute(id, 30e6, "");
        vm.prank(org);
        funds.cancel(id);
        vm.prank(a);
        assertEq(funds.refund(id), 30e6);
    }

    function test_iuran_tracksWhoIsPaidUp() public {
        vm.prank(org);
        uint256 id = funds.create(GroupFunds.Kind.Iuran, org, "Kas kelas XII IPA 2", 0, 0, 10e6, 30 days);
        vm.prank(a);
        vm.expectRevert(GroupFunds.NotMember.selector);
        funds.contribute(id, 10e6, "");
        vm.prank(a);
        funds.join(id);
        vm.prank(a);
        vm.expectRevert(GroupFunds.InvalidAmount.selector); // not a whole number of periods
        funds.contribute(id, 15e6, "");
        vm.prank(a);
        funds.contribute(id, 20e6, "Oktober + November");
        (uint256 paid, uint256 owed) = funds.duesOf(id, a);
        assertEq(paid, 2);
        assertEq(owed, 1);
        vm.warp(block.timestamp + 61 days);
        (paid, owed) = funds.duesOf(id, a);
        assertEq(owed, 3); // a period behind now
        // a friend covers it, without making anyone a member
        vm.prank(b);
        funds.contributeFor(id, a, 10e6, "aku bayarin");
        (paid,) = funds.duesOf(id, a);
        assertEq(paid, 3);
        assertFalse(funds.isMember(id, b));
        vm.prank(a);
        vm.expectRevert(GroupFunds.InvalidAmount.selector); // over a year ahead
        funds.contribute(id, 130e6, "");
    }

    function test_donasi_withdrawsToTheBeneficiaryWithAMemo() public {
        vm.prank(org);
        uint256 id = funds.create(GroupFunds.Kind.Donasi, venue, "Panti asuhan", 0, 0, 0, 0);
        vm.prank(a);
        funds.contribute(id, 50e6, "Semoga berkah");
        vm.prank(a);
        vm.expectRevert(GroupFunds.Unauthorized.selector);
        funds.withdraw(id, 50e6, "not the organizer");
        vm.prank(org);
        vm.expectRevert(GroupFunds.InvalidAmount.selector);
        funds.withdraw(id, 51e6, "more than raised");
        vm.prank(org);
        funds.withdraw(id, 20e6, "Beras 50 kg");
        assertEq(usdt.balanceOf(venue), 20e6);
        vm.prank(a);
        vm.expectRevert(GroupFunds.Closed.selector); // only a Patungan refunds
        funds.refund(id);
    }

    function test_createValidatesEachKind() public {
        vm.startPrank(org);
        vm.expectRevert(GroupFunds.InvalidFund.selector);
        funds.create(GroupFunds.Kind.Patungan, venue, "no target", 0, uint64(block.timestamp + 1 days), 0, 0);
        vm.expectRevert(GroupFunds.InvalidFund.selector);
        funds.create(GroupFunds.Kind.Iuran, venue, "no dues", 0, 0, 0, 30 days);
        vm.expectRevert(GroupFunds.InvalidFund.selector);
        funds.create(GroupFunds.Kind.Iuran, venue, "too short a period", 0, 0, 1e6, 1 hours);
        vm.expectRevert(GroupFunds.InvalidFund.selector);
        funds.create(GroupFunds.Kind.Donasi, venue, "", 0, 0, 0, 0);
        vm.stopPrank();
        vm.prank(a);
        uint256 id = funds.create(GroupFunds.Kind.Donasi, venue, "ok", 0, 0, 0, 0);
        bytes memory long = new bytes(141);
        for (uint256 i; i < long.length; ++i) long[i] = "a";
        vm.prank(a);
        vm.expectRevert(GroupFunds.TooLong.selector);
        funds.contribute(id, 1e6, string(long));
    }
}
