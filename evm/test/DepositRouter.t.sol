// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/Save.sol";
import "../src/MockUSDT.sol";
import "../src/SimpleVault.sol";
import "../src/DepositRouter.sol";

contract MockFeed {
    int256 public answer;
    uint256 public updatedAt;

    function set(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract DepositRouterTest is Test {
    CoinAI coinai;
    MockUSDT usdt;
    MockFeed feed;
    DepositRouter router;

    address alice = address(0xA11CE);
    address treasury = address(0x7EA5);

    function setUp() public {
        vm.warp(10 days);
        usdt = new MockUSDT();
        SimpleVault v0 = new SimpleVault(address(usdt), "Conservative", "cv", 300, 1);
        SimpleVault v1 = new SimpleVault(address(usdt), "Balanced", "bv", 600, 2);
        SimpleVault v2 = new SimpleVault(address(usdt), "Growth", "gv", 1200, 3);
        coinai = new CoinAI(address(usdt), [address(v0), address(v1), address(v2)]);
        feed = new MockFeed();
        feed.set(600e8, block.timestamp); // 1 BNB = $600
        router = new DepositRouter(address(coinai), address(usdt), address(feed), treasury);
        router.refill(); // 1,000 tUSDT reserve
        vm.deal(alice, 1 ether);
    }

    function test_quote() public view {
        (uint256 out, uint256 price) = router.quoteBNB(0.01 ether);
        assertEq(price, 600e8);
        assertEq(out, 6_000_000); // 0.01 BNB * $600 = 6 tUSDT
    }

    function test_depositBNB_creditsAccountWithSplit() public {
        vm.prank(alice);
        uint256 out = router.depositBNB{value: 0.1 ether}(0); // $60

        assertEq(out, 60_000_000);
        CoinAI.Account memory acc = coinai.accountOf(alice);
        assertEq(acc.spend + acc.shares, 60_000_000);
        assertEq(acc.shares, 12_000_000); // default 20% split goes to savings
        assertEq(treasury.balance, 0.1 ether);
        assertEq(router.reserve(), 1_000_000_000 - 60_000_000);
        (uint128 received, uint64 count,) = coinai.statsOf(alice);
        assertEq(received, 60_000_000);
        assertEq(count, 1);
    }

    function test_revertsOnSlippage() public {
        vm.prank(alice);
        vm.expectRevert(DepositRouter.Slippage.selector);
        router.depositBNB{value: 0.1 ether}(61_000_000);
    }

    function test_revertsOnStalePrice() public {
        feed.set(600e8, block.timestamp - 2 days);
        vm.prank(alice);
        vm.expectRevert(DepositRouter.StalePrice.selector);
        router.depositBNB{value: 0.1 ether}(0);
    }

    function test_revertsWhenReserveTooLow() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert(DepositRouter.ReserveTooLow.selector);
        router.depositBNB{value: 2 ether}(0); // $1,200 > 1,000 reserve
    }

    function test_revertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(DepositRouter.ZeroDeposit.selector);
        router.depositBNB(0);
    }
}
