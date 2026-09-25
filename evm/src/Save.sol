// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Minimal ERC20 interface used by CoinAI
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IERC4626Minimal {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

/// @title CoinAI - auto-savings on every payment, managed by a user-authorized AI agent
/// @notice The agent can only (a) tune the split inside user-set bounds and (b) move idle savings
///         into one of three immutable vaults, with vault shares always minted to the user.
///         There is no code path that lets an agent send funds anywhere but the user.
contract CoinAI {
    enum YieldTarget {
        Conservative,
        Balanced,
        Growth
    }

    enum AgentActionType {
        SetSplit,
        Invest
    }

    struct Account {
        uint16 splitBps;
        uint128 spend;
        uint128 shares;
        uint64 lockUntil;
        YieldTarget yieldTarget;
    }

    /// @notice Lifetime payment stats, so off-chain agents avoid scanning logs.
    struct Stats {
        uint128 totalReceived;
        uint64 paymentCount;
        uint64 lastPaymentAt;
    }

    struct AgentPolicy {
        address agent;
        uint16 minSplitBps;
        uint16 maxSplitBps;
        uint64 expiry;
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
    error SavingsNotZero();
    error NotAgent();
    error InvalidPolicy();
    error SplitOutOfRange();

    uint16 public constant MAX_BPS = 10_000;
    uint16 public constant DEFAULT_SPLIT_BPS = 2_000;
    uint64 public constant MAX_LOCK_DURATION = 5 * 365 days;

    address public immutable token;
    address public immutable vaultConservative;
    address public immutable vaultBalanced;
    address public immutable vaultGrowth;

    mapping(address => Account) private _accounts;
    mapping(address => bool) private _initialized;
    mapping(address => AgentPolicy) public agentOf;
    mapping(address => Stats) public statsOf;

    event PaymentRouted(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 spendAmount,
        uint256 savingsAmount,
        YieldTarget yieldTarget
    );
    event SpendWithdrawn(address indexed user, uint256 amount);
    event SavingsWithdrawn(address indexed user, uint256 shares, uint256 amountOut);
    event SavingsInvested(address indexed user, YieldTarget target, address vault, uint256 amount, uint256 vaultShares);
    event SplitSet(address indexed user, uint16 bps);
    event LockSet(address indexed user, uint64 until);
    event YieldTargetSet(address indexed user, YieldTarget target);
    event AgentSet(address indexed user, address indexed agent, uint16 minSplitBps, uint16 maxSplitBps, uint64 expiry);
    event AgentRevoked(address indexed user);
    event AgentAction(address indexed user, address indexed agent, AgentActionType action, string reason);

    constructor(address _token, address[3] memory vaults) {
        if (_token == address(0)) revert InvalidAddress();
        for (uint256 i; i < 3; ++i) if (vaults[i] == address(0)) revert InvalidAddress();
        token = _token;
        vaultConservative = vaults[0];
        vaultBalanced = vaults[1];
        vaultGrowth = vaults[2];
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function accountOf(address user) external view returns (Account memory out) {
        if (user == address(0)) revert InvalidAddress();
        out = _accounts[user];
        if (!_initialized[user]) {
            out.splitBps = DEFAULT_SPLIT_BPS;
            out.yieldTarget = YieldTarget.Balanced;
        }
    }

    function vaultOf(YieldTarget target) public view returns (address) {
        if (target == YieldTarget.Conservative) return vaultConservative;
        if (target == YieldTarget.Balanced) return vaultBalanced;
        return vaultGrowth;
    }

    // ─── Payments & user actions ─────────────────────────────────────────────

    function pay(address from, address to, uint256 amount) external {
        if (to == address(0) || from == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (msg.sender != from) revert Unauthorized();

        Account storage acc = _account(to);
        uint256 savingsAmount = (amount * acc.splitBps) / MAX_BPS;
        uint256 spendAmount = amount - savingsAmount;

        require(IERC20Minimal(token).transferFrom(from, address(this), amount), "transfer-in-failed");

        acc.spend += _toUint128(spendAmount);
        acc.shares += _toUint128(savingsAmount);

        Stats storage st = statsOf[to];
        st.totalReceived += _toUint128(amount);
        st.paymentCount += 1;
        st.lastPaymentAt = uint64(block.timestamp);

        emit PaymentRouted(from, to, amount, spendAmount, savingsAmount, acc.yieldTarget);
    }

    function withdrawSpend(address user, uint256 amount) external returns (uint256 withdrawn) {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();
        if (amount == 0) revert EmptyWithdrawal();

        Account storage acc = _account(user);
        if (amount > acc.spend) revert InsufficientSpendable();

        acc.spend -= _toUint128(amount);
        require(IERC20Minimal(token).transfer(user, amount), "transfer-out-failed");
        emit SpendWithdrawn(user, amount);
        return amount;
    }

    function withdrawSavings(address user, uint256 shares) external returns (uint256 amountOut) {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();
        if (shares == 0) revert EmptyWithdrawal();

        Account storage acc = _account(user);
        if (block.timestamp < acc.lockUntil) revert LockActive();
        if (shares > acc.shares) revert InsufficientShares();

        acc.shares -= _toUint128(shares);
        require(IERC20Minimal(token).transfer(user, shares), "transfer-out-failed");
        emit SavingsWithdrawn(user, shares, shares);
        return shares;
    }

    /// @notice Move savings into the vault for `target`; vault shares go to the caller.
    function investSavings(uint256 amount, YieldTarget target) external returns (uint256 vaultShares) {
        return _invest(msg.sender, amount, target);
    }

    function setSplit(address user, uint16 bps) external {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();
        if (bps > MAX_BPS) revert InvalidBps();

        _account(user).splitBps = bps;
        emit SplitSet(user, bps);
    }

    function setLock(address user, uint64 until) external {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();
        if (until < block.timestamp) revert LockCannotShrink();
        if (until > block.timestamp + MAX_LOCK_DURATION) revert LockTooLong();

        Account storage acc = _account(user);
        if (until < acc.lockUntil) revert LockCannotShrink();
        acc.lockUntil = until;
        emit LockSet(user, until);
    }

    function setYieldTarget(address user, YieldTarget target) external {
        if (user == address(0)) revert InvalidAddress();
        if (msg.sender != user) revert Unauthorized();

        Account storage acc = _account(user);
        if (acc.shares != 0) revert SavingsNotZero();

        acc.yieldTarget = target;
        emit YieldTargetSet(user, target);
    }

    // ─── Agent delegation ────────────────────────────────────────────────────

    function setAgent(address agent, uint16 minSplitBps, uint16 maxSplitBps, uint64 expiry) external {
        if (agent == address(0) || agent == msg.sender) revert InvalidAddress();
        if (minSplitBps > maxSplitBps || maxSplitBps > MAX_BPS || expiry <= block.timestamp) revert InvalidPolicy();

        agentOf[msg.sender] = AgentPolicy(agent, minSplitBps, maxSplitBps, expiry);
        emit AgentSet(msg.sender, agent, minSplitBps, maxSplitBps, expiry);
    }

    function revokeAgent() external {
        delete agentOf[msg.sender];
        emit AgentRevoked(msg.sender);
    }

    function agentSetSplit(address user, uint16 bps, string calldata reason) external {
        AgentPolicy memory p = _onlyAgent(user);
        if (bps < p.minSplitBps || bps > p.maxSplitBps) revert SplitOutOfRange();

        _account(user).splitBps = bps;
        emit SplitSet(user, bps);
        emit AgentAction(user, msg.sender, AgentActionType.SetSplit, reason);
    }

    function agentInvest(address user, uint256 amount, YieldTarget target, string calldata reason)
        external
        returns (uint256 vaultShares)
    {
        _onlyAgent(user);
        vaultShares = _invest(user, amount, target);
        emit AgentAction(user, msg.sender, AgentActionType.Invest, reason);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _onlyAgent(address user) private view returns (AgentPolicy memory p) {
        p = agentOf[user];
        if (p.agent == address(0) || msg.sender != p.agent || block.timestamp >= p.expiry) revert NotAgent();
    }

    function _invest(address user, uint256 amount, YieldTarget target) private returns (uint256 vaultShares) {
        if (amount == 0) revert EmptyWithdrawal();

        Account storage acc = _account(user);
        if (block.timestamp < acc.lockUntil) revert LockActive();
        if (amount > acc.shares) revert InsufficientShares();

        acc.shares -= _toUint128(amount);
        acc.yieldTarget = target;

        address vault = vaultOf(target);
        require(IERC20Minimal(token).approve(vault, amount), "approve-vault-failed");
        vaultShares = IERC4626Minimal(vault).deposit(amount, user);

        emit SavingsInvested(user, target, vault, amount, vaultShares);
    }

    function _account(address user) private returns (Account storage acc) {
        acc = _accounts[user];
        if (!_initialized[user]) {
            _initialized[user] = true;
            acc.splitBps = DEFAULT_SPLIT_BPS;
            acc.yieldTarget = YieldTarget.Balanced;
        }
    }

    function _toUint128(uint256 x) private pure returns (uint128) {
        if (x > type(uint128).max) revert AmountOverflow();
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(x);
    }
}
