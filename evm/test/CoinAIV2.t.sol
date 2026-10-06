// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/CoinAIV2.sol";
import "../src/BasketVault.sol";
import "../src/GroupFunds.sol";
import "../src/MockUSDT.sol";
import "../src/SimpleVault.sol";

/// Chainlink-style feed with a settable answer and timestamp.
contract MockFeed {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 a) {
        set(a);
    }

    function set(int256 a) public {
        answer = a;
        updatedAt = block.timestamp;
    }

    function age(uint256 secondsOld) external {
        updatedAt = block.timestamp - secondsOld;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract CoinAIV2Test is Test {
    CoinAIV2 coinai;
    BasketVault basket;
    GroupFunds funds;
    MockUSDT usdt;
    SimpleVault[3] vaults;
    MockFeed bnb;
    MockFeed btc;

    address alice = address(0xA11CE); // payer
    address bob = address(0xB0B); // saver
    address carol = address(0xCA201);
    address agent = address(0xA6E7); // the AI team's wallet, also the basket's curator
    address deployer = address(this);

    uint8 constant CONSERVATIVE = 0;
    uint8 constant BALANCED = 1;
    uint8 constant BASKET = 3;
    uint256 constant ALL = type(uint256).max;

    function setUp() public {
        vm.warp(1_700_000_000);
        usdt = new MockUSDT();
        vaults[0] = new SimpleVault(address(usdt), "Conservative", "cv", 300, 1);
        vaults[1] = new SimpleVault(address(usdt), "Balanced", "bv", 600, 2);
        vaults[2] = new SimpleVault(address(usdt), "Growth", "gv", 1200, 3);
        bnb = new MockFeed(600e8);
        btc = new MockFeed(60_000e8);

        string[] memory symbols = new string[](3);
        (symbols[0], symbols[1], symbols[2]) = ("tUSDT", "BNB", "BTC");
        address[] memory feeds = new address[](3);
        (feeds[1], feeds[2]) = (address(bnb), address(btc));
        uint16[] memory caps = new uint16[](3);
        (caps[0], caps[1], caps[2]) = (10_000, 5_000, 5_000);
        basket = new BasketVault(address(usdt), agent, symbols, feeds, caps, _w(4_000, 3_000, 3_000));
        funds = new GroupFunds(address(usdt));
        coinai = new CoinAIV2(address(usdt), [address(vaults[0]), address(vaults[1]), address(vaults[2])], address(basket), address(funds));
        basket.initCoinAI(address(coinai));

        vm.startPrank(alice);
        usdt.faucet();
        usdt.approve(address(coinai), type(uint256).max);
        vm.stopPrank();
        usdt.faucet(); // this contract plays the operator: yield drips and the basket reserve
    }

    function _w(uint16 a, uint16 b, uint16 c) internal pure returns (uint16[] memory w) {
        w = new uint16[](3);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function _pay(address to, uint256 amount) internal {
        vm.prank(alice);
        coinai.pay(alice, to, amount);
    }

    uint8 constant SPLIT = 1;
    uint8 constant INVEST = 2;
    uint8 constant PAY = 4;

    function _delegate(address user) internal {
        vm.prank(user);
        coinai.setAgent(agent, SPLIT | INVEST, 1_000, 4_000, 0, uint64(block.timestamp + 30 days));
    }

    function _positions(address user) internal view returns (uint256[4] memory) {
        return coinai.accountOf(user).positions;
    }

    // ─── Payments ────────────────────────────────────────────────────────────

    function test_pay_splitsIntoSpendAndIdle() public {
        _pay(bob, 1_000e6);
        CoinAIV2.AccountView memory a = coinai.accountOf(bob);
        assertEq(a.splitBps, 2_000);
        assertEq(a.spend, 800e6);
        assertEq(a.idle, 200e6);
        (uint128 total, uint64 count,) = coinai.statsOf(bob);
        assertEq(total, 1_000e6);
        assertEq(count, 1);
    }

    function test_payMany_routesEachRecipientWithTheirOwnSplit() public {
        vm.prank(carol);
        coinai.setSplit(carol, 5_000);
        address[] memory to = new address[](2);
        (to[0], to[1]) = (bob, carol);
        uint256[] memory amounts = new uint256[](2);
        (amounts[0], amounts[1]) = (100e6, 200e6);
        vm.prank(alice);
        coinai.payMany(to, amounts);
        assertEq(coinai.accountOf(bob).idle, 20e6);
        assertEq(coinai.accountOf(carol).idle, 100e6);
        assertEq(usdt.balanceOf(address(coinai)), 300e6);
    }

    function test_payMany_rejectsMismatchAndZero() public {
        address[] memory to = new address[](1);
        to[0] = bob;
        uint256[] memory amounts = new uint256[](2);
        vm.prank(alice);
        vm.expectRevert(CoinAIV2.InvalidAmount.selector);
        coinai.payMany(to, amounts);
        uint256[] memory zero = new uint256[](1);
        vm.prank(alice);
        vm.expectRevert(CoinAIV2.InvalidAmount.selector);
        coinai.payMany(to, zero);
    }

    // ─── Positions ───────────────────────────────────────────────────────────

    function test_investAndWithdrawVaultPosition() public {
        _pay(bob, 1_000e6);
        vm.startPrank(bob);
        coinai.investSavings(150e6, BALANCED);
        assertEq(_positions(bob)[BALANCED], 150e6);
        assertEq(coinai.accountOf(bob).idle, 50e6);
        // shares sit with CoinAI, not the user: the lock can cover them
        assertEq(vaults[1].balanceOf(bob), 0);
        assertEq(coinai.withdrawPosition(bob, BALANCED, 50e6), 50e6);
        assertEq(coinai.withdrawPosition(bob, BALANCED, ALL), 100e6);
        vm.stopPrank();
        assertEq(usdt.balanceOf(bob), 150e6);
        assertEq(_positions(bob)[BALANCED], 0);
    }

    function test_vaultYieldAccruesToThePosition() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(200e6, CONSERVATIVE);
        usdt.transfer(address(vaults[0]), 20e6); // the testnet yield simulator's drip
        assertApproxEqAbs(_positions(bob)[CONSERVATIVE], 220e6, 1);
        vm.prank(bob);
        assertApproxEqAbs(coinai.withdrawPosition(bob, CONSERVATIVE, ALL), 220e6, 1);
    }

    function test_lockCoversPositionsButAllowsMovesInsideSavings() public {
        _pay(bob, 1_000e6);
        vm.startPrank(bob);
        coinai.setLock(bob, uint64(block.timestamp + 7 days));
        coinai.investSavings(100e6, BALANCED); // still allowed: the money stays in savings
        coinai.rebalance(BALANCED, CONSERVATIVE, 40e6);
        vm.expectRevert(CoinAIV2.LockActive.selector);
        coinai.withdrawPosition(bob, BALANCED, 10e6);
        vm.expectRevert(CoinAIV2.LockActive.selector);
        coinai.withdrawSavings(bob, 10e6);
        vm.warp(block.timestamp + 7 days);
        coinai.withdrawPosition(bob, CONSERVATIVE, ALL);
        vm.stopPrank();
        assertApproxEqAbs(usdt.balanceOf(bob), 40e6, 1);
    }

    function test_onlyTheUserWithdraws() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(100e6, BALANCED);
        vm.prank(agent);
        vm.expectRevert(CoinAIV2.Unauthorized.selector);
        coinai.withdrawPosition(bob, BALANCED, ALL);
        vm.prank(agent);
        vm.expectRevert(CoinAIV2.Unauthorized.selector);
        coinai.withdrawSavings(bob, 1);
    }

    function test_unknownTargetReverts() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        vm.expectRevert(CoinAIV2.InvalidTarget.selector);
        coinai.investSavings(10e6, 4);
    }

    // ─── Agent ───────────────────────────────────────────────────────────────

    function test_agentInvestsAndRebalancesInsideTheUsersPositions() public {
        _pay(bob, 1_000e6);
        _delegate(bob);
        vm.startPrank(agent);
        coinai.agentInvest(bob, 200e6, BASKET, "risk_on: follow the AI basket");
        coinai.agentRebalance(bob, BASKET, CONSERVATIVE, 120e6, "risk_off: de-risk");
        vm.stopPrank();
        uint256[4] memory p = _positions(bob);
        assertApproxEqAbs(p[BASKET], 80e6, 1);
        assertApproxEqAbs(p[CONSERVATIVE], 120e6, 1);
        assertEq(usdt.balanceOf(agent), 0); // no path pays the agent
    }

    function test_agentNeedsAPolicyAndRespectsSplitBounds() public {
        _pay(bob, 1_000e6);
        vm.prank(agent);
        vm.expectRevert(CoinAIV2.NotAgent.selector);
        coinai.agentInvest(bob, 10e6, BALANCED, "x");
        _delegate(bob);
        vm.startPrank(agent);
        vm.expectRevert(CoinAIV2.SplitOutOfRange.selector);
        coinai.agentSetSplit(bob, 5_000, "too much");
        coinai.agentSetSplit(bob, 3_000, "steady salary");
        vm.stopPrank();
        assertEq(coinai.accountOf(bob).splitBps, 3_000);
        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        vm.expectRevert(CoinAIV2.NotAgent.selector);
        coinai.agentRebalance(bob, BALANCED, CONSERVATIVE, 1, "expired");
    }

    // ─── AI Smart Money basket ───────────────────────────────────────────────

    function test_basketBuysAtTheSmartWeightsAndFollowsPrices() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(100e6, BASKET);
        uint256[] memory units = basket.unitsOf(bob);
        assertEq(units[0], 40e18); // 40 tUSDT
        assertEq(units[1], 0.05e18); // 30 USD of BNB at 600
        assertEq(units[2], 0.0005e18); // 30 USD of BTC at 60,000
        bnb.set(900e8); // BNB +50% → +15 on the 30 held
        assertEq(_positions(bob)[BASKET], 115e6);
        btc.set(30_000e8); // BTC −50% → −15
        assertEq(_positions(bob)[BASKET], 100e6);
    }

    function test_curatorWeightsAreCappedOnChain() public {
        vm.startPrank(agent);
        vm.expectRevert(BasketVault.InvalidWeights.selector);
        basket.setSmartWeights(_w(500, 4_750, 4_750), "stable under 10%");
        vm.expectRevert(BasketVault.InvalidWeights.selector);
        basket.setSmartWeights(_w(1_000, 6_000, 3_000), "BNB over its 50% cap");
        vm.expectRevert(BasketVault.InvalidWeights.selector);
        basket.setSmartWeights(_w(1_000, 3_000, 3_000), "doesn't sum to 100%");
        basket.setSmartWeights(_w(6_000, 2_000, 2_000), "risk_off");
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(BasketVault.Unauthorized.selector);
        basket.setSmartWeights(_w(4_000, 3_000, 3_000), "not the curator");
        assertEq(basket.smartEpoch(), 2);
    }

    function test_followersMoveToNewSmartWeightsKeepingValue() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(100e6, BASKET);
        vm.prank(agent);
        basket.setSmartWeights(_w(8_000, 1_000, 1_000), "risk_off: mostly stable");
        basket.sync(bob);
        assertEq(basket.unitsOf(bob)[0], 80e18);
        // units round down on every buy, so re-weighting may drop a few micro-tUSDT, never add
        assertApproxEqAbs(_positions(bob)[BASKET], 100e6, 3);
        assertLe(_positions(bob)[BASKET], 100e6);
    }

    function test_customMixIgnoresTheCurator() public {
        _pay(bob, 1_000e6);
        vm.startPrank(bob);
        basket.setWeights(_w(1_000, 5_000, 4_000));
        coinai.investSavings(100e6, BASKET);
        vm.stopPrank();
        vm.prank(agent);
        basket.setSmartWeights(_w(9_000, 500, 500), "risk_off");
        basket.sync(bob);
        (uint16[] memory w, bool custom) = basket.weightsOf(bob);
        assertTrue(custom);
        assertEq(w[1], 5_000);
        assertEq(basket.unitsOf(bob)[0], 10e18);
    }

    function test_staleOracleBlocksBuyingButNeverSelling() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(100e6, BASKET);
        vm.prank(agent);
        basket.setSmartWeights(_w(9_000, 500, 500), "pending sync");
        btc.age(2 days);
        vm.prank(bob);
        vm.expectRevert(BasketVault.StalePrice.selector);
        coinai.investSavings(10e6, BASKET);
        vm.prank(bob);
        assertEq(coinai.withdrawPosition(bob, BASKET, 50e6), 50e6); // sync skipped, sale at the last price
        assertEq(_positions(bob)[BASKET], 50e6);
    }

    function test_basketGainsArePaidFromTheReserve() public {
        _pay(bob, 1_000e6);
        vm.prank(bob);
        coinai.investSavings(100e6, BASKET);
        bnb.set(1_200e8); // +30 on paper; the vault only holds the 100 deposited
        vm.prank(bob);
        vm.expectRevert(); // MockUSDT: insufficient balance
        coinai.withdrawPosition(bob, BASKET, ALL);
        usdt.transfer(address(basket), 30e6); // the operator tops up the reserve
        vm.prank(bob);
        assertEq(coinai.withdrawPosition(bob, BASKET, ALL), 130e6);
        assertEq(usdt.balanceOf(bob), 130e6);
    }

    function test_basketOnlyTakesDepositsFromCoinAI() public {
        vm.prank(alice);
        vm.expectRevert(BasketVault.Unauthorized.selector);
        basket.deposit(alice, 1);
        vm.expectRevert(BasketVault.AlreadyInitialized.selector);
        basket.initCoinAI(address(1));
    }

    // ─── Scoped skills, several agents, the pay skill ────────────────────────

    function test_eachAgentOnlyHasTheSkillsItWasGranted() public {
        address hermes = address(0x4E12);
        _pay(bob, 1_000e6);
        vm.startPrank(bob);
        coinai.setAgent(agent, INVEST, 0, 0, 0, uint64(block.timestamp + 30 days));
        coinai.setAgent(hermes, PAY, 0, 0, 50e6, uint64(block.timestamp + 30 days));
        vm.stopPrank();
        (address[] memory list,) = coinai.agentsOf(bob);
        assertEq(list.length, 2);

        vm.prank(agent);
        vm.expectRevert(CoinAIV2.NotAgent.selector); // INVEST only: no split
        coinai.agentSetSplit(bob, 1_000, "x");
        vm.prank(hermes);
        vm.expectRevert(CoinAIV2.NotAgent.selector); // PAY only: can't touch savings
        coinai.agentInvest(bob, 10e6, BALANCED, "x");
        vm.prank(agent);
        coinai.agentInvest(bob, 10e6, BALANCED, "ok");

        vm.prank(bob);
        coinai.revokeAgent(agent);
        (list,) = coinai.agentsOf(bob);
        assertEq(list.length, 1);
        assertEq(list[0], hermes);
        vm.prank(agent);
        vm.expectRevert(CoinAIV2.NotAgent.selector);
        coinai.agentInvest(bob, 1e6, BALANCED, "revoked");
    }

    function test_payAgentPaysDuesOnlyIntoJoinedFundsWithinBudget() public {
        address hermes = address(0x4E12);
        _pay(bob, 1_000e6); // bob: 800 spendable
        vm.prank(carol);
        uint256 kas = funds.create(GroupFunds.Kind.Iuran, carol, "Kas RT 05", 0, 0, 20e6, 30 days);
        vm.prank(alice);
        uint256 scam = funds.create(GroupFunds.Kind.Donasi, alice, "Not bob's", 0, 0, 0, 0);
        vm.startPrank(bob);
        funds.join(kas);
        coinai.setAgent(hermes, PAY, 0, 0, 40e6, uint64(block.timestamp + 90 days));
        vm.stopPrank();

        vm.startPrank(hermes);
        coinai.agentContribute(bob, kas, 20e6, "October dues");
        vm.expectRevert(CoinAIV2.NotMember.selector); // bob never joined it
        coinai.agentContribute(bob, scam, 1e6, "drain");
        coinai.agentContribute(bob, kas, 20e6, "November dues");
        vm.expectRevert(CoinAIV2.OverBudget.selector); // 40 per 30 days
        coinai.agentContribute(bob, kas, 20e6, "December dues");
        vm.stopPrank();

        assertEq(coinai.accountOf(bob).spend, 760e6);
        (uint256 paid,) = funds.duesOf(kas, bob);
        assertEq(paid, 2);
        vm.warp(block.timestamp + 30 days); // a new budget window
        vm.prank(hermes);
        coinai.agentContribute(bob, kas, 20e6, "December dues");
        assertEq(usdt.balanceOf(hermes), 0);
    }

    function test_userPaysAFundFromTheirSpendableBalance() public {
        _pay(bob, 1_000e6);
        vm.prank(carol);
        uint256 id = funds.create(GroupFunds.Kind.Donasi, carol, "Banjir Bekasi", 500e6, 0, 0, 0);
        vm.prank(bob);
        coinai.contributeFromSpend(id, 25e6, "Semoga cepat pulih");
        assertEq(coinai.accountOf(bob).spend, 775e6);
        assertEq(funds.contributedOf(id, bob), 25e6);
        assertFalse(funds.isMember(id, bob)); // paying never enrols anyone
        vm.prank(bob);
        vm.expectRevert(CoinAIV2.InsufficientSpendable.selector);
        coinai.contributeFromSpend(id, 10_000e6, "too much");
    }
}
