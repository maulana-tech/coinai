// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/CoinAIBadges.sol";

/// Stands in for CoinAI v2: settable payment count and savings.
contract MockCoinAI {
    uint64 public count;
    uint128 public idle;
    uint256 public basket;

    function set(uint64 c, uint128 i, uint256 b) external {
        (count, idle, basket) = (c, i, b);
    }

    function statsOf(address) external view returns (uint128, uint64, uint64) {
        return (0, count, 0);
    }

    function accountOf(address) external view returns (AccountView memory a) {
        a.idle = idle;
        a.positions[3] = basket;
    }
}

contract CoinAIBadgesTest is Test {
    CoinAIBadges badges;
    MockCoinAI coinai;
    address agent = address(0xA6E7);
    address alice = address(0xA11CE);
    // badge ids as literals: reading them from the contract inside a prank/expectRevert would consume it
    uint8 constant FIRST = 0;
    uint8 constant SAVED = 2;
    uint8 constant STREAK = 3;

    function setUp() public {
        coinai = new MockCoinAI();
        badges = new CoinAIBadges(address(coinai), agent);
    }

    function test_claimNeedsOnChainProof() public {
        vm.prank(alice);
        vm.expectRevert(CoinAIBadges.NotEligible.selector);
        badges.claim(FIRST);

        coinai.set(1, 0, 0);
        vm.prank(alice);
        badges.claim(FIRST);
        assertEq(badges.balanceOf(alice), 1);
        assertEq(badges.ownerOf(badges.tokenIdOf(alice, 0)), alice);
        assertGt(badges.badgesOf(alice)[0], 0);

        vm.prank(alice);
        vm.expectRevert(CoinAIBadges.AlreadyEarned.selector);
        badges.claim(FIRST);
    }

    function test_saved100CountsIdleAndPositions() public {
        coinai.set(0, 60e6, 39e6);
        assertFalse(badges.eligible(alice, SAVED));
        coinai.set(0, 60e6, 40e6);
        assertTrue(badges.eligible(alice, SAVED));
        vm.prank(alice);
        badges.claim(SAVED);
    }

    function test_awardOnlyByMinterAndOnlyAwardable() public {
        vm.expectRevert(CoinAIBadges.Unauthorized.selector);
        badges.award(alice, STREAK);

        vm.prank(agent);
        badges.award(alice, STREAK);
        assertEq(badges.balanceOf(alice), 1);

        vm.prank(agent);
        vm.expectRevert(CoinAIBadges.UnknownBadge.selector);
        badges.award(alice, FIRST); // claimable ones can't be handed out

        vm.prank(alice);
        vm.expectRevert(CoinAIBadges.UnknownBadge.selector);
        badges.claim(STREAK); // awarded ones can't be claimed
    }

    function test_soulbound() public {
        coinai.set(1, 0, 0);
        vm.prank(alice);
        badges.claim(0);
        uint256 id = badges.tokenIdOf(alice, 0);
        assertTrue(badges.locked(id));
        vm.prank(alice);
        vm.expectRevert(CoinAIBadges.Soulbound.selector);
        badges.transferFrom(alice, address(1), id);
        vm.expectRevert(CoinAIBadges.Soulbound.selector);
        badges.approve(address(1), id);
        uint256 unearned = badges.tokenIdOf(alice, 1);
        vm.expectRevert(CoinAIBadges.NotFound.selector);
        badges.ownerOf(unearned);
        assertTrue(badges.supportsInterface(0xb45a3c0e));
        assertEq(badges.tokenURI(id), 'data:application/json;utf8,{"name":"coinAI: First payment","description":"A soulbound coinAI saving badge."}');
    }
}
