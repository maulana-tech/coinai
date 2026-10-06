// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20Funds {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title GroupFunds - money a group puts together, in the open
/// @notice Three kinds, all in tUSDT and all readable by anyone:
///         - Patungan: chip in for an event or a gift. All or nothing: the organizer can take the money only once
///           the target is reached; if the deadline passes short of it (or the organizer cancels), everyone takes
///           their share back.
///         - Iuran: recurring dues (class fund, neighbourhood fund, community). Members join, each period they owe
///           `dues`, and everyone can see who is paid up.
///         - Donasi: open fundraising for a cause; the beneficiary is fixed when the fund is created.
///         Money only ever leaves to the fund's beneficiary (with a memo, on-chain) or back to the people who put
///         it in (refunds). Contributions carry a short message, so the fund page reads like a feed.
contract GroupFunds {
    enum Kind {
        Patungan,
        Iuran,
        Donasi
    }

    struct Fund {
        address organizer;
        address beneficiary;
        Kind kind;
        bool cancelled;
        uint64 start;
        uint64 deadline; // 0 = none (Iuran never has one)
        uint64 period; // Iuran: seconds per period
        uint128 target; // Patungan: required; Donasi: optional goal; Iuran: 0
        uint128 dues; // Iuran: owed per member per period
        uint128 raised; // net of refunds
        uint128 withdrawn;
        uint32 contributors;
        uint32 members;
        string title;
    }

    error InvalidFund();
    error NotFound();
    error Unauthorized();
    error Closed();
    error NotMember();
    error InvalidAmount();
    error TargetNotReached();
    error NothingToRefund();
    error TransferFailed();
    error TooLong();

    uint256 public constant MAX_TITLE = 64;
    uint256 public constant MAX_MESSAGE = 140;
    uint256 public constant MAX_PREPAID_PERIODS = 12;

    IERC20Funds public immutable token;
    Fund[] private _funds;
    mapping(uint256 => mapping(address => uint256)) public contributedOf;
    mapping(uint256 => mapping(address => uint64)) public joinedAt; // 0 = not a member
    mapping(uint256 => mapping(address => uint32)) public periodsPaid;

    event FundCreated(uint256 indexed id, address indexed organizer, Kind kind, address beneficiary, string title);
    event Joined(uint256 indexed id, address indexed member);
    event Contributed(uint256 indexed id, address indexed payer, address indexed member, uint256 amount, string message);
    event Withdrawn(uint256 indexed id, address to, uint256 amount, string memo);
    event Refunded(uint256 indexed id, address indexed member, uint256 amount);
    event Cancelled(uint256 indexed id);

    constructor(address token_) {
        token = IERC20Funds(token_);
    }

    // ─── Organizer ───────────────────────────────────────────────────────────

    function create(
        Kind kind,
        address beneficiary,
        string calldata title,
        uint128 target,
        uint64 deadline,
        uint128 dues,
        uint64 period
    ) external returns (uint256 id) {
        uint256 len = bytes(title).length;
        if (beneficiary == address(0) || len == 0 || len > MAX_TITLE) revert InvalidFund();
        if (kind == Kind.Patungan && (target == 0 || deadline <= block.timestamp)) revert InvalidFund();
        if (kind == Kind.Iuran && (dues == 0 || period < 1 days || deadline != 0 || target != 0)) revert InvalidFund();
        if (kind != Kind.Iuran && (dues != 0 || period != 0)) revert InvalidFund();
        if (kind == Kind.Donasi && deadline != 0 && deadline <= block.timestamp) revert InvalidFund();

        id = _funds.length;
        Fund storage f = _funds.push();
        f.organizer = msg.sender;
        f.beneficiary = beneficiary;
        f.kind = kind;
        f.start = uint64(block.timestamp);
        f.deadline = deadline;
        f.period = period;
        f.target = target;
        f.dues = dues;
        f.title = title;
        emit FundCreated(id, msg.sender, kind, beneficiary, title);
    }

    /// @notice Sends money to the beneficiary with a memo saying what for. A Patungan pays out only once it reached its target.
    function withdraw(uint256 id, uint256 amount, string calldata memo) external {
        Fund storage f = _fund(id);
        if (msg.sender != f.organizer) revert Unauthorized();
        if (f.kind == Kind.Patungan && (f.cancelled || f.raised < f.target)) revert TargetNotReached();
        if (amount == 0 || amount > f.raised - f.withdrawn) revert InvalidAmount();
        f.withdrawn += uint128(amount);
        if (!token.transfer(f.beneficiary, amount)) revert TransferFailed();
        emit Withdrawn(id, f.beneficiary, amount, _text(memo));
    }

    /// @notice Stops new contributions. A Patungan can only be cancelled before it paid out, and then refunds open.
    function cancel(uint256 id) external {
        Fund storage f = _fund(id);
        if (msg.sender != f.organizer) revert Unauthorized();
        if (f.cancelled) revert Closed();
        if (f.kind == Kind.Patungan && f.withdrawn != 0) revert Closed();
        f.cancelled = true;
        emit Cancelled(id);
    }

    // ─── Members & contributors ──────────────────────────────────────────────

    /// @notice Joining is always the member's own transaction: an agent with the pay skill may only pay into funds its
    ///         user joined, so nobody can enrol someone else in a fund that drains them.
    function join(uint256 id) external {
        Fund storage f = _fund(id);
        if (f.cancelled) revert Closed();
        if (joinedAt[id][msg.sender] != 0) return;
        joinedAt[id][msg.sender] = uint64(block.timestamp);
        f.members += 1;
        emit Joined(id, msg.sender);
    }

    function contribute(uint256 id, uint256 amount, string calldata message) external {
        _contribute(id, msg.sender, amount, message);
    }

    /// @notice Pays on someone's behalf (CoinAI from their spendable balance, or a friend covering their dues).
    ///         Never makes them a member.
    function contributeFor(uint256 id, address member, uint256 amount, string calldata message) external {
        _contribute(id, member, amount, message);
    }

    /// @notice Patungan only: your share back once it failed (deadline passed short of the target) or was cancelled.
    function refund(uint256 id) external returns (uint256 amount) {
        Fund storage f = _fund(id);
        bool failed = f.cancelled || (block.timestamp > f.deadline && f.raised < f.target);
        if (f.kind != Kind.Patungan || !failed) revert Closed();
        amount = contributedOf[id][msg.sender];
        if (amount == 0) revert NothingToRefund();
        contributedOf[id][msg.sender] = 0;
        f.raised -= uint128(amount);
        if (!token.transfer(msg.sender, amount)) revert TransferFailed();
        emit Refunded(id, msg.sender, amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function fundCount() external view returns (uint256) {
        return _funds.length;
    }

    function fund(uint256 id) external view returns (Fund memory) {
        return _fund(id);
    }

    function isMember(uint256 id, address who) external view returns (bool) {
        return joinedAt[id][who] != 0;
    }

    /// @notice Iuran: periods paid and periods owed so far (since the period the member joined in, current one included).
    function duesOf(uint256 id, address member) external view returns (uint256 paid, uint256 owed) {
        Fund storage f = _fund(id);
        uint64 joined = joinedAt[id][member];
        if (f.kind != Kind.Iuran || joined == 0) return (0, 0);
        return (periodsPaid[id][member], _periodIndex(f, block.timestamp) - _periodIndex(f, joined) + 1);
    }

    function currentPeriod(uint256 id) external view returns (uint256) {
        Fund storage f = _fund(id);
        return f.kind == Kind.Iuran ? _periodIndex(f, block.timestamp) : 0;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _contribute(uint256 id, address member, uint256 amount, string calldata message) private {
        Fund storage f = _fund(id);
        if (f.cancelled || (f.deadline != 0 && block.timestamp > f.deadline)) revert Closed();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (f.kind == Kind.Iuran) {
            uint64 joined = joinedAt[id][member];
            if (joined == 0) revert NotMember();
            if (amount % f.dues != 0) revert InvalidAmount();
            uint256 paid = periodsPaid[id][member] + amount / f.dues;
            uint256 owedSoFar = _periodIndex(f, block.timestamp) - _periodIndex(f, joined) + 1;
            if (paid > owedSoFar + MAX_PREPAID_PERIODS) revert InvalidAmount();
            periodsPaid[id][member] = uint32(paid);
        }
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        if (contributedOf[id][member] == 0) f.contributors += 1;
        contributedOf[id][member] += amount;
        f.raised += uint128(amount);
        emit Contributed(id, msg.sender, member, amount, _text(message));
    }

    function _fund(uint256 id) private view returns (Fund storage) {
        if (id >= _funds.length) revert NotFound();
        return _funds[id];
    }

    function _periodIndex(Fund storage f, uint256 t) private view returns (uint256) {
        return (t - f.start) / f.period;
    }

    /// @dev Rejected rather than cut: cutting bytes could split a multi-byte character.
    function _text(string calldata s) private pure returns (string calldata) {
        if (bytes(s).length > MAX_MESSAGE) revert TooLong();
        return s;
    }
}
