// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ICoinAIStats {
    function statsOf(address user) external view returns (uint128 totalReceived, uint64 paymentCount, uint64 lastPaymentAt);
    function accountOf(address user) external view returns (AccountView memory);
}

struct AccountView {
    uint16 splitBps;
    uint128 spend;
    uint128 idle;
    uint64 lockUntil;
    uint256[4] positions;
    uint256[3] vaultShares;
}

/// @title coinAI badges - soulbound (non-transferable) ERC-721 badges for saving habits
/// @notice Two kinds of badge:
///         - claimable: anyone can mint their own once CoinAI v2's on-chain state proves it (first payment,
///           ten payments, 100 tUSDT saved);
///         - awarded: only the minter (the agent wallet) can mint them, for what needs history the chain doesn't
///           keep (a four-week saving streak, a goal reached, the first agent run).
///         One badge per kind per wallet. Tokens can't be transferred or approved (ERC-5192 "locked").
/// @dev tokenId = uint160(owner) << 8 | badge id, so ownerOf needs no storage beyond earnedAt.
contract CoinAIBadges {
    error Unauthorized();
    error UnknownBadge();
    error AlreadyEarned();
    error NotEligible();
    error Soulbound();
    error NotFound();

    uint8 public constant FIRST_PAYMENT = 0;
    uint8 public constant TEN_PAYMENTS = 1;
    uint8 public constant SAVED_100 = 2;
    uint8 public constant STREAK_4_WEEKS = 3;
    uint8 public constant GOAL_REACHED = 4;
    uint8 public constant FIRST_AGENT_RUN = 5;
    uint8 public constant BADGE_COUNT = 6;
    uint256 public constant SAVED_100_AMOUNT = 100e6; // tUSDT, 6 decimals

    string public constant name = "coinAI Badges";
    string public constant symbol = "COINAI-B";

    ICoinAIStats public immutable coinai;
    address public immutable minter;

    mapping(address => uint64[BADGE_COUNT]) private _earnedAt;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Locked(uint256 tokenId);
    event BadgeEarned(address indexed user, uint8 indexed badge, uint256 tokenId);

    constructor(address coinai_, address minter_) {
        coinai = ICoinAIStats(coinai_);
        minter = minter_;
    }

    // ─── Minting ─────────────────────────────────────────────────────────────

    /// @notice Mints a badge the chain itself can prove, to the caller.
    function claim(uint8 badge) external {
        if (badge >= STREAK_4_WEEKS) revert UnknownBadge();
        if (!eligible(msg.sender, badge)) revert NotEligible();
        _mint(msg.sender, badge);
    }

    /// @notice The agent wallet mints a badge that needs off-chain history.
    function award(address user, uint8 badge) external {
        if (msg.sender != minter) revert Unauthorized();
        if (badge < STREAK_4_WEEKS || badge >= BADGE_COUNT) revert UnknownBadge();
        _mint(user, badge);
    }

    /// @notice Whether `user` can claim a claimable badge right now.
    function eligible(address user, uint8 badge) public view returns (bool) {
        if (badge == SAVED_100) {
            AccountView memory a = coinai.accountOf(user);
            uint256 saved = a.idle;
            for (uint256 i; i < 4; ++i) saved += a.positions[i];
            return saved >= SAVED_100_AMOUNT;
        }
        (, uint64 count,) = coinai.statsOf(user);
        if (badge == FIRST_PAYMENT) return count >= 1;
        if (badge == TEN_PAYMENTS) return count >= 10;
        return false;
    }

    function _mint(address user, uint8 badge) private {
        if (_earnedAt[user][badge] != 0) revert AlreadyEarned();
        _earnedAt[user][badge] = uint64(block.timestamp);
        balanceOf[user] += 1;
        uint256 id = tokenIdOf(user, badge);
        emit Transfer(address(0), user, id);
        emit Locked(id);
        emit BadgeEarned(user, badge, id);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @notice When each badge was earned (unix seconds, 0 = not yet), indexed by badge id.
    function badgesOf(address user) external view returns (uint64[BADGE_COUNT] memory) {
        return _earnedAt[user];
    }

    function tokenIdOf(address user, uint8 badge) public pure returns (uint256) {
        return (uint256(uint160(user)) << 8) | badge;
    }

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = address(uint160(tokenId >> 8));
        uint256 badge = tokenId & 0xff;
        if (badge >= BADGE_COUNT || _earnedAt[owner][badge] == 0) revert NotFound();
    }

    function locked(uint256 tokenId) external view returns (bool) {
        ownerOf(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        string[BADGE_COUNT] memory titles =
            ["First payment", "Ten payments", "100 tUSDT saved", "4-week saving streak", "Goal reached", "First agent run"];
        return string.concat(
            'data:application/json;utf8,{"name":"coinAI: ', titles[tokenId & 0xff], '","description":"A soulbound coinAI saving badge."}'
        );
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        // ERC-165, ERC-721, ERC-721 Metadata, ERC-5192
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f || id == 0xb45a3c0e;
    }

    // ─── Soulbound: no transfers, no approvals ───────────────────────────────

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }
}
