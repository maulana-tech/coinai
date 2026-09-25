// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Script.sol";
import "../src/Save.sol";
import "../src/MockUSDT.sol";
import "../src/SimpleVault.sol";

/// Deploys tUSDT, the three yield vaults and CoinAI to BSC Testnet.
/// forge script script/DeployAll.s.sol --rpc-url bsc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
contract DeployAll is Script {
    function run() external {
        vm.startBroadcast();
        MockUSDT usdt = new MockUSDT();
        SimpleVault conservative = new SimpleVault(address(usdt), "coinAI Conservative Vault", "cvUSDT", 300, 1);
        SimpleVault balanced = new SimpleVault(address(usdt), "coinAI Balanced Vault", "bvUSDT", 600, 2);
        SimpleVault growth = new SimpleVault(address(usdt), "coinAI Growth Vault", "gvUSDT", 1200, 3);
        CoinAI coinai = new CoinAI(address(usdt), [address(conservative), address(balanced), address(growth)]);
        vm.stopBroadcast();

        console.log("MockUSDT:          ", address(usdt));
        console.log("Vault Conservative:", address(conservative));
        console.log("Vault Balanced:    ", address(balanced));
        console.log("Vault Growth:      ", address(growth));
        console.log("CoinAI:            ", address(coinai));
    }
}
