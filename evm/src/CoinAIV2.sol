// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20V2 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IVaultV2 {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
}

interface IBasketV2 {
    function deposit(address user, uint256 amount) external;
    function withdraw(address user, uint256 amount, address to) external;
    function withdrawAll(address user, address to) external returns (uint256);
    function valueOf(address user) external view returns (uint256);
}

interface IGroupFundsV2 {
    function contributeFor(uint256 id, address member, uint256 amount, string calldata message) external;
    function isMember(uint256 id, address who) external view returns (bool);
}

/// @title CoinAI v2 - auto-savings on every payment, with AI agents that hold scoped, time-boxed skills
/// @notice Savings live inside this contract: idle tUSDT, shares of three yield vaults held for the user, and the
///         user's "AI Smart Money" basket (BasketVault). A user can authorize several agents (their own team, or
///         ones hired through AgentRegistry), each with its own skills and limits:
///         - SPLIT:  set the savings split, inside the user's range;
///         - INVEST: put idle savings into a position and move value between the user's own positions;
///         - PAY:    pay the user's group dues / contributions (GroupFunds) from their spendable balance, only into
///                   funds the user joined, and only up to a budget per 30 days.
///         Savings never leave except to the user, and the savings lock covers every position.
/// @dev Targets: 0 Conservative, 1 Balanced, 2 Growth (yield vaults), 3 Basket. Event signatures shared with v1
///      (PaymentRouted, SavingsInvested, AgentAction, ...) keep the same layout so the app reads both.
contract CoinAIV2 {
    enum AgentActionType {
        SetSplit,
        Invest,
        Rebalance,
        Contribute
    }

    struct Account {
        uint16 splitBps;
        uint128 spend;
        uint128 idle; // savings not in any position, 1:1 tUSDT
        uint64 lockUntil;
    }

    /// @dev `accountOf` result: positions are what each target is worth now, in tUSDT.
    struct AccountView {
        uint16 splitBps;
        uint128 spend;
        uint128 idle;
        uint64 lockUntil;
        uint256[4] positions;
        uint256[3] vaultShares;
    }

    struct Stats {
        uint128 totalReceived;
        uint64 paymentCount;
        uint64 lastPaymentAt;
    }

    struct AgentPolicy {
        uint8 skills; // SKILL_* bits
        uint16 minSplitBps;
        uint16 maxSplitBps;
        uint64 expiry;
        uint128 payBudget; // PAY: tUSDT per 30-day window
        uint64 windowStart;
        uint128 paidInWindow;
    }

    error InvalidAddress();
    error InvalidAmount();
    error InvalidBps();
    error AmountOverflow();
    error InsufficientSpendable();
    error InsufficientShares();
    error EmptyWithdrawal();
    error Unauthorized();
    error LockActive();
    error LockCannotShrink();
    error LockTooLong();
    error NotAgent();
    error InvalidPolicy();
    error SplitOutOfRange();
    error InvalidTarget();
    error TooManyRecipients();
    error TransferFailed();
    error TooManyAgents();
    error NotMember();
    error OverBudget();

    uint16 public constant MAX_BPS = 10_000;
    uint16 public constant DEFAULT_SPLIT_BPS = 2_000;
    uint64 public constant MAX_LOCK_DURATION = 5 * 365 days;
    uint8 public constant BASKET = 3;
    /// @dev PaymentRouted keeps v1's yieldTarget slot; v2 has no default target, so it carries this.
    uint8 private constant NO_TARGET = type(uint8).max;
    uint256 public constant MAX_RECIPIENTS = 50;
    uint8 public constant SKILL_SPLIT = 1;
    uint8 public constant SKILL_INVEST = 2;
    uint8 public constant SKILL_PAY = 4;
    uint256 public constant MAX_AGENTS = 8;
    uint64 public constant PAY_WINDOW = 30 days;
    /// @notice `withdrawPosition` / `rebalance` amount meaning "everything in that position".
    uint256 public constant ALL = type(uint256).max;

    IERC20V2 public immutable token;
    IVaultV2 public immutable vaultConservative;
    IVaultV2 public immutable vaultBalanced;
    IVaultV2 public immutable vaultGrowth;
    IBasketV2 public immutable basket;
    IGroupFundsV2 public immutable groupFunds;

    mapping(address => Account) private _accounts;
    mapping(address => bool) private _initialized;
    mapping(address => uint256[3]) private _shares; // vault shares this contract holds for each user
    mapping(address => mapping(address => AgentPolicy)) public policyOf; // user => agent => policy
    mapping(address => address[]) private _agents; // every agent the user authorized and hasn't revoked
    mapping(address => Stats) public statsOf;

    event PaymentRouted(address indexed from, address indexed to, uint256 amount, uint256 spendAmount, uint256 savingsAmount, uint8 yieldTarget);
    event SpendWithdrawn(address indexed user, uint256 amount);
    event SavingsWithdrawn(address indexed user, uint256 shares, uint256 amountOut);
    event SavingsInvested(address indexed user, uint8 target, address vault, uint256 amount, uint256 vaultShares);
    event PositionWithdrawn(address indexed user, uint8 indexed target, uint256 amount);
    event PositionMoved(address indexed user, uint8 from, uint8 to, uint256 amount);
    event SplitSet(address indexed user, uint16 bps);
    event LockSet(address indexed user, uint64 until);
    event AgentSet(address indexed user, address indexed agent, uint8 skills, uint16 minSplitBps, uint16 maxSplitBps, uint128 payBudget, uint64 expiry);
    event AgentRevoked(address indexed user, address indexed agent);
    event FundContributed(address indexed user, uint256 indexed fundId, uint256 amount);
    event AgentAction(address indexed user, address indexed agent, uint8 action, string reason);

    constructor(address token_, address[3] memory vaults, address basket_, address groupFunds_) {
        if (token_ == address(0) || basket_ == address(0) || groupFunds_ == address(0)) revert InvalidAddress();
        for (uint256 i; i < 3; ++i) if (vaults[i] == address(0)) revert InvalidAddress();
        token = IERC20V2(token_);
        vaultConservative = IVaultV2(vaults[0]);
        vaultBalanced = IVaultV2(vaults[1]);
        vaultGrowth = IVaultV2(vaults[2]);
        basket = IBasketV2(basket_);
        groupFunds = IGroupFundsV2(groupFunds_);
        for (uint256 i; i < 3; ++i) IERC20V2(token_).approve(vaults[i], type(uint256).max);
        IERC20V2(token_).approve(basket_, type(uint256).max);
        IERC20V2(token_).approve(groupFunds_, type(uint256).max);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function accountOf(address user) external view returns (AccountView memory out) {
        if (user == address(0)) revert InvalidAddress();
        Account memory acc = _accounts[user];
        out.splitBps = _initialized[user] ? acc.splitBps : DEFAULT_SPLIT_BPS;
        out.spend = acc.spend;
        out.idle = acc.idle;
        out.lockUntil = acc.lockUntil;
        out.vaultShares = _shares[user];
        for (uint8 t; t <= BASKET; ++t) out.positions[t] = _positionValue(user, t);
    }

    /// @notice Every agent the user authorized (expired ones included until revoked) and its policy.
    function agentsOf(address user) external view returns (address[] memory agents, AgentPolicy[] memory policies) {
        agents = _agents[user];
        policies = new AgentPolicy[](agents.length);
        for (uint256 i; i < agents.length; ++i) policies[i] = policyOf[user][agents[i]];
    }

    function vaultOf(uint8 target) public view returns (address) {
        if (target == 0) return address(vaultConservative);
        if (target == 1) return address(vaultBalanced);
        if (target == 2) return address(vaultGrowth);
        if (target == BASKET) return address(basket);
        revert InvalidTarget();
    }

    // ─── Payments ────────────────────────────────────────────────────────────

    function pay(address from, address to, uint256 amount) external {
        if (from == address(0)) revert InvalidAddress();
        if (msg.sender != from) revert Unauthorized();
        if (amount == 0) revert InvalidAmount();
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
        _route(from, to, amount);
    }

    /// @notice One payer, many recipients (payroll, gig payouts): each recipient's own split applies.
    function payMany(address[] calldata to, uint256[] calldata amounts) external {
        if (to.length != amounts.length || to.length == 0) revert InvalidAmount();
        if (to.length > MAX_RECIPIENTS) revert TooManyRecipients();
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            if (amounts[i] == 0) revert InvalidAmount();
            total += amounts[i];
        }
        if (!token.transferFrom(msg.sender, address(this), total)) revert TransferFailed();
        for (uint256 i; i < to.length; ++i) _route(msg.sender, to[i], amounts[i]);
    }

    // ─── User actions ────────────────────────────────────────────────────────

    function withdrawSpend(address user, uint256 amount) external returns (uint256) {
        _onlyUser(user);
        if (amount == 0) revert EmptyWithdrawal();
        Account storage acc = _account(user);
        if (amount > acc.spend) revert InsufficientSpendable();
        acc.spend -= _u128(amount);
        if (!token.transfer(user, amount)) revert TransferFailed();
        emit SpendWithdrawn(user, amount);
        return amount;
    }

    /// @notice Idle savings back to the wallet, 1:1. Blocked while locked.
    function withdrawSavings(address user, uint256 amount) external returns (uint256) {
        _onlyUser(user);
        if (amount == 0) revert EmptyWithdrawal();
        Account storage acc = _account(user);
        if (block.timestamp < acc.lockUntil) revert LockActive();
        if (amount > acc.idle) revert InsufficientShares();
        acc.idle -= _u128(amount);
        if (!token.transfer(user, amount)) revert TransferFailed();
        emit SavingsWithdrawn(user, amount, amount);
        return amount;
    }

    /// @notice A position back to the wallet: `amount` tUSDT, or ALL. Blocked while locked.
    function withdrawPosition(address user, uint8 target, uint256 amount) external returns (uint256 out) {
        _onlyUser(user);
        if (block.timestamp < _account(user).lockUntil) revert LockActive();
        out = _exit(user, target, amount, user);
        emit PositionWithdrawn(user, target, out);
    }

    /// @notice Idle savings into a position. Allowed while locked: the money stays in savings.
    function investSavings(uint256 amount, uint8 target) external returns (uint256) {
        return _invest(msg.sender, amount, target);
    }

    /// @notice Moves value between the user's own positions (ALL for everything). Allowed while locked.
    function rebalance(uint8 from, uint8 to, uint256 amount) external returns (uint256) {
        return _move(msg.sender, from, to, amount);
    }

    /// @notice Pays group dues or a contribution (GroupFunds) from the spendable balance inside coinAI.
    function contributeFromSpend(uint256 fundId, uint256 amount, string calldata message) external {
        _contribute(msg.sender, fundId, amount, message);
    }

    function setSplit(address user, uint16 bps) external {
        _onlyUser(user);
        if (bps > MAX_BPS) revert InvalidBps();
        _account(user).splitBps = bps;
        emit SplitSet(user, bps);
    }

    function setLock(address user, uint64 until) external {
        _onlyUser(user);
        Account storage acc = _account(user);
        if (until < block.timestamp || until < acc.lockUntil) revert LockCannotShrink();
        if (until > block.timestamp + MAX_LOCK_DURATION) revert LockTooLong();
        acc.lockUntil = until;
        emit LockSet(user, until);
    }

    // ─── Agent delegation ────────────────────────────────────────────────────

    /// @notice Grants (or replaces) one agent's skills and limits. Up to MAX_AGENTS agents at a time.
    function setAgent(address agent, uint8 skills, uint16 minSplitBps, uint16 maxSplitBps, uint128 payBudget, uint64 expiry)
        external
    {
        if (agent == address(0) || agent == msg.sender) revert InvalidAddress();
        if (skills == 0 || skills > (SKILL_SPLIT | SKILL_INVEST | SKILL_PAY) || expiry <= block.timestamp) revert InvalidPolicy();
        if (minSplitBps > maxSplitBps || maxSplitBps > MAX_BPS) revert InvalidPolicy();
        AgentPolicy storage p = policyOf[msg.sender][agent];
        if (p.skills == 0) {
            if (_agents[msg.sender].length >= MAX_AGENTS) revert TooManyAgents();
            _agents[msg.sender].push(agent);
        }
        (p.skills, p.minSplitBps, p.maxSplitBps, p.payBudget, p.expiry) = (skills, minSplitBps, maxSplitBps, payBudget, expiry);
        emit AgentSet(msg.sender, agent, skills, minSplitBps, maxSplitBps, payBudget, expiry);
    }

    function revokeAgent(address agent) external {
        if (policyOf[msg.sender][agent].skills == 0) revert NotAgent();
        delete policyOf[msg.sender][agent];
        address[] storage list = _agents[msg.sender];
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == agent) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        emit AgentRevoked(msg.sender, agent);
    }

    function agentSetSplit(address user, uint16 bps, string calldata reason) external {
        AgentPolicy storage p = _onlyAgent(user, SKILL_SPLIT);
        if (bps < p.minSplitBps || bps > p.maxSplitBps) revert SplitOutOfRange();
        _account(user).splitBps = bps;
        emit SplitSet(user, bps);
        emit AgentAction(user, msg.sender, uint8(AgentActionType.SetSplit), reason);
    }

    function agentInvest(address user, uint256 amount, uint8 target, string calldata reason) external returns (uint256 out) {
        _onlyAgent(user, SKILL_INVEST);
        out = _invest(user, amount, target);
        emit AgentAction(user, msg.sender, uint8(AgentActionType.Invest), reason);
    }

    /// @notice The agent moves value between the user's positions, e.g. out of the basket on a risk-off read.
    function agentRebalance(address user, uint8 from, uint8 to, uint256 amount, string calldata reason) external returns (uint256 out) {
        _onlyAgent(user, SKILL_INVEST);
        out = _move(user, from, to, amount);
        emit AgentAction(user, msg.sender, uint8(AgentActionType.Rebalance), reason);
    }

    /// @notice A pay agent (e.g. one hired to keep dues current) pays into a fund the user joined, within its budget.
    function agentContribute(address user, uint256 fundId, uint256 amount, string calldata reason) external {
        AgentPolicy storage p = _onlyAgent(user, SKILL_PAY);
        if (!groupFunds.isMember(fundId, user)) revert NotMember();
        if (block.timestamp >= p.windowStart + PAY_WINDOW) (p.windowStart, p.paidInWindow) = (uint64(block.timestamp), 0);
        if (p.paidInWindow + amount > p.payBudget) revert OverBudget();
        p.paidInWindow += _u128(amount);
        _contribute(user, fundId, amount, reason);
        emit AgentAction(user, msg.sender, uint8(AgentActionType.Contribute), reason);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _route(address from, address to, uint256 amount) private {
        if (to == address(0)) revert InvalidAddress();
        Account storage acc = _account(to);
        uint256 saved = (amount * acc.splitBps) / MAX_BPS;
        acc.spend += _u128(amount - saved);
        acc.idle += _u128(saved);
        Stats storage st = statsOf[to];
        st.totalReceived += _u128(amount);
        st.paymentCount += 1;
        st.lastPaymentAt = uint64(block.timestamp);
        emit PaymentRouted(from, to, amount, amount - saved, saved, NO_TARGET);
    }

    function _contribute(address user, uint256 fundId, uint256 amount, string calldata message) private {
        if (amount == 0) revert InvalidAmount();
        Account storage acc = _account(user);
        if (amount > acc.spend) revert InsufficientSpendable();
        acc.spend -= _u128(amount);
        groupFunds.contributeFor(fundId, user, amount, message);
        emit FundContributed(user, fundId, amount);
    }

    function _invest(address user, uint256 amount, uint8 target) private returns (uint256 out) {
        if (amount == 0) revert EmptyWithdrawal();
        Account storage acc = _account(user);
        if (amount > acc.idle) revert InsufficientShares();
        acc.idle -= _u128(amount);
        out = _enter(user, target, amount);
        emit SavingsInvested(user, target, vaultOf(target), amount, out);
    }

    function _move(address user, uint8 from, uint8 to, uint256 amount) private returns (uint256 moved) {
        if (from == to) revert InvalidTarget();
        vaultOf(to); // reverts on an unknown target before anything moves
        moved = _exit(user, from, amount, address(this));
        _enter(user, to, moved);
        emit PositionMoved(user, from, to, moved);
    }

    /// @dev tUSDT into a position held for `user`; returns vault shares (yield vaults) or the amount (basket).
    function _enter(address user, uint8 target, uint256 amount) private returns (uint256) {
        if (target == BASKET) {
            basket.deposit(user, amount);
            return amount;
        }
        uint256 shares = IVaultV2(vaultOf(target)).deposit(amount, address(this));
        _shares[user][target] += shares;
        return shares;
    }

    /// @dev Takes `amount` tUSDT (or ALL) out of a position to `to`; returns the tUSDT that came out.
    function _exit(address user, uint8 target, uint256 amount, address to) private returns (uint256 out) {
        if (amount == 0) revert EmptyWithdrawal();
        if (target == BASKET) {
            if (amount == ALL) return basket.withdrawAll(user, to);
            basket.withdraw(user, amount, to);
            return amount;
        }
        IVaultV2 vault = IVaultV2(vaultOf(target));
        uint256 held = _shares[user][target];
        uint256 shares = amount == ALL ? held : _sharesFor(vault, amount);
        if (shares == 0 || shares > held) revert InsufficientShares();
        _shares[user][target] = held - shares;
        out = vault.redeem(shares, to, address(this));
    }

    /// @dev Shares worth at least `amount`, rounded up so the user never gets less than asked.
    function _sharesFor(IVaultV2 vault, uint256 amount) private view returns (uint256 shares) {
        shares = vault.convertToShares(amount);
        if (vault.convertToAssets(shares) < amount) shares += 1;
    }

    function _positionValue(address user, uint8 target) private view returns (uint256) {
        if (target == BASKET) return basket.valueOf(user);
        uint256 shares = _shares[user][target];
        return shares == 0 ? 0 : IVaultV2(vaultOf(target)).convertToAssets(shares);
    }

    function _onlyUser(address user) private view {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();
    }

    function _onlyAgent(address user, uint8 skill) private view returns (AgentPolicy storage p) {
        p = policyOf[user][msg.sender];
        if (p.skills & skill == 0 || block.timestamp >= p.expiry) revert NotAgent();
    }

    function _account(address user) private returns (Account storage acc) {
        acc = _accounts[user];
        if (!_initialized[user]) {
            _initialized[user] = true;
            acc.splitBps = DEFAULT_SPLIT_BPS;
        }
    }

    function _u128(uint256 x) private pure returns (uint128) {
        if (x > type(uint128).max) revert AmountOverflow();
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(x);
    }
}
