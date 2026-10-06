// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20Registry {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title AgentRegistry - agent skills anyone can hire for a while
/// @notice An operator lists an agent wallet with the skills it offers (the same bits CoinAI v2 grants: split,
///         invest, pay) and a fee per 30 days. Hiring pays the operator and records until when the hirer rented it.
///         The registry moves no savings: what an agent may actually do is what the hirer then grants it in CoinAI
///         v2 (skills, split range, pay budget, expiry), and CoinAI enforces that on every call.
contract AgentRegistry {
    struct Listing {
        address operator; // gets the fees, can edit the listing
        address agent; // the wallet that will act for hirers
        uint8 skills; // CoinAI v2 skill bits
        bool active;
        uint64 hires;
        uint128 feePer30Days; // tUSDT, 6 decimals; 0 = free
        string name;
        string description;
    }

    error Unauthorized();
    error InvalidListing();
    error Inactive();
    error InvalidPeriods();
    error TransferFailed();

    uint64 public constant PERIOD = 30 days;
    uint8 public constant MAX_PERIODS = 12;
    uint8 public constant ALL_SKILLS = 7;

    IERC20Registry public immutable token;
    Listing[] private _listings;
    mapping(address => mapping(uint256 => uint64)) public rentedUntil; // hirer => listing => unix seconds

    event Listed(uint256 indexed id, address indexed operator, address indexed agent, uint8 skills, uint128 feePer30Days, string name);
    event Updated(uint256 indexed id, uint128 feePer30Days, bool active, string description);
    event Hired(uint256 indexed id, address indexed hirer, uint64 until, uint256 paid);

    constructor(address token_) {
        token = IERC20Registry(token_);
    }

    function list(address agent, uint8 skills, uint128 feePer30Days, string calldata name, string calldata description)
        external
        returns (uint256 id)
    {
        if (agent == address(0) || skills == 0 || skills > ALL_SKILLS) revert InvalidListing();
        if (bytes(name).length == 0 || bytes(name).length > 48 || bytes(description).length > 280) revert InvalidListing();
        id = _listings.length;
        _listings.push(Listing(msg.sender, agent, skills, true, 0, feePer30Days, name, description));
        emit Listed(id, msg.sender, agent, skills, feePer30Days, name);
    }

    function update(uint256 id, uint128 feePer30Days, bool active, string calldata description) external {
        Listing storage l = _listing(id);
        if (msg.sender != l.operator) revert Unauthorized();
        if (bytes(description).length > 280) revert InvalidListing();
        (l.feePer30Days, l.active, l.description) = (feePer30Days, active, description);
        emit Updated(id, feePer30Days, active, description);
    }

    /// @notice Rents the agent for `periods` × 30 days (stacking on a rental still running) and pays its operator.
    function hire(uint256 id, uint8 periods) external returns (uint64 until) {
        Listing storage l = _listing(id);
        if (!l.active) revert Inactive();
        if (periods == 0 || periods > MAX_PERIODS) revert InvalidPeriods();
        uint256 cost = uint256(l.feePer30Days) * periods;
        if (cost != 0 && !token.transferFrom(msg.sender, l.operator, cost)) revert TransferFailed();
        uint64 from = rentedUntil[msg.sender][id] > block.timestamp ? rentedUntil[msg.sender][id] : uint64(block.timestamp);
        until = from + PERIOD * periods;
        rentedUntil[msg.sender][id] = until;
        l.hires += 1;
        emit Hired(id, msg.sender, until, cost);
    }

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function listing(uint256 id) external view returns (Listing memory) {
        return _listing(id);
    }

    function _listing(uint256 id) private view returns (Listing storage) {
        if (id >= _listings.length) revert InvalidListing();
        return _listings[id];
    }
}
