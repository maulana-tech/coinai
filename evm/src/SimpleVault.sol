// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IERC20 - Minimal ERC20 interface
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @title IERC4626 - Minimal ERC4626 vault interface
interface IERC4626 is IERC20 {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxDeposit(address receiver) external view returns (uint256);
    function maxMint(address receiver) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);
}

/// @title SimpleVault - minimal ERC-4626 vault used as a CoinAI yield target on testnet
/// @notice Shares track the asset balance, so anyone transferring asset in raises the share price.
///         `apyBps` is display/agent metadata only.
// ponytail: APY is static metadata, not accrued; wire a real strategy (Venus/Lista) on mainnet
contract SimpleVault is IERC4626 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 6;
    uint16 public immutable apyBps;
    uint8 public immutable riskLevel; // 1 = low, 2 = medium, 3 = high

    address public immutable override asset;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);

    constructor(address _asset, string memory _name, string memory _symbol, uint16 _apyBps, uint8 _riskLevel) {
        require(_asset != address(0), "zero address");
        asset = _asset;
        name = _name;
        symbol = _symbol;
        apyBps = _apyBps;
        riskLevel = _riskLevel;
    }

    // ─── ERC20 ───────────────────────────────────────────────────────────────

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0), "transfer to zero");
        require(balanceOf[from] >= amount, "insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function totalAssets() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    // ─── ERC4626 View Functions ──────────────────────────────────────────────

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply;
        if (supply == 0) return assets;
        return (assets * supply) / IERC20(asset).balanceOf(address(this));
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        if (supply == 0) return shares;
        return (shares * IERC20(asset).balanceOf(address(this))) / supply;
    }

    function maxDeposit(address) public view returns (uint256) {
        return type(uint256).max;
    }

    function maxMint(address) public view returns (uint256) {
        return type(uint256).max;
    }

    function maxWithdraw(address owner_) public view returns (uint256) {
        return convertToAssets(balanceOf[owner_]);
    }

    function maxRedeem(address owner_) public view returns (uint256) {
        return balanceOf[owner_];
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return convertToShares(assets);
    }

    function previewMint(uint256 shares) public view returns (uint256) {
        uint256 supply = totalSupply;
        if (supply == 0) return shares;
        return (shares * IERC20(asset).balanceOf(address(this)) + supply - 1) / supply;
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        uint256 supply = totalSupply;
        if (supply == 0) return assets;
        return (assets * supply + IERC20(asset).balanceOf(address(this)) - 1) / IERC20(asset).balanceOf(address(this));
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return convertToAssets(shares);
    }

    // ─── ERC4626 Mutative Functions ──────────────────────────────────────────

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(assets <= maxDeposit(receiver), "deposit exceeds max");
        shares = convertToShares(assets);
        require(IERC20(asset).transferFrom(msg.sender, address(this), assets), "transfer failed");
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver) external returns (uint256 assets) {
        require(shares <= maxMint(receiver), "mint exceeds max");
        assets = previewMint(shares);
        require(IERC20(asset).transferFrom(msg.sender, address(this), assets), "transfer failed");
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner_) external returns (uint256 shares) {
        shares = previewWithdraw(assets);
        require(assets <= maxWithdraw(owner_), "withdraw exceeds max");
        if (msg.sender != owner_) {
            uint256 allowed = allowance[owner_][msg.sender];
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "insufficient allowance");
                allowance[owner_][msg.sender] = allowed - shares;
            }
        }
        _burn(owner_, shares);
        require(IERC20(asset).transfer(receiver, assets), "transfer failed");
        emit Withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256 assets) {
        require(shares <= maxRedeem(owner_), "redeem exceeds max");
        assets = convertToAssets(shares);
        if (msg.sender != owner_) {
            uint256 allowed = allowance[owner_][msg.sender];
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "insufficient allowance");
                allowance[owner_][msg.sender] = allowed - shares;
            }
        }
        _burn(owner_, shares);
        require(IERC20(asset).transfer(receiver, assets), "transfer failed");
        emit Withdraw(msg.sender, receiver, owner_, assets, shares);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }
}
