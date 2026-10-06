// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20Basket {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
}

/// @title BasketVault - "AI Smart Money": a basket of coins per saver, weighted by the coinAI agent team
/// @notice Each saver holds units of every asset (tUSDT, then coins priced by Chainlink on BSC). A saver either
///         follows the weights the agent team (the curator) publishes, or sets their own. The contract enforces the
///         caps on every set of weights: at least MIN_STABLE_BPS in tUSDT and at most `maxBps` per coin, so a
///         confused or jailbroken model can only move a follower inside those bounds. Value follows the market and
///         can fall below what was saved.
/// @dev    Testnet has no tUSDT liquidity for these coins, so buys and sells are bookkeeping at the oracle price and
///         the vault's own tUSDT backs withdrawals; gains above deposits are paid from a reserve the operator tops up
///         (anyone can send tUSDT here), losses stay in the vault. On mainnet buys and sells become PancakeSwap swaps.
contract BasketVault {
    struct Asset {
        string symbol;
        IPriceFeed feed; // address(0) for the stable asset (always $1)
        uint16 maxBps; // cap per set of weights
    }

    struct Holder {
        uint256[] units; // per asset, 18 decimals of the coin
        uint16[] custom; // the saver's own weights; empty = follow the curator
        uint64 epoch; // smart-weights epoch the units were last balanced to
    }

    error Unauthorized();
    error AlreadyInitialized();
    error InvalidWeights();
    error StalePrice();
    error InsufficientValue();
    error NoWeights();
    error TransferFailed();

    uint16 public constant MAX_BPS = 10_000;
    uint16 public constant MIN_STABLE_BPS = 1_000;
    uint256 public constant MAX_PRICE_AGE = 1 days;
    uint256 private constant ONE = 1e18;

    IERC20Basket public immutable token; // tUSDT, 6 decimals
    address public immutable owner; // deployer: wires CoinAI once
    address public curator; // the agent wallet
    address public coinai; // the only contract that deposits and withdraws for savers

    Asset[] private _assets;
    uint16[] private _smart;
    uint64 public smartEpoch;
    mapping(address => Holder) private _holders;

    event SmartWeightsSet(uint64 indexed epoch, uint16[] weights, string reason);
    event WeightsSet(address indexed user, bool custom, uint16[] weights);
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, address to);
    event Rebalanced(address indexed user, uint64 epoch, uint256 value);

    /// @param symbols / feeds / caps Asset 0 must be the stable asset (feed address(0)).
    constructor(
        address token_,
        address curator_,
        string[] memory symbols,
        address[] memory feeds,
        uint16[] memory caps,
        uint16[] memory initialWeights
    ) {
        if (symbols.length < 2 || symbols.length != feeds.length || feeds.length != caps.length) revert InvalidWeights();
        if (feeds[0] != address(0)) revert InvalidWeights();
        token = IERC20Basket(token_);
        owner = msg.sender;
        curator = curator_;
        for (uint256 i; i < symbols.length; ++i) {
            if (i > 0 && feeds[i] == address(0)) revert InvalidWeights();
            _assets.push(Asset(symbols[i], IPriceFeed(feeds[i]), caps[i]));
        }
        _setSmart(initialWeights, "initial weights");
    }

    function initCoinAI(address coinai_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (coinai != address(0)) revert AlreadyInitialized();
        coinai = coinai_;
    }

    // ─── Weights ─────────────────────────────────────────────────────────────

    /// @notice The agent team publishes new weights with its reason; followers move to them at their next action.
    function setSmartWeights(uint16[] calldata weights, string calldata reason) external {
        if (msg.sender != curator) revert Unauthorized();
        _setSmart(weights, reason);
    }

    /// @notice A saver sets their own mix (empty = follow the agent team). Re-weighting keeps the basket's value.
    function setWeights(uint16[] calldata weights) external {
        if (weights.length != 0) _validate(weights);
        Holder storage h = _holders[msg.sender];
        h.custom = weights;
        emit WeightsSet(msg.sender, weights.length != 0, weights);
        if (_hasUnits(h)) _rebalanceTo(msg.sender, h, _weightsOf(h));
    }

    /// @notice Moves a follower to the latest smart weights at today's prices. Anyone may call it. Skipped while a
    ///         price is stale, so a lagging oracle never blocks the withdrawal that triggers it.
    function sync(address user) public {
        Holder storage h = _holders[user];
        if (h.custom.length == 0 && h.epoch < smartEpoch && _hasUnits(h) && _allFresh()) _rebalanceTo(user, h, _smart);
    }

    // ─── CoinAI ──────────────────────────────────────────────────────────────

    function deposit(address user, uint256 amount) external {
        if (msg.sender != coinai) revert Unauthorized();
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        sync(user);
        Holder storage h = _holders[user];
        uint16[] memory w = _weightsOf(h);
        if (w.length == 0) revert NoWeights();
        _buy(h, amount, w);
        if (h.custom.length == 0) h.epoch = smartEpoch;
        emit Deposited(user, amount);
    }

    /// @notice Sells `amount` worth of the saver's basket pro rata and sends the tUSDT to `to`.
    function withdraw(address user, uint256 amount, address to) external {
        if (msg.sender != coinai) revert Unauthorized();
        sync(user);
        Holder storage h = _holders[user];
        uint256 value = _value(h);
        if (amount > value) revert InsufficientValue();
        for (uint256 i; i < h.units.length; ++i) h.units[i] -= (h.units[i] * amount) / value;
        if (!token.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(user, amount, to);
    }

    /// @notice Sells the whole basket at today's prices; returns the tUSDT sent.
    function withdrawAll(address user, address to) external returns (uint256 amount) {
        if (msg.sender != coinai) revert Unauthorized();
        Holder storage h = _holders[user];
        amount = _value(h);
        delete h.units;
        if (amount != 0 && !token.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(user, amount, to);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function assets() external view returns (Asset[] memory) {
        return _assets;
    }

    function smartWeights() external view returns (uint16[] memory) {
        return _smart;
    }

    /// @notice The weights the saver's basket follows: their own, or the agent team's.
    function weightsOf(address user) external view returns (uint16[] memory weights, bool custom) {
        Holder storage h = _holders[user];
        return (_weightsOf(h), h.custom.length != 0);
    }

    function unitsOf(address user) external view returns (uint256[] memory) {
        return _holders[user].units;
    }

    /// @notice USD prices with 18 decimals, in asset order, and whether each is fresh enough to buy at.
    function prices() external view returns (uint256[] memory p, bool[] memory fresh) {
        p = new uint256[](_assets.length);
        fresh = new bool[](_assets.length);
        for (uint256 i; i < p.length; ++i) (p[i], fresh[i]) = _read(i);
    }

    /// @notice What the saver's basket is worth now, in tUSDT (6 decimals).
    function valueOf(address user) external view returns (uint256) {
        return _value(_holders[user]);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _setSmart(uint16[] memory weights, string memory reason) private {
        _validate(weights);
        _smart = weights;
        emit SmartWeightsSet(++smartEpoch, weights, reason);
    }

    function _validate(uint16[] memory w) private view {
        if (w.length != _assets.length || w[0] < MIN_STABLE_BPS) revert InvalidWeights();
        uint256 total;
        for (uint256 i; i < w.length; ++i) {
            if (w[i] > _assets[i].maxBps) revert InvalidWeights();
            total += w[i];
        }
        if (total != MAX_BPS) revert InvalidWeights();
    }

    function _weightsOf(Holder storage h) private view returns (uint16[] memory) {
        return h.custom.length != 0 ? h.custom : _smart;
    }

    function _hasUnits(Holder storage h) private view returns (bool) {
        for (uint256 i; i < h.units.length; ++i) if (h.units[i] != 0) return true;
        return false;
    }

    function _rebalanceTo(address user, Holder storage h, uint16[] memory w) private {
        uint256 value = _value(h);
        delete h.units;
        _buy(h, value, w);
        if (h.custom.length == 0) h.epoch = smartEpoch;
        emit Rebalanced(user, smartEpoch, value);
    }

    /// @dev `amount` tUSDT (6 decimals) spread over the assets by weight, priced now.
    function _buy(Holder storage h, uint256 amount, uint16[] memory w) private {
        if (h.units.length == 0) h.units = new uint256[](_assets.length);
        uint256 left = amount;
        for (uint256 i; i < w.length; ++i) {
            uint256 part = i == w.length - 1 ? left : (amount * w[i]) / MAX_BPS;
            left -= part;
            if (part != 0) h.units[i] += (part * 1e30) / _freshPrice(i); // 6 → 18 decimals of USD, then per coin
        }
    }

    /// @dev Valued at the latest oracle price even if it's old: selling must never get stuck behind a lagging feed.
    function _value(Holder storage h) private view returns (uint256 value) {
        for (uint256 i; i < h.units.length; ++i) {
            if (h.units[i] == 0) continue;
            (uint256 p,) = _read(i);
            value += (h.units[i] * p) / 1e30;
        }
    }

    /// @dev Buying needs a fresh price.
    function _freshPrice(uint256 i) private view returns (uint256 p) {
        bool fresh;
        (p, fresh) = _read(i);
        if (!fresh) revert StalePrice();
    }

    function _allFresh() private view returns (bool) {
        for (uint256 i; i < _assets.length; ++i) {
            (, bool fresh) = _read(i);
            if (!fresh) return false;
        }
        return true;
    }

    function _read(uint256 i) private view returns (uint256 price, bool fresh) {
        IPriceFeed feed = _assets[i].feed;
        if (address(feed) == address(0)) return (ONE, true);
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (answer <= 0) revert StalePrice(); // no usable price at all
        return (uint256(answer) * 10 ** (18 - feed.decimals()), block.timestamp - updatedAt <= MAX_PRICE_AGE);
    }
}
