// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ICoinAIPay {
    function pay(address from, address to, uint256 amount) external;
}

interface IFaucetToken {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function faucet() external;
}

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title DepositRouter
/// @notice Testnet on-ramp: deposit tBNB, receive its USD value in tUSDT (Chainlink BNB/USD) credited
///         straight into your coinAI account as a payment, so your split and the AI agents apply to it.
///         tUSDT comes from this contract's reserve, refilled from the MockUSDT faucet.
// ponytail: oracle-priced reserve because MockUSDT has no DEX pool; on mainnet swap via PancakeSwap instead
contract DepositRouter {
    ICoinAIPay public immutable coinai;
    IFaucetToken public immutable token;
    IAggregatorV3 public immutable bnbUsdFeed;
    /// @notice Receives the deposited tBNB (the agent wallet, which spends it on gas).
    address public immutable treasury;

    uint256 public constant MAX_PRICE_AGE = 1 days;

    event DepositedBNB(address indexed user, uint256 bnbIn, uint256 usdtOut, uint256 price);

    error ZeroDeposit();
    error StalePrice();
    error Slippage();
    error ReserveTooLow();
    error TransferFailed();

    constructor(address _coinai, address _token, address _bnbUsdFeed, address _treasury) {
        coinai = ICoinAIPay(_coinai);
        token = IFaucetToken(_token);
        bnbUsdFeed = IAggregatorV3(_bnbUsdFeed);
        treasury = _treasury;
        IFaucetToken(_token).approve(_coinai, type(uint256).max);
    }

    /// @notice tUSDT (6 decimals) for `bnbIn` wei at the current Chainlink price (8 decimals).
    function quoteBNB(uint256 bnbIn) public view returns (uint256 usdtOut, uint256 price) {
        (, int256 answer,, uint256 updatedAt,) = bnbUsdFeed.latestRoundData();
        if (answer <= 0 || block.timestamp - updatedAt > MAX_PRICE_AGE) revert StalePrice();
        price = uint256(answer);
        usdtOut = (bnbIn * price) / 1e20; // 1e18 (wei) * 1e8 (price) / 1e6 (tUSDT)
    }

    /// @notice Converts msg.value to tUSDT and pays it into msg.sender's coinAI account.
    function depositBNB(uint256 minOut) external payable returns (uint256 usdtOut) {
        if (msg.value == 0) revert ZeroDeposit();
        uint256 price;
        (usdtOut, price) = quoteBNB(msg.value);
        if (usdtOut == 0 || usdtOut < minOut) revert Slippage();
        if (token.balanceOf(address(this)) < usdtOut) revert ReserveTooLow();

        coinai.pay(address(this), msg.sender, usdtOut);
        (bool ok,) = treasury.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit DepositedBNB(msg.sender, msg.value, usdtOut, price);
    }

    /// @notice Tops up the tUSDT reserve from the faucet (1,000 tUSDT, once a day). Anyone can call it.
    function refill() external {
        token.faucet();
    }

    function reserve() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
